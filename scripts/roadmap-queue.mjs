import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_OWNER = 'Noobucodonosor';
export const DEFAULT_PROJECT_NUMBER = 1;
export const ECOSYSTEM_REPOS = [
  'Noobucodonosor',
  'basilico',
  'mediometeo',
  'genova-settimana',
  'leslie-agency-os',
  'kn5',
  'resuscipack',
  'scooterlab',
  'v.i.n.o.'
];

export function waveRank(wave = '') {
  const m = String(wave).match(/wave\s*(\d+)/i);
  return m ? Number(m[1]) : 99;
}

export function priorityRank(priority = '') {
  const p = String(priority).toUpperCase();
  if (p.startsWith('P0')) return 0;
  if (p.startsWith('P1')) return 1;
  if (p.startsWith('P2')) return 2;
  return 3;
}

export function getItemPriority(item) {
  return item['priorità'] || item.priority || item.Priorità || '';
}

export function getItemRepoSlug(item) {
  const raw = item.repository || item.content?.repository || '';
  return String(raw).replace(/^https:\/\/github\.com\//, '');
}

export function sortPlayQueue(items, { waveFilter = '', includeInProgress = true } = {}) {
  return items
    .filter((item) => {
      if (!item || item.status === 'Done') return false;
      if (!includeInProgress && item.status === 'In Progress') return false;
      if (waveFilter) {
        const w = String(item.wave || '').toLowerCase();
        if (!w.includes(waveFilter.toLowerCase())) return false;
      }
      return true;
    })
    .map((item) => ({
      id: item.id,
      repo: getItemRepoSlug(item),
      number: item.content?.number ?? null,
      title: item.title || item.content?.title || '',
      status: item.status || 'Todo',
      wave: item.wave || 'Unscheduled',
      priority: getItemPriority(item) || 'Unset',
      startDate: item['start date'] || '',
      targetDate: item['target date'] || '',
      url: item.content?.url || ''
    }))
    .sort((a, b) => {
      const wDiff = waveRank(a.wave) - waveRank(b.wave);
      if (wDiff !== 0) return wDiff;
      const pDiff = priorityRank(a.priority) - priorityRank(b.priority);
      if (pDiff !== 0) return pDiff;
      const dDiff = (a.startDate || '9999-99-99').localeCompare(b.startDate || '9999-99-99');
      if (dDiff !== 0) return dDiff;
      const rDiff = a.repo.localeCompare(b.repo);
      if (rDiff !== 0) return rDiff;
      return (a.number ?? 0) - (b.number ?? 0);
    });
}

export function formatMarkdownQueue(queue) {
  if (!queue.length) return 'Nessun task aperto trovato nella coda selezionata.';
  const lines = [
    '| # | Wave | Priorità | Stato | Repo | Issue | Finestra |',
    '| :---: | :--- | :--- | :--- | :--- | :--- | :--- |'
  ];
  queue.forEach((item, idx) => {
    const ref = item.number ? `[#${item.number}](${item.url})` : '—';
    const windowStr = item.startDate && item.targetDate ? `${item.startDate} → ${item.targetDate}` : '—';
    lines.push(
      `| ${idx + 1} | ${item.wave} | ${item.priority} | ${item.status} | \`${item.repo}\` | ${ref} ${item.title} | ${windowStr} |`
    );
  });
  return lines.join('\n');
}

export function parseCliArgs(argv) {
  const [command = 'next', ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    }
  }
  return { command, flags };
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 25 * 1024 * 1024 }).trim();
}

function gql(query) {
  const raw = gh(['api', 'graphql', '-f', `query=${query}`]);
  const parsed = JSON.parse(raw);
  if (parsed.errors && parsed.errors.length) {
    throw new Error('GraphQL errors: ' + JSON.stringify(parsed.errors));
  }
  return parsed.data;
}

function getProjectMeta(owner, projNum) {
  const projects = JSON.parse(gh(['project', 'list', '--owner', owner, '--format', 'json'])).projects || [];
  const proj = projects.find((p) => p.number === Number(projNum));
  if (!proj) throw new Error(`Project #${projNum} not found for owner ${owner}`);
  const fields = JSON.parse(
    gh(['project', 'field-list', String(projNum), '--owner', owner, '--format', 'json'])
  ).fields || [];
  return { proj, fields };
}

function fetchProjectItems(owner, projNum) {
  const raw = JSON.parse(
    gh(['project', 'item-list', String(projNum), '--owner', owner, '--limit', '300', '--format', 'json'])
  );
  return raw.items || [];
}

function syncOpenIssues({ owner, projNum }) {
  const { proj, fields } = getProjectMeta(owner, projNum);
  const existing = fetchProjectItems(owner, projNum);
  const existingByUrl = new Map(existing.map((it) => [it.content?.url, it]));

  const statusField = fields.find((f) => f.name === 'Status');
  const prioField = fields.find((f) => f.name === 'Priorità');
  const waveField = fields.find((f) => f.name === 'Wave');
  const startField = fields.find((f) => f.name === 'Start date');
  const targetField = fields.find((f) => f.name === 'Target date');

  const todoOpt = statusField?.options?.find((o) => /todo|backlog|open/i.test(o.name));
  const inProgOpt = statusField?.options?.find((o) => /progress|doing/i.test(o.name));
  const p0Opt = prioField?.options?.find((o) => o.name.startsWith('P0'));
  const p1Opt = prioField?.options?.find((o) => o.name.startsWith('P1'));
  const p2Opt = prioField?.options?.find((o) => o.name.startsWith('P2'));
  const wave1Opt = waveField?.options?.find((o) => o.name.startsWith('Wave 1'));
  const wave2Opt = waveField?.options?.find((o) => o.name.startsWith('Wave 2'));

  let added = 0;
  let updated = 0;

  for (const repo of ECOSYSTEM_REPOS) {
    const openIssues = JSON.parse(
      gh([
        'issue',
        'list',
        '-R',
        `${owner}/${repo}`,
        '--state',
        'open',
        '--limit',
        '100',
        '--json',
        'id,number,title,labels,url'
      ])
    );

    for (const issue of openIssues) {
      let item = existingByUrl.get(issue.url);
      let itemId = item?.id;
      if (!itemId) {
        const res = gql(
          `mutation { addProjectV2ItemById(input: { projectId: ${JSON.stringify(proj.id)}, contentId: ${JSON.stringify(issue.id)} }) { item { id } } }`
        );
        itemId = res.addProjectV2ItemById.item.id;
        added++;
      }

      const labelNames = (issue.labels || []).map((l) => l.name);
      const isInProgress = labelNames.some((n) => /in-progress|taste-check/i.test(n));
      const ops = [];

      if (!item?.status && statusField) {
        const opt = isInProgress ? inProgOpt || todoOpt : todoOpt;
        if (opt) ops.push({ fieldId: statusField.id, value: { singleSelectOptionId: opt.id } });
      }
      if (!item?.['priorità'] && prioField) {
        const opt = labelNames.includes('P0-critical')
          ? p0Opt
          : labelNames.includes('P1-high')
            ? p1Opt
            : labelNames.includes('P2-medium')
              ? p2Opt
              : null;
        if (opt) ops.push({ fieldId: prioField.id, value: { singleSelectOptionId: opt.id } });
      }
      if (!item?.wave && waveField) {
        const opt = isInProgress ? wave2Opt || wave1Opt : wave1Opt;
        if (opt) ops.push({ fieldId: waveField.id, value: { singleSelectOptionId: opt.id } });
      }
      if (!item?.['start date'] && startField) {
        const start = isInProgress ? '2026-12-01' : '2026-11-23';
        ops.push({ fieldId: startField.id, value: { date: start } });
      }
      if (!item?.['target date'] && targetField) {
        const target = isInProgress ? '2026-12-07' : '2026-11-30';
        ops.push({ fieldId: targetField.id, value: { date: target } });
      }

      if (ops.length > 0) {
        const mut = ops
          .map(
            (op, i) =>
              `u${i}: updateProjectV2ItemFieldValue(input: { projectId: ${JSON.stringify(proj.id)}, itemId: ${JSON.stringify(itemId)}, fieldId: ${JSON.stringify(op.fieldId)}, value: ${JSON.stringify(op.value).replace(/"([^"]+)":/g, '$1:')} }) { projectV2Item { id } }`
          )
          .join('\n');
        gql(`mutation {\n${mut}\n}`);
        updated++;
      }
    }
  }

  return { added, updated };
}

function scheduleIssue({ owner, projNum, repo, issueNum, wave, start, target, status }) {
  if (!repo || !issueNum) {
    throw new Error('Usage: schedule --repo <owner/repo> --issue <number> [--wave ...] [--start YYYY-MM-DD] [--target YYYY-MM-DD]');
  }
  const fullRepo = repo.includes('/') ? repo : `${owner}/${repo}`;
  const issue = JSON.parse(gh(['issue', 'view', String(issueNum), '-R', fullRepo, '--json', 'id,url,title']));
  const { proj, fields } = getProjectMeta(owner, projNum);

  const addRes = gql(
    `mutation { addProjectV2ItemById(input: { projectId: ${JSON.stringify(proj.id)}, contentId: ${JSON.stringify(issue.id)} }) { item { id } } }`
  );
  const itemId = addRes.addProjectV2ItemById.item.id;
  const ops = [];

  if (wave) {
    const waveField = fields.find((f) => f.name === 'Wave');
    const opt = waveField?.options?.find((o) => o.name.toLowerCase().includes(String(wave).toLowerCase()));
    if (waveField && opt) ops.push({ fieldId: waveField.id, value: { singleSelectOptionId: opt.id } });
  }
  if (status) {
    const statusField = fields.find((f) => f.name === 'Status');
    const opt = statusField?.options?.find((o) => o.name.toLowerCase() === String(status).toLowerCase());
    if (statusField && opt) ops.push({ fieldId: statusField.id, value: { singleSelectOptionId: opt.id } });
  }
  if (start) {
    const startField = fields.find((f) => f.name === 'Start date');
    if (startField) ops.push({ fieldId: startField.id, value: { date: String(start) } });
  }
  if (target) {
    const targetField = fields.find((f) => f.name === 'Target date');
    if (targetField) ops.push({ fieldId: targetField.id, value: { date: String(target) } });
  }

  if (ops.length > 0) {
    const mut = ops
      .map(
        (op, i) =>
          `u${i}: updateProjectV2ItemFieldValue(input: { projectId: ${JSON.stringify(proj.id)}, itemId: ${JSON.stringify(itemId)}, fieldId: ${JSON.stringify(op.fieldId)}, value: ${JSON.stringify(op.value).replace(/"([^"]+)":/g, '$1:')} }) { projectV2Item { id } }`
      )
      .join('\n');
    gql(`mutation {\n${mut}\n}`);
  }

  return { itemId, url: issue.url, title: issue.title };
}

function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const owner = flags.owner || DEFAULT_OWNER;
  const projNum = Number(flags.project || DEFAULT_PROJECT_NUMBER);

  if (command === 'sync-open') {
    const result = syncOpenIssues({ owner, projNum });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'schedule') {
    const result = scheduleIssue({
      owner,
      projNum,
      repo: flags.repo,
      issueNum: flags.issue,
      wave: flags.wave,
      start: flags.start,
      target: flags.target,
      status: flags.status
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const items = fetchProjectItems(owner, projNum);
  const queue = sortPlayQueue(items, {
    waveFilter: flags.wave || '',
    includeInProgress: flags['todo-only'] ? false : true
  });
  const limit = flags.limit ? Number(flags.limit) : queue.length;
  const sliced = queue.slice(0, limit);

  if (flags.json) {
    console.log(JSON.stringify(sliced, null, 2));
  } else {
    console.log(formatMarkdownQueue(sliced));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
