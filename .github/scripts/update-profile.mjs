import fs from 'node:fs';
import path from 'node:path';

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

function getLiveTarget(appId, fallbackUrl, fallbackLabel) {
  if (HUB_BASE_URL) {
    return {
      liveUrl: `${HUB_BASE_URL}/?app=${appId}`,
      liveLabel: 'Prova Live',
    };
  }
  return { liveUrl: fallbackUrl, liveLabel: fallbackLabel };
}

const PROJECTS = [
  {
    repo: 'basilico',
    title: 'Basilico — Rapallo',
    category: 'App Consumer & Risparmio',
    liveUrl: 'https://basilico-txfxsxuuma-ew.a.run.app',
    liveLabel: 'Prova la Demo',
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
    ...getLiveTarget('resuscipack', 'https://noobucodonosor.github.io/resuscipack/', 'Apri Anteprima'),
    infoUrl: 'https://github.com/Noobucodonosor/resuscipack',
    summary:
      'Motore di ricerca e consultazione su oltre 1.400 testi e volumi tecnici, progettato per trovare subito concetti chiave con fonti sempre verificabili.',
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

async function ghFetch(endpoint) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Noobucodonosor-profile-updater',
  };
  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }
  const res = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${endpoint} failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateIt(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  });
}

function freshnessBadge(isoDate) {
  const diffHours = (Date.now() - new Date(isoDate).getTime()) / 36e5;
  if (diffHours <= 24) return '🟢 Aggiornato oggi';
  if (diffHours <= 24 * 7) return '🟡 Aggiornato questa settimana';
  return '⚪ Stabile';
}

async function fetchProjectState(proj) {
  const [repoInfo, latestCommits, previewCommits, weekCommits] = await Promise.all([
    ghFetch(`/repos/${OWNER}/${proj.repo}`),
    ghFetch(`/repos/${OWNER}/${proj.repo}/commits?per_page=10`),
    ghFetch(`/repos/${OWNER}/${proj.repo}/commits?path=docs/preview/social-preview.png&per_page=1`),
    ghFetch(
      `/repos/${OWNER}/${proj.repo}/commits?since=${new Date(
        Date.now() - 7 * 86400e3,
      ).toISOString()}&per_page=100`,
    ),
  ]);

  const meaningfulCommit =
    latestCommits.find((c) => !/^(chore|fix|ci)\(preview\):/i.test(c.commit.message)) ||
    latestCommits[0];

  const previewSha = previewCommits[0]?.sha?.slice(0, 8) || 'latest';
  const lastDate = meaningfulCommit?.commit?.author?.date || repoInfo.pushed_at;

  return {
    ...proj,
    previewSha,
    lastDate,
    lastDateIt: formatDateIt(lastDate),
    freshness: freshnessBadge(lastDate),
    weekUpdatesCount: Array.isArray(weekCommits) ? weekCommits.length : 0,
  };
}

function renderCard(p) {
  const imgUrl = `https://raw.githubusercontent.com/${OWNER}/${p.repo}/main/docs/preview/social-preview.png?v=${p.previewSha}`;
  return `    <td width="50%" valign="top">
      <a href="${p.liveUrl}">
        <img src="${imgUrl}" alt="${escapeHtml(p.title)}" />
      </a>
      <br />
      <strong><a href="${p.liveUrl}">${escapeHtml(p.title)}</a></strong><br />
      <sub>${escapeHtml(p.category)} · ${p.freshness} (${p.lastDateIt})</sub><br /><br />
      ${escapeHtml(p.summary)}<br /><br />
      <a href="${p.liveUrl}"><strong>🚀 ${escapeHtml(p.liveLabel)}</strong></a> · <a href="${p.infoUrl}">📄 Dettagli</a>
    </td>`;
}

function renderShowcase(states) {
  const rows = [];
  for (let i = 0; i < states.length; i += 2) {
    const left = renderCard(states[i]);
    const right = states[i + 1] ? renderCard(states[i + 1]) : '    <td width="50%" valign="top"></td>';
    rows.push(`  <tr>\n${left}\n${right}\n  </tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

function renderPulse(states) {
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

function replaceBlock(content, marker, replacement) {
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

async function main() {
  const readmePath = path.resolve('README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');

  const states = await Promise.all(PROJECTS.map(fetchProjectState));
  states.sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());

  readme = replaceBlock(readme, 'SHOWCASE', renderShowcase(states));
  readme = replaceBlock(readme, 'PULSE', renderPulse(states));

  fs.writeFileSync(readmePath, readme, 'utf8');
  console.log('README.md updated successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
