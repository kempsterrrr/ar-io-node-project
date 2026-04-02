import type { ResolvedConfig } from '../config.js';
import type { AnchorOptions, AnchorResult } from '../types.js';
import { sha256Hex } from '../integrity/merkle.js';
import { uploadToArweave } from '../c2pa/upload.js';

/** Integrity anchor protocol tags. */
const ANCHOR_TAGS = {
  protocol: { name: 'Data-Protocol', value: 'AgenticWay-Integrity' },
  type: { name: 'Type', value: 'integrity-anchor' },
  algorithm: { name: 'Hash-Algorithm', value: 'SHA-256' },
} as const;

/**
 * Anchor arbitrary data on Arweave by storing its SHA-256 hash.
 *
 * The hash is stored as an Arweave transaction with protocol tags,
 * allowing later verification that the data existed at anchor time.
 */
export async function executeAnchor(
  config: ResolvedConfig,
  options: AnchorOptions
): Promise<AnchorResult> {
  if (!config.turboWallet) {
    throw new Error('AgenticWay.anchor(): turboWallet is required in config');
  }

  const data = Buffer.isBuffer(options.data) ? options.data : Buffer.from(options.data);
  const hash = sha256Hex(data);

  const tags: Array<{ name: string; value: string }> = [
    { name: 'Content-Type', value: 'application/json' },
    ANCHOR_TAGS.protocol,
    ANCHOR_TAGS.type,
    ANCHOR_TAGS.algorithm,
    { name: 'Data-Hash', value: hash },
  ];

  if (options.metadata) {
    for (const [name, value] of Object.entries(options.metadata)) {
      tags.push({ name, value });
    }
  }

  const payload = Buffer.from(JSON.stringify({ hash, algorithm: 'SHA-256' }));

  const result = await uploadToArweave({
    data: payload,
    tags,
    ethPrivateKey: config.turboWallet,
    gatewayUrl: config.gatewayUrl,
  });

  return {
    txId: result.txId,
    hash,
    timestamp: new Date().toISOString(),
  };
}
