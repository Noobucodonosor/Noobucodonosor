import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '..', 'showcase.config.json');

export function loadShowcaseConfig(configPath = DEFAULT_CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

const DEFAULT_CONFIG = loadShowcaseConfig();

export const SERVICE_PROMPTS = Object.fromEntries(
  Object.entries(DEFAULT_CONFIG.services).map(([id, cfg]) => [id, cfg.systemPrompt]),
);

export const ALLOWED_SERVICES = new Set(Object.keys(DEFAULT_CONFIG.services));

const PROFILE_CHAINS = {
  'long-rag': ['gemini-lite', 'gemini', 'openrouter', 'mistral', 'mistral-lite', 'groq'],
  'compact-json': ['groq', 'gemini-lite', 'gemini', 'openrouter', 'mistral-lite', 'mistral'],
};

export function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

export function normalizeText(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildProvidersFromEnv(env = process.env) {
  const providers = [];

  if (env.GEMINI_API_KEY) {
    providers.push({
      id: 'gemini-lite',
      family: 'gemini',
      label: 'Google Gemini Flash-Lite (Free)',
      model: env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite',
      apiKey: env.GEMINI_API_KEY,
    });
    providers.push({
      id: 'gemini',
      family: 'gemini',
      label: 'Google Gemini Flash (Free)',
      model: env.GEMINI_MODEL || 'gemini-3.8-flash',
      apiKey: env.GEMINI_API_KEY,
    });
  }

  if (env.GROQ_API_KEY) {
    providers.push({
      id: 'groq',
      family: 'groq',
      label: 'Groq (Free Tier)',
      model: env.GROQ_MODEL || 'openai/gpt-oss-20b',
      apiKey: env.GROQ_API_KEY,
    });
  }

  if (env.OPENROUTER_API_KEY) {
    providers.push({
      id: 'openrouter',
      family: 'openrouter',
      label: 'OpenRouter (:free)',
      model: env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      apiKey: env.OPENROUTER_API_KEY,
    });
  }

  if (env.MISTRAL_API_KEY && env.EXCLUDE_MISTRAL !== '1') {
    providers.push({
      id: 'mistral-lite',
      family: 'mistral',
      label: 'Mistral Free (Ministral 8B)',
      model: env.MISTRAL_LITE_MODEL || 'ministral-8b-2512',
      apiKey: env.MISTRAL_API_KEY,
    });
    providers.push({
      id: 'mistral',
      family: 'mistral',
      label: 'Mistral Free (Small)',
      model: env.MISTRAL_MODEL || 'mistral-small-2603',
      apiKey: env.MISTRAL_API_KEY,
    });
  }

  return providers;
}

function classifyRateLimitError(bodyText = '') {
  const lower = String(bodyText).toLowerCase();
  if (
    lower.includes('per day') ||
    lower.includes('daily') ||
    lower.includes('rpd') ||
    lower.includes('quota exceeded')
  ) {
    return 'rpd';
  }
  return 'rpm_tpm';
}

async function callProvider(provider, systemPrompt, userPrompt, fetchImpl, timeoutMs, maxTokens) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const family = provider.family || provider.id;

  try {
    if (family === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
        }),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        const err = new Error(`Gemini HTTP ${res.status}`);
        err.status = res.status;
        err.bodyText = bodyText;
        throw err;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
      if (!text) throw new Error('Gemini returned empty response');
      return text;
    }

    const endpointMap = {
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      mistral: 'https://api.mistral.ai/v1/chat/completions',
    };
    const url = endpointMap[family];
    if (!url) throw new Error(`Unsupported provider: ${provider.id}`);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    };
    if (family === 'openrouter') {
      headers['HTTP-Referer'] = 'https://noobucodonosor.github.io/';
      headers['X-Title'] = 'Noobucodonosor Hub';
    }

    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.4,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      const err = new Error(`${provider.id} HTTP ${res.status}`);
      err.status = res.status;
      err.bodyText = bodyText;
      throw err;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error(`${provider.id} returned empty response`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export class FreeTierRouter {
  constructor(options = {}) {
    this.config = options.config ?? DEFAULT_CONFIG;
    this.servicesConfig = this.config.services || DEFAULT_CONFIG.services;
    this.allowedServices = new Set(Object.keys(this.servicesConfig));

    this.providers = options.providers ?? buildProvidersFromEnv(options.env ?? process.env);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.cacheTtlMs = options.cacheTtlMs ?? 6 * 60 * 60 * 1000;
    this.maxCacheEntries = options.maxCacheEntries ?? 200;
    this.maxIpEntries = options.maxIpEntries ?? 5000;
    this.ipLimitPerHour = options.ipLimitPerHour ?? Number(process.env.IP_LIMIT_PER_HOUR || 20);
    this.dailyGlobalCap = options.dailyGlobalCap ?? Number(process.env.DAILY_FREE_CAP || 500);
    this.cooldownMs = options.cooldownMs ?? 60 * 1000;
    this.rpdCooldownMs = options.rpdCooldownMs ?? 30 * 60 * 1000;
    this.now = options.now ?? (() => Date.now());

    this.cache = new Map();
    this.ipHits = new Map();
    this.providerCooldownUntil = new Map();
    this.dailyState = { day: this.#todayKey(), count: 0 };
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      byService: {},
      byProvider: {},
      statusCounts: {},
    };
  }

  #todayKey() {
    return new Date(this.now()).toISOString().slice(0, 10);
  }

  #resetDayIfNeeded() {
    const today = this.#todayKey();
    if (this.dailyState.day !== today) {
      this.dailyState = { day: today, count: 0 };
    }
  }

  #cacheKey({ serviceId, presetId, prompt, context }) {
    const canonical = JSON.stringify({
      v: 'adr0003-v1',
      s: serviceId,
      p: presetId || null,
      q: normalizeText(prompt),
      c: normalizeText(context),
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  #getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  #setCache(key, payload) {
    if (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      ...payload,
      expiresAt: this.now() + this.cacheTtlMs,
    });
  }

  #checkRateLimit(clientIp) {
    const now = this.now();
    const hourAgo = now - 60 * 60 * 1000;
    const existing = this.ipHits.get(clientIp);
    const hits = existing ? existing.filter((ts) => ts > hourAgo) : [];

    if (!existing && this.ipHits.size >= this.maxIpEntries) {
      const oldestIp = this.ipHits.keys().next().value;
      this.ipHits.delete(oldestIp);
    }

    if (hits.length > 0 || existing) {
      this.ipHits.delete(clientIp);
      this.ipHits.set(clientIp, hits);
    }

    if (hits.length >= this.ipLimitPerHour) {
      return { allowed: false, remainingIp: 0 };
    }
    return { allowed: true, remainingIp: this.ipLimitPerHour - hits.length };
  }

  consumeIpSlot(clientIp) {
    const check = this.#checkRateLimit(clientIp);
    if (!check.allowed) return false;
    const hits = this.ipHits.get(clientIp) || [];
    hits.push(this.now());
    this.ipHits.delete(clientIp);
    this.ipHits.set(clientIp, hits);
    return true;
  }

  #recordHit(clientIp) {
    if (!this.ipHits.has(clientIp) && this.ipHits.size >= this.maxIpEntries) {
      const oldestIp = this.ipHits.keys().next().value;
      this.ipHits.delete(oldestIp);
    }
    const hits = this.ipHits.get(clientIp) || [];
    hits.push(this.now());
    this.ipHits.delete(clientIp);
    this.ipHits.set(clientIp, hits);
    this.dailyState.count += 1;
  }

  #selectProvidersForPayload(serviceProfile, estimatedTokens) {
    const effectiveProfile =
      serviceProfile === 'compact-json' && estimatedTokens <= 4000 ? 'compact-json' : 'long-rag';
    const preferredOrder = PROFILE_CHAINS[effectiveProfile] || PROFILE_CHAINS['long-rag'];

    const ordered = [];
    const used = new Set();

    for (const targetId of preferredOrder) {
      for (const provider of this.providers) {
        if (used.has(provider)) continue;
        if (provider.id === targetId || provider.family === targetId) {
          if (provider.family === 'groq' && estimatedTokens > 7000) continue;
          ordered.push(provider);
          used.add(provider);
        }
      }
    }

    for (const provider of this.providers) {
      if (!used.has(provider)) {
        if (provider.family === 'groq' && estimatedTokens > 7000) continue;
        ordered.push(provider);
      }
    }

    return { effectiveProfile, ordered };
  }

  #recordMetric(serviceId, status, providerId = null, cached = false) {
    this.metrics.totalRequests += 1;
    if (cached) this.metrics.cacheHits += 1;
    this.metrics.byService[serviceId] = (this.metrics.byService[serviceId] || 0) + 1;
    this.metrics.statusCounts[status] = (this.metrics.statusCounts[status] || 0) + 1;
    if (providerId) {
      this.metrics.byProvider[providerId] = (this.metrics.byProvider[providerId] || 0) + 1;
    }
  }

  getMetrics() {
    const { totalRequests, cacheHits, byService, byProvider, statusCounts } = this.metrics;
    return {
      totalRequests,
      cacheHits,
      cacheHitRatio: totalRequests > 0 ? Number((cacheHits / totalRequests).toFixed(3)) : 0,
      byService: { ...byService },
      byProvider: { ...byProvider },
      statusCounts: { ...statusCounts },
    };
  }

  getStatus() {
    this.#resetDayIfNeeded();
    const now = this.now();
    return {
      proxyReady: this.providers.length > 0,
      providers: this.providers.map((p) => ({
        id: p.id,
        label: p.label,
        model: p.model,
        coolingDown: (this.providerCooldownUntil.get(p.id) || 0) > now,
      })),
      dailyUsed: this.dailyState.count,
      dailyCap: this.dailyGlobalCap,
      dailyRemaining: Math.max(0, this.dailyGlobalCap - this.dailyState.count),
      cacheSize: this.cache.size,
      allowedServices: [...this.allowedServices],
      metrics: this.getMetrics(),
    };
  }

  hasCached({ serviceId, presetId = null, prompt, userQuery, context = '' }) {
    if (!this.allowedServices.has(serviceId)) return false;
    const rawPrompt = userQuery ?? prompt ?? '';
    const cleanPrompt = String(rawPrompt).trim().slice(0, 2000);
    if (!cleanPrompt) return false;
    const cleanContext = String(context || '').trim().slice(0, 10000);
    const cacheKey = this.#cacheKey({ serviceId, presetId, prompt: cleanPrompt, context: cleanContext });
    return Boolean(this.#getCached(cacheKey));
  }

  async complete({ serviceId, presetId = null, prompt, userQuery, context = '', clientIp = 'local' }) {
    if (!this.allowedServices.has(serviceId)) {
      this.#recordMetric('invalid', 400);
      return {
        ok: false,
        status: 400,
        error: 'invalid_service',
        message: `Servizio non consentito: ${serviceId}`,
      };
    }

    const rawPrompt = userQuery ?? prompt ?? '';
    const cleanPrompt = String(rawPrompt).trim().slice(0, 2000);
    const cleanContext = String(context || '').trim().slice(0, 10000);
    if (!cleanPrompt) {
      this.#recordMetric(serviceId, 400);
      return {
        ok: false,
        status: 400,
        error: 'empty_prompt',
        message: 'Inserisci una domanda o seleziona un preset.',
      };
    }

    const cacheKey = this.#cacheKey({ serviceId, presetId, prompt: cleanPrompt, context: cleanContext });
    const cached = this.#getCached(cacheKey);
    if (cached) {
      this.#recordMetric(serviceId, 200, cached.provider, true);
      return {
        ok: true,
        status: 200,
        mode: 'proxy-cache',
        provider: cached.provider,
        providerLabel: cached.providerLabel,
        model: cached.model,
        cached: true,
        text: cached.text,
      };
    }

    this.#resetDayIfNeeded();

    if (this.providers.length === 0) {
      this.#recordMetric(serviceId, 503);
      return {
        ok: false,
        status: 503,
        error: 'no_providers_configured',
        fallbackSuggested: 'byok_or_local',
        message: 'Nessuna chiave free-tier configurata sul proxy. Usa BYOK nel browser o la modalità locale.',
      };
    }

    if (this.dailyState.count >= this.dailyGlobalCap) {
      this.#recordMetric(serviceId, 429);
      return {
        ok: false,
        status: 429,
        error: 'daily_cap_reached',
        fallbackSuggested: 'byok_or_local',
        message: 'Soglia gratuita giornaliera del proxy raggiunta. Puoi continuare subito con BYOK gratuito o in modalità locale.',
      };
    }

    const rate = this.#checkRateLimit(clientIp);
    if (!rate.allowed) {
      this.#recordMetric(serviceId, 429);
      return {
        ok: false,
        status: 429,
        error: 'ip_rate_limited',
        fallbackSuggested: 'byok_or_local',
        message: 'Hai raggiunto il limite orario del proxy gratuito. Inserisci una tua chiave BYOK gratuita per continuare senza limiti.',
      };
    }

    const serviceCfg = this.servicesConfig[serviceId];
    const systemPrompt = serviceCfg.systemPrompt;
    const maxTokens = serviceCfg.maxTokens || (serviceCfg.profile === 'compact-json' ? 600 : 900);
    const combinedUserPrompt = cleanContext
      ? `CONTESTO PRESCARICATO:\n${cleanContext}\n\n<user_query>\n${cleanPrompt}\n</user_query>`
      : `<user_query>\n${cleanPrompt}\n</user_query>`;

    const estimatedTokens = estimateTokens(systemPrompt) + estimateTokens(combinedUserPrompt);
    const { effectiveProfile, ordered } = this.#selectProvidersForPayload(
      serviceCfg.profile || 'long-rag',
      estimatedTokens,
    );

    const now = this.now();
    const errors = [];

    for (const provider of ordered) {
      const cooldownUntil = this.providerCooldownUntil.get(provider.id) || 0;
      if (cooldownUntil > now) {
        errors.push(`${provider.id}:cooldown`);
        continue;
      }

      try {
        const text = await callProvider(
          provider,
          systemPrompt,
          combinedUserPrompt,
          this.fetchImpl,
          this.timeoutMs,
          maxTokens,
        );
        this.#recordHit(clientIp);
        const result = {
          provider: provider.id,
          providerLabel: provider.label,
          model: provider.model,
          profile: effectiveProfile,
          text,
        };
        this.#setCache(cacheKey, result);
        this.#recordMetric(serviceId, 200, provider.id, false);

        return {
          ok: true,
          status: 200,
          mode: 'proxy-free-tier',
          cached: false,
          dailyRemaining: Math.max(0, this.dailyGlobalCap - this.dailyState.count),
          ...result,
        };
      } catch (err) {
        errors.push(`${provider.id}:${err.status || err.message}`);
        if (err.status === 429) {
          const kind = classifyRateLimitError(err.bodyText);
          const delay = kind === 'rpd' ? this.rpdCooldownMs : this.cooldownMs;
          this.providerCooldownUntil.set(provider.id, this.now() + delay);
        } else if (err.status >= 500 && err.status < 600) {
          this.providerCooldownUntil.set(provider.id, this.now() + this.cooldownMs);
        }
      }
    }

    this.#recordMetric(serviceId, 503);
    return {
      ok: false,
      status: 503,
      error: 'all_providers_failed',
      fallbackSuggested: 'byok_or_local',
      attempts: errors,
      message: 'Tutti i provider free-tier del pool sono momentaneamente saturi. Passa a BYOK gratuito o alla modalità deterministica locale.',
    };
  }
}
