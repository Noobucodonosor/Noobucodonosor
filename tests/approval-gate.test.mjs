import test from 'node:test';
import assert from 'node:assert/strict';
import { SmartphoneApprovalGate } from '../server/approval-gate.mjs';
import { FreeTierRouter } from '../server/free-tier-router.mjs';
import { createAppServer } from '../server/index.mjs';

test('SmartphoneApprovalGate Telegram webhook approves and denies pending requests', async () => {
  const sentMessages = [];
  const fakeFetch = async (url, init) => {
    sentMessages.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, async json() { return { ok: true }; } };
  };

  const gate = new SmartphoneApprovalGate({
    mode: 'telegram',
    telegramToken: 'bot-token',
    telegramChatId: '12345',
    telegramWebhookSecret: 'wh-secret',
    fetchImpl: fakeFetch,
    timeoutMs: 5000,
  });

  const pendingPromise = gate.requestApproval({
    serviceId: 'basilico',
    promptPreview: 'Lista spesa settimanale',
    clientIp: '203.0.113.10',
    dailyRemaining: 100,
    dailyCap: 500,
  });

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(sentMessages.length, 1);
  const callbackData = sentMessages[0].body.reply_markup.inline_keyboard[0][1].callback_data;
  assert.ok(callbackData.startsWith('deny:'));

  const whRes = await gate.handleTelegramWebhook({
    callback_query: { id: 'cb-1', data: callbackData },
  });
  assert.equal(whRes.matched, true);
  assert.equal(whRes.approved, false);

  const decision = await pendingPromise;
  assert.equal(decision.approved, false);
  assert.equal(decision.reason, 'denied');
});

test('POST /api/ai/complete blocks denied requests before calling AI provider and skips approval on cache hit', async () => {
  let aiCalls = 0;
  const fakeAiFetch = async () => {
    aiCalls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{ message: { content: 'Lista della spesa: pomodori, basilico.' } }],
        };
      },
    };
  };

  const router = new FreeTierRouter({
    providers: [{ id: 'groq', family: 'groq', label: 'Groq', model: 'test-model', apiKey: 'k' }],
    fetchImpl: fakeAiFetch,
  });

  const sentAlerts = [];
  const gate = new SmartphoneApprovalGate({
    mode: 'ntfy',
    ntfyTopic: 'noob-test',
    publicBaseUrl: 'http://localhost',
    secret: 'test-secret',
    timeoutMs: 5000,
    fetchImpl: async (url, init) => {
      sentAlerts.push({ url, headers: init.headers });
      return { ok: true, status: 200 };
    },
  });

  const server = createAppServer({ router, approvalGate: gate });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1) Deny via signed endpoint -> 403, zero AI provider calls
    const denyReq = fetch(`${baseUrl}/api/ai/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: 'basilico', userQuery: 'Spesa per cena' }),
    });

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sentAlerts.length, 1);
    const actionsHeader = sentAlerts[0].headers.Actions;
    const denyMatch = actionsHeader.match(/http:\/\/localhost(\/api\/approval\/decide\?[^,]+decision=deny[^,]+)/);
    assert.ok(denyMatch);

    const denyClick = await fetch(`${baseUrl}${denyMatch[1]}`);
    assert.equal(denyClick.status, 200);

    const denyRes = await denyReq;
    assert.equal(denyRes.status, 403);
    const denyBody = await denyRes.json();
    assert.equal(denyBody.error, 'approval_denied');
    assert.equal(aiCalls, 0);

    // 2) Forged signature -> 403
    const badSig = await fetch(`${baseUrl}/api/approval/decide?id=fake&decision=approve&sig=bad`);
    assert.equal(badSig.status, 403);

    // 3) Approve via signed endpoint -> 200 and caches result
    const approveReq = fetch(`${baseUrl}/api/ai/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: 'basilico', userQuery: 'Spesa per cena' }),
    });

    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sentAlerts.length, 2);
    const approveMatch = sentAlerts[1].headers.Actions.match(
      /http:\/\/localhost(\/api\/approval\/decide\?[^,]+decision=approve[^,]+)/,
    );
    assert.ok(approveMatch);

    const approveClick = await fetch(`${baseUrl}${approveMatch[1]}`);
    assert.equal(approveClick.status, 200);

    const approveRes = await approveReq;
    assert.equal(approveRes.status, 200);
    const approveBody = await approveRes.json();
    assert.equal(approveBody.ok, true);
    assert.equal(aiCalls, 1);

    // 4) Repeated identical request hits cache -> no smartphone notification!
    const cachedRes = await fetch(`${baseUrl}/api/ai/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId: 'basilico', userQuery: 'Spesa per cena' }),
    });
    assert.equal(cachedRes.status, 200);
    const cachedBody = await cachedRes.json();
    assert.equal(cachedBody.cached, true);
    assert.equal(sentAlerts.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
