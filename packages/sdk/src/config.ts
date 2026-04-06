import type { AgenticWayConfig, GatewayTarget } from './types.js';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ResolvedConfig {
  gatewayUrl: string;
  trusthashUrl: string | null;
  turboWallet: string | null;
  timeoutMs: number;
  optimisticIndexTargets: GatewayTarget[];
}

export function resolveConfig(config: AgenticWayConfig): ResolvedConfig {
  if (!config.gatewayUrl) {
    throw new Error('AgenticWay: gatewayUrl is required');
  }

  const gatewayUrl = config.gatewayUrl.replace(/\/+$/, '');

  return {
    gatewayUrl,
    trusthashUrl: config.trusthashUrl?.replace(/\/+$/, '') ?? null,
    turboWallet: config.turboWallet ?? null,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    optimisticIndexTargets: config.optimisticIndexTargets ?? [],
  };
}
