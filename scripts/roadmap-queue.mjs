import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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

export const PRIVATE_REPOS = [
  'entanglement-system',
  'cibo',
  'PACK',
  'a',
  'meteomare',
  'kn5-agentic-downloader',
  'claude-24h-project'
];

export function resolveReposForScope(scope, projNum) {
  if (scope === 'private' || Number(projNum) === 2) return PRIVATE_REPOS;
  if (scope === 'all') return [...ECOSYSTEM_REPOS, ...PRIVATE_REPOS];
  return ECOSYSTEM_REPOS;
}

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

function syncOpenIssues({ owner, projNum, repos = ECOSYSTEM_REPOS, includeClosed = false }) {
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
  const doneOpt = statusField?.options?.find((o) => /done|closed|complete/i.test(o.name));
  const p0Opt = prioField?.options?.find((o) => o.name.startsWith('P0'));
  const p1Opt = prioField?.options?.find((o) => o.name.startsWith('P1'));
  const p2Opt = prioField?.options?.find((o) => o.name.startsWith('P2'));
  const wave1Opt = waveField?.options?.find((o) => o.name.startsWith('Wave 1'));
  const wave2Opt = waveField?.options?.find((o) => o.name.startsWith('Wave 2'));

  let added = 0;
  let updated = 0;

  for (const repo of repos) {
    const openIssues = JSON.parse(
      gh([
        'issue',
        'list',
        '-R',
        `${owner}/${repo}`,
        '--state',
        includeClosed ? 'all' : 'open',
        '--limit',
        '100',
        '--json',
        'id,number,title,state,labels,url'
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
      const isClosed = issue.state === 'CLOSED';
      const isInProgress = !isClosed && labelNames.some((n) => /in-progress|taste-check/i.test(n));
      const ops = [];

      if ((!item?.status || isClosed) && statusField) {
        const opt = isClosed ? doneOpt : isInProgress ? inProgOpt || todoOpt : todoOpt;
        if (opt && item?.status !== opt.name) {
          ops.push({ fieldId: statusField.id, value: { singleSelectOptionId: opt.id } });
        }
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

export const AUDIT_SCANNERS = [
  {
    id: 'L1-adr-structure',
    level: 1,
    check(repoDir) {
      const missing = [];
      if (!fs.existsSync(path.join(repoDir, 'AGENTS.md'))) missing.push('AGENTS.md');
      if (!fs.existsSync(path.join(repoDir, 'docs', 'adr', 'README.md'))) missing.push('docs/adr/README.md');
      return missing.length
        ? { ok: false, taskCode: 'TASK-ADR-01', priority: 'P1-high', detail: `Missing: ${missing.join(', ')}` }
        : { ok: true };
    }
  },
  {
    id: 'L1-ci-pipeline',
    level: 1,
    check(repoDir) {
      const wfDir = path.join(repoDir, '.github', 'workflows');
      if (!fs.existsSync(wfDir)) {
        return { ok: false, taskCode: 'TASK-CI-01', priority: 'P1-high', detail: 'No .github/workflows directory' };
      }
      const files = fs.readdirSync(wfDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
      const hasGate = files.some((f) => /ci|test|adr-pre-release|update-profile/i.test(f));
      return hasGate
        ? { ok: true, workflows: files }
        : { ok: false, taskCode: 'TASK-CI-01', priority: 'P1-high', detail: 'Missing CI/ADR gate workflow' };
    }
  },
  {
    id: 'L2-preview-assets',
    level: 2,
    check(repoDir, repoName) {
      if (repoName === 'Noobucodonosor' || repoName === 'v.i.n.o.' || PRIVATE_REPOS.includes(repoName)) return { ok: true };
      const social = path.join(repoDir, 'docs', 'preview', 'social-preview.png');
      const desktop = path.join(repoDir, 'docs', 'preview', 'desktop.png');
      if (fs.existsSync(social) || fs.existsSync(desktop)) {
        return { ok: true, asset: fs.existsSync(social) ? 'social-preview.png' : 'desktop.png' };
      }
      return {
        ok: false,
        taskCode: 'TASK-PREVIEW-01',
        priority: 'P2-medium',
        detail: 'Missing docs/preview/social-preview.png and desktop.png'
      };
    }
  }
];

export function auditRepositoryDir(repoDir, repoName = path.basename(repoDir), scanners = AUDIT_SCANNERS) {
  if (!fs.existsSync(repoDir)) {
    return { repo: repoName, present: false, findings: [] };
  }
  const findings = [];
  for (const scanner of scanners) {
    const res = scanner.check(repoDir, repoName);
    if (!res.ok) {
      findings.push({
        scannerId: scanner.id,
        level: scanner.level,
        taskCode: res.taskCode,
        priority: res.priority,
        detail: res.detail
      });
    }
  }
  return { repo: repoName, present: true, healthy: findings.length === 0, findings };
}

export function auditLocalWorkspace(workspaceRoot = path.resolve(process.cwd(), '..'), repos = ECOSYSTEM_REPOS) {
  return repos.map((repo) => auditRepositoryDir(path.join(workspaceRoot, repo), repo));
}

export function discoverRepoTodos(repoDir, repoName = path.basename(repoDir)) {
  if (!fs.existsSync(repoDir)) {
    return { repo: repoName, present: false, adrOpen: [], codeTodos: [], gitState: null };
  }

  const adrOpen = [];
  const adrDir = path.join(repoDir, 'docs', 'adr');
  if (fs.existsSync(adrDir)) {
    for (const file of fs.readdirSync(adrDir).filter((f) => f.endsWith('.md') && f !== '0000-adr-template.md')) {
      const lines = fs.readFileSync(path.join(adrDir, file), 'utf8').split('\n');
      lines.forEach((line, idx) => {
        if (/^\s*-\s*\[\s\]\s+/.test(line)) {
          const taskMatch = line.match(/\*\*(TASK-[A-Z0-9-]+)\*\*/);
          adrOpen.push({
            file: `docs/adr/${file}`,
            line: idx + 1,
            taskCode: taskMatch ? taskMatch[1] : null,
            text: line.replace(/^\s*-\s*\[\s\]\s+/, '').trim()
          });
        }
      });
    }
  }

  const codeTodos = [];
  try {
    const out = execFileSync(
      'git',
      ['-C', repoDir, 'grep', '-n', '-E', '\\b(TODO|FIXME)\\b', '--', ':!docs/adr/0000*', ':!*.json', ':!*.html', ':!*.md'],
      { encoding: 'utf8', stdio: 'pipe' }
    ).trim();
    if (out) {
      for (const line of out.split('\n').slice(0, 20)) {
        const [file, lineNum, ...rest] = line.split(':');
        codeTodos.push({ file, line: Number(lineNum), text: rest.join(':').trim() });
      }
    }
  } catch {
    // git grep exits 1 when no matches are found
  }

  let gitState = null;
  try {
    const branch = execFileSync('git', ['-C', repoDir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' }).trim();
    const dirtyCount = execFileSync('git', ['-C', repoDir, 'status', '--porcelain'], { encoding: 'utf8', stdio: 'pipe' })
      .trim()
      .split('\n')
      .filter(Boolean).length;
    if (branch !== 'main' || dirtyCount > 0) {
      gitState = { branch, dirtyCount };
    }
  } catch {
    // ignore non-git dirs
  }

  return { repo: repoName, present: true, adrOpen, codeTodos, gitState };
}

export function discoverWorkspaceTodos(workspaceRoot = path.resolve(process.cwd(), '..'), repos = ECOSYSTEM_REPOS) {
  return repos.map((repo) => discoverRepoTodos(path.join(workspaceRoot, repo), repo));
}

export const LIVE_ENDPOINTS = [
  { repo: 'Noobucodonosor', url: 'https://noobucodonosor-hub-664856461640.us-central1.run.app/api/health' },
  { repo: 'basilico', url: 'https://basilico-txfxsxuuma-ew.a.run.app' },
  { repo: 'mediometeo', url: 'https://mediometeo-664856461640.europe-west1.run.app' },
  { repo: 'genova-settimana', url: 'https://noobucodonosor.github.io/genova-settimana/' },
  { repo: 'resuscipack', url: 'https://noobucodonosor.github.io/resuscipack/' },
  { repo: 'kn5', url: 'https://noobucodonosor.github.io/kn5/' },
  { repo: 'leslie-agency-os', url: 'https://noobucodonosor.github.io/leslie-agency-os/' },
  { repo: 'scooterlab', url: 'https://noobucodonosor.github.io/scooterlab/' },
  { repo: 'v.i.n.o.', url: 'https://noobucodonosor.github.io/v.i.n.o./' }
];

export async function checkLiveEndpoints(endpoints = LIVE_ENDPOINTS, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  return Promise.all(
    endpoints.map(async ({ repo, url }) => {
      const t0 = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
        const latencyMs = Date.now() - t0;
        clearTimeout(timer);
        return {
          repo,
          url,
          ok: res.ok,
          status: res.status,
          latencyMs,
          finding: res.ok
            ? null
            : {
                scannerId: 'L2-live-http',
                level: 2,
                taskCode: 'TASK-OPS-01',
                priority: 'P0-critical',
                detail: `Live endpoint ${url} returned HTTP ${res.status}`
              }
        };
      } catch (err) {
        clearTimeout(timer);
        return {
          repo,
          url,
          ok: false,
          status: 0,
          latencyMs: Date.now() - t0,
          finding: {
            scannerId: 'L2-live-http',
            level: 2,
            taskCode: 'TASK-OPS-01',
            priority: 'P0-critical',
            detail: `Live endpoint ${url} unreachable: ${err.message}`
          }
        };
      }
    })
  );
}

export function detectTestCommand(repoDir, repoName) {
  if (repoName === 'Noobucodonosor') {
    return { cmd: 'node', args: ['--test', 'tests/free-tier-router.test.mjs', 'tests/roadmap-queue.test.mjs', 'tests/update-profile.test.mjs', 'tests/url-ingestor.test.mjs'], env: { NODE_ENV: 'test' } };
  }
  const venvPytest = path.join(repoDir, '.venv', 'bin', 'pytest');
  if (fs.existsSync(venvPytest) && fs.existsSync(path.join(repoDir, 'tests'))) {
    return { cmd: venvPytest, args: ['-q'], env: { PYTHONPATH: '.' } };
  }
  if (fs.existsSync(path.join(repoDir, 'tests')) && (repoName === 'kn5' || repoName === 'genova-settimana')) {
    return { cmd: 'python3', args: ['-m', 'unittest', 'discover', '-s', 'tests'], env: {} };
  }
  if (fs.existsSync(path.join(repoDir, 'app.py')) || fs.existsSync(path.join(repoDir, 'main.py'))) {
    return { cmd: 'python3', args: ['-m', 'compileall', '-q', '-x', '\\.venv|venv|node_modules', '.'], env: {} };
  }
  return null;
}

export function runRepoTests(workspaceRoot = path.resolve(process.cwd(), '..'), repos = ECOSYSTEM_REPOS) {
  const results = [];
  for (const repo of repos) {
    const repoDir = path.join(workspaceRoot, repo);
    if (!fs.existsSync(repoDir)) continue;
    const spec = detectTestCommand(repoDir, repo);
    if (!spec) {
      results.push({ repo, skipped: true, ok: true, detail: 'No local test runner detected' });
      continue;
    }
    const t0 = Date.now();
    try {
      execFileSync(spec.cmd, spec.args, {
        cwd: repoDir,
        env: { ...process.env, ...spec.env },
        encoding: 'utf8',
        timeout: 30000,
        stdio: 'pipe'
      });
      results.push({ repo, ok: true, durationMs: Date.now() - t0, command: `${spec.cmd} ${spec.args.join(' ')}` });
    } catch (err) {
      results.push({
        repo,
        ok: false,
        durationMs: Date.now() - t0,
        command: `${spec.cmd} ${spec.args.join(' ')}`,
        finding: {
          scannerId: 'L2-test-suite',
          level: 2,
          taskCode: 'TASK-QA-01',
          priority: 'P1-high',
          detail: `Test suite failed (${spec.cmd}): ${(err.stderr || err.stdout || err.message).trim().slice(-200)}`
        }
      });
    }
  }
  return results;
}

async function main() {
  const { command, flags } = parseCliArgs(process.argv.slice(2));
  const owner = flags.owner || DEFAULT_OWNER;
  const projNum = Number(flags.project || (flags.scope === 'private' ? 2 : DEFAULT_PROJECT_NUMBER));
  const repos = resolveReposForScope(flags.scope, projNum);

  if (command === 'discover') {
    const root = flags.workspace ? path.resolve(flags.workspace) : path.resolve(process.cwd(), '..');
    const results = discoverWorkspaceTodos(root, repos);
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (command === 'audit') {
    const root = flags.workspace ? path.resolve(flags.workspace) : path.resolve(process.cwd(), '..');
    const local = auditLocalWorkspace(root, repos);
    const out = { level1_local: local };
    if (flags.live || flags.full) {
      out.level2_live_http = await checkLiveEndpoints();
    }
    if (flags.tests || flags.full) {
      out.level2_tests = runRepoTests(root, repos);
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (command === 'sync-open') {
    const result = syncOpenIssues({ owner, projNum, repos, includeClosed: Boolean(flags.all) });
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
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
