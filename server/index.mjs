import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FreeTierRouter } from './free-tier-router.mjs';
import { PublicUrlIngestor } from './url-ingestor.mjs';
import { SmartphoneApprovalGate } from './approval-gate.mjs';
import { fetchBasilicoContext, buildBasilicoListFromOffers } from './basilico-client.mjs';
import { createGatewayServer, extractClientIp } from '../packages/ai-gateway/src/server.mjs';
import { AltchaGate } from '../packages/ai-gateway/src/altcha.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT_DIR, 'web');
const BUNDLES_DIR = path.join(ROOT_DIR, 'bundles');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveSafePath(baseDir, reqPath) {
  const normalized = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.resolve(baseDir, normalized);
  if (!fullPath.startsWith(baseDir)) return null;
  return fullPath;
}

export { extractClientIp };

export function createAppServer(options = {}) {
  const router = options.router ?? new FreeTierRouter();
  const urlIngestor = options.urlIngestor ?? new PublicUrlIngestor({ userAgent: 'Mozilla/5.0 (compatible; Noobucodonosor-kn5-Preview/1.0)' });
  const approvalGate = options.approvalGate ?? new SmartphoneApprovalGate();
  const altchaGate = options.altchaGate ?? new AltchaGate();
  const basilicoFetcher = options.basilicoFetcher ?? fetchBasilicoContext;
  const webDir = options.webDir ?? WEB_DIR;
  const bundlesDir = options.bundlesDir ?? BUNDLES_DIR;

  return createGatewayServer({
    serviceName: 'noobucodonosor-hub',
    router,
    urlIngestor,
    approvalGate,
    altchaGate,
    allowedOrigins:
      options.allowedOrigins ??
      options.allowedOrigin ??
      process.env.ALLOWED_ORIGINS ??
      process.env.ALLOWED_ORIGIN ??
      'https://noobucodonosor.github.io',
    allowLocalhost: options.allowLocalhost,
    logFn: options.logFn,
    onBeforeComplete: async ({ body, userQuery, context }) => {
      if (body.serviceId === 'basilico' && !context) {
        const basilicoLive = await basilicoFetcher(userQuery);
        if (basilicoLive?.ok && basilicoLive.contextText) {
          return { context: basilicoLive.contextText, basilicoLive };
        }
        return { basilicoLive };
      }
      return null;
    },
    onFallbackComplete: async ({ body, userQuery, hookState }) => {
      const basilicoLive = hookState?.basilicoLive;
      if (body.serviceId === 'basilico' && basilicoLive?.ok && basilicoLive.offers.length > 0) {
        const liveText = buildBasilicoListFromOffers(
          userQuery,
          basilicoLive.offers,
          basilicoLive.budgetEuro,
          basilicoLive.baseUrl,
        );
        if (liveText) {
          return {
            ok: true,
            status: 200,
            mode: 'basilico-live',
            provider: 'basilico',
            providerLabel: 'Basilico Live (Offerte Rapallo)',
            model: 'basilico-offers-v1',
            cached: false,
            text: liveText,
          };
        }
      }
      return null;
    },
    staticHandler: (req, res, urlObj, pathname) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;

      let targetFile = null;
      let isDownload = false;

      if (pathname.startsWith('/bundles/')) {
        const rel = pathname.slice('/bundles/'.length);
        targetFile = resolveSafePath(bundlesDir, rel);
        isDownload = urlObj.searchParams.get('download') === '1';
      } else {
        const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        targetFile = resolveSafePath(webDir, rel);
      }

      if (!targetFile || !fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return true;
      }

      const ext = path.extname(targetFile).toLowerCase();
      const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      };
      if (isDownload) {
        headers['Content-Disposition'] = `attachment; filename="${path.basename(targetFile)}"`;
      }

      res.writeHead(200, headers);
      if (req.method === 'HEAD') {
        res.end();
        return true;
      }
      fs.createReadStream(targetFile).pipe(res);
      return true;
    },
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const server = createAppServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Noobucodonosor Hub attivo su http://localhost:${port}`);
  });
}
