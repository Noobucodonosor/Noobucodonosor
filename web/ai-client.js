const BYOK_STORAGE_PREFIX = 'noobucodonosor:v1:byok:';
const BYOK_ACTIVE_KEY = `${BYOK_STORAGE_PREFIX}active`;
const DEFAULT_CLOUD_RUN_GATEWAY = 'https://noobucodonosor-hub-664856461640.us-central1.run.app';
const ramVault = new Map();
let lastPrewarmAt = 0;
let gatewayAltchaEnabled = false;

export const BYOK_PROVIDERS = {
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (:free · Consigliato CORS)',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    keyUrl: 'https://openrouter.ai/keys',
    placeholder: 'sk-or-v1-...',
    requiresKey: true,
  },
  groq: {
    id: 'groq',
    label: 'Groq (Free Tier · CORS-open)',
    defaultModel: 'openai/gpt-oss-20b',
    keyUrl: 'https://console.groq.com/keys',
    placeholder: 'gsk_...',
    requiresKey: true,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude (Direct Browser)',
    defaultModel: 'claude-3-5-haiku-latest',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-...',
    requiresKey: true,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama Locale (http://localhost:11434 · 0 chiavi)',
    defaultModel: 'llama3.2',
    keyUrl: 'https://ollama.com/download',
    placeholder: '(opzionale — nessuna API key richiesta)',
    requiresKey: false,
  },
};

const SYSTEM_PROMPTS = {
  assistant:
    'Sei l’Assistente AI della vetrina Noobucodonosor. Rispondi in italiano, conciso (max 160 parole), basandoti solo sui 7 progetti reali e sui servizi di consulenza.',
  leslie:
    'Sei Leslie — Agency OS. Qualifica il lead B2B in italiano: 1) Score X/10, 2) 3 segnali chiave, 3) Bozza breve di primo contatto.',
  kn5:
    'Sei kn5 — Knowledge Ingestor. Produci una scheda Markdown Obsidian con frontmatter YAML, sintesi in 3-4 punti, concetti chiave e 3 azioni pratiche.',
  resuscipack:
    'Sei resuscipack. Rispondi in italiano usando SOLO le fonti Open-Access nel contesto, citando sempre gli ID [OA-..], e chiudi con un Ponte Trasversale.',
  scooterlab:
    'Sei ScooterLab. Analizza la sessione telemetrica .slab: evidenzia 2 punti critici (piega/frenata), valuta la fluidità e dai 3 consigli pratici di sicurezza.',
  basilico:
    'Sei Basilico (Rapallo). Genera in italiano solo testo/Markdown una lista della spesa ordinata per reparto con quantità e 2 consigli di risparmio.',
  mediometeo:
    'Sei MedioMeteo Genova. Genera in italiano solo testo/Markdown un bollettino sintetico terra/mare per la zona richiesta.',
};

export function loadByokConfig() {
  const fromRam = ramVault.get(BYOK_ACTIVE_KEY);
  if (fromRam) return { ...fromRam };

  try {
    const raw = sessionStorage.getItem(BYOK_ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const prov = BYOK_PROVIDERS[parsed?.provider];
    if (!prov) return null;
    if (prov.requiresKey && !parsed?.apiKey) return null;
    return {
      provider: parsed.provider,
      apiKey: String(parsed.apiKey || '').trim(),
      model: String(parsed.model || prov.defaultModel).trim(),
      ramOnly: Boolean(parsed.ramOnly),
    };
  } catch {
    return null;
  }
}

export function saveByokConfig(config) {
  const prov = config ? BYOK_PROVIDERS[config.provider] || BYOK_PROVIDERS.openrouter : null;
  if (!config || !prov || (prov.requiresKey && !config.apiKey?.trim())) {
    ramVault.delete(BYOK_ACTIVE_KEY);
    try {
      sessionStorage.removeItem(BYOK_ACTIVE_KEY);
    } catch {
      // sessionStorage non disponibile (es. Safari file:// restrittivo)
    }
    return null;
  }

  const clean = {
    provider: prov.id,
    apiKey: String(config.apiKey || '').trim(),
    model: (config.model || prov.defaultModel || '').trim(),
    ramOnly: Boolean(config.ramOnly),
  };

  ramVault.set(BYOK_ACTIVE_KEY, clean);

  if (clean.ramOnly) {
    try {
      sessionStorage.removeItem(BYOK_ACTIVE_KEY);
    } catch {
      // noop
    }
    return clean;
  }

  try {
    sessionStorage.setItem(BYOK_ACTIVE_KEY, JSON.stringify(clean));
  } catch {
    // Fallback trasparente su ramVault in memoria volatile (es. Safari file://)
    clean.ramOnly = true;
  }
  return clean;
}

export function exportPortableStateJson() {
  const byok = loadByokConfig();
  return JSON.stringify(
    {
      version: 'adr0004-v1',
      exportedAt: new Date().toISOString(),
      byok: byok
        ? {
            provider: byok.provider,
            model: byok.model,
            ramOnly: Boolean(byok.ramOnly),
          }
        : null,
    },
    null,
    2,
  );
}

export function importPortableStateJson(rawJson) {
  const parsed = JSON.parse(String(rawJson || '{}'));
  if (parsed?.byok?.provider && BYOK_PROVIDERS[parsed.byok.provider]) {
    const existing = loadByokConfig();
    saveByokConfig({
      provider: parsed.byok.provider,
      model: parsed.byok.model || BYOK_PROVIDERS[parsed.byok.provider].defaultModel,
      apiKey: parsed.byok.apiKey || existing?.apiKey || '',
      ramOnly: Boolean(parsed.byok.ramOnly),
    });
  }
  return parsed;
}

export function getProxyBaseUrl() {
  const explicit = (globalThis.NOOB_CONFIG?.proxyBaseUrl || globalThis.NOOB_CONFIG?.gatewayBaseUrl || '').replace(/\/+$/, '');
  if (explicit) return explicit;
  const host = globalThis.location?.hostname || '';
  if (host.endsWith('github.io')) {
    return DEFAULT_CLOUD_RUN_GATEWAY;
  }
  return '';
}

/**
 * Silent simple-request pre-warming (GET /health with zero custom headers -> no CORS OPTIONS preflight).
 * Keeps Cloud Run warm for ~15 min while preserving scale-to-zero cost (~€0).
 */
export async function prewarmGateway() {
  if (globalThis.location?.protocol === 'file:') return false;
  const now = Date.now();
  if (now - lastPrewarmAt < 10 * 60 * 1000) return true;
  lastPrewarmAt = now;
  try {
    const res = await fetch(`${getProxyBaseUrl()}/health`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (typeof data?.altchaEnabled === 'boolean') {
        gatewayAltchaEnabled = data.altchaEnabled;
      }
      return true;
    }
  } catch {
    // Non-blocking best-effort warmup
  }
  return false;
}

async function sha256HexBrowser(input) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(input);
  const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchAndSolveAltcha(baseUrl) {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const chRes = await fetch(`${baseUrl}/api/altcha/challenge`, { method: 'GET' });
    if (!chRes.ok) return null;
    const ch = await chRes.json();
    const max = Math.min(Number(ch.maxnumber || 50000), 100000);
    for (let n = 0; n <= max; n += 1) {
      const digest = await sha256HexBrowser(`${ch.salt}${n}`);
      if (digest === ch.challenge) {
        const payload = {
          algorithm: ch.algorithm,
          challenge: ch.challenge,
          number: n,
          salt: ch.salt,
          signature: ch.signature,
        };
        return btoa(JSON.stringify(payload));
      }
    }
  } catch {
    // Fallback gracefully
  }
  return null;
}

export async function extractKn5Url(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) {
    return { ok: false, message: 'Inserisci un URL valido (es. https://www.youtube.com/watch?v=...).' };
  }

  const baseUrl = getProxyBaseUrl();
  if (globalThis.location?.protocol !== 'file:' || baseUrl) {
    try {
      const res = await fetch(`${baseUrl}/api/kn5/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data?.ok && data.extracted) {
        return { ok: true, extracted: data.extracted };
      }
      return {
        ok: false,
        message: data?.message || 'Impossibile estrarre il contenuto pubblico da questo link.',
      };
    } catch {
      // Fall through to client-side oEmbed attempt for YouTube
    }
  }

  // Fallback client-side leggero per file:// o assenza backend (YouTube oEmbed pubblico CORS *)
  if (/youtube\.com|youtu\.be/i.test(url)) {
    try {
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { credentials: 'omit' },
      );
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        return {
          ok: true,
          extracted: {
            ok: true,
            url,
            kind: 'youtube-metadata',
            source: oembed.author_name ? `YouTube · ${oembed.author_name}` : 'YouTube',
            title: oembed.title || 'Video YouTube',
            author: oembed.author_name || 'YouTube',
            content: `Titolo del video: "${oembed.title || ''}"\nCanale: ${oembed.author_name || 'YouTube'}\nURL: ${url}`,
            hasTranscript: false,
            warning:
              'Modalità offline/file://: letti titolo e canale via oEmbed. Avvia node server/index.mjs o usa il link Cloud Run per estrarre anche sottotitoli e pagine web.',
          },
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    ok: false,
    message:
      'In modalità file:// offline il browser blocca la lettura di siti esterni (CORS). Usa il link Cloud Run live, avvia node server/index.mjs oppure incolla il testo nel riquadro.',
  };
}

export async function checkProxyHealth() {
  if (globalThis.location?.protocol === 'file:') {
    return { reachable: false, proxyReady: false, providers: [] };
  }
  try {
    const res = await fetch(`${getProxyBaseUrl()}/api/health`);
    if (!res.ok) return { reachable: false, proxyReady: false, providers: [] };
    const data = await res.json();
    if (typeof data?.altchaEnabled === 'boolean') {
      gatewayAltchaEnabled = data.altchaEnabled;
    }
    return { reachable: true, ...data };
  } catch {
    return { reachable: false, proxyReady: false, providers: [] };
  }
}

async function callByokDirect(byok, serviceId, prompt, context) {
  const systemPrompt = SYSTEM_PROMPTS[serviceId] || SYSTEM_PROMPTS.assistant;
  const userText = context ? `CONTESTO PRESCARICATO:\n${context}\n\nRICHIESTA:\n${prompt}` : prompt;

  if (byok.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': byok.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: byok.model,
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: userText }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic BYOK HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.content?.map((c) => c.text || '').join('').trim();
    if (!text) throw new Error('Risposta Anthropic vuota');
    return text;
  }

  if (byok.provider === 'ollama') {
    const res = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: byok.model || 'llama3.2',
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama locale HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.message?.content?.trim();
    if (!text) throw new Error('Risposta Ollama vuota');
    return text;
  }

  const endpoint =
    byok.provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${byok.apiKey}`,
  };
  if (byok.provider === 'openrouter') {
    headers['X-Title'] = 'Noobucodonosor Hub BYOK';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    credentials: 'omit',
    headers,
    body: JSON.stringify({
      model: byok.model,
      temperature: 0.4,
      max_tokens: 700,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${byok.provider} BYOK HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`Risposta ${byok.provider} vuota`);
  return text;
}

export function runDeterministicFallback(serviceId, prompt, dataset, meta = {}) {
  const q = String(prompt || '').toLowerCase();

  if (serviceId === 'assistant') {
    if (q.includes('cost') || q.includes('api') || q.includes('gratuit') || q.includes('sutterfugio')) {
      return [
        '**Come funziona il sutterfugio a costo ~€0:**',
        '- **Dataset prescaricati:** ogni playground parte già carico di dati dimostrativi reali (zero upload, zero database esposti).',
        '- **Pool Free-Tier + Cache:** il proxy ruota su modelli gratuiti (Gemini Flash, Groq, OpenRouter `:free`) e mette in cache le risposte ricorrenti.',
        '- **Doppio paracadute:** se la soglia gratuita si esaurisce, puoi inserire una tua chiave gratuita (**BYOK** in `sessionStorage`) o usare l’analisi deterministica locale.',
        '- Progetti consigliati da guardare subito: **kn5** (sentinella di budget API) e **Leslie — Agency OS**.',
      ].join('\n');
    }
    if (q.includes('b2b') || q.includes('agenzia') || q.includes('lead') || q.includes('client')) {
      return [
        '**Consigliato per agenzie e team commerciali B2B:**',
        '- **Leslie — Agency OS** (provalo subito nel Playground AI qui sotto): scouting autonomo, qualificazione lead con score 0–10 e bozza outreach su misura.',
        '- **kn5 — Knowledge Ingestor**: trasforma video e post di settore in schede interne consultabili dal team.',
        '- Se vuoi valutare un flusso su misura per la tua azienda, guarda anche i repository completi su GitHub.',
      ].join('\n');
    }
    if (q.includes('offline') || q.includes('pwa') || q.includes('spesa') || q.includes('meteo')) {
      return [
        '**Prodotti digitali già online e pronti all’uso:**',
        '- **Basilico — Rapallo** (PWA offline-first su Cloud Run): offerte e volantini di 14 supermercati con cache locale e seed integrato.',
        '- **MedioMeteo Genova** (Cloud Run): 199 sensori reali OMIRL/ARPAL su 67 comuni + AI meteo contestuale.',
        '- **Genova Civica & Cultura**: guida territoriale statica su 67 comuni e quasi 5.000 attività.',
      ].join('\n');
    }
    return [
      '**Benvenuto nella vetrina Noobucodonosor!** Ecco come orientarti subito:',
      '- **3 App già Live:** *Basilico* (PWA spesa), *MedioMeteo Genova* (199 sensori), *Genova Civica & Cultura*.',
      '- **4 Playground AI Prescaricati qui in pagina:** *Leslie* (lead B2B), *kn5* (schede Obsidian), *resuscipack* (ricerca open-access), *ScooterLab* (telemetria IoT).',
      '- **Binario Locale Separato:** in fondo alla pagina puoi scaricare il file portabile `noobucodonosor-portable.html` da usare sul tuo PC.',
    ].join('\n');
  }

  if (serviceId === 'leslie') {
    const lead = meta.item || dataset?.playgrounds?.leslie?.items?.[0];
    const score = lead?.signals?.length >= 3 ? 8.5 : 7.5;
    return [
      `### Qualificazione Lead (Locale): ${lead?.name || 'Lead B2B'}`,
      `- **Score stimato:** **${score}/10** — Alta compatibilità con automazione CRM & qualificazione AI.`,
      `- **Settore / Area:** ${lead?.sector || 'B2B'} · ${lead?.location || 'Liguria'}`,
      '- **3 Segnali chiave rilevati:**',
      ...(lead?.signals || []).slice(0, 3).map((s) => `  - ${s}`),
      '',
      '**Bozza primo contatto (breve):**',
      `> Buongiorno team di ${lead?.name || 'riferimento'}, ho visto la vostra attività su ${lead?.location || 'territorio'} e il livello delle recensioni. Abbiamo preparato un prototipo snello per raccogliere e qualificare automaticamente le richieste partner/preventivi senza cambiare i vostri strumenti attuali. Se vi fa piacere, posso mostrarvi una demo di 5 minuti questa settimana.`,
    ].join('\n');
  }

  if (serviceId === 'kn5') {
    const item = meta.item || dataset?.playgrounds?.kn5?.items?.[0];
    const rawText = String(item?.transcript || prompt || '').trim();
    const words = rawText.split(/\s+/).filter(Boolean).length;
    const estTokens = Math.round(words * 1.35);
    const sentences = rawText
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 25)
      .slice(0, 3);
    const bullets =
      sentences.length > 0
        ? sentences.map((s) => `- ${s.slice(0, 220)}`)
        : [
            '- Il contenuto evidenzia un pattern pragmatico orientato a resilienza, controllo dei costi e verificabilità.',
            '- Struttura pronta per archiviazione in vault Obsidian con frontmatter standardizzato.',
          ];
    return [
      '```yaml',
      '---',
      `title: "${(item?.title || 'Nota kn5').replace(/"/g, "'")}"`,
      `source: "${(item?.source || 'Testo utente').replace(/"/g, "'")}"`,
      ...(item?.url ? [`url: "${item.url}"`] : []),
      'tags: [kn5, knowledge-ingestor, sintesi-locale]',
      `estimated_tokens: ${estTokens}`,
      'estimated_cost_eur: 0.0000',
      '---',
      '```',
      '**Sintesi operativa:**',
      ...bullets,
      '- **Sentinella Budget kn5:** modalità locale deterministica attiva (€0.00 spesi).',
      '',
      '**3 Azioni pratiche:**',
      '1. Archiviare la scheda nella libreria di progetto con tag tematici.',
      '2. Collegare la nota a un ADR o a una checklist operativa.',
      '3. Attivare un modello free-tier (Proxy o BYOK) per estrarre domande di approfondimento.',
    ].join('\n');
  }

  if (serviceId === 'resuscipack') {
    const sources = meta.items?.length ? meta.items : dataset?.playgrounds?.resuscipack?.items || [];
    const primary = sources.slice(0, 2);
    const lines = [
      '### Sintesi Epistemica Verificata (Modalità Locale)',
      `- **Fonti attive consultate (${primary.length}/${sources.length}):**`,
      ...primary.map((s) => `  - **[${s.id}]** *${s.title}* (${s.discipline}): ${s.excerpt}`),
      '',
      '**Ponte Trasversale ("Libro Sbagliato"):**',
    ];
    if (primary.length >= 2) {
      lines.push(
        `Collegando **[${primary[0].id}]** con **[${primary[1].id}]**, lo stesso principio di *immutabilità verificabile* unisce la tracciabilità dei contenuti alla sicurezza applicativa: ogni asserzione o modifica resta auditabile nel tempo.`,
      );
    } else {
      lines.push('Seleziona o filtra almeno due fonti Open-Access per generare un ponte trasversale.');
    }
    return lines.join('\n');
  }

  if (serviceId === 'scooterlab') {
    const s = dataset?.playgrounds?.scooterlab?.session;
    const points = s?.points || [];
    const maxLeanPt = points.reduce((best, p) => (p.leanDeg > (best?.leanDeg ?? -1) ? p : best), points[0]);
    const maxBrakePt = points.reduce((best, p) => (p.accelG < (best?.accelG ?? 99) ? p : best), points[0]);
    return [
      `### Analisi Telemetrica .slab — ${s?.sessionId || 'Sessione Demo'}`,
      `- **Tratta:** ${s?.route || 'Costiera Ligure'} (${s?.distanceKm} km in ${s?.durationMin} min, media ${s?.avgSpeedKmh} km/h).`,
      `- **Criticità #1 (Piega massima):** **${maxLeanPt?.leanDeg}°** a *${maxLeanPt?.zone}* (${maxLeanPt?.t}) — ${maxLeanPt?.note}.`,
      `- **Criticità #2 (Decelerazione massima):** **${maxBrakePt?.accelG} g** a *${maxBrakePt?.zone}* (${maxBrakePt?.t}) — ${maxBrakePt?.note}.`,
      '',
      '**3 Consigli pratici di sicurezza:**',
      '1. Sui tornanti costieri in ombra (asfalto ~17°C), anticipa l’impostazione di traiettoria per ridurre la piega di 3–4°.',
      '2. In ingresso rotonda/attraversamenti urbani, modula la decelerazione progressiva per evitare picchi oltre -0.60 g.',
      '3. Sincronizza il file `.slab` su Wi-Fi garage per confrontare il trend frenate settimana su settimana.',
    ].join('\n');
  }

  if (serviceId === 'basilico') {
    const req = String(prompt || 'Spesa settimanale per 2 persone').trim();
    return [
      `# Lista della Spesa — Basilico`,
      `Richiesta: ${req}`,
      '',
      '## Ortofrutta',
      '- [ ] Verdure di stagione (1 kg)',
      '- [ ] Frutta fresca di stagione (1 kg)',
      '- [ ] Aromi freschi (basilico / prezzemolo)',
      '',
      '## Dispensa',
      '- [ ] Pasta di semola (2 pacchi)',
      '- [ ] Olio extravergine d’oliva (1 bottiglia, controlla offerte volantino)',
      '- [ ] Legumi o passata di pomodoro (3 confezioni)',
      '',
      '## Freschi & Proteine',
      '- [ ] Latticini / formaggio fresco',
      '- [ ] Uova (6 pz) o alternativa proteica',
      '',
      'Consiglio risparmio: confronta i volantini locali su Basilico Live prima di uscire.',
    ].join('\n');
  }

  if (serviceId === 'mediometeo') {
    const zone = String(prompt || 'Genova Centro / Tigullio').trim();
    return [
      `# Bollettino Sintetico — MedioMeteo Genova`,
      `Zona richiesta: ${zone}`,
      '',
      '- Modalità: stima locale offline (per i dati in tempo reale dai 199 sensori apri MedioMeteo Live).',
      '- Cielo e precipitazioni: variabilità locale con possibili addensamenti sui rilievi.',
      '- Vento e mare: brezza tesa lungo la costa, moto ondoso da valutare sotto costa.',
      '- Consiglio pratico: verifica la stazione più vicina alla tua zona su MedioMeteo Genova.',
    ].join('\n');
  }

  return 'Analisi locale completata sui dati prescaricati.';
}

export async function runServiceAI({ serviceId, prompt, context = '', dataset = null, meta = {}, preferByok = false }) {
  const byok = loadByokConfig();

  // 1) If user explicitly configured BYOK (or we are running from file:// portable bundle)
  if (byok && (preferByok || globalThis.location?.protocol === 'file:')) {
    try {
      const text = await callByokDirect(byok, serviceId, prompt, context);
      return {
        ok: true,
        mode: 'byok',
        provider: byok.provider,
        providerLabel: `${BYOK_PROVIDERS[byok.provider].label} (BYOK)`,
        model: byok.model,
        cached: false,
        text,
      };
    } catch (err) {
      const isFileCorsBlock =
        globalThis.location?.protocol === 'file:' && err instanceof TypeError;
      const notice = isFileCorsBlock
        ? 'Blocco CORS su Origin: null (file://). Per usare BYOK dal browser avvia un server locale con: python3 -m http.server 8080 e apri http://localhost:8080/noobucodonosor-portable.html. Attivato intanto il Motore Deterministico Locale.'
        : `Chiamata BYOK fallita (${err.message}). Mostro l'analisi deterministica locale.`;
      return {
        ok: true,
        mode: 'local-fallback',
        provider: 'local',
        providerLabel: 'Motore Locale Deterministico',
        model: 'offline-rules-v1',
        cached: false,
        notice,
        text: runDeterministicFallback(serviceId, prompt, dataset, meta),
      };
    }
  }

  // 2) Try Free-Tier Server Proxy (when served over HTTP/HTTPS)
  if (globalThis.location?.protocol !== 'file:') {
    try {
      const baseUrl = getProxyBaseUrl();
      const reqHeaders = { 'Content-Type': 'application/json' };
      if (gatewayAltchaEnabled) {
        const altchaToken = await fetchAndSolveAltcha(baseUrl);
        if (altchaToken) reqHeaders['X-Altcha-Payload'] = altchaToken;
      }

      const res = await fetch(`${baseUrl}/api/ai/complete`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          serviceId,
          presetId: meta?.presetId || meta?.item?.id || null,
          userQuery: prompt,
          context,
          urlAlreadyExtracted: Boolean(meta?.urlAlreadyExtracted),
        }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        return data;
      }

      // Proxy unavailable or quota exhausted -> try BYOK if configured
      if (byok) {
        try {
          const text = await callByokDirect(byok, serviceId, prompt, context);
          return {
            ok: true,
            mode: 'byok',
            provider: byok.provider,
            providerLabel: `${BYOK_PROVIDERS[byok.provider].label} (BYOK Fallback)`,
            model: byok.model,
            cached: false,
            text,
          };
        } catch {
          // fall through to deterministic local
        }
      }

      return {
        ok: true,
        mode: 'local-fallback',
        provider: 'local',
        providerLabel: 'Motore Locale Deterministico',
        model: 'offline-rules-v1',
        cached: false,
        notice:
          data?.message ||
          'Proxy free-tier non configurato o esaurito: risposta generata in modalità locale deterministica. Puoi attivare una chiave BYOK gratuita in 20 secondi.',
        suggestByok: true,
        text: runDeterministicFallback(serviceId, prompt, dataset, meta),
      };
    } catch {
      // Proxy unreachable (e.g., static GitHub Pages without backend)
      if (byok) {
        try {
          const text = await callByokDirect(byok, serviceId, prompt, context);
          return {
            ok: true,
            mode: 'byok',
            provider: byok.provider,
            providerLabel: `${BYOK_PROVIDERS[byok.provider].label} (BYOK)`,
            model: byok.model,
            cached: false,
            text,
          };
        } catch {
          // fall through
        }
      }
    }
  }

  // 3) Guaranteed deterministic local fallback
  return {
    ok: true,
    mode: 'local-fallback',
    provider: 'local',
    providerLabel: 'Motore Locale Deterministico',
    model: 'offline-rules-v1',
    cached: false,
    notice:
      'Modalità locale deterministica attiva (costo €0). Per risposte generative AI complete, avvia il proxy free-tier oppure inserisci una chiave gratuita BYOK.',
    suggestByok: true,
    text: runDeterministicFallback(serviceId, prompt, dataset, meta),
  };
}
