import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchProjectState,
  renderCard,
  renderShowcase,
  parseProfileArgs,
  replaceBlock,
} from '../.github/scripts/update-profile.mjs';

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

test('renderCard renders usable weekly product for genova-settimana instead of preview image', () => {
  const html = renderCard({
    repo: 'genova-settimana',
    title: 'Cosa faccio questa settimana a Genova',
    category: 'Agenda & Territorio (67 comuni)',
    liveUrl: 'https://noobucodonosor.github.io/genova-settimana/',
    liveLabel: "Apri l'agenda completa",
    infoUrl: 'https://noobucodonosor.github.io/genova-settimana/esercenti.html',
    summary: 'Summary',
    freshness: '🟢 Aggiornato oggi',
    lastDateIt: '23 nov 2026',
    weeklyEvents: [
      {
        title: 'Cinema America',
        venue: 'Cinema America',
        district: 'Centro',
        category: 'cinema',
        url: 'https://circuitocinemagenova.com/america/',
        showtimes: [{ titolo: 'Dune - Parte Tre', quando: '21:00' }],
      },
      {
        title: 'Politeama Genovese',
        venue: 'Politeama Genovese',
        district: 'Centro',
        category: 'musica',
        url: 'https://www.politeamagenovese.it/',
        showtimes: [{ titolo: 'Geppi Cucciari, Perfetta', quando: '23-24 novembre 2026' }],
      },
    ],
  });

  assert.ok(!html.includes('<img '), 'genova-settimana renders real weekly guide without mockup preview image');
  assert.ok(html.includes('Cosa faccio questa settimana a Genova'));
  assert.ok(html.includes('Dune - Parte Tre'));
  assert.ok(html.includes('Geppi Cucciari, Perfetta'));
  assert.ok(html.includes('<details>'));
});
