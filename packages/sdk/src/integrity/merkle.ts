/**
 * Binary Merkle tree with SHA-256 hashing.
 *
 * Provides tree construction, proof generation, and proof verification
 * for the Layer 1 integrity anchoring system.
 */

import { createHash } from 'node:crypto';

/** A single step in a Merkle proof path. */
export interface MerkleProofStep {
  /** Sibling hash (hex). */
  hash: string;
  /** Position of the sibling: 'left' means sibling is on the left. */
  position: 'left' | 'right';
}

/** A Merkle inclusion proof for a single leaf. */
export interface MerkleProof {
  /** Index of the leaf in the original array. */
  index: number;
  /** Leaf hash (hex). */
  leaf: string;
  /** Path from leaf to root. */
  path: MerkleProofStep[];
  /** Merkle root (hex). */
  root: string;
}

/** Result of building a Merkle tree. */
export interface MerkleTreeResult {
  /** Merkle root hash (hex). */
  root: string;
  /** Leaf hashes (hex), in input order. */
  leaves: string[];
  /** All tree layers from leaves (index 0) to root (last index). */
  layers: string[][];
}

/** Compute SHA-256 hash of a buffer, returning hex string. */
export function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Compute SHA-256 hash of two concatenated hex hashes. */
function hashPair(left: string, right: string): string {
  const combined = Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]);
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Build a binary Merkle tree from an array of leaf hashes.
 *
 * For odd-count layers, the last element is duplicated.
 * Returns the root hash, leaf hashes, and all layers.
 */
export function buildMerkleTree(leafHashes: string[]): MerkleTreeResult {
  if (leafHashes.length === 0) {
    throw new Error('Cannot build Merkle tree from empty array');
  }

  const layers: string[][] = [leafHashes.slice()];

  let current = leafHashes.slice();
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : current[i]; // duplicate last for odd
      next.push(hashPair(left, right));
    }
    layers.push(next);
    current = next;
  }

  return {
    root: current[0],
    leaves: leafHashes.slice(),
    layers,
  };
}

/**
 * Generate a Merkle inclusion proof for a leaf at the given index.
 */
export function generateProof(tree: MerkleTreeResult, leafIndex: number): MerkleProof {
  if (leafIndex < 0 || leafIndex >= tree.leaves.length) {
    throw new Error(`Leaf index ${leafIndex} out of range [0, ${tree.leaves.length})`);
  }

  const path: MerkleProofStep[] = [];
  let idx = leafIndex;

  for (let layer = 0; layer < tree.layers.length - 1; layer++) {
    const currentLayer = tree.layers[layer];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;

    // For odd-length layers, the last node pairs with itself
    const sibling = siblingIdx < currentLayer.length ? currentLayer[siblingIdx] : currentLayer[idx];

    path.push({
      hash: sibling,
      position: isRight ? 'left' : 'right',
    });

    idx = Math.floor(idx / 2);
  }

  return {
    index: leafIndex,
    leaf: tree.leaves[leafIndex],
    path,
    root: tree.root,
  };
}

/**
 * Verify a Merkle inclusion proof.
 *
 * Returns true if the proof is valid (the leaf hash + path produces the expected root).
 */
export function verifyProof(proof: MerkleProof): boolean {
  let hash = proof.leaf;

  for (const step of proof.path) {
    if (step.position === 'left') {
      hash = hashPair(step.hash, hash);
    } else {
      hash = hashPair(hash, step.hash);
    }
  }

  return hash === proof.root;
}
