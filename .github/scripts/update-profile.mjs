import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OWNER = 'Noobucodonosor';
const TOKEN = process.env.GITHUB_TOKEN || '';

const HUB_CONFIG_PATH = path.resolve(process.cwd(), 'showcase.config.json');
let HUB_BASE_URL = (process.env.HUB_BASE_URL || '').replace(/\/+$/, '');
if (!HUB_BASE_URL && fs.existsSync(HUB_CONFIG_PATH)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(HUB_CONFIG_PATH, 'utf8'));
    HUB_BASE_URL = String(cfg.hubBaseUrl || '').replace(/\/+$/, '');
  } catch {
    // ignore malformed config
  }
}

export function getLiveTarget(appId, fallbackUrl, fallbackLabel) {
  if (HUB_BASE_URL) {
    return {
      liveUrl: `${HUB_BASE_URL}/?app=${appId}`,
      liveLabel: 'Prova Live',
    };
  }
  return { liveUrl: fallbackUrl, liveLabel: fallbackLabel };
}

export const PROJECTS = [
  {
    repo: 'basilico',
    title: 'Basilico — Rapallo',
    category: 'App Consumer & Risparmio',
    liveUrl: 'https://basilico-txfxsxuuma-ew.a.run.app/?room=room-1-negozi',
    liveLabel: 'Apri Vista Offerte',
    infoUrl: 'https://github.com/Noobucodonosor/basilico',
    summary:
      'App per confrontare in tempo reale offerte e volantini dei supermercati locali, organizzare la dispensa e pianificare la spesa settimanale anche senza connessione.',
  },
  {
    repo: 'mediometeo',
    title: 'MedioMeteo Genova',
    category: 'Previsioni & Monitoraggio',
    liveUrl: 'https://mediometeo-664856461640.europe-west1.run.app',
    liveLabel: 'Prova la Demo',
    infoUrl: 'https://github.com/Noobucodonosor/mediometeo',
    summary:
      'Piattaforma meteo per terra e mare su 67 comuni della provincia di Genova, basata su 199 sensori reali sul territorio con mappe interattive e bollettini chiari.',
  },
  {
    repo: 'genova-settimana',
    title: 'Genova Civica & Cultura',
    category: 'Portale Territoriale',
    liveUrl: 'https://noobucodonosor.github.io/genova-settimana/',
    liveLabel: 'Prova la Demo',
    infoUrl: 'https://noobucodonosor.github.io/genova-settimana/esercenti.html',
    summary:
      'Guida digitale su 67 comuni per scoprire eventi della settimana, quasi 5.000 attività commerciali locali, idee per il tempo libero e storia delle vie cittadine.',
  },
  {
    repo: 'leslie-agency-os',
    title: 'Leslie — Agency OS',
    category: 'Automazione Commerciale B2B',
    ...getLiveTarget('leslie', 'https://noobucodonosor.github.io/leslie-agency-os/', 'Guarda la Demo'),
    infoUrl: 'https://github.com/Noobucodonosor/leslie-agency-os',
    summary:
      'Sistema intelligente per agenzie e team commerciali: ricerca automaticamente nuovi potenziali clienti, li analizza con l’AI e li organizza in un pannello di gestione.',
  },
  {
    repo: 'kn5',
    title: 'kn5 — Knowledge Ingestor',
    category: 'AI & Gestione Conoscenza',
    ...getLiveTarget('kn5', 'https://noobucodonosor.github.io/kn5/', 'Esplora il Progetto'),
    infoUrl: 'https://github.com/Noobucodonosor/kn5',
    summary:
      'Assistente AI che trasforma video e post (YouTube e Instagram) in schede ordinate e riassunti consultabili, con controllo dei costi e invio rapido da Telegram.',
  },
  {
    repo: 'resuscipack',
    title: 'resuscipack',
    category: 'Ricerca & Editoria Digitale',
    ...getLiveTarget('resuscipack', 'https://noobucodonosor.github.io/resuscipack/', 'Apri Vista Libro'),
    secondaryUrl: 'https://noobucodonosor.github.io/resuscipack/',
    secondaryLabel: '📖 Vista Libro',
    infoUrl: 'https://github.com/Noobucodonosor/resuscipack',
    summary:
      'Due volumi continui in 20 capitoli e motore di ricerca su oltre 1.400 testi tecnici, progettato per studiare con formule KaTeX, diagrammi SVG e fonti sempre verificabili.',
  },
  {
    repo: 'scooterlab',
    title: 'ScooterLab — IoT & Sensori',
    category: 'Dispositivi Connessi (IoT)',
    ...getLiveTarget('scooterlab', 'https://noobucodonosor.github.io/scooterlab/', 'Vedi Scheda Progetto'),
    infoUrl: 'https://github.com/Noobucodonosor/scooterlab',
    summary:
      'Sistema di monitoraggio con sensori di movimento e GPS per raccogliere dati di guida su due ruote in modo non invasivo, sicuro e resistente alle intemperie.',
  },
];

export async function ghFetch(endpoint, fetchImpl = fetch) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Noobucodonosor-profile-updater',
  };
  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }
  const res = await fetchImpl(`https://api.github.com${endpoint}`, { headers });
  if (!res.ok) {
    const err = new Error(`GitHub API ${endpoint} failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function checkPreviewReachable(repo, previewPath = 'docs/preview/social-preview.png', fetchImpl = fetch) {
  const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${repo}/main/${previewPath}`;
  try {
    const res = await fetchImpl(rawUrl, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function resolvePreviewImage(repo, previewCommits, fetchImpl = fetch) {
  const primaryPath = 'docs/preview/social-preview.png';
  const fallbackPath = 'docs/preview/desktop.png';
  const hasPrimaryCommit = Array.isArray(previewCommits) && previewCommits.length > 0;
  if (hasPrimaryCommit || (await checkPreviewReachable(repo, primaryPath, fetchImpl))) {
    return {
      hasPreview: true,
      previewPath: primaryPath,
      previewSha: hasPrimaryCommit ? previewCommits[0]?.sha?.slice(0, 8) || 'latest' : 'latest',
    };
  }
  if (await checkPreviewReachable(repo, fallbackPath, fetchImpl)) {
    return {
      hasPreview: true,
      previewPath: fallbackPath,
      previewSha: 'latest',
    };
  }
  return {
    hasPreview: false,
    previewPath: primaryPath,
    previewSha: 'latest',
  };
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDateIt(isoDate) {
  if (!isoDate) return 'N/D';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'N/D';
  return d.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  });
}

export function freshnessBadge(isoDate) {
  if (!isoDate) return '⚪ Stabile';
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return '⚪ Stabile';
  const diffHours = (Date.now() - ts) / 36e5;
  if (diffHours <= 24) return '🟢 Aggiornato oggi';
  if (diffHours <= 24 * 7) return '🟡 Aggiornato questa settimana';
  return '⚪ Stabile';
}

export async function fetchProjectState(proj, { fetchImpl = fetch } = {}) {
  try {
    const [repoInfo, latestCommits, previewCommits, weekCommits] = await Promise.all([
      ghFetch(`/repos/${OWNER}/${proj.repo}`, fetchImpl),
      ghFetch(`/repos/${OWNER}/${proj.repo}/commits?per_page=10`, fetchImpl),
      ghFetch(`/repos/${OWNER}/${proj.repo}/commits?path=docs/preview/social-preview.png&per_page=1`, fetchImpl),
      ghFetch(
        `/repos/${OWNER}/${proj.repo}/commits?since=${new Date(
          Date.now() - 7 * 86400e3,
        ).toISOString()}&per_page=100`,
        fetchImpl,
      ),
    ]);

    const meaningfulCommit =
      (Array.isArray(latestCommits) &&
        latestCommits.find((c) => !/^(chore|fix|ci)\(preview\):/i.test(c?.commit?.message || ''))) ||
      (Array.isArray(latestCommits) ? latestCommits[0] : null);

    const previewInfo = await resolvePreviewImage(proj.repo, previewCommits, fetchImpl);
    const lastDate = meaningfulCommit?.commit?.author?.date || repoInfo?.pushed_at || null;

    return {
      ...proj,
      ...previewInfo,
      lastDate,
      lastDateIt: formatDateIt(lastDate),
      freshness: freshnessBadge(lastDate),
      weekUpdatesCount: Array.isArray(weekCommits) ? weekCommits.length : 0,
      apiFallback: false,
    };
  } catch (err) {
    console.warn(`[WARN] API fallback for ${proj.repo}: ${err.message}`);
    const previewInfo = await resolvePreviewImage(proj.repo, [], fetchImpl);
    return {
      ...proj,
      ...previewInfo,
      lastDate: null,
      lastDateIt: 'N/D',
      freshness: '⚪ Stabile',
      weekUpdatesCount: 0,
      apiFallback: true,
    };
  }
}

export function renderCard(p) {
  const hasPreview = p.hasPreview !== false;
  const previewPath = p.previewPath || 'docs/preview/social-preview.png';
  const imgUrl = `https://raw.githubusercontent.com/${OWNER}/${p.repo}/main/${previewPath}?v=${p.previewSha || 'latest'}`;
  const previewBlock = hasPreview
    ? `      <a href="${p.liveUrl}">
        <img src="${imgUrl}" alt="${escapeHtml(p.title)}" />
      </a>
      <br />\n`
    : '';
  const secondaryLink = p.secondaryUrl
    ? ` · <a href="${p.secondaryUrl}"><strong>${escapeHtml(p.secondaryLabel || 'Anteprima')}</strong></a>`
    : '';
  const dateSuffix = p.lastDateIt && p.lastDateIt !== 'N/D' ? ` (${p.lastDateIt})` : '';
  return `    <td width="50%" valign="top">
${previewBlock}      <strong><a href="${p.liveUrl}">${escapeHtml(p.title)}</a></strong><br />
      <sub>${escapeHtml(p.category)} · ${p.freshness}${dateSuffix}</sub><br /><br />
      ${escapeHtml(p.summary)}<br /><br />
      <a href="${p.liveUrl}"><strong>🚀 ${escapeHtml(p.liveLabel)}</strong></a>${secondaryLink} · <a href="${p.infoUrl}">📄 Dettagli</a>
    </td>`;
}

export function renderShowcase(states) {
  const rows = [];
  for (let i = 0; i < states.length; i += 2) {
    const left = renderCard(states[i]);
    const right = states[i + 1] ? renderCard(states[i + 1]) : '    <td width="50%" valign="top"></td>';
    rows.push(`  <tr>\n${left}\n${right}\n  </tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

export function renderPulse(states) {
  const totalWeekUpdates = states.reduce((acc, s) => acc + s.weekUpdatesCount, 0);
  const activeToday = states.filter((s) => s.freshness.includes('oggi')).length;
  const nowIt = new Date().toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  });

  const rows = states
    .map(
      (s) =>
        `| [**${s.title}**](${s.liveUrl}) | ${s.category} | ${s.freshness} | ${s.lastDateIt} | ${s.weekUpdatesCount} aggiornamenti |`,
    )
    .join('\n');

  return `> **${states.length}** progetti attivi in vetrina · **${totalWeekUpdates}** miglioramenti negli ultimi 7 giorni · **${activeToday}** aggiornati oggi · *Ultimo controllo automatico: ${nowIt}*

| Progetto | Ambito | Stato | Ultimo aggiornamento | Attività (7 giorni) |
| :--- | :--- | :--- | :--- | :---: |
${rows}`;
}

export function replaceBlock(content, marker, replacement) {
  const startTag = `<!-- ${marker}:START -->`;
  const endTag = `<!-- ${marker}:END -->`;
  const startIdx = content.indexOf(startTag);
  const endIdx = content.indexOf(endTag);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Missing markers ${startTag} / ${endTag}`);
  }
  return (
    content.slice(0, startIdx + startTag.length) +
    '\n' +
    replacement +
    '\n' +
    content.slice(endIdx)
  );
}

export function parseProfileArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

export async function runProfileUpdate({ dryRun = false, readmePath = path.resolve('README.md'), fetchImpl = fetch } = {}) {
  const originalReadme = fs.readFileSync(readmePath, 'utf8');
  let nextReadme = originalReadme;

  const states = await Promise.all(PROJECTS.map((p) => fetchProjectState(p, { fetchImpl })));
  states.sort((a, b) => {
    const ta = a.lastDate ? new Date(a.lastDate).getTime() : 0;
    const tb = b.lastDate ? new Date(b.lastDate).getTime() : 0;
    return tb - ta;
  });

  nextReadme = replaceBlock(nextReadme, 'SHOWCASE', renderShowcase(states));
  nextReadme = replaceBlock(nextReadme, 'PULSE', renderPulse(states));

  const changed = nextReadme !== originalReadme;

  if (dryRun) {
    console.log(`[DRY-RUN] Verified ${states.length} projects (README.md not written, changed=${changed}).`);
    for (const s of states) {
      console.log(
        ` - ${s.repo}: ${s.freshness} (${s.lastDateIt}) | preview=${s.hasPreview ? s.previewSha : 'MISSING'} | fallback=${s.apiFallback}`
      );
    }
    return { dryRun: true, changed, states };
  }

  fs.writeFileSync(readmePath, nextReadme, 'utf8');
  console.log('README.md updated successfully.');
  return { dryRun: false, changed, states };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { dryRun } = parseProfileArgs();
  runProfileUpdate({ dryRun }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
