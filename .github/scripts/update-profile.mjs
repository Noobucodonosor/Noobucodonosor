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
    title: 'Cosa faccio questa settimana a Genova',
    category: 'Agenda & Territorio (67 comuni)',
    liveUrl: 'https://noobucodonosor.github.io/genova-settimana/',
    liveLabel: "Apri l'agenda completa",
    infoUrl: 'https://noobucodonosor.github.io/genova-settimana/esercenti.html',
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

const GENOVA_EVENTS_RAW_URL = `https://raw.githubusercontent.com/${OWNER}/genova-settimana/main/site/data/events.json`;
const GENOVA_CATEGORY_META = [
  { key: 'cinema', label: '🎬 Cinema' },
  { key: 'musica', label: '🎵 Musica & Teatro' },
  { key: 'mostra', label: '🖼️ Mostre & Musei' },
  { key: 'biblioteca', label: '📚 Biblioteche & Incontri' },
  { key: 'passeggiata', label: '🚶 Passeggiate & Gite' },
  { key: 'laboratorio', label: '🛠️ Laboratori & Botteghe' },
  { key: 'ritrovo', label: '☕ Ritrovi & Sapori' },
];

export async function fetchGenovaSettimanaEvents(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(GENOVA_EVENTS_RAW_URL);
    if (res && res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {
    // fallback to local sibling repo if available
  }
  const localPath = path.resolve(process.cwd(), '../genova-settimana/site/data/events.json');
  if (fs.existsSync(localPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    } catch {
      // ignore malformed local cache
    }
  }
  return [];
}

function truncateText(text, maxLen = 110) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

function sanitizeEventUrl(url, fallback) {
  const raw = String(url || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  return fallback;
}

export function renderGenovaSettimanaCard(p) {
  const events = Array.isArray(p.weeklyEvents) ? p.weeklyEvents : [];
  const dateSuffix = p.lastDateIt && p.lastDateIt !== 'N/D' ? ` (${p.lastDateIt})` : '';
  const baseUrl = p.liveUrl.replace(/\/+$/, '');

  // Pick up to 6 distinct highlights with real showtimes, balanced across categories (round-robin)
  const highlights = [];
  const seenShowtimeKeys = new Set();
  const seenVenues = new Set();
  const preferredOrder = ['cinema', 'musica', 'mostra', 'biblioteca', 'passeggiata', 'altro'];
  const queues = preferredOrder.map((cat) =>
    events.filter((e) => e.category === cat && Array.isArray(e.showtimes) && e.showtimes.length > 0),
  );
  let progressed = true;
  while (highlights.length < 6 && progressed) {
    progressed = false;
    for (const queue of queues) {
      while (queue.length > 0) {
        const ev = queue.shift();
        const st = ev.showtimes[0];
        const showKey = `${st?.titolo || ''}|${st?.quando || ''}`.toLowerCase();
        const venueKey = String(ev.venue || ev.title || '').toLowerCase().slice(0, 24);
        if (!st?.titolo || seenShowtimeKeys.has(showKey) || seenVenues.has(venueKey)) continue;
        seenShowtimeKeys.add(showKey);
        seenVenues.add(venueKey);
        highlights.push({ ev, st });
        progressed = true;
        break;
      }
      if (highlights.length >= 6) break;
    }
  }

  const highlightRows = highlights
    .map(({ ev, st }) => {
      const href = sanitizeEventUrl(ev.url, p.liveUrl);
      const place = ev.venue || ev.title;
      const district = ev.district ? ` · ${ev.district}` : '';
      return `          <tr>
            <td><a href="${href}"><strong>${escapeHtml(truncateText(st.titolo, 82))}</strong></a></td>
            <td>${escapeHtml(truncateText(place, 48))}${escapeHtml(district)}</td>
            <td><sub>${escapeHtml(truncateText(st.quando, 64))}</sub></td>
          </tr>`;
    })
    .join('\n');

  const categoryDetails = GENOVA_CATEGORY_META.map(({ key, label }) => {
    const dedup = [];
    const seen = new Set();
    for (const ev of events.filter((e) => e.category === key)) {
      const sig = `${ev.showtimes?.[0]?.titolo || ev.title}`.toLowerCase().slice(0, 42);
      if (seen.has(sig)) continue;
      seen.add(sig);
      dedup.push(ev);
    }
    if (!dedup.length) return '';
    // Sort showtime-bearing events first
    dedup.sort((a, b) => (b.showtimes?.length || 0) - (a.showtimes?.length || 0));
    const itemsHtml = dedup
      .slice(0, 8)
      .map((ev) => {
        const href = sanitizeEventUrl(ev.url, p.liveUrl);
        const st = ev.showtimes?.[0];
        const detail = st
          ? `${truncateText(st.titolo, 78)} — <em>${escapeHtml(truncateText(st.quando, 64))}</em>`
          : escapeHtml(truncateText(ev.day_time || ev.summary, 88));
        const district = ev.district ? ` (${escapeHtml(ev.district)})` : '';
        return `          <li><a href="${href}"><strong>${escapeHtml(truncateText(ev.title, 62))}</strong></a>${district}: ${st ? escapeHtml(truncateText(st.titolo, 78)) + ` — <em>${escapeHtml(truncateText(st.quando, 64))}</em>` : detail}</li>`;
      })
      .join('\n');
    return `      <details>
        <summary><strong>${label}</strong> (${dedup.length})</summary>
        <ul>
${itemsHtml}
        </ul>
      </details>`;
  })
    .filter(Boolean)
    .join('\n');

  return `    <td width="100%" valign="top">
      <h3><a href="${p.liveUrl}">📅 ${escapeHtml(p.title)}</a></h3>
      <sub>${escapeHtml(p.category)} · ${events.length} proposte attive · ${p.freshness}${dateSuffix}</sub><br /><br />
      <strong>In programma questa settimana:</strong>
      <table>
        <thead>
          <tr>
            <th align="left">Appuntamento</th>
            <th align="left">Luogo &amp; Zona</th>
            <th align="left">Quando</th>
          </tr>
        </thead>
        <tbody>
${highlightRows}
        </tbody>
      </table>
      <strong>Esplora subito per categoria:</strong><br />
${categoryDetails}
      <br />
      <a href="${p.liveUrl}"><strong>📅 Apri l'agenda completa</strong></a> · <a href="${baseUrl}/bussola.html">🧭 Bussola Tempo Libero</a> · <a href="${baseUrl}/esercenti.html">🏪 4.966 Esercenti</a> · <a href="${baseUrl}/storie.html">🗺️ Storie &amp; Vie</a> · <a href="${baseUrl}/dashboard.html">📊 67 Comuni</a>
    </td>`;
}

export async function fetchProjectState(proj, { fetchImpl = fetch } = {}) {
  const weeklyEventsPromise =
    proj.repo === 'genova-settimana' ? fetchGenovaSettimanaEvents(fetchImpl) : Promise.resolve([]);
  try {
    const [repoInfo, latestCommits, previewCommits, weekCommits, weeklyEvents] = await Promise.all([
      ghFetch(`/repos/${OWNER}/${proj.repo}`, fetchImpl),
      ghFetch(`/repos/${OWNER}/${proj.repo}/commits?per_page=10`, fetchImpl),
      ghFetch(`/repos/${OWNER}/${proj.repo}/commits?path=docs/preview/social-preview.png&per_page=1`, fetchImpl),
      ghFetch(
        `/repos/${OWNER}/${proj.repo}/commits?since=${new Date(
          Date.now() - 7 * 86400e3,
        ).toISOString()}&per_page=100`,
        fetchImpl,
      ),
      weeklyEventsPromise,
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
      weeklyEvents,
      lastDate,
      lastDateIt: formatDateIt(lastDate),
      freshness: freshnessBadge(lastDate),
      weekUpdatesCount: Array.isArray(weekCommits) ? weekCommits.length : 0,
      apiFallback: false,
    };
  } catch (err) {
    console.warn(`[WARN] API fallback for ${proj.repo}: ${err.message}`);
    const [previewInfo, weeklyEvents] = await Promise.all([
      resolvePreviewImage(proj.repo, [], fetchImpl),
      weeklyEventsPromise,
    ]);
    return {
      ...proj,
      ...previewInfo,
      weeklyEvents,
      lastDate: null,
      lastDateIt: 'N/D',
      freshness: '⚪ Stabile',
      weekUpdatesCount: 0,
      apiFallback: true,
    };
  }
}

export function renderCard(p) {
  if (p.repo === 'genova-settimana' && Array.isArray(p.weeklyEvents) && p.weeklyEvents.length > 0) {
    return renderGenovaSettimanaCard(p);
  }
  const hasPreview = p.hasPreview !== false;
  const previewPath = p.previewPath || 'docs/preview/social-preview.png';
  const imgUrl = `https://raw.githubusercontent.com/${OWNER}/${p.repo}/main/${previewPath}?v=${p.previewSha || 'latest'}`;
  const previewBlock = hasPreview
    ? `      <a href="${p.liveUrl}">
        <img src="${imgUrl}" alt="${escapeHtml(p.title)}" width="100%" />
      </a>
      <br />\n`
    : '';
  const secondaryLink = p.secondaryUrl
    ? ` · <a href="${p.secondaryUrl}"><strong>${escapeHtml(p.secondaryLabel || 'Anteprima')}</strong></a>`
    : '';
  const dateSuffix = p.lastDateIt && p.lastDateIt !== 'N/D' ? ` (${p.lastDateIt})` : '';
  return `    <td width="100%" valign="top">
${previewBlock}      <strong><a href="${p.liveUrl}">${escapeHtml(p.title)}</a></strong><br />
      <sub>${escapeHtml(p.category)} · ${p.freshness}${dateSuffix}</sub><br /><br />
      ${escapeHtml(p.summary)}<br /><br />
      <a href="${p.liveUrl}"><strong>🚀 ${escapeHtml(p.liveLabel)}</strong></a>${secondaryLink} · <a href="${p.infoUrl}">📄 Dettagli</a>
    </td>`;
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
