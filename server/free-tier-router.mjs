import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FreeTierRouter as GatewayFreeTierRouter,
  buildProvidersFromEnv,
  estimateTokens,
  normalizeText,
} from '../packages/ai-gateway/src/free-tier-router.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '..', 'showcase.config.json');

export function loadShowcaseConfig(configPath = DEFAULT_CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

const DEFAULT_CONFIG = loadShowcaseConfig();

export const SERVICE_PROMPTS = Object.fromEntries(
  Object.entries(DEFAULT_CONFIG.services).map(([id, cfg]) => [id, cfg.systemPrompt]),
);

export const ALLOWED_SERVICES = new Set(Object.keys(DEFAULT_CONFIG.services));

export { buildProvidersFromEnv, estimateTokens, normalizeText };

export class FreeTierRouter extends GatewayFreeTierRouter {
  constructor(options = {}) {
    super({
      config: options.config ?? DEFAULT_CONFIG,
      referer: options.referer ?? 'https://noobucodonosor.github.io/',
      title: options.title ?? 'Noobucodonosor Hub',
      ...options,
    });
  }
}
