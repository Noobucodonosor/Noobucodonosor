import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchProjectState,
  renderCard,
  renderShowcase,
  renderBentoShowcase,
  parseProfileArgs,
  replaceBlock,
} from '../.github/scripts/update-profile.mjs';
import {
  renderHeroSvg,
  renderProjectCardSvg,
  renderSmilCounter,
} from '../scripts/build-profile-hud.mjs';

test('parseProfileArgs detects --dry-run flag', () => {
  assert.equal(parseProfileArgs([]).dryRun, false);
  assert.equal(parseProfileArgs(['--dry-run']).dryRun, true);
});

test('fetchProjectState falls back gracefully when GitHub API fails or rate-limits', async () => {
  const failingFetch = async (url, opts) => {
    if (opts?.method === 'HEAD') {
      return { ok: false, status: 404, statusText: 'Not Found' };
    }
    return { ok: false, status: 403, statusText: 'rate limit exceeded' };
  };

  const state = await fetchProjectState(
    {
      repo: 'demo-repo',
      title: 'Demo Project',
      category: 'Test',
      liveUrl: 'https://example.com',
      liveLabel: 'Prova',
      infoUrl: 'https://github.com/Noobucodonosor/demo-repo',
      summary: 'Summary',
    },
    { fetchImpl: failingFetch }
  );

  assert.equal(state.apiFallback, true);
  assert.equal(state.hasPreview, false);
  assert.equal(state.freshness, '⚪ Stabile');
  assert.equal(state.lastDateIt, 'N/D');

  const cardHtml = renderCard(state);
  assert.ok(!cardHtml.includes('<img '), 'Card omits broken <img> when social-preview.png is missing');
  assert.ok(cardHtml.includes('Demo Project'));
});

test('replaceBlock replaces content between HTML markers', () => {
  const src = 'before\n<!-- SHOWCASE:START -->\nold\n<!-- SHOWCASE:END -->\nafter';
  const out = replaceBlock(src, 'SHOWCASE', 'new-content');
  assert.ok(out.includes('<!-- SHOWCASE:START -->\nnew-content\n<!-- SHOWCASE:END -->'));
});

test('renderShowcase renders full-width single-column rows', () => {
  const html = renderShowcase([
    {
      repo: 'r1',
      title: 'Project 1',
      category: 'Cat 1',
      liveUrl: 'https://example.com/1',
      liveLabel: 'Prova',
      infoUrl: 'https://github.com/Noobucodonosor/r1',
      summary: 'Summary 1',
      hasPreview: true,
      previewSha: 'abc123',
      freshness: '🟢 Aggiornato oggi',
      lastDateIt: '23 nov 2026',
    },
    {
      repo: 'r2',
      title: 'Project 2',
      category: 'Cat 2',
      liveUrl: 'https://example.com/2',
      liveLabel: 'Prova',
      infoUrl: 'https://github.com/Noobucodonosor/r2',
      summary: 'Summary 2',
      hasPreview: false,
      freshness: '⚪ Stabile',
      lastDateIt: 'N/D',
    },
  ]);

  assert.equal((html.match(/<tr>/g) || []).length, 2);
  assert.ok(html.includes('<td width="100%" valign="top">'));
  assert.ok(html.includes('width="100%" />'));
  assert.ok(!html.includes('width="50%"'));
});

test('renderCard renders clean desktop screenshot and quickLinks for genova-settimana', () => {
  const html = renderCard({
    repo: 'genova-settimana',
    title: 'Cosa faccio questa settimana a Genova',
    category: 'Agenda & Territorio (67 comuni)',
    previewPath: 'docs/preview/desktop.png',
    previewSha: 'fc48f839',
    liveUrl: 'https://noobucodonosor.github.io/genova-settimana/',
    liveLabel: 'Apri Questa settimana',
    liveIcon: '📅',
    quickLinks: [
      { label: '🧭 Tempo libero', url: 'https://noobucodonosor.github.io/genova-settimana/bussola.html' },
      { label: '🏪 Esercenti', url: 'https://noobucodonosor.github.io/genova-settimana/esercenti.html' },
    ],
    infoUrl: 'https://github.com/Noobucodonosor/genova-settimana',
    summary: 'Summary',
    freshness: '🟢 Aggiornato oggi',
    lastDateIt: '23 nov 2026',
  });

  assert.ok(html.includes('docs/preview/desktop.png?v=fc48f839'));
  assert.ok(html.includes('width="100%" />'));
  assert.ok(html.includes('📅 Apri Questa settimana'));
  assert.ok(html.includes('🧭 Tempo libero'));
  assert.ok(html.includes('🏪 Esercenti'));
});

test('SVG HUD generator produces pure native SVG without foreignObject and respects STATIC=1', () => {
  const animatedHero = renderHeroSvg({
    theme: 'dark',
    identity: { handle: 'noobucodonosor', tagline: 'Test tagline', location: 'Genova' },
    states: [{ repo: 'mediometeo', slug: 'mediometeo', weekUpdatesCount: 3, freshness: '🟢 Aggiornato oggi' }],
    hubProbe: { ok: true, status: 200, latencyMs: 120 },
    updatedAtIt: '23 nov 2026, 21:00',
    isStatic: false,
  });

  assert.ok(!animatedHero.includes('<foreignObject'), 'Must not use foreignObject for WebKit safety');
  assert.ok(animatedHero.includes('prefers-reduced-motion: reduce'));
  assert.ok(animatedHero.includes('gradientTransform'));

  const staticHero = renderHeroSvg({
    theme: 'light',
    identity: { handle: 'noobucodonosor', tagline: 'Test tagline', location: 'Genova' },
    states: [{ repo: 'mediometeo', slug: 'mediometeo', weekUpdatesCount: 3, freshness: '🟢 Aggiornato oggi' }],
    hubProbe: { ok: false, status: 0, latencyMs: 4000 },
    updatedAtIt: '23 nov 2026, 21:00',
    isStatic: true,
  });

  assert.ok(!staticHero.includes('<animateTransform'), 'STATIC=1 omits SMIL animateTransform');
  assert.ok(staticHero.includes('HUB STANDBY'));

  const smilCounter = renderSmilCounter({
    x: 10,
    y: 20,
    targetValue: 199,
    suffix: ' sensori',
    fill: '#fff',
    isStatic: false,
  });
  assert.equal((smilCounter.match(/<set /g) || []).length, 18, 'Uses 18 SMIL <set> frames');

  const bentoHtml = renderBentoShowcase([
    {
      repo: 'genova-settimana',
      slug: 'genova-settimana',
      title: 'Cosa faccio questa settimana a Genova',
      category: 'Agenda & Territorio',
      liveUrl: 'https://noobucodonosor.github.io/genova-settimana/',
      infoUrl: 'https://github.com/Noobucodonosor/genova-settimana',
      summary: 'Summary',
      hasPreview: true,
      previewPath: 'docs/preview/desktop.png',
      previewSha: 'fc48f839',
    },
    {
      repo: 'mediometeo',
      slug: 'mediometeo',
      title: 'MedioMeteo Genova',
      category: 'Meteo & Sensori',
      liveUrl: 'https://mediometeo-664856461640.europe-west1.run.app',
      infoUrl: 'https://github.com/Noobucodonosor/mediometeo',
      summary: 'Summary 2',
    },
  ]);

  assert.ok(bentoHtml.includes('#gh-light-mode-only'));
  assert.ok(bentoHtml.includes('#gh-dark-mode-only'));
  assert.ok(bentoHtml.includes('width="49%"'));
  assert.ok(bentoHtml.includes('<details>'));

  const cardSvg = renderProjectCardSvg({
    theme: 'dark',
    project: {
      repo: 'mediometeo',
      slug: 'mediometeo',
      title: 'MedioMeteo Genova',
      category: 'Meteo & Sensori',
      metricValue: 199,
      metricSuffix: ' sensori',
      metricSub: 'OMIRL · 67 comuni',
      freshness: '🟢 Aggiornato oggi',
      lastDateIt: '23 nov 2026',
      weekUpdatesCount: 3,
    },
    probe: { ok: true, status: 200, latencyMs: 95 },
    isStatic: true,
  });
  assert.ok(cardSvg.includes('ONLINE 95ms'));
});
