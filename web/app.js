import {
  BYOK_PROVIDERS,
  checkProxyHealth,
  extractKn5Url,
  loadByokConfig,
  runDeterministicFallback,
  runServiceAI,
  saveByokConfig,
} from './ai-client.js';

const state = {
  dataset: null,
  proxyHealth: { reachable: false, proxyReady: false, providers: [] },
  filter: 'all',
  activeTab: 'leslie',
  selectedLeslieId: null,
  selectedKn5Id: null,
  customKn5Item: null,
  kn5UrlInput: '',
  resuscipackQuery: '',
};

const SAFE_MD_ELEMENTS = ['p', 'h3', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'br'];

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdownToHtml(line) {
  let out = escapeHtml(line);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}

function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inCode = false;
  let codeLines = [];
  let listType = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith('```')) {
      closeList();
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    if (line.startsWith('### ') || line.startsWith('## ')) {
      closeList();
      const title = line.replace(/^#{2,3}\s+/, '');
      html.push(`<h3>${inlineMarkdownToHtml(title)}</h3>`);
      continue;
    }

    if (line.startsWith('> ')) {
      closeList();
      html.push(`<blockquote>${inlineMarkdownToHtml(line.slice(2))}</blockquote>`);
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${inlineMarkdownToHtml(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${inlineMarkdownToHtml(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  }

  if (inCode && codeLines.length) {
    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  closeList();
  return html.join('');
}

function appendInlineNodes(parent, text) {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  for (const match of text.matchAll(tokenRegex)) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      const el = document.createElement('strong');
      el.textContent = token.slice(2, -2);
      parent.appendChild(el);
    } else if (token.startsWith('`')) {
      const el = document.createElement('code');
      el.textContent = token.slice(1, -1);
      parent.appendChild(el);
    } else if (token.startsWith('*')) {
      const el = document.createElement('em');
      el.textContent = token.slice(1, -1);
      parent.appendChild(el);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

export function safeRenderMarkdown(container, md) {
  if (typeof container.setHTML === 'function' && typeof Document.parseHTML === 'function') {
    const html = markdownToHtml(md);
    container.setHTML(html, { sanitizer: { elements: SAFE_MD_ELEMENTS, attributes: [] } });
    return;
  }

  // Fallback without native Sanitizer API: construct DOM nodes directly (zero innerHTML)
  container.replaceChildren();
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  let inCode = false;
  let codeLines = [];
  let currentList = null;

  const flushList = () => {
    currentList = null;
  };

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith('```')) {
      flushList();
      if (inCode) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = codeLines.join('\n');
        pre.appendChild(code);
        container.appendChild(pre);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    if (line.startsWith('### ') || line.startsWith('## ')) {
      flushList();
      const h = document.createElement('h3');
      appendInlineNodes(h, line.replace(/^#{2,3}\s+/, ''));
      container.appendChild(h);
      continue;
    }

    if (line.startsWith('> ')) {
      flushList();
      const bq = document.createElement('blockquote');
      appendInlineNodes(bq, line.slice(2));
      container.appendChild(bq);
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (!currentList || currentList.tagName !== 'UL') {
        currentList = document.createElement('ul');
        container.appendChild(currentList);
      }
      const li = document.createElement('li');
      appendInlineNodes(li, ulMatch[1]);
      currentList.appendChild(li);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!currentList || currentList.tagName !== 'OL') {
        currentList = document.createElement('ol');
        container.appendChild(currentList);
      }
      const li = document.createElement('li');
      appendInlineNodes(li, olMatch[1]);
      currentList.appendChild(li);
      continue;
    }

    flushList();
    const p = document.createElement('p');
    appendInlineNodes(p, line);
    container.appendChild(p);
  }
}

function updateEngineBadge() {
  const pill = document.getElementById('engine-status');
  const text = document.getElementById('engine-status-text');
  const byok = loadByokConfig();

  pill.classList.remove('is-live', 'is-byok');

  if (byok) {
    pill.classList.add('is-byok');
    text.textContent = `BYOK: ${byok.provider} (${byok.model})`;
    return;
  }

  if (state.proxyHealth.proxyReady) {
    pill.classList.add('is-live');
    const count = state.proxyHealth.providers?.length || 1;
    text.textContent = `Proxy Free-Tier (${count} provider · ${state.proxyHealth.dailyRemaining ?? '—'} rim.)`;
    return;
  }

  text.textContent = 'Locale Deterministico (€0)';
}

function buildFallbackThumbDataUri(project) {
  const accent = project.accessType === 'live' ? '#1b7a46' : '#c44922';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#1c364d"/>
    <rect x="0" y="348" width="640" height="12" fill="${accent}"/>
    <text x="40" y="135" fill="#d9e2ec" font-family="system-ui,sans-serif" font-size="20" font-weight="600">${escapeHtml(project.category)}</text>
    <text x="40" y="195" fill="#ffffff" font-family="system-ui,sans-serif" font-size="38" font-weight="700">${escapeHtml(project.title)}</text>
    <text x="40" y="250" fill="#b8c7d9" font-family="monospace" font-size="18">${escapeHtml(project.badge)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function renderProjects() {
  const grid = document.getElementById('projects-grid');
  grid.replaceChildren();

  const items = state.dataset.projects.filter((p) =>
    state.filter === 'all' ? true : p.accessType === state.filter,
  );

  for (const p of items) {
    const card = document.createElement('article');
    card.className = 'project-card';

    const img = document.createElement('img');
    img.className = 'project-thumb';
    img.src = p.previewUrl;
    img.alt = p.title;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      if (!img.dataset.fallbackApplied) {
        img.dataset.fallbackApplied = '1';
        img.src = buildFallbackThumbDataUri(p);
      }
    });
    card.appendChild(img);

    const body = document.createElement('div');
    body.className = 'project-body';

    const top = document.createElement('div');
    top.className = 'project-top';

    const cat = document.createElement('span');
    cat.className = 'project-cat';
    cat.textContent = p.category;

    const badge = document.createElement('span');
    badge.className = `badge ${p.accessType === 'live' ? 'badge-live' : 'badge-playground'}`;
    badge.textContent = p.badge;

    top.append(cat, badge);
    body.appendChild(top);

    const title = document.createElement('h3');
    title.textContent = p.title;
    body.appendChild(title);

    const summary = document.createElement('p');
    summary.textContent = p.summary;
    body.appendChild(summary);

    const tags = document.createElement('div');
    tags.className = 'tag-row';
    for (const s of p.stack) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = s;
      tags.appendChild(tag);
    }
    body.appendChild(tags);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    if (p.accessType === 'playground') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = 'Prova Live qui';
      btn.addEventListener('click', () => {
        selectTab(p.id);
        document.getElementById('playground').scrollIntoView({ behavior: 'smooth' });
      });
      actions.appendChild(btn);
    } else {
      const liveLink = document.createElement('a');
      liveLink.className = 'btn btn-primary btn-sm';
      liveLink.href = p.liveUrl;
      liveLink.target = '_blank';
      liveLink.rel = 'noopener noreferrer';
      liveLink.textContent = 'Apri App Live';
      actions.appendChild(liveLink);
    }

    const repoLink = document.createElement('a');
    repoLink.className = 'btn btn-sm';
    repoLink.href = p.repoUrl;
    repoLink.target = '_blank';
    repoLink.rel = 'noopener noreferrer';
    repoLink.textContent = 'Codice';
    actions.appendChild(repoLink);

    body.appendChild(actions);
    card.appendChild(body);
    grid.appendChild(card);
  }
}

function buildTelemetrySvg(points) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const w = 440;
  const h = 150;
  const pad = 22;
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'telemetry-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Grafico velocità km/h e angolo di piega della sessione ScooterLab');

  const maxSpeed = 65;
  const maxLean = 35;
  const stepX = (w - pad * 2) / Math.max(1, points.length - 1);

  const speedPts = points
    .map((pt, i) => `${(pad + i * stepX).toFixed(1)},${(h - pad - (pt.speedKmh / maxSpeed) * (h - pad * 2)).toFixed(1)}`)
    .join(' ');
  const leanPts = points
    .map((pt, i) => `${(pad + i * stepX).toFixed(1)},${(h - pad - (pt.leanDeg / maxLean) * (h - pad * 2)).toFixed(1)}`)
    .join(' ');

  const speedLine = document.createElementNS(svgNS, 'polyline');
  speedLine.setAttribute('fill', 'none');
  speedLine.setAttribute('stroke', '#1c364d');
  speedLine.setAttribute('stroke-width', '2.5');
  speedLine.setAttribute('points', speedPts);
  svg.appendChild(speedLine);

  const leanLine = document.createElementNS(svgNS, 'polyline');
  leanLine.setAttribute('fill', 'none');
  leanLine.setAttribute('stroke', '#c44922');
  leanLine.setAttribute('stroke-width', '2');
  leanLine.setAttribute('stroke-dasharray', '4 3');
  leanLine.setAttribute('points', leanPts);
  svg.appendChild(leanLine);

  points.forEach((pt, i) => {
    const cx = pad + i * stepX;
    const cy = h - pad - (pt.speedKmh / maxSpeed) * (h - pad * 2);
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', cx.toFixed(1));
    dot.setAttribute('cy', cy.toFixed(1));
    dot.setAttribute('r', '3.5');
    dot.setAttribute('fill', '#1c364d');
    svg.appendChild(dot);
  });

  return svg;
}

function getActiveContextAndMeta() {
  const pg = state.dataset.playgrounds;
  if (state.activeTab === 'leslie') {
    const item = pg.leslie.items.find((x) => x.id === state.selectedLeslieId) || pg.leslie.items[0];
    const context = [
      `Azienda: ${item.name}`,
      `Settore: ${item.sector} · Località: ${item.location}`,
      `Segnali: ${item.signals.join('; ')}`,
      `Note: ${item.notes}`,
    ].join('\n');
    return { context, meta: { item } };
  }

  if (state.activeTab === 'kn5') {
    const isCustom = state.selectedKn5Id === '__custom_url__' && state.customKn5Item;
    const item = isCustom
      ? state.customKn5Item
      : pg.kn5.items.find((x) => x.id === state.selectedKn5Id) || pg.kn5.items[0];
    const customBox = document.getElementById('kn5-transcript');
    const transcript = customBox ? customBox.value : item.transcript;
    const urlLine = item.url ? `URL: ${item.url}\n` : '';
    const context = `Titolo: ${item.title}\nFonte: ${item.source}\n${urlLine}Trascrizione:\n${transcript}`;
    return {
      context,
      meta: {
        item: { ...item, transcript },
        presetId: isCustom ? `url:${item.url}` : item.id,
        urlAlreadyExtracted: isCustom,
      },
    };
  }

  if (state.activeTab === 'resuscipack') {
    const q = state.resuscipackQuery.trim().toLowerCase();
    const matched = pg.resuscipack.items.filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.discipline.toLowerCase().includes(q) ||
        s.excerpt.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
    const activeItems = matched.length ? matched : pg.resuscipack.items;
    const context = activeItems
      .map((s) => `[${s.id}] ${s.title} (${s.discipline}, ${s.license}): ${s.excerpt}`)
      .join('\n');
    return { context, meta: { items: activeItems } };
  }

  const s = pg.scooterlab.session;
  const context = [
    `Sessione: ${s.sessionId} · Veicolo: ${s.vehicle}`,
    `Hardware: ${s.hardware}`,
    `Tratta: ${s.route} (${s.distanceKm} km, ${s.durationMin} min, media ${s.avgSpeedKmh} km/h, max ${s.maxSpeedKmh} km/h, piega max ${s.maxLeanDeg}°, frenata max ${s.maxBrakeG} g)`,
    'Punti chiave:',
    ...s.points.map(
      (pt) => `- ${pt.t} ${pt.zone}: ${pt.speedKmh} km/h, piega ${pt.leanDeg}°, accel ${pt.accelG} g (${pt.note})`,
    ),
  ].join('\n');
  return { context, meta: { session: s } };
}

function renderPlaygroundLeft() {
  const left = document.getElementById('playground-left');
  left.replaceChildren();
  const pg = state.dataset.playgrounds[state.activeTab];

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Dataset Prescaricato (Zero Upload)';

  const heading = document.createElement('h3');
  heading.textContent = pg.label;

  const sub = document.createElement('p');
  sub.style.cssText = 'margin: 0.35rem 0 0.8rem; font-size: 0.86rem; color: var(--ink-soft);';
  sub.textContent = pg.subtitle;

  left.append(eyebrow, heading, sub);

  if (state.activeTab === 'leslie') {
    const list = document.createElement('div');
    list.className = 'preset-list';
    for (const lead of pg.items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `preset-item ${lead.id === state.selectedLeslieId ? 'is-selected' : ''}`;
      const strong = document.createElement('strong');
      strong.textContent = lead.name;
      const span = document.createElement('span');
      span.textContent = `${lead.sector} · ${lead.location} — ${lead.signals[0]}`;
      btn.append(strong, span);
      btn.addEventListener('click', () => {
        state.selectedLeslieId = lead.id;
        renderPlaygroundLeft();
      });
      list.appendChild(btn);
    }
    left.appendChild(list);
  } else if (state.activeTab === 'kn5') {
    const urlField = document.createElement('div');
    urlField.className = 'field';
    urlField.style.marginBottom = '0.85rem';
    const urlLabel = document.createElement('label');
    urlLabel.setAttribute('for', 'kn5-url-input');
    urlLabel.textContent = 'Incolla un tuo link pubblico (video YouTube o articolo web)';

    const urlRow = document.createElement('div');
    urlRow.style.cssText = 'display: flex; gap: 0.45rem;';
    const urlInput = document.createElement('input');
    urlInput.id = 'kn5-url-input';
    urlInput.className = 'input';
    urlInput.type = 'url';
    urlInput.placeholder = 'https://www.youtube.com/watch?v=... o https://...';
    urlInput.value = state.kn5UrlInput;
    urlInput.addEventListener('input', (e) => {
      state.kn5UrlInput = e.target.value;
    });

    const urlBtn = document.createElement('button');
    urlBtn.id = 'kn5-url-btn';
    urlBtn.type = 'button';
    urlBtn.className = 'btn btn-primary btn-sm';
    urlBtn.style.whiteSpace = 'nowrap';
    urlBtn.textContent = 'Estrai & Analizza';
    urlBtn.addEventListener('click', () => handleKn5UrlExtract(urlInput.value));
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleKn5UrlExtract(urlInput.value);
      }
    });

    urlRow.append(urlInput, urlBtn);
    urlField.append(urlLabel, urlRow);
    left.appendChild(urlField);

    const list = document.createElement('div');
    list.className = 'preset-list';

    if (state.customKn5Item) {
      const cBtn = document.createElement('button');
      cBtn.type = 'button';
      cBtn.className = `preset-item ${state.selectedKn5Id === '__custom_url__' ? 'is-selected' : ''}`;
      const strong = document.createElement('strong');
      strong.textContent = `🔗 ${state.customKn5Item.title}`;
      const span = document.createElement('span');
      span.textContent = `${state.customKn5Item.source} · Estratto dal tuo link`;
      cBtn.append(strong, span);
      cBtn.addEventListener('click', () => {
        state.selectedKn5Id = '__custom_url__';
        renderPlaygroundLeft();
      });
      list.appendChild(cBtn);
    }

    for (const item of pg.items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `preset-item ${item.id === state.selectedKn5Id ? 'is-selected' : ''}`;
      const strong = document.createElement('strong');
      strong.textContent = item.title;
      const span = document.createElement('span');
      span.textContent = `${item.source} · ${item.author}`;
      btn.append(strong, span);
      btn.addEventListener('click', () => {
        state.selectedKn5Id = item.id;
        renderPlaygroundLeft();
      });
      list.appendChild(btn);
    }
    left.appendChild(list);

    const active =
      state.selectedKn5Id === '__custom_url__' && state.customKn5Item
        ? state.customKn5Item
        : pg.items.find((x) => x.id === state.selectedKn5Id) || pg.items[0];
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    label.setAttribute('for', 'kn5-transcript');
    label.textContent = 'Testo / Trascrizione attiva (modificabile liberamente)';
    const ta = document.createElement('textarea');
    ta.id = 'kn5-transcript';
    ta.className = 'textarea';
    ta.rows = 4;
    ta.value = active.transcript;
    field.append(label, ta);
    left.appendChild(field);
  } else if (state.activeTab === 'resuscipack') {
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    label.setAttribute('for', 'resuscipack-search');
    label.textContent = 'Filtra il mini-atlante Open-Access (es. git, crittografia, sqlite, owasp)';
    const input = document.createElement('input');
    input.id = 'resuscipack-search';
    input.className = 'input';
    input.type = 'search';
    input.placeholder = 'Cerca per titolo, disciplina o parola chiave...';
    input.value = state.resuscipackQuery;
    input.addEventListener('input', (e) => {
      state.resuscipackQuery = e.target.value;
      renderResuscipackSources(sourcesBox);
    });
    field.append(label, input);
    left.appendChild(field);

    const sourcesBox = document.createElement('div');
    sourcesBox.className = 'preset-list';
    renderResuscipackSources(sourcesBox);
    left.appendChild(sourcesBox);
  } else if (state.activeTab === 'scooterlab') {
    const s = pg.session;
    const kpis = document.createElement('div');
    kpis.className = 'kpi-row';
    [
      ['Distanza', `${s.distanceKm} km`],
      ['Vel. Max', `${s.maxSpeedKmh} km/h`],
      ['Piega Max', `${s.maxLeanDeg}°`],
      ['Frenata Max', `${s.maxBrakeG} g`],
    ].forEach(([k, v]) => {
      const box = document.createElement('div');
      box.className = 'kpi';
      const sm = document.createElement('small');
      sm.textContent = k;
      const st = document.createElement('strong');
      st.textContent = v;
      box.append(sm, st);
      kpis.appendChild(box);
    });
    left.appendChild(kpis);
    left.appendChild(buildTelemetrySvg(s.points));

    const legend = document.createElement('p');
    legend.style.cssText = 'margin: 0 0 0.65rem; font-size: 0.78rem; color: var(--ink-soft);';
    legend.textContent = `Linea continua: velocità (km/h) · Tratteggiata: piega (°) · ${s.route}`;
    left.appendChild(legend);
  }
}

function renderResuscipackSources(container) {
  container.replaceChildren();
  const q = state.resuscipackQuery.trim().toLowerCase();
  const items = state.dataset.playgrounds.resuscipack.items.filter(
    (s) =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.discipline.toLowerCase().includes(q) ||
      s.excerpt.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q),
  );
  if (!items.length) {
    const empty = document.createElement('p');
    empty.style.fontSize = '0.85rem';
    empty.textContent = 'Nessuna fonte corrisponde al filtro.';
    container.appendChild(empty);
    return;
  }
  for (const s of items) {
    const card = document.createElement('div');
    card.className = 'preset-item';
    const strong = document.createElement('strong');
    strong.textContent = `[${s.id}] ${s.title}`;
    const span = document.createElement('span');
    span.textContent = `${s.discipline} · ${s.license} — ${s.excerpt}`;
    card.append(strong, span);
    container.appendChild(card);
  }
}

function selectTab(tabId) {
  if (!state.dataset.playgrounds[tabId]) return;
  state.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === tabId));
  });
  const pg = state.dataset.playgrounds[tabId];
  document.getElementById('pg-active-title').textContent = pg.label;
  document.getElementById('pg-prompt').value = pg.defaultAction;
  const { meta } = getActiveContextAndMeta();
  const snapshot = runDeterministicFallback(tabId, pg.defaultAction, state.dataset, meta);
  safeRenderMarkdown(document.getElementById('pg-output'), snapshot);
  document.getElementById('pg-mode-badge').textContent = 'Snapshot Zero-Click (€0)';
  document.getElementById('pg-meta').textContent =
    'Motore: Snapshot Prescaricato (€0 · 0 chiamate API). Premi "Esegui Analisi AI" per interrogare il modello live.';
  document.getElementById('pg-notice').replaceChildren();
  renderPlaygroundLeft();
}

function renderNotice(container, result) {
  container.replaceChildren();
  if (!result.notice) return;
  const bar = document.createElement('div');
  bar.className = 'notice-bar';
  const span = document.createElement('span');
  span.textContent = result.notice;
  bar.appendChild(span);

  if (result.suggestByok) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm';
    btn.textContent = 'Configura BYOK gratis';
    btn.addEventListener('click', openByokDialog);
    bar.appendChild(btn);
  }
  container.appendChild(bar);
}

async function handleKn5UrlExtract(rawUrl, autoRun = true) {
  const cleanUrl = String(rawUrl || '').trim();
  if (!cleanUrl) return false;

  state.kn5UrlInput = cleanUrl;
  const urlBtn = document.getElementById('kn5-url-btn');
  const noticeEl = document.getElementById('pg-notice');
  const badge = document.getElementById('pg-mode-badge');

  if (urlBtn) {
    urlBtn.disabled = true;
    urlBtn.textContent = 'Estrazione...';
  }
  badge.textContent = 'Lettura URL...';

  const res = await extractKn5Url(cleanUrl);
  if (urlBtn) {
    urlBtn.disabled = false;
    urlBtn.textContent = 'Estrai & Analizza';
  }

  if (!res.ok) {
    badge.textContent = 'URL non estratto';
    renderNotice(noticeEl, { notice: res.message, suggestByok: false });
    return false;
  }

  const ex = res.extracted;
  state.customKn5Item = {
    id: '__custom_url__',
    title: ex.title,
    source: ex.source,
    author: ex.author || ex.source,
    url: ex.url,
    transcript: ex.content,
    warning: ex.warning || null,
  };
  state.selectedKn5Id = '__custom_url__';
  renderPlaygroundLeft();

  const promptEl = document.getElementById('pg-prompt');
  if (!promptEl.value.trim() || /^https?:\/\/\S+$/i.test(promptEl.value.trim())) {
    promptEl.value = state.dataset.playgrounds.kn5.defaultAction;
  }

  if (autoRun) {
    await runPlayground(ex.warning);
  }
  return true;
}

async function runPlayground(extraNotice = null) {
  const runBtn = document.getElementById('pg-run-btn');
  const output = document.getElementById('pg-output');
  const metaEl = document.getElementById('pg-meta');
  const noticeEl = document.getElementById('pg-notice');
  const badge = document.getElementById('pg-mode-badge');
  let prompt = document.getElementById('pg-prompt').value.trim();

  if (!prompt) return;

  // Se l'utente ha incollato un URL direttamente nel box prompt di kn5, estrailo prima
  if (state.activeTab === 'kn5') {
    const urlMatch = prompt.match(/https?:\/\/[^\s<>"')]+/i);
    if (urlMatch && (!state.customKn5Item || state.customKn5Item.url !== urlMatch[0])) {
      const ok = await handleKn5UrlExtract(urlMatch[0], false);
      if (!ok) return;
      const stripped = prompt.replace(urlMatch[0], '').trim();
      prompt = stripped || state.dataset.playgrounds.kn5.defaultAction;
      document.getElementById('pg-prompt').value = prompt;
    }
  }

  runBtn.disabled = true;
  runBtn.textContent = 'Elaborazione...';
  badge.textContent = 'In corso';

  const { context, meta } = getActiveContextAndMeta();
  const result = await runServiceAI({
    serviceId: state.activeTab,
    prompt,
    context,
    dataset: state.dataset,
    meta,
  });

  if (extraNotice && !result.notice) {
    result.notice = extraNotice;
  }

  safeRenderMarkdown(output, result.text);
  const cacheLabel = result.cached ? ' · Cache €0' : '';
  metaEl.textContent = `Motore: ${result.providerLabel || result.provider} (${result.model || 'locale'})${cacheLabel}`;
  badge.textContent = result.mode === 'local-fallback' ? 'Locale (€0)' : result.cached ? 'Cache (€0)' : 'AI Live';
  renderNotice(noticeEl, result);

  runBtn.disabled = false;
  runBtn.textContent = 'Esegui Analisi AI';
}

async function runAssistant(question) {
  const output = document.getElementById('assistant-output');
  const metaEl = document.getElementById('assistant-meta');
  const submitBtn = document.getElementById('assistant-submit');
  const q = question.trim();
  if (!q) return;

  submitBtn.disabled = true;
  submitBtn.textContent = '...';

  const context = [
    `Profilo: ${state.dataset.profile.tagline}. ${state.dataset.profile.bio}`,
    'Progetti:',
    ...state.dataset.projects.map(
      (p) => `- ${p.title} (${p.category}, ${p.badge}): ${p.summary}`,
    ),
  ].join('\n');

  const result = await runServiceAI({
    serviceId: 'assistant',
    prompt: q,
    context,
    dataset: state.dataset,
  });

  safeRenderMarkdown(output, result.text);
  metaEl.textContent = `Motore: ${result.providerLabel || result.provider}${result.cached ? ' · Cache €0' : ''}`;

  submitBtn.disabled = false;
  submitBtn.textContent = 'Chiedi';
}

function setupByokDialog() {
  const dialog = document.getElementById('byok-dialog');
  const openBtn = document.getElementById('open-byok-btn');
  const providerSel = document.getElementById('byok-provider');
  const modelInput = document.getElementById('byok-model');
  const keyInput = document.getElementById('byok-key');
  const link = document.getElementById('byok-provider-link');
  const form = document.getElementById('byok-form');
  const clearBtn = document.getElementById('byok-clear-btn');
  const ramOnlyChk = document.getElementById('byok-ram-only');

  // Fallback for browsers without native <dialog closedby="any"> support (e.g. Safari)
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = outside(e);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && outside(e)) dialog.close();
    });
  }

  dialog.addEventListener('close', () => {
    dialog.returnValue = '';
  });

  const syncProviderFields = () => {
    const p = BYOK_PROVIDERS[providerSel.value];
    if (!p) return;
    modelInput.value = p.defaultModel;
    keyInput.placeholder = p.placeholder;
    link.href = p.keyUrl;
    link.textContent = `Ottieni chiave su ${p.label}`;
  };

  providerSel.addEventListener('change', syncProviderFields);

  openBtn.addEventListener('click', openByokDialog);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveByokConfig({
      provider: providerSel.value,
      model: modelInput.value,
      apiKey: keyInput.value,
      ramOnly: Boolean(ramOnlyChk?.checked),
    });
    updateEngineBadge();
    dialog.close();
  });

  clearBtn.addEventListener('click', () => {
    saveByokConfig(null);
    keyInput.value = '';
    if (ramOnlyChk) ramOnlyChk.checked = false;
    updateEngineBadge();
    dialog.close();
  });

  syncProviderFields();
}

function openByokDialog() {
  const dialog = document.getElementById('byok-dialog');
  const existing = loadByokConfig();
  if (existing) {
    document.getElementById('byok-provider').value = existing.provider;
    document.getElementById('byok-model').value = existing.model;
    document.getElementById('byok-key').value = existing.apiKey;
    const ramOnlyChk = document.getElementById('byok-ram-only');
    if (ramOnlyChk) ramOnlyChk.checked = Boolean(existing.ramOnly);
  }
  dialog.showModal();
}

function applyDeepLinkFocus() {
  const params = new URLSearchParams(globalThis.location?.search || '');
  const appParam = (params.get('app') || '').trim().toLowerCase();
  const focusBanner = document.getElementById('focus-banner');
  const focusLabel = document.getElementById('focus-banner-label');

  const validPlaygrounds = ['leslie', 'kn5', 'resuscipack', 'scooterlab'];
  if (validPlaygrounds.includes(appParam)) {
    document.body.classList.add('is-focused-app');
    if (focusBanner) focusBanner.hidden = false;
    const pgLabel = state.dataset?.playgrounds?.[appParam]?.label || appParam;
    if (focusLabel) focusLabel.textContent = `Playground Focus: ${pgLabel} (dati prescaricati)`;
    document.title = `${pgLabel} — Noobucodonosor Live`;
    selectTab(appParam);
    const urlParam = (params.get('url') || '').trim();
    if (appParam === 'kn5' && urlParam) {
      handleKn5UrlExtract(urlParam, true);
    }
    return;
  }

  document.body.classList.remove('is-focused-app');
  if (focusBanner) focusBanner.hidden = true;
  selectTab('leslie');
  if (appParam === 'assistant') {
    document.getElementById('assistant-input')?.focus();
  }
}

async function init() {
  const res = await fetch('./data/preloaded-services.json');
  state.dataset = await res.json();
  state.selectedLeslieId = state.dataset.playgrounds.leslie.items[0].id;
  state.selectedKn5Id = state.dataset.playgrounds.kn5.items[0].id;

  // Assistant presets
  const presetsBox = document.getElementById('assistant-presets');
  for (const q of state.dataset.assistantPresets) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = q;
    chip.addEventListener('click', () => {
      document.getElementById('assistant-input').value = q;
      runAssistant(q);
    });
    presetsBox.appendChild(chip);
  }

  document.getElementById('assistant-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runAssistant(document.getElementById('assistant-input').value);
  });

  // Project filters
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      renderProjects();
    });
  });

  // Playground tabs & actions
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab));
  });
  document.getElementById('pg-run-btn').addEventListener('click', runPlayground);
  document.getElementById('pg-reset-btn').addEventListener('click', () => {
    document.getElementById('pg-prompt').value = state.dataset.playgrounds[state.activeTab].defaultAction;
  });

  setupByokDialog();
  renderProjects();
  applyDeepLinkFocus();

  const resetLink = document.getElementById('focus-reset-link');
  resetLink?.addEventListener('click', (e) => {
    if (globalThis.location?.protocol !== 'file:') {
      e.preventDefault();
      globalThis.history?.replaceState({}, '', globalThis.location.pathname);
      applyDeepLinkFocus();
    }
  });

  state.proxyHealth = await checkProxyHealth();
  updateEngineBadge();
}

init().catch((err) => {
  console.error('Errore inizializzazione vetrina:', err);
});
