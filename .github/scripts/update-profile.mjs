import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAllHudSvgs, probeEndpoint } from '../../scripts/build-profile-hud.mjs';

const OWNER = 'Noobucodonosor';
const TOKEN = process.env.GITHUB_TOKEN || '';

const HUB_CONFIG_PATH = path.resolve(process.cwd(), 'showcase.config.json');
let SHOWCASE_CONFIG = {};
if (fs.existsSync(HUB_CONFIG_PATH)) {
  try {
    SHOWCASE_CONFIG = JSON.parse(fs.readFileSync(HUB_CONFIG_PATH, 'utf8'));
  } catch {
    SHOWCASE_CONFIG = {};
  }
}
let HUB_BASE_URL = (process.env.HUB_BASE_URL || String(SHOWCASE_CONFIG.hubBaseUrl || '')).replace(/\/+$/, '');

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
    title: 'Cosa faccio questa settimana a Genova',
    category: 'Agenda & Territorio (67 comuni)',
    previewPath: 'docs/preview/desktop.png',
    liveUrl: 'https://noobucodonosor.github.io/genova-settimana/',
    liveLabel: 'Apri Questa settimana',
    liveIcon: '📅',
    quickLinks: [
      { label: '🧭 Tempo libero', url: 'https://noobucodonosor.github.io/genova-settimana/bussola.html' },
      { label: '🏪 Esercenti', url: 'https://noobucodonosor.github.io/genova-settimana/esercenti.html' },
      { label: '🗺️ Storie & Vie', url: 'https://noobucodonosor.github.io/genova-settimana/storie.html' },
      { label: '📊 67 Comuni', url: 'https://noobucodonosor.github.io/genova-settimana/dashboard.html' },
    ],
    infoUrl: 'https://github.com/Noobucodonosor/genova-settimana',
    summary:
      'Cinema, mostre, musica, biblioteche, passeggiate, quasi 5.000 attività commerciali locali e storia delle vie su 67 comuni.',
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

export async function resolvePreviewImage(
  repo,
  previewCommits,
  fetchImpl = fetch,
  preferredPath = 'docs/preview/social-preview.png',
) {
  const primaryPath = preferredPath || 'docs/preview/social-preview.png';
  const fallbackPath =
    primaryPath === 'docs/preview/desktop.png' ? 'docs/preview/social-preview.png' : 'docs/preview/desktop.png';
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
  const preferredPreviewPath = proj.previewPath || 'docs/preview/social-preview.png';
  try {
    const [repoInfo, latestCommits, previewCommits, weekCommits] = await Promise.all([
      ghFetch(`/repos/${OWNER}/${proj.repo}`, fetchImpl),
      ghFetch(`/repos/${OWNER}/${proj.repo}/commits?per_page=10`, fetchImpl),
      ghFetch(
        `/repos/${OWNER}/${proj.repo}/commits?path=${encodeURIComponent(preferredPreviewPath)}&per_page=1`,
        fetchImpl,
      ),
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

    const previewInfo = await resolvePreviewImage(proj.repo, previewCommits, fetchImpl, preferredPreviewPath);
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
    const previewInfo = await resolvePreviewImage(proj.repo, [], fetchImpl, preferredPreviewPath);
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
        <img src="${imgUrl}" alt="${escapeHtml(p.title)}" width="100%" />
      </a>
      <br />\n`
    : '';
  const liveIcon = p.liveIcon || '🚀';
  const secondaryLink = p.secondaryUrl
    ? ` · <a href="${p.secondaryUrl}"><strong>${escapeHtml(p.secondaryLabel || 'Anteprima')}</strong></a>`
    : '';
  const quickLinksHtml = Array.isArray(p.quickLinks) && p.quickLinks.length
    ? p.quickLinks.map((ql) => ` · <a href="${ql.url}">${escapeHtml(ql.label)}</a>`).join('')
    : '';
  const dateSuffix = p.lastDateIt && p.lastDateIt !== 'N/D' ? ` (${p.lastDateIt})` : '';
  return `    <td width="100%" valign="top">
${previewBlock}      <strong><a href="${p.liveUrl}">${escapeHtml(p.title)}</a></strong><br />
      <sub>${escapeHtml(p.category)} · ${p.freshness}${dateSuffix}</sub><br /><br />
      ${escapeHtml(p.summary)}<br /><br />
      <a href="${p.liveUrl}"><strong>${liveIcon} ${escapeHtml(p.liveLabel)}</strong></a>${secondaryLink}${quickLinksHtml} · <a href="${p.infoUrl}">📄 Dettagli</a>
    </td>`;
}

export function dualThemeImg({ basePath, alt, width, align }) {
  const alignAttr = align ? ` align="${align}"` : '';
  const widthAttr = width ? ` width="${width}"` : '';
  return `<img src="${basePath}-light.svg#gh-light-mode-only" alt="${escapeHtml(alt)}"${widthAttr}${alignAttr} /><img src="${basePath}-dark.svg#gh-dark-mode-only" alt="${escapeHtml(alt)}"${widthAttr}${alignAttr} />`;
}

export function renderHudHero(hubUrl) {
  const target = hubUrl || 'https://github.com/Noobucodonosor';
  return `<a href="${target}">${dualThemeImg({
    basePath: './assets/cards/hero',
    alt: 'Noobucodonosor — Terminal HUD',
    width: '100%',
  })}</a>`;
}

export function renderHudTasks(config = SHOWCASE_CONFIG) {
  const tasks = config?.profileHud?.quickTasks || [];
  const base = HUB_BASE_URL || 'https://noobucodonosor-hub-664856461640.us-central1.run.app';
  return tasks
    .map(
      (t) =>
        `<a href="${base}/?task=${encodeURIComponent(t.task)}">${dualThemeImg({
          basePath: `./assets/cards/task-${t.slug}`,
          alt: `${t.title} — ${t.project}`,
          width: '19%',
        })}</a>`,
    )
    .join(' ');
}

export function renderHudBinaries(config = SHOWCASE_CONFIG) {
  const base = HUB_BASE_URL || 'https://noobucodonosor-hub-664856461640.us-central1.run.app';
  const portablePath = config?.profileHud?.portableBundlePath || 'bundles/noobucodonosor-portable.html';
  return [
    `<a href="${base}">${dualThemeImg({
      basePath: './assets/cards/binary-web',
      alt: 'Binario Web Live — Hub & Assistente AI',
      width: '32.5%',
    })}</a>`,
    `<a href="${base}/${portablePath}?download=1">${dualThemeImg({
      basePath: './assets/cards/binary-portable',
      alt: 'Binario Locale Portabile (.html offline)',
      width: '32.5%',
    })}</a>`,
    `<a href="#stato-dei-progetti-in-tempo-reale">${dualThemeImg({
      basePath: './assets/cards/binary-telemetry',
      alt: 'Telemetria 7 giorni',
      width: '32.5%',
    })}</a>`,
  ].join(' ');
}

export function renderBentoShowcase(states) {
  const featured = states.find((s) => s.repo === 'genova-settimana');
  const rest = states.filter((s) => s.repo !== 'genova-settimana');

  const blocks = [];
  if (featured) {
    const slug = featured.slug || featured.repo;
    blocks.push(
      `<a href="${featured.liveUrl}">${dualThemeImg({
        basePath: `./assets/cards/project-${slug}`,
        alt: featured.title,
        width: '100%',
      })}</a>`,
    );
    if (featured.hasPreview !== false) {
      const previewPath = featured.previewPath || 'docs/preview/desktop.png';
      const imgUrl = `https://raw.githubusercontent.com/${OWNER}/${featured.repo}/main/${previewPath}?v=${featured.previewSha || 'latest'}`;
      blocks.push(
        `\n<a href="${featured.liveUrl}"><img src="${imgUrl}" alt="${escapeHtml(featured.title)}" width="100%" /></a>`,
      );
    }
    blocks.push(
      `\n<p><a href="${featured.liveUrl}"><strong>📅 Apri Questa settimana</strong></a> · <a href="https://noobucodonosor.github.io/genova-settimana/bussola.html">🧭 Tempo libero</a> · <a href="https://noobucodonosor.github.io/genova-settimana/esercenti.html">🏪 Esercenti</a> · <a href="https://noobucodonosor.github.io/genova-settimana/storie.html">🗺️ Storie &amp; Vie</a> · <a href="https://noobucodonosor.github.io/genova-settimana/dashboard.html">📊 67 Comuni</a> · <a href="${featured.infoUrl}">📄 Dettagli</a></p>`,
    );
  }

  for (let i = 0; i < rest.length; i += 2) {
    const pair = rest.slice(i, i + 2).map((s) => {
      const slug = s.slug || s.repo;
      return `<a href="${s.liveUrl}">${dualThemeImg({
        basePath: `./assets/cards/project-${slug}`,
        alt: s.title,
        width: '49%',
      })}</a>`;
    });
    blocks.push(`\n${pair.join(' ')}`);
  }

  const fallbackRows = states
    .map(
      (s) =>
        `| [**${s.title}**](${s.liveUrl}) | ${s.category} | ${s.summary} | [Repo](${s.infoUrl}) |`,
    )
    .join('\n');

  blocks.push(`\n<details>
<summary><strong>📋 Elenco testuale accessibile (Mobile / Screen Reader)</strong></summary>

| Progetto | Ambito | Descrizione | Sorgente |
| :--- | :--- | :--- | :---: |
${fallbackRows}

</details>`);

  return blocks.join('\n');
}

export function renderCompactProductTable(states) {
  const rows = states
    .map((s) => {
      const stack = s.stack || s.category;
      const livePart = `[**${s.liveLabel || 'Apri'}**](${s.liveUrl})`;
      const secondaryPart = s.secondaryUrl ? ` · [${s.secondaryLabel || 'Libro'}](${s.secondaryUrl})` : '';
      return `| [**${s.title}**](${s.infoUrl}) | ${s.summary} | \`${stack}\` | ${livePart}${secondaryPart} |`;
    })
    .join('\n');

  return `| Progetto | Problema risolto | Stack | Live / Playground |
| :--- | :--- | :--- | :--- |
${rows}`;
}

export function renderShowcase(states) {
  const rows = states.map((state) => `  <tr>\n${renderCard(state)}\n  </tr>`);
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

export async function runProfileUpdate({
  dryRun = false,
  readmePath = path.resolve('README.md'),
  cardsDir = path.resolve('assets/cards'),
  fetchImpl = fetch,
} = {}) {
  const originalReadme = fs.readFileSync(readmePath, 'utf8');
  let nextReadme = originalReadme;

  const hudProjects = Array.isArray(SHOWCASE_CONFIG?.profileHud?.projects) && SHOWCASE_CONFIG.profileHud.projects.length
    ? SHOWCASE_CONFIG.profileHud.projects.map((hp) => {
        const base = PROJECTS.find((p) => p.repo === hp.repo) || {};
        const target = hp.appId ? getLiveTarget(hp.appId, hp.probeUrl, hp.liveLabel || 'Prova Live') : {};
        return {
          ...base,
          ...hp,
          ...target,
          previewPath: base.previewPath || hp.previewPath,
        };
      })
    : PROJECTS;

  const [states, hubProbe, ...projectProbes] = await Promise.all([
    Promise.all(hudProjects.map((p) => fetchProjectState(p, { fetchImpl }))),
    probeEndpoint(HUB_BASE_URL, { fetchImpl }),
    ...hudProjects.map((p) => probeEndpoint(p.probeUrl || p.liveUrl, { fetchImpl })),
  ]);

  const probeMap = {};
  hudProjects.forEach((p, idx) => {
    probeMap[p.slug || p.repo] = projectProbes[idx];
  });

  states.sort((a, b) => {
    if (a.repo === 'genova-settimana') return -1;
    if (b.repo === 'genova-settimana') return 1;
    const ta = a.lastDate ? new Date(a.lastDate).getTime() : 0;
    const tb = b.lastDate ? new Date(b.lastDate).getTime() : 0;
    return tb - ta;
  });

  const updatedAtIt = new Date().toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  });

  if (!dryRun && SHOWCASE_CONFIG?.profileHud) {
    buildAllHudSvgs({
      outDir: cardsDir,
      config: SHOWCASE_CONFIG,
      states,
      probes: probeMap,
      hubProbe,
      updatedAtIt,
    });
  }

  if (nextReadme.includes('<!-- HUD_HERO:START -->')) {
    nextReadme = replaceBlock(nextReadme, 'HUD_HERO', renderHudHero(HUB_BASE_URL));
  }
  if (nextReadme.includes('<!-- HUD_TASKS:START -->')) {
    nextReadme = replaceBlock(nextReadme, 'HUD_TASKS', renderHudTasks(SHOWCASE_CONFIG));
  }
  if (nextReadme.includes('<!-- HUD_BINARIES:START -->')) {
    nextReadme = replaceBlock(nextReadme, 'HUD_BINARIES', renderHudBinaries(SHOWCASE_CONFIG));
  }
  nextReadme = replaceBlock(
    nextReadme,
    'SHOWCASE',
    nextReadme.includes('<!-- HUD_HERO:START -->')
      ? renderBentoShowcase(states)
      : renderCompactProductTable(states),
  );
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
