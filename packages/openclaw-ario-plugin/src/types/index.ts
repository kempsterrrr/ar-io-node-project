/**
 * Gateway types for the AR.IO OpenClaw plugin
 */

// Gateway info response
export interface GatewayInfo {
  network: string;
  version: string;
  release: string;
  fqdn?: string;
}

// Arweave transaction metadata
export interface ArweaveTransaction {
  id: string;
  owner: string;
  tags: { name: string; value: string }[];
  data?: string;
  dataSize?: number;
}

// ArNS name resolution result
export interface ArNSResolution {
  name: string;
  txId: string;
  ttlSeconds: number;
}
