/**
 * Hardened CORS policy for the AI Gateway.
 * - Validates Origin against an exact allowlist (never reflects arbitrary origins).
 * - Always rejects opaque Origin: "null" (prevents sandboxed iframe abuse).
 * - Always emits Vary: Origin to prevent cache poisoning.
 * - Emits Access-Control-Max-Age: 7200 on OPTIONS preflight.
 */

export function parseAllowedOrigins(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim().replace(/\/+$/, '')).filter(Boolean);
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function isLocalhostOrigin(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

export function createCorsPolicy(options = {}) {
  const env = options.env ?? process.env;
  const rawList = options.allowedOrigins ?? options.allowedOrigin ?? env.ALLOWED_ORIGINS ?? env.ALLOWED_ORIGIN ?? '';
  const allowLocalhost =
    options.allowLocalhost !== undefined
      ? Boolean(options.allowLocalhost)
      : (env.NODE_ENV || 'development') !== 'production';
  const maxAge = Number(options.maxAge ?? 7200);
  const allowHeaders =
    options.allowHeaders ?? 'Content-Type, X-Altcha-Payload';

  const parsed = parseAllowedOrigins(rawList);
  const wildcard = parsed.includes('*');
  const exactSet = new Set(parsed.filter((o) => o !== '*' && o.toLowerCase() !== 'null'));

  return {
    isOriginAllowed(origin) {
      if (!origin || typeof origin !== 'string') return false;
      const clean = origin.trim().replace(/\/+$/, '');
      if (!clean || clean.toLowerCase() === 'null') return false;
      if (exactSet.has(clean)) return true;
      if (allowLocalhost && isLocalhostOrigin(clean)) return true;
      if (wildcard && exactSet.size === 0) return true;
      return false;
    },

    buildHeaders(req, { isPreflight = false } = {}) {
      const origin = req?.headers?.origin;
      const headers = {
        Vary: 'Origin',
      };

      if (origin && this.isOriginAllowed(origin)) {
        headers['Access-Control-Allow-Origin'] = origin.trim().replace(/\/+$/, '');
        headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        headers['Access-Control-Allow-Headers'] = allowHeaders;
        if (isPreflight) {
          headers['Access-Control-Max-Age'] = String(maxAge);
        }
      } else if (!origin && wildcard && exactSet.size === 0) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        headers['Access-Control-Allow-Headers'] = allowHeaders;
        if (isPreflight) {
          headers['Access-Control-Max-Age'] = String(maxAge);
        }
      }

      return headers;
    },
  };
}
