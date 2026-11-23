import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicUrlIngestor, validateSafeExternalUrl } from '../server/url-ingestor.mjs';
import { createAppServer } from '../server/index.mjs';
import { FreeTierRouter } from '../server/free-tier-router.mjs';

test('SSRF guard blocks localhost, cloud metadata IP, private DNS resolution and non-HTTP schemes', async () => {
  await assert.rejects(() => validateSafeExternalUrl('http://127.0.0.1:8080/secret'), {
    code: 'ssrf_blocked',
  });
  await assert.rejects(
    () => validateSafeExternalUrl('http://169.254.169.254/computeMetadata/v1/'),
    { code: 'ssrf_blocked' },
  );
  await assert.rejects(() => validateSafeExternalUrl('file:///etc/passwd'), {
    code: 'unsupported_protocol',
  });

  // DNS rebinding / internal resolution check
  const fakeInternalLookup = async () => [{ address: '10.0.0.42', family: 4 }];
  await assert.rejects(
    () => validateSafeExternalUrl('https://evil.example.com/test', fakeInternalLookup),
    { code: 'ssrf_blocked' },
  );
});

test('PublicUrlIngestor extracts YouTube oEmbed + XML captions and caches result', async () => {
  let fetchCount = 0;
  const mockLookup = async () => [{ address: '142.250.180.14', family: 4 }];
  const mockFetch = async (url) => {
    fetchCount += 1;
    if (url.includes('/oembed?')) {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        text: async () =>
          JSON.stringify({ title: 'Guida Pratica ADR & AI', author_name: 'Noobucodonosor Channel' }),
      };
    }
    if (url.includes('youtube.com/watch')) {
      const playerJson = JSON.stringify({
        videoDetails: {
          title: 'Guida Pratica ADR & AI',
          author: 'Noobucodonosor Channel',
          shortDescription: 'Video dimostrativo sugli ADR.',
        },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              { languageCode: 'it', baseUrl: 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=it' },
            ],
          },
        },
      });
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html; charset=utf-8']]),
        text: async () => `<html><script>var ytInitialPlayerResponse = ${playerJson};</script></html>`,
      };
    }
    if (url.includes('timedtext')) {
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/xml']]),
        text: async () =>
          '<transcript><text start="0" dur="2">Gli ADR documentano il &amp;quot;perch&#233;&amp;quot; delle scelte.</text><text start="2" dur="3">Evitano regressioni tra agenti AI.</text></transcript>',
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const ingestor = new PublicUrlIngestor({ fetchImpl: mockFetch, lookupImpl: mockLookup });
  const res = await ingestor.ingest('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  assert.equal(res.ok, true);
  assert.equal(res.kind, 'youtube-transcript');
  assert.equal(res.title, 'Guida Pratica ADR & AI');
  assert.equal(res.hasTranscript, true);
  assert.match(res.content, /Evitano regressioni tra agenti AI/);
  assert.equal(fetchCount, 3);

  // Second call hits LRU cache (0 network calls)
  const cachedRes = await ingestor.ingest('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(cachedRes.cached, true);
  assert.equal(fetchCount, 3);
});

test('POST /api/kn5/extract and /api/ai/complete auto-extract public article URLs', async (t) => {
  const mockLookup = async () => [{ address: '93.184.216.34', family: 4 }];
  const mockUrlIngestor = new PublicUrlIngestor({
    lookupImpl: mockLookup,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/html; charset=utf-8']]),
      text: async () => `
        <html>
          <head>
            <meta property="og:title" content="Architettura Serverless a Costo Zero" />
            <meta property="og:site_name" content="TechBlog" />
          </head>
          <body>
            <script>alert('xss')</script>
            <article>
              <p>Costruire micro-servizi con Node.js 22 zero-dependency riduce la superficie di attacco e mantiene i costi a zero euro.</p>
            </article>
          </body>
        </html>`,
    }),
  });

  let capturedPromptPayload = '';
  const mockRouter = new FreeTierRouter({
    fetchImpl: async (_url, init) => {
      capturedPromptPayload = String(init?.body || '');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '---\ntitle: "Architettura Serverless"\n---' }] } }],
        }),
      };
    },
    providers: [
      { id: 'gemini-lite', family: 'gemini', label: 'Gemini Flash-Lite', model: 'gemini-3.5-flash-lite', apiKey: 'k' },
    ],
  });

  const server = createAppServer({ router: mockRouter, urlIngestor: mockUrlIngestor });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const base = `http://127.0.0.1:${server.address().port}`;

  // 1) Direct /api/kn5/extract
  const exRes = await fetch(`${base}/api/kn5/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/serverless-zero' }),
  });
  assert.equal(exRes.status, 200);
  const exData = await exRes.json();
  assert.equal(exData.ok, true);
  assert.equal(exData.extracted.title, 'Architettura Serverless a Costo Zero');
  assert.doesNotMatch(exData.extracted.content, /alert\('xss'\)/);

  // 2) Auto-ingest when pasting URL directly into /api/ai/complete for kn5
  const aiRes = await fetch(`${base}/api/ai/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'kn5',
      userQuery: 'https://example.com/serverless-zero',
    }),
  });
  assert.equal(aiRes.status, 200);
  const aiData = await aiRes.json();
  assert.equal(aiData.ok, true);
  assert.equal(aiData.extractedSource?.title, 'Architettura Serverless a Costo Zero');
  assert.match(capturedPromptPayload, /Costruire micro-servizi con Node\.js 22/);
});
