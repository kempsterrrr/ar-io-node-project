import type { ResolvedConfig } from '../config.js';
import type { BatchAnchorOptions, BatchAnchorResult, BatchAnchorProof } from '../types.js';
import { sha256Hex, buildMerkleTree, generateProof } from '../integrity/merkle.js';
import { uploadToArweave } from '../c2pa/upload.js';

/** Integrity batch anchor protocol tags. */
const BATCH_ANCHOR_TAGS = {
  protocol: { name: 'Data-Protocol', value: 'AgenticWay-Integrity' },
  type: { name: 'Type', value: 'integrity-batch-anchor' },
  algorithm: { name: 'Hash-Algorithm', value: 'SHA-256' },
  treeType: { name: 'Tree-Type', value: 'binary-merkle' },
} as const;

/**
 * Anchor a batch of items by building a Merkle tree and storing the root on Arweave.
 *
 * Each item is hashed individually, then a binary Merkle tree is constructed.
 * The Merkle root is anchored on Arweave, and individual inclusion proofs
 * are returned for each item.
 */
export async function executeBatchAnchor(
  config: ResolvedConfig,
  options: BatchAnchorOptions
): Promise<BatchAnchorResult> {
  if (!config.turboWallet) {
    throw new Error('AgenticWay.batchAnchor(): turboWallet is required in config');
  }

  if (options.items.length === 0) {
    throw new Error('AgenticWay.batchAnchor(): items array must not be empty');
  }

  // Hash each item
  const leafHashes = options.items.map((item) => {
    const data = Buffer.isBuffer(item.data) ? item.data : Buffer.from(item.data);
    return sha256Hex(data);
  });

  // Build Merkle tree
  const tree = buildMerkleTree(leafHashes);

  // Generate proofs for each leaf
  const proofs: BatchAnchorProof[] = leafHashes.map((hash, index) => {
    const proof = generateProof(tree, index);
    return {
      index,
      hash,
      proof: proof.path,
    };
  });

  // Build tags
  const tags: Array<{ name: string; value: string }> = [
    { name: 'Content-Type', value: 'application/json' },
    BATCH_ANCHOR_TAGS.protocol,
    BATCH_ANCHOR_TAGS.type,
    BATCH_ANCHOR_TAGS.algorithm,
    BATCH_ANCHOR_TAGS.treeType,
    { name: 'Merkle-Root', value: tree.root },
    { name: 'Leaf-Count', value: String(leafHashes.length) },
  ];

  if (options.metadata) {
    for (const [name, value] of Object.entries(options.metadata)) {
      tags.push({ name, value });
    }
  }

  // Store on Arweave
  const payload = Buffer.from(
    JSON.stringify({
      merkleRoot: tree.root,
      algorithm: 'SHA-256',
      treeType: 'binary-merkle',
      leafCount: leafHashes.length,
      leaves: leafHashes,
    })
  );

  const result = await uploadToArweave({
    data: payload,
    tags,
    ethPrivateKey: config.turboWallet,
    gatewayUrl: config.gatewayUrl,
  });

  return {
    txId: result.txId,
    merkleRoot: tree.root,
    proofs,
    timestamp: new Date().toISOString(),
  };
}
