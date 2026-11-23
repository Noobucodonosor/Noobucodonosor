import crypto from 'node:crypto';

/**
 * Self-hosted ALTCHA Proof-of-Work verifier (zero third-party dependencies, GDPR-friendly).
 * Protocol compatible with ALTCHA v1 SHA-256 challenges:
 *   challenge = sha256(salt + number)
 *   signature = hmac_sha256(hmacKey, challenge)
 */
export class AltchaGate {
  constructor(options = {}) {
    const env = options.env ?? process.env;
    this.enabled =
      options.enabled !== undefined
        ? Boolean(options.enabled)
        : env.ALTCHA_ENABLED === '1' || env.ALTCHA_ENABLED === 'true';
    this.hmacKey =
      options.hmacKey ||
      env.ALTCHA_HMAC_KEY ||
      crypto.randomBytes(32).toString('hex');
    this.maxNumber = Number(options.maxNumber ?? env.ALTCHA_MAX_NUMBER ?? 50_000);
    this.ttlMs = Number(options.ttlMs ?? env.ALTCHA_TTL_MS ?? 5 * 60 * 1000);
    this.maxSeenChallenges = options.maxSeenChallenges ?? 2000;
    this.now = options.now ?? (() => Date.now());
    this.seenChallenges = new Map();
  }

  isEnabled() {
    return this.enabled;
  }

  #pruneSeen() {
    const now = this.now();
    for (const [key, exp] of this.seenChallenges.entries()) {
      if (exp <= now) this.seenChallenges.delete(key);
    }
    while (this.seenChallenges.size >= this.maxSeenChallenges) {
      const oldest = this.seenChallenges.keys().next().value;
      this.seenChallenges.delete(oldest);
    }
  }

  createChallenge() {
    const expiresAt = Math.floor((this.now() + this.ttlMs) / 1000);
    const saltRandom = crypto.randomBytes(12).toString('hex');
    const salt = `${saltRandom}?expires=${expiresAt}`;
    const secretNumber = crypto.randomInt(0, this.maxNumber + 1);
    const challenge = crypto
      .createHash('sha256')
      .update(`${salt}${secretNumber}`)
      .digest('hex');
    const signature = crypto
      .createHmac('sha256', this.hmacKey)
      .update(challenge)
      .digest('hex');

    return {
      algorithm: 'SHA-256',
      challenge,
      maxnumber: this.maxNumber,
      salt,
      signature,
    };
  }

  verifyPayload(rawPayload) {
    if (!rawPayload) {
      return { ok: false, reason: 'missing_payload' };
    }

    let payload;
    try {
      if (typeof rawPayload === 'string') {
        const trimmed = rawPayload.trim();
        const jsonStr = trimmed.startsWith('{')
          ? trimmed
          : Buffer.from(trimmed, 'base64').toString('utf8');
        payload = JSON.parse(jsonStr);
      } else if (typeof rawPayload === 'object') {
        payload = rawPayload;
      } else {
        return { ok: false, reason: 'invalid_payload' };
      }
    } catch {
      return { ok: false, reason: 'malformed_payload' };
    }

    const { algorithm, challenge, number, salt, signature } = payload || {};
    if (
      algorithm !== 'SHA-256' ||
      typeof challenge !== 'string' ||
      typeof salt !== 'string' ||
      typeof signature !== 'string' ||
      typeof number !== 'number' ||
      !Number.isInteger(number) ||
      number < 0 ||
      number > this.maxNumber
    ) {
      return { ok: false, reason: 'invalid_fields' };
    }

    const expMatch = salt.match(/\?expires=(\d+)$/);
    if (!expMatch) {
      return { ok: false, reason: 'missing_expiration' };
    }
    const expiresSec = Number(expMatch[1]);
    if (!Number.isFinite(expiresSec) || this.now() > expiresSec * 1000) {
      return { ok: false, reason: 'challenge_expired' };
    }

    const expectedSig = crypto
      .createHmac('sha256', this.hmacKey)
      .update(challenge)
      .digest('hex');
    const sigA = Buffer.from(expectedSig, 'utf8');
    const sigB = Buffer.from(signature, 'utf8');
    if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
      return { ok: false, reason: 'invalid_signature' };
    }

    const computedChallenge = crypto
      .createHash('sha256')
      .update(`${salt}${number}`)
      .digest('hex');
    if (computedChallenge !== challenge) {
      return { ok: false, reason: 'invalid_solution' };
    }

    this.#pruneSeen();
    if (this.seenChallenges.has(challenge)) {
      return { ok: false, reason: 'challenge_replayed' };
    }
    this.seenChallenges.set(challenge, expiresSec * 1000);

    return { ok: true };
  }
}

/**
 * Helper to solve an ALTCHA SHA-256 challenge (for tests or CLI clients).
 */
export function solveAltchaChallenge(challengeObj) {
  const { algorithm, challenge, maxnumber, salt, signature } = challengeObj;
  for (let n = 0; n <= maxnumber; n += 1) {
    const digest = crypto.createHash('sha256').update(`${salt}${n}`).digest('hex');
    if (digest === challenge) {
      const payload = { algorithm, challenge, number: n, salt, signature };
      return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    }
  }
  return null;
}
