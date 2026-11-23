import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FreeTierRouter } from './free-tier-router.mjs';
import { PublicUrlIngestor, extractFirstUrlFromText } from './url-ingestor.mjs';
import { SmartphoneApprovalGate } from './approval-gate.mjs';
import { AltchaGate } from './altcha.mjs';
import { createCorsPolicy } from './cors.mjs';

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        reject(Object.assign(new Error('Payload troppo grande (max 16 KB)'), { status: 413 }));
        req.pause();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('JSON non valido'), { status: 400 }));
      }
    });
    req.on('error', (err) => {
      if (!settled) reject(err);
    });
  });
}

function isInternalOrLoopback(ip) {
  const lower = String(ip || '').toLowerCase();
  return (
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower.startsWith('169.254.') ||
    lower.startsWith('10.') ||
    lower.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(lower) ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd')
  );
}

export function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const parts = forwarded
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const candidate = parts[i];
      if (net.isIP(candidate) && !isInternalOrLoopback(candidate)) {
        return candidate;
      }
    }
  }
  return req.socket?.remoteAddress || 'local';
}

function emitTelemetryLog(payload) {
  if (process.env.NODE_ENV === 'test') return;
  console.log(JSON.stringify(payload));
}

export function createGatewayServer(options = {}) {
  const env = options.env ?? process.env;
  const serviceName = options.serviceName ?? env.GATEWAY_SERVICE_NAME ?? 'ai-gateway';
  const router = options.router ?? new FreeTierRouter({ env });
  const urlIngestor = options.urlIngestor ?? new PublicUrlIngestor({ env });
  const approvalGate = options.approvalGate ?? new SmartphoneApprovalGate({ env });
  const altchaGate = options.altchaGate ?? new AltchaGate({ env });
  const corsPolicy =
    options.corsPolicy ??
    createCorsPolicy({
      allowedOrigins: options.allowedOrigins ?? options.allowedOrigin,
      allowLocalhost: options.allowLocalhost,
      env,
    });
  const logFn = options.logFn ?? emitTelemetryLog;
  const urlAutoExtractServices = new Set(
    options.urlAutoExtractServices ?? ['kn5'],
  );
  const extractPaths = new Set(
    options.extractPaths ?? ['/api/extract', '/api/kn5/extract'],
  );
  const onBeforeComplete = options.onBeforeComplete ?? null;
  const onFallbackComplete = options.onFallbackComplete ?? null;
  const staticHandler = options.staticHandler ?? null;
  const startedAtMs = Date.now();

  return http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(urlObj.pathname);

    if (req.method === 'OPTIONS') {
      const preflightHeaders = corsPolicy.buildHeaders(req, { isPreflight: true });
      res.writeHead(204, preflightHeaders);
      res.end();
      return;
    }

    const corsHeaders = corsPolicy.buildHeaders(req, { isPreflight: false });

    // Lightweight simple-request pre-warming endpoint (no custom headers required)
    if (pathname === '/health' && req.method === 'GET') {
      sendJson(
        res,
        200,
        {
          ok: true,
          service: serviceName,
          altchaEnabled: altchaGate.isEnabled(),
          uptimeSec: Math.floor((Date.now() - startedAtMs) / 1000),
        },
        corsHeaders,
      );
      return;
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      sendJson(
        res,
        200,
        {
          ok: true,
          service: serviceName,
          altchaEnabled: altchaGate.isEnabled(),
          approvalMode: approvalGate.isEnabled() ? approvalGate.mode : 'off',
          ...router.getStatus(),
        },
        corsHeaders,
      );
      return;
    }

    if (pathname === '/api/altcha/challenge' && req.method === 'GET') {
      sendJson(res, 200, altchaGate.createChallenge(), corsHeaders);
      return;
    }

    if (pathname === '/api/approval/decide' && req.method === 'GET') {
      const id = urlObj.searchParams.get('id') || '';
      const decision = urlObj.searchParams.get('decision') || '';
      const sig = urlObj.searchParams.get('sig') || '';
      if (!['approve', 'deny'].includes(decision) || !approvalGate.verifySignature(id, decision, sig)) {
        sendJson(res, 403, { ok: false, error: 'invalid_signature' }, corsHeaders);
        return;
      }
      const approved = decision === 'approve';
      const matched = approvalGate.decide(id, approved, approved ? 'approved' : 'denied');
      if (!matched) {
        sendJson(res, 404, { ok: false, error: 'approval_not_found' }, corsHeaders);
        return;
      }
      sendJson(res, 200, { ok: true, id, decision }, corsHeaders);
      return;
    }

    if (pathname === '/api/approval/telegram-webhook' && req.method === 'POST') {
      if (
        approvalGate.telegramWebhookSecret &&
        req.headers['x-telegram-bot-api-secret-token'] !== approvalGate.telegramWebhookSecret
      ) {
        sendJson(res, 403, { ok: false, error: 'invalid_webhook_secret' }, corsHeaders);
        return;
      }
      try {
        const body = await readJsonBody(req, 16 * 1024);
        const result = await approvalGate.handleTelegramWebhook(body);
        sendJson(res, 200, result, corsHeaders);
      } catch (err) {
        sendJson(res, err.status || 400, { ok: false, error: err.message }, corsHeaders);
      }
      return;
    }

    if (extractPaths.has(pathname) && req.method === 'POST') {
      const startedAt = Date.now();
      try {
        const body = await readJsonBody(req, 4 * 1024);
        const clientIp = extractClientIp(req);
        if (!router.consumeIpSlot(clientIp)) {
          sendJson(
            res,
            429,
            {
              ok: false,
              error: 'ip_rate_limited',
              message: 'Limite orario estrazioni URL raggiunto. Riprova più tardi o incolla il testo manualmente.',
            },
            corsHeaders,
          );
          return;
        }
        const extracted = await urlIngestor.ingest(body.url);
        logFn({
          event: 'url_extract',
          status: 200,
          kind: extracted.kind,
          cached: Boolean(extracted.cached),
          latencyMs: Date.now() - startedAt,
        });
        sendJson(res, 200, { ok: true, extracted }, corsHeaders);
      } catch (err) {
        const status = err.status || 422;
        logFn({
          event: 'url_extract_error',
          status,
          code: err.code || 'extract_failed',
          latencyMs: Date.now() - startedAt,
        });
        sendJson(
          res,
          status,
          { ok: false, error: err.code || 'extract_failed', message: err.message },
          status === 413 ? { ...corsHeaders, Connection: 'close' } : corsHeaders,
        );
        if (status === 413) req.destroy();
      }
      return;
    }

    if (pathname === '/api/ai/complete' && req.method === 'POST') {
      const startedAt = Date.now();
      try {
        const body = await readJsonBody(req, 16 * 1024);
        let userQuery = body.userQuery ?? body.prompt ?? '';
        let context = body.context ?? '';
        let extractedSource = null;
        let hookState = null;

        if (typeof onBeforeComplete === 'function') {
          hookState = await onBeforeComplete({ body, userQuery, context });
          if (hookState?.context) context = hookState.context;
          if (hookState?.userQuery) userQuery = hookState.userQuery;
        }

        if (urlAutoExtractServices.has(body.serviceId) && !body.urlAlreadyExtracted) {
          const detectedUrl = body.sourceUrl || extractFirstUrlFromText(userQuery);
          if (detectedUrl) {
            try {
              const ex = await urlIngestor.ingest(detectedUrl);
              extractedSource = ex;
              context = `Titolo: ${ex.title}\nFonte: ${ex.source}\nURL: ${ex.url}\n${ex.content}`;
              const stripped = String(userQuery).replace(detectedUrl, '').trim();
              userQuery =
                stripped ||
                `Genera una scheda Markdown completa dal contenuto estratto (${ex.title}).`;
            } catch (exErr) {
              sendJson(
                res,
                exErr.status || 422,
                { ok: false, error: exErr.code || 'extract_failed', message: exErr.message },
                corsHeaders,
              );
              return;
            }
          }
        }

        const presetId = extractedSource ? `url:${extractedSource.url}` : (body.presetId ?? null);
        const clientIp = extractClientIp(req);
        const isCached = router.hasCached({ serviceId: body.serviceId, presetId, userQuery, context });

        // Level 3 Anti-Bot: ALTCHA self-hosted PoW verification on uncached live requests
        if (altchaGate.isEnabled() && router.allowedServices.has(body.serviceId) && !isCached) {
          const altchaPayload = req.headers['x-altcha-payload'] || body.altchaPayload;
          const check = altchaGate.verifyPayload(altchaPayload);
          if (!check.ok) {
            logFn({
              event: 'ai_complete_altcha_blocked',
              serviceId: body.serviceId,
              status: 403,
              reason: check.reason,
              latencyMs: Date.now() - startedAt,
            });
            sendJson(
              res,
              403,
              {
                ok: false,
                error: 'altcha_verification_failed',
                reason: check.reason,
                message: 'Verifica anti-bot ALTCHA richiesta o non valida.',
              },
              corsHeaders,
            );
            return;
          }
        }

        if (approvalGate.isEnabled() && router.allowedServices.has(body.serviceId) && !isCached) {
          const statusSnapshot = router.getStatus();
          const approval = await approvalGate.requestApproval({
            serviceId: body.serviceId,
            promptPreview: userQuery,
            clientIp,
            dailyRemaining: statusSnapshot.dailyRemaining,
            dailyCap: statusSnapshot.dailyCap,
          });
          if (!approval.approved) {
            const isTimeout = approval.reason === 'timeout';
            const denyStatus = isTimeout ? 408 : 403;
            const errorCode = isTimeout ? 'approval_timeout' : 'approval_denied';
            logFn({
              event: 'ai_complete_approval_blocked',
              serviceId: body.serviceId,
              status: denyStatus,
              reason: approval.reason,
              latencyMs: Date.now() - startedAt,
            });
            sendJson(
              res,
              denyStatus,
              {
                ok: false,
                error: errorCode,
                fallbackSuggested: 'byok_or_local',
                message: isTimeout
                  ? 'Approvazione su smartphone scaduta. Riprova o usa una tua chiave BYOK gratuita.'
                  : 'Richiesta negata dallo smartphone del proprietario. Usa una tua chiave BYOK gratuita o la modalità locale.',
              },
              corsHeaders,
            );
            return;
          }
        }

        let result = await router.complete({
          serviceId: body.serviceId,
          presetId,
          userQuery,
          context,
          clientIp,
        });

        if (!result.ok && typeof onFallbackComplete === 'function') {
          const fallback = await onFallbackComplete({ body, userQuery, hookState, result });
          if (fallback) result = fallback;
        }

        if (extractedSource && result.ok) {
          result.extractedSource = extractedSource;
        }
        const status = result.status || (result.ok ? 200 : 500);
        logFn({
          event: 'ai_complete',
          serviceId: body.serviceId || 'unknown',
          status,
          mode: result.mode || result.error || 'error',
          provider: result.provider || null,
          cached: Boolean(result.cached),
          latencyMs: Date.now() - startedAt,
        });
        sendJson(res, status, result, corsHeaders);
      } catch (err) {
        const status = err.status || 400;
        logFn({
          event: 'ai_complete_error',
          status,
          error: err.message,
          latencyMs: Date.now() - startedAt,
        });
        sendJson(
          res,
          status,
          { ok: false, error: status === 413 ? 'payload_too_large' : 'bad_request', message: err.message },
          status === 413 ? { ...corsHeaders, Connection: 'close' } : corsHeaders,
        );
        if (status === 413) {
          req.destroy();
        }
      }
      return;
    }

    if (typeof staticHandler === 'function') {
      const handled = staticHandler(req, res, urlObj, pathname, corsHeaders);
      if (handled) return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' }, corsHeaders);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'not_found' }, corsHeaders);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const server = createGatewayServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`AI Gateway listening on http://0.0.0.0:${port}`);
  });
}
