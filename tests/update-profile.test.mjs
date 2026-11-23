import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchProjectState,
  renderCard,
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
