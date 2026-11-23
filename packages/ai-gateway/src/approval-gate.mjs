import crypto from 'node:crypto';

/**
 * Human-in-the-loop smartphone approval gate for live AI requests.
 * Supports Telegram Bot inline buttons (webhook or on-demand polling) and ntfy.sh push actions.
 */
export class SmartphoneApprovalGate {
  constructor(options = {}) {
    const env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.brandName = options.brandName ?? env.GATEWAY_BRAND ?? 'AI Gateway';
    this.timeoutMs = Number(options.timeoutMs ?? env.APPROVAL_TIMEOUT_MS ?? 90_000);
    this.telegramToken = options.telegramToken ?? env.TELEGRAM_BOT_TOKEN ?? '';
    this.telegramChatId = options.telegramChatId ?? env.TELEGRAM_CHAT_ID ?? '';
    this.telegramWebhookSecret = options.telegramWebhookSecret ?? env.TELEGRAM_WEBHOOK_SECRET ?? '';
    this.ntfyTopic = options.ntfyTopic ?? env.NTFY_TOPIC ?? '';
    this.publicBaseUrl = String(options.publicBaseUrl ?? env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
    this.secret = options.secret ?? env.APPROVAL_SECRET ?? crypto.randomBytes(32).toString('hex');

    const requestedMode = String(options.mode ?? env.APPROVAL_MODE ?? 'off').toLowerCase();
    if (requestedMode === 'auto') {
      if (this.telegramToken && this.telegramChatId) this.mode = 'telegram';
      else if (this.ntfyTopic) this.mode = 'ntfy';
      else this.mode = 'off';
    } else {
      this.mode = ['telegram', 'ntfy'].includes(requestedMode) ? requestedMode : 'off';
    }

    this.pending = new Map();
    this.telegramOffset = 0;
    this.pollTimer = null;
  }

  isEnabled() {
    if (this.mode === 'telegram') return Boolean(this.telegramToken && this.telegramChatId);
    if (this.mode === 'ntfy') return Boolean(this.ntfyTopic && this.publicBaseUrl);
    return false;
  }

  signDecision(id, decision) {
    return crypto
      .createHmac('sha256', this.secret)
      .update(`${id}:${decision}`)
      .digest('hex');
  }

  verifySignature(id, decision, sig) {
    if (!id || !decision || !sig) return false;
    const expected = this.signDecision(id, decision);
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(sig), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  decide(id, approved, reason = approved ? 'approved' : 'denied') {
    const entry = this.pending.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    if (this.pending.size === 0 && this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    entry.resolve({ approved: Boolean(approved), reason });
    return true;
  }

  async handleTelegramWebhook(update) {
    const cb = update?.callback_query;
    if (!cb?.data) return { ok: false, ignored: true };
    const [action, id] = String(cb.data).split(':');
    if (!id || (action !== 'approve' && action !== 'deny')) {
      return { ok: false, ignored: true };
    }
    const approved = action === 'approve';
    const matched = this.decide(id, approved, approved ? 'approved' : 'denied');
    if (this.telegramToken && cb.id) {
      await this.#answerTelegramCallback(
        cb.id,
        matched ? (approved ? '✅ Richiesta approvata' : '❌ Richiesta negata') : 'Richiesta già scaduta',
      );
    }
    return { ok: true, matched, approved, id };
  }

  async requestApproval({ serviceId, promptPreview, clientIp, dailyRemaining, dailyCap }) {
    if (!this.isEnabled()) {
      return { approved: true, reason: 'disabled' };
    }

    const id = crypto.randomBytes(8).toString('hex');
    const safePreview = String(promptPreview || '').replace(/\s+/g, ' ').trim().slice(0, 140);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.decide(id, false, 'timeout');
      }, this.timeoutMs);

      this.pending.set(id, { resolve, timer, serviceId, createdAt: Date.now() });

      this.#dispatchNotification({ id, serviceId, safePreview, clientIp, dailyRemaining, dailyCap })
        .catch(() => {
          this.decide(id, false, 'notify_failed');
        });
    });
  }

  async #dispatchNotification({ id, serviceId, safePreview, clientIp, dailyRemaining, dailyCap }) {
    const quotaText =
      typeof dailyRemaining === 'number' && typeof dailyCap === 'number'
        ? `${dailyRemaining}/${dailyCap}`
        : 'n/d';

    if (this.mode === 'telegram') {
      const text = [
        `🔔 *Richiesta API ${this.brandName}*`,
        `• Servizio: \`${serviceId}\``,
        `• Quota residua: \`${quotaText}\``,
        `• IP: \`${clientIp}\``,
        `• Input: _${safePreview}_`,
      ].join('\n');

      const res = await this.fetchImpl(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.telegramChatId,
          text,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approva', callback_data: `approve:${id}` },
                { text: '❌ Nega (Stop API)', callback_data: `deny:${id}` },
              ],
            ],
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`Telegram sendMessage ${res.status}`);
      }
      if (!this.telegramWebhookSecret) {
        this.#scheduleTelegramPoll();
      }
      return;
    }

    if (this.mode === 'ntfy') {
      const topicUrl = this.ntfyTopic.startsWith('http')
        ? this.ntfyTopic
        : `https://ntfy.sh/${encodeURIComponent(this.ntfyTopic)}`;
      const approveUrl = `${this.publicBaseUrl}/api/approval/decide?id=${encodeURIComponent(id)}&decision=approve&sig=${this.signDecision(id, 'approve')}`;
      const denyUrl = `${this.publicBaseUrl}/api/approval/decide?id=${encodeURIComponent(id)}&decision=deny&sig=${this.signDecision(id, 'deny')}`;

      const res = await this.fetchImpl(topicUrl, {
        method: 'POST',
        headers: {
          Title: `${this.brandName} API: ${serviceId} (${quotaText})`,
          Priority: 'high',
          Actions: `http, Approva, ${approveUrl}, method=GET, clear=true; http, Nega, ${denyUrl}, method=GET, clear=true`,
        },
        body: `IP: ${clientIp}\nInput: ${safePreview}`,
      });
      if (!res.ok) {
        throw new Error(`ntfy ${res.status}`);
      }
    }
  }

  async #answerTelegramCallback(callbackQueryId, text) {
    try {
      await this.fetchImpl(`https://api.telegram.org/bot${this.telegramToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      });
    } catch {
      // Best-effort feedback
    }
  }

  #scheduleTelegramPoll() {
    if (this.pollTimer || this.pending.size === 0) return;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      if (this.pending.size === 0) return;
      try {
        const res = await this.fetchImpl(
          `https://api.telegram.org/bot${this.telegramToken}/getUpdates?offset=${this.telegramOffset}&timeout=0`,
        );
        if (res.ok) {
          const data = await res.json();
          for (const upd of data?.result || []) {
            if (upd.update_id >= this.telegramOffset) {
              this.telegramOffset = upd.update_id + 1;
            }
            await this.handleTelegramWebhook(upd);
          }
        }
      } catch {
        // Retry while pending
      }
      if (this.pending.size > 0) {
        this.#scheduleTelegramPoll();
      }
    }, 1500);
  }
}
