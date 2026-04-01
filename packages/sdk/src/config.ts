import type { ArIOConfig } from './types.js';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ResolvedConfig {
  gatewayUrl: string;
  signingOracleUrl: string | null;
  turboWallet: string | null;
  timeoutMs: number;
}

export function resolveConfig(config: ArIOConfig): ResolvedConfig {
  if (!config.gatewayUrl) {
    throw new Error('ArIO: gatewayUrl is required');
  }

  const gatewayUrl = config.gatewayUrl.replace(/\/+$/, '');

  return {
    gatewayUrl,
    signingOracleUrl: config.signingOracleUrl?.replace(/\/+$/, '') ?? null,
    turboWallet: config.turboWallet ?? null,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}
