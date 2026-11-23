import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGatewayServer } from '../src/server.mjs';
import { FreeTierRouter } from '../src/free-tier-router.mjs';
import { AltchaGate, solveAltchaChallenge } from '../src/altcha.mjs';
import { createCorsPolicy } from '../src/cors.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '..', 'src');

test('zero-brand invariant: packages/ai-gateway/src contains no hardcoded brand or showcase references', () => {
  const forbidden = [/noobucodonosor/i, /basilico/i, /showcase\.config\.json/i];
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.mjs'));
  assert.ok(files.length >= 5);
  for (const file of files) {
    const content = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(
        content,
        pattern,
        `Forbidden brand reference ${pattern} found in packages/ai-gateway/src/${file}`,
      );
    }
  }
});

test('CORS policy enforces exact allowlist, rejects Origin: null, emits Vary: Origin and Max-Age: 7200', () => {
  const cors = createCorsPolicy({
    allowedOrigins: 'https://example.github.io, https://app.example.com/',
    allowLocalhost: false,
  });

  assert.equal(cors.isOriginAllowed('https://example.github.io'), true);
  assert.equal(cors.isOriginAllowed('https://app.example.com'), true);
  assert.equal(cors.isOriginAllowed('null'), false);
  assert.equal(cors.isOriginAllowed('https://evil.example.com'), false);
  assert.equal(cors.isOriginAllowed('http://localhost:8080'), false);

  const allowedHeaders = cors.buildHeaders(
    { headers: { origin: 'https://example.github.io' } },
    { isPreflight: true },
  );
  assert.equal(allowedHeaders['Access-Control-Allow-Origin'], 'https://example.github.io');
  assert.equal(allowedHeaders.Vary, 'Origin');
  assert.equal(allowedHeaders['Access-Control-Max-Age'], '7200');

  const nullHeaders = cors.buildHeaders({ headers: { origin: 'null' } }, { isPreflight: true });
  assert.equal(nullHeaders['Access-Control-Allow-Origin'], undefined);
  assert.equal(nullHeaders.Vary, 'Origin');
});

test('AltchaGate creates verifiable SHA-256 PoW challenge and blocks replays and tampering', () => {
  const gate = new AltchaGate({ enabled: true, hmacKey: 'test-secret-key', maxNumber: 2000 });
  const challenge = gate.createChallenge();
  assert.equal(challenge.algorithm, 'SHA-256');
  assert.ok(challenge.challenge.length === 64);

  const solvedB64 = solveAltchaChallenge(challenge);
  assert.ok(solvedB64, 'Challenge should be solvable within maxNumber');

  // First verification succeeds
  assert.deepEqual(gate.verifyPayload(solvedB64), { ok: true });

  // Replay must fail
  assert.deepEqual(gate.verifyPayload(solvedB64), { ok: false, reason: 'challenge_replayed' });

  // Tampered payload must fail
  const tampered = JSON.parse(Buffer.from(solvedB64, 'base64').toString('utf8'));
  tampered.signature = '0'.repeat(64);
  assert.deepEqual(gate.verifyPayload(tampered), { ok: false, reason: 'invalid_signature' });
});

test('Gateway server serves /health, enforces ALTCHA PoW when enabled, and caches responses', async (t) => {
  const altchaGate = new AltchaGate({ enabled: true, hmacKey: 'gateway-test-hmac', maxNumber: 2000 });
  const router = new FreeTierRouter({
    services: {
      demo: { profile: 'compact-json', maxTokens: 200, systemPrompt: 'Reply concisely.' },
    },
    providers: [
      { id: 'groq', family: 'groq', label: 'Groq', model: 'test-model', apiKey: 'SECRET_KEY' },
    ],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Gateway OK' } }] }),
    }),
  });

  const server = createGatewayServer({
    router,
    altchaGate,
    allowedOrigins: 'https://example.github.io',
    allowLocalhost: false,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  // 1) Simple-request /health pre-warming endpoint
  const healthRes = await fetch(`${base}/health`, {
    headers: { Origin: 'https://example.github.io' },
  });
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.headers.get('access-control-allow-origin'), 'https://example.github.io');
  assert.equal(healthRes.headers.get('vary'), 'Origin');
  const health = await healthRes.json();
  assert.equal(health.ok, true);
  assert.equal(health.altchaEnabled, true);

  // 2) Unauthenticated / missing ALTCHA must be blocked (403)
  const blockedRes = await fetch(`${base}/api/ai/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceId: 'demo', userQuery: 'Hello gateway' }),
  });
  assert.equal(blockedRes.status, 403);
  const blocked = await blockedRes.json();
  assert.equal(blocked.error, 'altcha_verification_failed');

  // 3) Fetch challenge, solve PoW, succeed
  const chRes = await fetch(`${base}/api/altcha/challenge`);
  assert.equal(chRes.status, 200);
  const ch = await chRes.json();
  const token = solveAltchaChallenge(ch);

  const okRes = await fetch(`${base}/api/ai/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Altcha-Payload': token,
    },
    body: JSON.stringify({ serviceId: 'demo', userQuery: 'Hello gateway' }),
  });
  assert.equal(okRes.status, 200);
  const okData = await okRes.json();
  assert.equal(okData.ok, true);
  assert.equal(okData.text, 'Gateway OK');

  // 4) Subsequent cache hit bypasses ALTCHA smoothly
  const cachedRes = await fetch(`${base}/api/ai/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceId: 'demo', userQuery: 'Hello gateway' }),
  });
  assert.equal(cachedRes.status, 200);
  const cachedData = await cachedRes.json();
  assert.equal(cachedData.cached, true);
});
