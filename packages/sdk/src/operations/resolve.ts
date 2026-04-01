import type { ResolveResult } from '../types.js';
import { GatewayClient } from '../clients/gateway.js';

export async function executeResolve(gateway: GatewayClient, name: string): Promise<ResolveResult> {
  const res = await gateway.resolveArNS(name);
  return {
    txId: res.txId,
    ttl: null,
    owner: null,
  };
}
