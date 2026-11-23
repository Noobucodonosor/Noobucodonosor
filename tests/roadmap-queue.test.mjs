import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortPlayQueue,
  formatMarkdownQueue,
  parseCliArgs,
  waveRank,
  priorityRank
} from '../scripts/roadmap-queue.mjs';

test('waveRank and priorityRank order Wave 1..3 and P0..P2 deterministically', () => {
  assert.equal(waveRank('Wave 1 - Attiva'), 1);
  assert.equal(waveRank('Wave 2 - Prossima'), 2);
  assert.equal(waveRank('Unscheduled'), 99);
  assert.equal(priorityRank('P0 - Critica'), 0);
  assert.equal(priorityRank('P1 - Alta'), 1);
  assert.equal(priorityRank('P2 - Media'), 2);
});

test('sortPlayQueue filters Done items and orders by Wave, Priority, and Date', () => {
  const sample = [
    {
      id: '1',
      title: 'Done task',
      status: 'Done',
      wave: 'Wave 1 - Attiva',
      'priorità': 'P0 - Critica',
      repository: 'https://github.com/Noobucodonosor/Noobucodonosor',
      content: { number: 3, url: 'https://github.com/Noobucodonosor/Noobucodonosor/issues/3' }
    },
    {
      id: '2',
      title: 'Wave 2 P0',
      status: 'Todo',
      wave: 'Wave 2 - Prossima',
      'priorità': 'P0 - Critica',
      'start date': '2026-12-01',
      'target date': '2026-12-07',
      repository: 'https://github.com/Noobucodonosor/leslie-agency-os',
      content: { number: 3, url: 'https://github.com/Noobucodonosor/leslie-agency-os/issues/3' }
    },
    {
      id: '3',
      title: 'Wave 1 P2',
      status: 'Todo',
      wave: 'Wave 1 - Attiva',
      'priorità': 'P2 - Media',
      'start date': '2026-11-23',
      'target date': '2026-11-30',
      repository: 'https://github.com/Noobucodonosor/Noobucodonosor',
      content: { number: 2, url: 'https://github.com/Noobucodonosor/Noobucodonosor/issues/2' }
    },
    {
      id: '4',
      title: 'Wave 1 P1',
      status: 'Todo',
      wave: 'Wave 1 - Attiva',
      'priorità': 'P1 - Alta',
      'start date': '2026-11-23',
      'target date': '2026-11-30',
      repository: 'https://github.com/Noobucodonosor/Noobucodonosor',
      content: { number: 1, url: 'https://github.com/Noobucodonosor/Noobucodonosor/issues/1' }
    }
  ];

  const ordered = sortPlayQueue(sample);
  assert.equal(ordered.length, 3);
  assert.deepEqual(
    ordered.map((x) => x.title),
    ['Wave 1 P1', 'Wave 1 P2', 'Wave 2 P0']
  );

  const wave1Only = sortPlayQueue(sample, { waveFilter: 'Wave 1' });
  assert.equal(wave1Only.length, 2);
});

test('formatMarkdownQueue renders table and parseCliArgs parses flags', () => {
  const parsed = parseCliArgs(['next', '--wave', 'Wave 1', '--json', '--limit', '5']);
  assert.equal(parsed.command, 'next');
  assert.equal(parsed.flags.wave, 'Wave 1');
  assert.equal(parsed.flags.json, true);
  assert.equal(parsed.flags.limit, '5');

  const md = formatMarkdownQueue([
    {
      wave: 'Wave 1 - Attiva',
      priority: 'P1 - Alta',
      status: 'Todo',
      repo: 'Noobucodonosor/Noobucodonosor',
      number: 1,
      title: 'Test Task',
      startDate: '2026-11-23',
      targetDate: '2026-11-30',
      url: 'https://github.com/Noobucodonosor/Noobucodonosor/issues/1'
    }
  ]);
  assert.match(md, /\| 1 \| Wave 1 - Attiva \| P1 - Alta \| Todo \|/);
  assert.match(md, /\[#1\]/);
});
