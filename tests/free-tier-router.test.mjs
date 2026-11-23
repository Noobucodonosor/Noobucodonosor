import test from 'node:test';
import assert from 'node:assert/strict';
import { FreeTierRouter } from '../server/free-tier-router.mjs';

test('rejects disallowed serviceId to prevent open relay abuse', async () => {
  const router = new FreeTierRouter({ providers: [] });
  const res = await router.complete({
    serviceId: 'arbitrary-open-chat',
    prompt: 'Hello',
    clientIp: '127.0.0.1',
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
  assert.equal(res.error, 'invalid_service');
});

test('long-rag fails over from gemini-lite (429) to openrouter and canonicalizes cache keys', async () => {
  const calls = [];
  const mockFetch = async (url) => {
    calls.push(url);
    if (url.includes('generativelanguage.googleapis.com')) {
      return { ok: false, status: 429, text: async () => 'rate limit per minute', json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Scheda kn5 pronta.' } }],
      }),
    };
  };

  const router = new FreeTierRouter({
    fetchImpl: mockFetch,
    providers: [
      { id: 'gemini-lite', family: 'gemini', label: 'Gemini Flash-Lite', model: 'gemini-3.5-flash-lite', apiKey: 'k1' },
      { id: 'openrouter', family: 'openrouter', label: 'OpenRouter (:free)', model: 'meta-llama/llama-3.3-70b-instruct:free', apiKey: 'k2' },
    ],
  });

  const first = await router.complete({
    serviceId: 'kn5',
    userQuery: 'Sintetizza   nota',
    context: 'Trascrizione demo',
    clientIp: '10.0.0.1',
  });

  assert.equal(first.ok, true);
  assert.equal(first.provider, 'openrouter');
  assert.equal(first.cached, false);
  assert.equal(calls.length, 2);

  // Whitespace-variant query must hit canonical SHA-256 cache (0 upstream fetch calls)
  const second = await router.complete({
    serviceId: 'kn5',
    userQuery: '  Sintetizza nota ',
    context: 'Trascrizione demo',
    clientIp: '10.0.0.2',
  });

  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(second.mode, 'proxy-cache');
  assert.equal(calls.length, 2);
});

test('compact-json routes to Groq primary before Gemini', async () => {
  const calls = [];
  const mockFetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Score 9/10 — Ottimo lead B2B.' } }],
      }),
    };
  };

  const router = new FreeTierRouter({
    fetchImpl: mockFetch,
    providers: [
      { id: 'gemini-lite', family: 'gemini', label: 'Gemini Flash-Lite', model: 'gemini-3.5-flash-lite', apiKey: 'k1' },
      { id: 'groq', family: 'groq', label: 'Groq', model: 'openai/gpt-oss-20b', apiKey: 'k2' },
    ],
  });

  const res = await router.complete({
    serviceId: 'leslie',
    userQuery: 'Qualifica lead',
    context: 'Charter Tigullio',
    clientIp: '10.0.0.3',
  });

  assert.equal(res.ok, true);
  assert.equal(res.provider, 'groq');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.groq\.com/);
});

test('enforces per-IP hourly rate limit and suggests BYOK/local fallback', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: 'Risposta OK' } }],
    }),
  });

  const router = new FreeTierRouter({
    fetchImpl: mockFetch,
    ipLimitPerHour: 2,
    providers: [{ id: 'groq', label: 'Groq', model: 'llama-3.3-70b-versatile', apiKey: 'k' }],
  });

  const r1 = await router.complete({ serviceId: 'assistant', prompt: 'Domanda 1', clientIp: '1.2.3.4' });
  const r2 = await router.complete({ serviceId: 'assistant', prompt: 'Domanda 2', clientIp: '1.2.3.4' });
  const r3 = await router.complete({ serviceId: 'assistant', prompt: 'Domanda 3', clientIp: '1.2.3.4' });

  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r3.ok, false);
  assert.equal(r3.status, 429);
  assert.equal(r3.error, 'ip_rate_limited');
  assert.equal(r3.fallbackSuggested, 'byok_or_local');
});

test('enforces global daily cap', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: 'OK' } }],
    }),
  });

  const router = new FreeTierRouter({
    fetchImpl: mockFetch,
    dailyGlobalCap: 1,
    providers: [{ id: 'groq', label: 'Groq', model: 'llama-3.3-70b-versatile', apiKey: 'k' }],
  });

  const r1 = await router.complete({ serviceId: 'kn5', prompt: 'Nota 1', clientIp: '1.1.1.1' });
  const r2 = await router.complete({ serviceId: 'kn5', prompt: 'Nota 2', clientIp: '2.2.2.2' });

  assert.equal(r1.ok, true);
  assert.equal(r2.ok, false);
  assert.equal(r2.status, 429);
  assert.equal(r2.error, 'daily_cap_reached');
});
