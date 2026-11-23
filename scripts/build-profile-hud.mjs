import fs from 'node:fs';
import path from 'node:path';

export const PALETTES = {
  dark: {
    bg: '#0d1117',
    cardBg: '#161b22',
    cardBgAlt: '#1c2128',
    border: '#30363d',
    borderSoft: '#21262d',
    ink: '#f0f6fc',
    muted: '#8b949e',
    dim: '#6e7681',
    accent: '#58a6ff',
    green: '#3fb950',
    yellow: '#d29922',
    red: '#f85149',
    shineStart: '#f0f6fc',
    shineMid: '#58a6ff',
    shineEnd: '#f0f6fc',
    barBg: '#21262d',
  },
  light: {
    bg: '#ffffff',
    cardBg: '#f6f8fa',
    cardBgAlt: '#ffffff',
    border: '#d0d7de',
    borderSoft: '#e5e8ec',
    ink: '#1f2328',
    muted: '#59636e',
    dim: '#6e7781',
    accent: '#0969da',
    green: '#1a7f37',
    yellow: '#9a6700',
    red: '#cf222e',
    shineStart: '#1f2328',
    shineMid: '#0969da',
    shineEnd: '#1f2328',
    barBg: '#eaeef2',
  },
};

export function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatNumberIt(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('it-IT');
}

function sharedCss({ isStatic }) {
  const mono = `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  const sans = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  if (isStatic) {
    return `
      .sans { font-family: ${sans}; }
      .mono { font-family: ${mono}; }
      .line-reveal { opacity: 1; }
      .bar-grow { transform: scaleY(1); }
      .pulse-dot { opacity: 1; }
      .arrow-nudge { transform: translateX(0); }
    `;
  }
  return `
    .sans { font-family: ${sans}; }
    .mono { font-family: ${mono}; }
    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes barRise {
      from { transform: scaleY(0.05); }
      to { transform: scaleY(1); }
    }
    @keyframes pulseOpacity {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.35; }
    }
    @keyframes arrowSlide {
      0%, 100% { transform: translateX(0); }
      50% { transform: translateX(3px); }
    }
    .line-reveal {
      opacity: 0;
      animation: fadeSlideIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    .bar-grow {
      transform-box: fill-box;
      transform-origin: bottom;
      animation: barRise 0.75s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    .pulse-dot {
      animation: pulseOpacity 2.2s ease-in-out infinite;
    }
    .arrow-nudge {
      animation: arrowSlide 2s ease-in-out infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .line-reveal, .bar-grow, .pulse-dot, .arrow-nudge {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    }
  `;
}

/**
 * Generates 18 discrete SMIL <set> frames counting from 0 up to targetValue.
 * Falls back to static <text> when isStatic=true.
 */
export function renderSmilCounter({
  x,
  y,
  targetValue,
  suffix = '',
  className = 'mono',
  fontSize = 24,
  fontWeight = 700,
  fill,
  isStatic = false,
  formatFn = formatNumberIt,
}) {
  const finalLabel = `${formatFn(targetValue)}${suffix}`;
  if (isStatic || targetValue <= 1) {
    return `<text x="${x}" y="${y}" class="${className}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">${escapeXml(finalLabel)}</text>`;
  }

  const frames = 18;
  const stepMs = 45;
  const nodes = [];
  for (let i = 0; i < frames; i++) {
    const progress = (i + 1) / frames;
    const eased = 1 - Math.pow(1 - progress, 3);
    const val = i === frames - 1 ? targetValue : Math.max(0, Math.round(targetValue * eased));
    const begin = `${(i * stepMs) / 1000}s`;
    const isLast = i === frames - 1;
    const durAttr = isLast ? '' : ` dur="${stepMs / 1000}s"`;
    const vis = i === 0 ? 'visible' : 'hidden';
    nodes.push(
      `<text x="${x}" y="${y}" class="${className}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" visibility="${vis}">${escapeXml(
        `${formatFn(val)}${suffix}`,
      )}<set attributeName="visibility" to="visible" begin="${begin}"${durAttr} fill="freeze" /></text>`,
    );
  }
  return nodes.join('\n  ');
}

function probeColor(probe, p) {
  if (!probe || !probe.ok) return p.yellow;
  return p.green;
}

function probeBadgeText(probe) {
  if (!probe) return 'STANDBY';
  if (probe.ok) return `ONLINE ${probe.latencyMs}ms`;
  return probe.status ? `HTTP ${probe.status}` : 'STANDBY';
}

function freshnessColor(freshness, p) {
  if (String(freshness).includes('oggi')) return p.green;
  if (String(freshness).includes('settimana')) return p.yellow;
  return p.dim;
}

function renderTaskIcon(slug, x, y, color) {
  switch (slug) {
    case 'spesa':
      return `<g transform="translate(${x},${y})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 7h12l-1.2 11H7.2L6 7z" />
        <path d="M9 7V5a3 3 0 0 1 6 0v2" />
      </g>`;
    case 'libro':
      return `<g transform="translate(${x},${y})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21V5.5z" />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5a2.5 2.5 0 0 1 2.5 2V5.5z" />
      </g>`;
    case 'video':
      return `<g transform="translate(${x},${y})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <polygon points="10,9 16,12 10,15" fill="${color}" stroke="none" />
      </g>`;
    case 'meteo':
      return `<g transform="translate(${x},${y})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 16a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17.3 9.5 3.5 3.5 0 0 1 16.5 16H7z" />
        <line x1="8" y1="19" x2="7" y2="21" />
        <line x1="12" y1="19" x2="11" y2="21" />
        <line x1="16" y1="19" x2="15" y2="21" />
      </g>`;
    case 'lead':
    default:
      return `<g transform="translate(${x},${y})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1.2" fill="${color}" />
      </g>`;
  }
}

export function renderHeroSvg({ theme = 'dark', identity, states, hubProbe, updatedAtIt, isStatic = false }) {
  const p = PALETTES[theme];
  const W = 880;
  const H = 224;
  const totalUpdates = states.reduce((acc, s) => acc + (s.weekUpdatesCount || 0), 0);
  const activeToday = states.filter((s) => String(s.freshness).includes('oggi')).length;
  const hubText = probeBadgeText(hubProbe);
  const hubCol = probeColor(hubProbe, p);

  const lines = [
    { prefix: '$', text: `whoami --profile ${identity.handle} --region "${identity.location}"`, delay: 0 },
    { prefix: '>', text: identity.tagline, delay: 18 },
    {
      prefix: '>',
      text: `vetrina: ${states.length} prodotti verticali | ${activeToday} aggiornati oggi | ${totalUpdates} commit (7g)`,
      delay: 36,
    },
    {
      prefix: '>',
      text: `hub-cloud-run: ${hubText} | kit-offline: bundles/noobucodonosor-portable.html | sync: ${updatedAtIt}`,
      delay: 54,
    },
  ];

  const lineSvg = lines
    .map((l, idx) => {
      const y = 114 + idx * 23;
      return `<g class="line-reveal" style="animation-delay: ${l.delay}ms">
        <text x="28" y="${y}" class="mono" font-size="13" font-weight="700" fill="${p.accent}">${escapeXml(l.prefix)}</text>
        <text x="46" y="${y}" class="mono" font-size="13" fill="${idx === 1 ? p.ink : p.muted}">${escapeXml(l.text)}</text>
      </g>`;
    })
    .join('\n  ');

  const shineAnim = isStatic
    ? ''
    : `<animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="2 0" dur="4.2s" repeatCount="indefinite" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Noobucodonosor Terminal HUD">
  <defs>
    <style>${sharedCss({ isStatic })}</style>
    <linearGradient id="hero-shine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${p.shineStart}" />
      <stop offset="45%" stop-color="${p.shineMid}" />
      <stop offset="55%" stop-color="${p.shineStart}" />
      <stop offset="100%" stop-color="${p.shineEnd}" />
      ${shineAnim}
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${p.cardBg}" stroke="${p.border}" />
  <rect x="1" y="1" width="${W - 2}" height="36" rx="11" fill="${p.cardBgAlt}" />
  <line x1="1" y1="37" x2="${W - 1}" y2="37" stroke="${p.borderSoft}" />
  <circle cx="22" cy="19" r="5" fill="#ff5f56" />
  <circle cx="38" cy="19" r="5" fill="#ffbd2e" />
  <circle cx="54" cy="19" r="5" fill="#27c93f" />
  <text x="74" y="23" class="mono" font-size="12" fill="${p.muted}">noobucodonosor@genova:~ — terminal-hud</text>
  <rect x="${W - 156}" y="9" width="140" height="20" rx="10" fill="${p.barBg}" stroke="${p.border}" />
  <circle cx="${W - 142}" cy="19" r="4" fill="${hubCol}" class="pulse-dot" />
  <text x="${W - 132}" y="23" class="mono" font-size="11" font-weight="600" fill="${p.ink}">HUB ${escapeXml(hubText)}</text>

  <text x="28" y="76" class="sans" font-size="26" font-weight="800" letter-spacing="-0.5" fill="url(#hero-shine)">Noobucodonosor — Control Deck</text>
  ${lineSvg}
</svg>`;
}

export function renderTaskTileSvg({ theme = 'dark', task, isStatic = false }) {
  const p = PALETTES[theme];
  const W = 172;
  const H = 112;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(task.title)} — ${escapeXml(task.project)}">
  <defs>
    <style>${sharedCss({ isStatic })}</style>
  </defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${p.cardBg}" stroke="${p.border}" />
  <rect x="0.5" y="0.5" width="${W - 1}" height="4" rx="2" fill="${task.accent}" />
  ${renderTaskIcon(task.slug, 14, 16, task.accent)}
  <text x="148" y="30" class="mono arrow-nudge" font-size="13" font-weight="700" fill="${task.accent}">→</text>
  <text x="14" y="62" class="sans" font-size="14" font-weight="700" fill="${p.ink}">${escapeXml(task.title)}</text>
  <text x="14" y="80" class="mono" font-size="11" font-weight="600" fill="${task.accent}">${escapeXml(task.project)}</text>
  <text x="14" y="97" class="sans" font-size="11" fill="${p.muted}">${escapeXml(task.subtitle)}</text>
</svg>`;
}

export function renderBinaryTileSvg({ theme = 'dark', kind, hubProbe, states, isStatic = false }) {
  const p = PALETTES[theme];
  const W = 286;
  const H = 164;

  if (kind === 'web') {
    const hubText = probeBadgeText(hubProbe);
    const hubCol = probeColor(hubProbe, p);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Binario Web Live">
  <defs><style>${sharedCss({ isStatic })}</style></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${p.cardBg}" stroke="${p.border}" />
  <text x="16" y="28" class="mono" font-size="11" font-weight="700" fill="${p.accent}">BINARIO 01 · CLOUD RUN</text>
  <circle cx="204" cy="24" r="4" fill="${hubCol}" class="pulse-dot" />
  <text x="213" y="28" class="mono" font-size="10" font-weight="600" fill="${hubCol}">${escapeXml(hubText)}</text>
  <text x="16" y="56" class="sans" font-size="17" font-weight="700" fill="${p.ink}">Hub &amp; Assistente AI</text>
  <text x="16" y="78" class="sans" font-size="12" fill="${p.muted}">4 Playground prescaricati + 5 flussi</text>
  <text x="16" y="96" class="sans" font-size="12" fill="${p.muted}">Pool API free-tier con cache &amp; BYOK</text>
  <rect x="16" y="114" width="78" height="22" rx="6" fill="${p.barBg}" stroke="${p.border}" />
  <text x="25" y="129" class="mono" font-size="10" fill="${p.ink}">ADR-0002</text>
  <rect x="102" y="114" width="78" height="22" rx="6" fill="${p.barBg}" stroke="${p.border}" />
  <text x="111" y="129" class="mono" font-size="10" fill="${p.ink}">ADR-0003</text>
  <text x="242" y="130" class="mono arrow-nudge" font-size="13" font-weight="700" fill="${p.accent}">↗</text>
</svg>`;
  }

  if (kind === 'portable') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Binario Locale Portabile">
  <defs><style>${sharedCss({ isStatic })}</style></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${p.cardBg}" stroke="${p.border}" />
  <text x="16" y="28" class="mono" font-size="11" font-weight="700" fill="${p.green}">BINARIO 02 · OFFLINE HTML</text>
  <text x="16" y="56" class="sans" font-size="17" font-weight="700" fill="${p.ink}">Kit Locale Portabile</text>
  <text x="16" y="78" class="sans" font-size="12" fill="${p.muted}">File singolo auto-contenuto (.html)</text>
  <text x="16" y="96" class="sans" font-size="12" fill="${p.muted}">Doppio clic file:// · Zero dipendenze</text>
  <rect x="16" y="114" width="114" height="22" rx="6" fill="${p.barBg}" stroke="${p.border}" />
  <text x="24" y="129" class="mono" font-size="10" fill="${p.ink}">BYOK + Fallback</text>
  <text x="242" y="130" class="mono arrow-nudge" font-size="13" font-weight="700" fill="${p.green}">↓</text>
</svg>`;
  }

  // kind === 'telemetry'
  const totalUpdates = states.reduce((acc, s) => acc + (s.weekUpdatesCount || 0), 0);
  const maxWeek = Math.max(1, ...states.map((s) => s.weekUpdatesCount || 0));
  const bars = states.slice(0, 7).map((s, idx) => {
    const val = s.weekUpdatesCount || 0;
    const barH = Math.max(6, Math.round((val / maxWeek) * 44));
    const x = 16 + idx * 36;
    const y = 136 - barH;
    const delay = idx * 45;
    return `<rect x="${x}" y="92" width="24" height="44" rx="4" fill="${p.barBg}" />
      <rect x="${x}" y="${y}" width="24" height="${barH}" rx="4" fill="${s.accent || p.accent}" class="bar-grow" style="animation-delay: ${delay}ms" />
      <text x="${x + 12}" y="150" text-anchor="middle" class="mono" font-size="9" fill="${p.muted}">${escapeXml((s.slug || s.repo).slice(0, 4))}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Telemetria 7 giorni">
  <defs><style>${sharedCss({ isStatic })}</style></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${p.cardBg}" stroke="${p.border}" />
  <text x="16" y="28" class="mono" font-size="11" font-weight="700" fill="${p.accent}">TELEMETRIA · ULTIMI 7 GIORNI</text>
  ${renderSmilCounter({
    x: 16,
    y: 62,
    targetValue: totalUpdates,
    suffix: ' commit',
    className: 'mono',
    fontSize: 22,
    fontWeight: 700,
    fill: p.ink,
    isStatic,
  })}
  <text x="16" y="80" class="sans" font-size="11" fill="${p.muted}">su ${states.length} progetti verticali attivi</text>
  ${bars.join('\n  ')}
</svg>`;
}

export function renderProjectCardSvg({ theme = 'dark', project, probe, wide = false, isStatic = false }) {
  const p = PALETTES[theme];
  const W = wide ? 880 : 432;
  const H = wide ? 136 : 156;
  const accent = project.accent || p.accent;
  const pText = probeBadgeText(probe);
  const pCol = probeColor(probe, p);
  const fCol = freshnessColor(project.freshness, p);
  const dateLabel = project.lastDateIt && project.lastDateIt !== 'N/D' ? project.lastDateIt : 'N/D';
  const updates = project.weekUpdatesCount || 0;

  if (wide) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(project.title)}">
  <defs><style>${sharedCss({ isStatic })}</style></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${p.cardBg}" stroke="${p.border}" />
  <rect x="0.5" y="0.5" width="5" height="${H - 1}" rx="2" fill="${accent}" />
  <text x="22" y="28" class="mono" font-size="11" font-weight="700" fill="${accent}">${escapeXml(project.category.toUpperCase())}</text>
  <circle cx="220" cy="24" r="4" fill="${fCol}" class="pulse-dot" />
  <text x="230" y="28" class="mono" font-size="11" fill="${p.muted}">${escapeXml(dateLabel)} · ${updates} agg. (7g)</text>
  <rect x="${W - 150}" y="12" width="132" height="22" rx="11" fill="${p.barBg}" stroke="${p.border}" />
  <circle cx="${W - 136}" cy="23" r="4" fill="${pCol}" />
  <text x="${W - 126}" y="27" class="mono" font-size="10" font-weight="600" fill="${p.ink}">${escapeXml(pText)}</text>

  <text x="22" y="62" class="sans" font-size="21" font-weight="800" fill="${p.ink}">${escapeXml(project.title)}</text>
  <text x="22" y="88" class="sans" font-size="13" fill="${p.muted}">${escapeXml(project.summary.slice(0, 92))}</text>
  <text x="22" y="116" class="mono" font-size="12" font-weight="700" fill="${accent}">Apri applicazione live →</text>

  <rect x="${W - 230}" y="48" width="212" height="72" rx="8" fill="${p.cardBgAlt}" stroke="${p.borderSoft}" />
  ${renderSmilCounter({
    x: W - 214,
    y: 84,
    targetValue: project.metricValue || 0,
    suffix: project.metricSuffix || '',
    className: 'mono',
    fontSize: 20,
    fontWeight: 700,
    fill: p.ink,
    isStatic,
  })}
  <text x="${W - 214}" y="106" class="sans" font-size="11" fill="${p.muted}">${escapeXml(project.metricSub || '')}</text>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(project.title)}">
  <defs><style>${sharedCss({ isStatic })}</style></defs>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${p.cardBg}" stroke="${p.border}" />
  <rect x="0.5" y="0.5" width="${W - 1}" height="4" rx="2" fill="${accent}" />
  <text x="16" y="28" class="mono" font-size="10" font-weight="700" fill="${accent}">${escapeXml(project.category.toUpperCase())}</text>
  <rect x="${W - 134}" y="14" width="118" height="20" rx="10" fill="${p.barBg}" stroke="${p.border}" />
  <circle cx="${W - 122}" cy="24" r="3.5" fill="${pCol}" />
  <text x="${W - 113}" y="28" class="mono" font-size="9.5" font-weight="600" fill="${p.ink}">${escapeXml(pText)}</text>

  <text x="16" y="56" class="sans" font-size="17" font-weight="800" fill="${p.ink}">${escapeXml(project.title)}</text>
  ${renderSmilCounter({
    x: 16,
    y: 86,
    targetValue: project.metricValue || 0,
    suffix: project.metricSuffix || '',
    className: 'mono',
    fontSize: 19,
    fontWeight: 700,
    fill: accent,
    isStatic,
  })}
  <text x="16" y="106" class="sans" font-size="11.5" fill="${p.muted}">${escapeXml(project.metricSub || '')}</text>

  <line x1="16" y1="122" x2="${W - 16}" y2="122" stroke="${p.borderSoft}" />
  <circle cx="21" cy="139" r="4" fill="${fCol}" class="pulse-dot" />
  <text x="31" y="143" class="mono" font-size="11" fill="${p.muted}">${escapeXml(dateLabel)} · ${updates} agg. (7g)</text>
  <text x="${W - 28}" y="143" class="mono arrow-nudge" font-size="13" font-weight="700" fill="${accent}">→</text>
</svg>`;
}

export async function probeEndpoint(url, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  if (!url) return { ok: false, status: 0, latencyMs: 0 };
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'GET', signal: controller.signal });
    const latencyMs = Date.now() - start;
    return { ok: Boolean(res?.ok), status: res?.status || 0, latencyMs };
  } catch {
    return { ok: false, status: 0, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

export function buildAllHudSvgs({
  outDir = path.resolve(process.cwd(), 'assets/cards'),
  config,
  states,
  probes = {},
  hubProbe,
  updatedAtIt,
  isStatic = process.env.STATIC === '1',
}) {
  fs.mkdirSync(outDir, { recursive: true });
  const hud = config.profileHud || {};
  const written = [];

  for (const theme of ['light', 'dark']) {
    const writeSvg = (filename, content) => {
      const target = path.join(outDir, filename);
      fs.writeFileSync(target, `${content.trim()}\n`, 'utf8');
      written.push(target);
    };

    writeSvg(
      `hero-${theme}.svg`,
      renderHeroSvg({
        theme,
        identity: hud,
        states,
        hubProbe,
        updatedAtIt,
        isStatic,
      }),
    );

    for (const task of hud.quickTasks || []) {
      writeSvg(`task-${task.slug}-${theme}.svg`, renderTaskTileSvg({ theme, task, isStatic }));
    }

    for (const kind of ['web', 'portable', 'telemetry']) {
      writeSvg(`binary-${kind}-${theme}.svg`, renderBinaryTileSvg({ theme, kind, hubProbe, states, isStatic }));
    }

    for (const proj of states) {
      const slug = proj.slug || proj.repo;
      writeSvg(
        `project-${slug}-${theme}.svg`,
        renderProjectCardSvg({
          theme,
          project: proj,
          probe: probes[slug],
          wide: slug === 'genova-settimana',
          isStatic,
        }),
      );
    }
  }
  return written;
}
