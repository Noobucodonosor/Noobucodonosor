import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_REDIRECTS = 3;
const MAX_FETCH_BYTES = 512 * 1024;
const MAX_EXTRACTED_CHARS = 8000;

export function isBlockedIp(ip) {
  const clean = String(ip || '').trim().toLowerCase();
  if (!clean) return true;

  const v4Mapped = clean.startsWith('::ffff:') ? clean.slice(7) : clean;
  const family = net.isIP(v4Mapped);
  if (!family) return true;

  if (family === 4) {
    const parts = v4Mapped.split('.').map(Number);
    const [a, b] = parts;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    ) {
      return true;
    }
    return false;
  }

  if (
    v4Mapped === '::' ||
    v4Mapped === '::1' ||
    v4Mapped.startsWith('fe80:') ||
    v4Mapped.startsWith('fc') ||
    v4Mapped.startsWith('fd') ||
    v4Mapped.startsWith('ff')
  ) {
    return true;
  }
  return false;
}

export async function validateSafeExternalUrl(rawUrl, lookupImpl = dns.lookup) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw Object.assign(new Error('URL non valido.'), { status: 400, code: 'invalid_url' });
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw Object.assign(new Error('Sono supportati solo link pubblici HTTP/HTTPS.'), {
      status: 400,
      code: 'unsupported_protocol',
    });
  }

  if (parsed.username || parsed.password) {
    throw Object.assign(new Error('Credenziali nell’URL non consentite.'), {
      status: 400,
      code: 'credentials_in_url',
    });
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    throw Object.assign(new Error('Host interno o locale bloccato per sicurezza.'), {
      status: 403,
      code: 'ssrf_blocked',
    });
  }

  if (net.isIP(host)) {
    if (isBlockedIp(host)) {
      throw Object.assign(new Error('Indirizzo IP privato o riservato bloccato.'), {
        status: 403,
        code: 'ssrf_blocked',
      });
    }
    return parsed;
  }

  let records;
  try {
    records = await lookupImpl(host, { all: true });
  } catch {
    throw Object.assign(new Error(`Impossibile risolvere il dominio: ${host}`), {
      status: 400,
      code: 'dns_failed',
    });
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw Object.assign(new Error(`Nessun indirizzo pubblico per: ${host}`), {
      status: 400,
      code: 'dns_empty',
    });
  }

  for (const rec of records) {
    if (isBlockedIp(rec.address)) {
      throw Object.assign(new Error('Il dominio risolve verso un IP interno non consentito.'), {
        status: 403,
        code: 'ssrf_blocked',
      });
    }
  }

  return parsed;
}

export function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : '';
    });
}

export function extractYouTubeVideoId(urlObj) {
  const host = urlObj.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let candidate = null;

  if (host === 'youtu.be') {
    candidate = urlObj.pathname.split('/').filter(Boolean)[0] || null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (urlObj.pathname === '/watch') {
      candidate = urlObj.searchParams.get('v');
    } else {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
        candidate = parts[1];
      }
    }
  }

  if (candidate && /^[\w-]{11}$/.test(candidate)) {
    return candidate;
  }
  return null;
}

function extractMetaContent(html, attrName, attrValue) {
  const escaped = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(
    `<meta[^>]+${attrName}=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    'i',
  );
  const m1 = html.match(re1);
  if (m1?.[1]) return decodeHtmlEntities(m1[1]).trim();

  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+${attrName}=["']${escaped}["'][^>]*>`,
    'i',
  );
  const m2 = html.match(re2);
  if (m2?.[1]) return decodeHtmlEntities(m2[1]).trim();
  return '';
}

export function stripHtmlToReadableText(html) {
  const bodyMatch =
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

  const scope = bodyMatch ? bodyMatch[1] : html;
  const cleaned = scope
    .replace(/<(script|style|noscript|svg|iframe|nav|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(cleaned)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 1)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseYouTubePlayerResponse(html) {
  const marker = 'ytInitialPlayerResponse = ';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  let start = idx + marker.length;
  while (start < html.length && html[start] !== '{') start += 1;
  if (start >= html.length) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < Math.min(html.length, start + 450000); i += 1) {
    const ch = html[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseCaptionXml(xml) {
  const parts = [];
  const re = /<(?:text|p)\b[^>]*>([\s\S]*?)<\/(?:text|p)>/gi;
  let match;
  while ((match = re.exec(xml)) !== null) {
    const clean = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (clean) parts.push(clean);
  }
  return parts.join(' ').trim();
}

export function extractFirstUrlFromText(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null;
}

export class PublicUrlIngestor {
  constructor(options = {}) {
    const env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.lookupImpl = options.lookupImpl ?? dns.lookup;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.maxBytes = options.maxBytes ?? MAX_FETCH_BYTES;
    this.cacheTtlMs = options.cacheTtlMs ?? 6 * 60 * 60 * 1000;
    this.maxCacheEntries = options.maxCacheEntries ?? 150;
    this.now = options.now ?? (() => Date.now());
    this.userAgent =
      options.userAgent ??
      env.GATEWAY_USER_AGENT ??
      'Mozilla/5.0 (compatible; AI-Gateway-Ingestor/1.0)';
    this.cache = new Map();
  }

  #getCached(url) {
    const entry = this.cache.get(url);
    if (!entry) return null;
    if (this.now() > entry.expiresAt) {
      this.cache.delete(url);
      return null;
    }
    this.cache.delete(url);
    this.cache.set(url, entry);
    return entry.value;
  }

  #setCached(url, value) {
    if (this.cache.size >= this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(url, { value, expiresAt: this.now() + this.cacheTtlMs });
  }

  async safeFetchText(rawUrl, extraHeaders = {}) {
    let currentUrl = rawUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const parsed = await validateSafeExternalUrl(currentUrl, this.lookupImpl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await this.fetchImpl(parsed.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': this.userAgent,
            'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
            Accept: 'text/html,application/xhtml+xml,application/xml,application/json,text/plain;q=0.9',
            ...extraHeaders,
          },
        });

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers?.get?.('location');
          if (!location) {
            throw Object.assign(new Error('Redirect privo di destinazione.'), { status: 502 });
          }
          currentUrl = new URL(location, parsed).toString();
          continue;
        }

        if (!res.ok) {
          throw Object.assign(new Error(`Il sito di origine ha risposto con HTTP ${res.status}.`), {
            status: 422,
          });
        }

        const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
        if (
          contentType &&
          !contentType.includes('text/') &&
          !contentType.includes('json') &&
          !contentType.includes('xml') &&
          !contentType.includes('html')
        ) {
          throw Object.assign(
            new Error(`Formato non testuale (${contentType.split(';')[0]}). Incolla un video YouTube o una pagina web.`),
            { status: 415 },
          );
        }

        if (!res.body || typeof res.body.getReader !== 'function') {
          const fallbackText = await res.text();
          return { finalUrl: parsed.toString(), contentType, text: fallbackText.slice(0, this.maxBytes) };
        }

        const reader = res.body.getReader();
        const chunks = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > this.maxBytes) {
            chunks.push(value.subarray(0, Math.max(0, this.maxBytes - (total - value.byteLength))));
            await reader.cancel().catch(() => {});
            break;
          }
          chunks.push(value);
        }
        const merged = Buffer.concat(chunks.map((u) => Buffer.from(u))).toString('utf8');
        return { finalUrl: parsed.toString(), contentType, text: merged };
      } finally {
        clearTimeout(timer);
      }
    }

    throw Object.assign(new Error('Troppi redirect consecutivi sull’URL fornito.'), { status: 422 });
  }

  async #ingestYouTube(videoId, canonicalUrl) {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

    let title = '';
    let author = '';
    try {
      const oembedRes = await this.safeFetchText(oembedUrl);
      const oembed = JSON.parse(oembedRes.text);
      title = String(oembed.title || '').trim();
      author = String(oembed.author_name || '').trim();
    } catch {
      // proceed with watch page parsing
    }

    let description = '';
    let transcript = '';

    try {
      const pageRes = await this.safeFetchText(`${watchUrl}&hl=it`, {
        Cookie: 'CONSENT=YES+cb.20210328-17-p0.it+FX+999',
      });
      const player = parseYouTubePlayerResponse(pageRes.text);
      const details = player?.videoDetails;
      if (!title && details?.title) title = String(details.title).trim();
      if (!author && details?.author) author = String(details.author).trim();
      if (details?.shortDescription) {
        description = String(details.shortDescription).trim();
      } else {
        description =
          extractMetaContent(pageRes.text, 'property', 'og:description') ||
          extractMetaContent(pageRes.text, 'name', 'description');
      }

      const tracks =
        player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (Array.isArray(tracks) && tracks.length > 0) {
        const preferred =
          tracks.find((t) => t.languageCode?.startsWith('it')) ||
          tracks.find((t) => t.languageCode?.startsWith('en')) ||
          tracks[0];

        if (preferred?.baseUrl) {
          const capRes = await this.safeFetchText(preferred.baseUrl);
          transcript = parseCaptionXml(capRes.text);
        }
      }
    } catch {
      // If watch HTML fails on datacenter IP, oEmbed still gives title + channel
    }

    if (!title && !transcript && !description) {
      throw Object.assign(
        new Error('Impossibile leggere i metadati pubblici di questo video YouTube. Verifica che il video sia pubblico.'),
        { status: 422 },
      );
    }

    const parts = [];
    if (transcript) {
      parts.push(`Trascrizione sottotitoli:\n${transcript}`);
    }
    if (description) {
      parts.push(`Descrizione autore:\n${description}`);
    }
    if (!transcript && !description) {
      parts.push(
        `Titolo del video: "${title}" (Canale: ${author || 'YouTube'}). Nota: il video non espone sottotitoli pubblici scaricabili senza autenticazione; sintetizza in modo fedele solo ciò che emerge dai metadati dichiarando il limite.`,
      );
    }

    const content = parts.join('\n\n').slice(0, MAX_EXTRACTED_CHARS);
    return {
      ok: true,
      url: canonicalUrl,
      kind: transcript ? 'youtube-transcript' : 'youtube-metadata',
      source: author ? `YouTube · ${author}` : 'YouTube',
      title: title || `Video YouTube (${videoId})`,
      author: author || 'YouTube',
      content,
      hasTranscript: Boolean(transcript),
      warning: transcript
        ? null
        : 'Sottotitoli non disponibili pubblicamente: scheda generata da titolo e descrizione ufficiali del video.',
    };
  }

  async ingest(rawUrl) {
    const parsed = await validateSafeExternalUrl(rawUrl, this.lookupImpl);
    const normalizedUrl = parsed.toString();

    const cached = this.#getCached(normalizedUrl);
    if (cached) {
      return { ...cached, cached: true };
    }

    const ytId = extractYouTubeVideoId(parsed);
    if (ytId) {
      const ytResult = await this.#ingestYouTube(ytId, normalizedUrl);
      this.#setCached(normalizedUrl, ytResult);
      return { ...ytResult, cached: false };
    }

    const { finalUrl, text: html } = await this.safeFetchText(normalizedUrl);
    const finalParsed = new URL(finalUrl);
    const host = finalParsed.hostname.replace(/^www\./, '');

    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle =
      extractMetaContent(html, 'property', 'og:title') ||
      extractMetaContent(html, 'name', 'twitter:title') ||
      (titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '') ||
      host;

    const description =
      extractMetaContent(html, 'property', 'og:description') ||
      extractMetaContent(html, 'name', 'description') ||
      extractMetaContent(html, 'name', 'twitter:description');

    const siteName = extractMetaContent(html, 'property', 'og:site_name') || host;
    const bodyText = stripHtmlToReadableText(html);

    const combined = [description ? `Sintesi pagina: ${description}` : '', bodyText]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, MAX_EXTRACTED_CHARS)
      .trim();

    if (combined.length < 40) {
      const isSocial = /instagram\.com|facebook\.com|tiktok\.com|linkedin\.com/i.test(host);
      throw Object.assign(
        new Error(
          isSocial
            ? `${host} richiede login/cookie per leggere il post completo. Incolla direttamente il testo nel riquadro oppure usa un link YouTube o un articolo web pubblico.`
            : `La pagina ${host} non contiene abbastanza testo pubblico leggibile senza JavaScript/login.`,
        ),
        { status: 422, code: 'insufficient_public_content' },
      );
    }

    const result = {
      ok: true,
      url: finalUrl,
      kind: 'web-article',
      source: siteName,
      title: rawTitle.slice(0, 180),
      author: siteName,
      content: combined,
      hasTranscript: false,
      warning: null,
    };
    this.#setCached(normalizedUrl, result);
    return { ...result, cached: false };
  }
}
