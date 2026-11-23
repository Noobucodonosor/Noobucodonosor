import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAppServer, extractClientIp } from '../server/index.mjs';
import { FreeTierRouter } from '../server/free-tier-router.mjs';
import { buildPortableBundle } from '../scripts/build-bundles.mjs';

test('HTTP server serves portal, dataset, health without secret leaks, AI proxy and portable download', async (t) => {
  const mockRouter = new FreeTierRouter({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Sintesi verificata [OA-01-PRO-GIT].' }] } }],
      }),
    }),
    providers: [
      { id: 'gemini', label: 'Google Gemini (Free Tier)', model: 'gemini-2.5-flash', apiKey: 'SUPER_SECRET_KEY_123' },
    ],
  });

  const server = createAppServer({ router: mockRouter });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  // 1) Home page
  const homeRes = await fetch(`${base}/`);
  assert.equal(homeRes.status, 200);
  const homeHtml = await homeRes.text();
  assert.match(homeHtml, /Assistente Noobucodonosor/);

  // 2) Preloaded dataset
  const dataRes = await fetch(`${base}/data/preloaded-services.json`);
  assert.equal(dataRes.status, 200);
  const dataset = await dataRes.json();
  assert.equal(dataset.projects.length, 8);
  assert.ok(dataset.playgrounds.leslie.items.length >= 3);
  assert.ok(dataset.playgrounds.kn5.items.length >= 3);
  assert.ok(dataset.playgrounds.resuscipack.items.length >= 4);
  assert.ok(dataset.playgrounds.scooterlab.session.points.length >= 5);

  // 3) Health endpoint must NOT leak API keys
  const healthRes = await fetch(`${base}/api/health`);
  assert.equal(healthRes.status, 200);
  const healthText = await healthRes.text();
  assert.doesNotMatch(healthText, /SUPER_SECRET_KEY_123/);
  const health = JSON.parse(healthText);
  assert.equal(health.proxyReady, true);
  assert.equal(health.providers[0].id, 'gemini');

  // 4) AI complete endpoint
  const aiRes = await fetch(`${base}/api/ai/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'resuscipack',
      prompt: 'Spiega Git',
      context: '[OA-01-PRO-GIT] Pro Git',
    }),
  });
  assert.equal(aiRes.status, 200);
  const aiData = await aiRes.json();
  assert.equal(aiData.ok, true);
  assert.equal(aiData.provider, 'gemini');
  assert.match(aiData.text, /OA-01-PRO-GIT/);

  // 5) Portable bundle download
  const { outPath } = buildPortableBundle();
  assert.ok(fs.existsSync(outPath));
  const dlRes = await fetch(`${base}/bundles/${path.basename(outPath)}?download=1`);
  assert.equal(dlRes.status, 200);
  assert.match(dlRes.headers.get('content-disposition') || '', /attachment/);
  const bundleHtml = await dlRes.text();
  assert.match(bundleHtml, /__PRELOADED_DATASET__/);
  assert.match(bundleHtml, /credentials:\s*'omit'/);
  assert.match(bundleHtml, /Document\.parseHTML/);
  assert.match(bundleHtml, /anthropic-dangerous-direct-browser-access/);
  assert.match(bundleHtml, /localhost:11434\/api\/chat/);
  assert.match(bundleHtml, /exportPortableStateJson/);
  assert.doesNotMatch(bundleHtml, /type="module"/);
  assert.doesNotMatch(bundleHtml, /href="\.\/styles\.css"/);
  assert.doesNotMatch(bundleHtml, /src="\.\/app\.js"/);

  // 6) Payload over 16 KB must be rejected with 413
  const bigRes = await fetch(`${base}/api/ai/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'kn5',
      userQuery: 'a'.repeat(17000),
    }),
  });
  assert.equal(bigRes.status, 413);
});

test('extractClientIp reads X-Forwarded-For right-to-left and ignores spoofed leftmost IP', () => {
  const ip = extractClientIp({
    headers: { 'x-forwarded-for': '203.0.113.99, 198.51.100.42, 169.254.1.1' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  assert.equal(ip, '198.51.100.42');
});
