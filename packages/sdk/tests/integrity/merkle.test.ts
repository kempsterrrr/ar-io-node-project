import { describe, it, expect } from 'vitest';
import {
  sha256Hex,
  buildMerkleTree,
  generateProof,
  verifyProof,
} from '../../src/integrity/merkle.js';

describe('sha256Hex', () => {
  it('hashes a buffer to hex', () => {
    const hash = sha256Hex(Buffer.from('hello'));
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('hashes Uint8Array identically', () => {
    const buf = Buffer.from('hello');
    const arr = new Uint8Array(buf);
    expect(sha256Hex(arr)).toBe(sha256Hex(buf));
  });
});

describe('buildMerkleTree', () => {
  it('throws on empty array', () => {
    expect(() => buildMerkleTree([])).toThrow('empty array');
  });

  it('single leaf: root equals the leaf', () => {
    const leaf = sha256Hex(Buffer.from('only'));
    const tree = buildMerkleTree([leaf]);
    expect(tree.root).toBe(leaf);
    expect(tree.leaves).toEqual([leaf]);
    expect(tree.layers).toHaveLength(1);
  });

  it('two leaves: root is hash of concatenated leaves', () => {
    const a = sha256Hex(Buffer.from('a'));
    const b = sha256Hex(Buffer.from('b'));
    const tree = buildMerkleTree([a, b]);

    expect(tree.leaves).toEqual([a, b]);
    expect(tree.layers).toHaveLength(2);
    expect(tree.root).not.toBe(a);
    expect(tree.root).not.toBe(b);
  });

  it('odd number of leaves: duplicates last leaf', () => {
    const a = sha256Hex(Buffer.from('a'));
    const b = sha256Hex(Buffer.from('b'));
    const c = sha256Hex(Buffer.from('c'));
    const tree = buildMerkleTree([a, b, c]);

    expect(tree.leaves).toHaveLength(3);
    // Layer 1 should have 2 nodes (pair a+b, pair c+c)
    expect(tree.layers[1]).toHaveLength(2);
    expect(tree.layers[2]).toHaveLength(1);
  });

  it('four leaves: produces balanced tree', () => {
    const leaves = ['a', 'b', 'c', 'd'].map((s) => sha256Hex(Buffer.from(s)));
    const tree = buildMerkleTree(leaves);

    expect(tree.layers).toHaveLength(3); // leaves, intermediate, root
    expect(tree.layers[0]).toHaveLength(4);
    expect(tree.layers[1]).toHaveLength(2);
    expect(tree.layers[2]).toHaveLength(1);
  });

  it('deterministic: same input produces same root', () => {
    const leaves = ['x', 'y', 'z'].map((s) => sha256Hex(Buffer.from(s)));
    const tree1 = buildMerkleTree(leaves);
    const tree2 = buildMerkleTree(leaves);
    expect(tree1.root).toBe(tree2.root);
  });

  it('different input produces different root', () => {
    const leaves1 = ['a', 'b'].map((s) => sha256Hex(Buffer.from(s)));
    const leaves2 = ['c', 'd'].map((s) => sha256Hex(Buffer.from(s)));
    const tree1 = buildMerkleTree(leaves1);
    const tree2 = buildMerkleTree(leaves2);
    expect(tree1.root).not.toBe(tree2.root);
  });
});

describe('generateProof', () => {
  it('throws for out-of-range index', () => {
    const tree = buildMerkleTree([sha256Hex(Buffer.from('a'))]);
    expect(() => generateProof(tree, -1)).toThrow('out of range');
    expect(() => generateProof(tree, 1)).toThrow('out of range');
  });

  it('single leaf: proof path is empty', () => {
    const leaf = sha256Hex(Buffer.from('only'));
    const tree = buildMerkleTree([leaf]);
    const proof = generateProof(tree, 0);

    expect(proof.index).toBe(0);
    expect(proof.leaf).toBe(leaf);
    expect(proof.root).toBe(leaf);
    expect(proof.path).toHaveLength(0);
  });

  it('two leaves: proof has one step', () => {
    const a = sha256Hex(Buffer.from('a'));
    const b = sha256Hex(Buffer.from('b'));
    const tree = buildMerkleTree([a, b]);

    const proofA = generateProof(tree, 0);
    expect(proofA.path).toHaveLength(1);
    expect(proofA.path[0].hash).toBe(b);
    expect(proofA.path[0].position).toBe('right');

    const proofB = generateProof(tree, 1);
    expect(proofB.path).toHaveLength(1);
    expect(proofB.path[0].hash).toBe(a);
    expect(proofB.path[0].position).toBe('left');
  });

  it('four leaves: each proof has two steps', () => {
    const leaves = ['a', 'b', 'c', 'd'].map((s) => sha256Hex(Buffer.from(s)));
    const tree = buildMerkleTree(leaves);

    for (let i = 0; i < 4; i++) {
      const proof = generateProof(tree, i);
      expect(proof.path).toHaveLength(2);
      expect(proof.leaf).toBe(leaves[i]);
      expect(proof.root).toBe(tree.root);
    }
  });
});

describe('verifyProof', () => {
  it('valid proof returns true', () => {
    const leaves = ['a', 'b', 'c', 'd'].map((s) => sha256Hex(Buffer.from(s)));
    const tree = buildMerkleTree(leaves);

    for (let i = 0; i < leaves.length; i++) {
      const proof = generateProof(tree, i);
      expect(verifyProof(proof)).toBe(true);
    }
  });

  it('tampered leaf returns false', () => {
    const leaves = ['a', 'b', 'c', 'd'].map((s) => sha256Hex(Buffer.from(s)));
    const tree = buildMerkleTree(leaves);
    const proof = generateProof(tree, 0);

    proof.leaf = sha256Hex(Buffer.from('tampered'));
    expect(verifyProof(proof)).toBe(false);
  });

  it('tampered root returns false', () => {
    const leaves = ['a', 'b'].map((s) => sha256Hex(Buffer.from(s)));
    const tree = buildMerkleTree(leaves);
    const proof = generateProof(tree, 0);

    proof.root = sha256Hex(Buffer.from('fake-root'));
    expect(verifyProof(proof)).toBe(false);
  });

  it('tampered proof step returns false', () => {
    const leaves = ['a', 'b', 'c', 'd'].map((s) => sha256Hex(Buffer.from(s)));
    const tree = buildMerkleTree(leaves);
    const proof = generateProof(tree, 0);

    proof.path[0].hash = sha256Hex(Buffer.from('wrong'));
    expect(verifyProof(proof)).toBe(false);
  });

  it('odd leaf count: all proofs verify', () => {
    const leaves = ['a', 'b', 'c', 'd', 'e'].map((s) => sha256Hex(Buffer.from(s)));
    const tree = buildMerkleTree(leaves);

    for (let i = 0; i < leaves.length; i++) {
      const proof = generateProof(tree, i);
      expect(verifyProof(proof)).toBe(true);
    }
  });

  it('single leaf proof verifies', () => {
    const leaf = sha256Hex(Buffer.from('solo'));
    const tree = buildMerkleTree([leaf]);
    const proof = generateProof(tree, 0);
    expect(verifyProof(proof)).toBe(true);
  });

  it('large tree (100 leaves): all proofs verify', () => {
    const leaves = Array.from({ length: 100 }, (_, i) => sha256Hex(Buffer.from(`item-${i}`)));
    const tree = buildMerkleTree(leaves);

    for (let i = 0; i < leaves.length; i++) {
      const proof = generateProof(tree, i);
      expect(verifyProof(proof)).toBe(true);
    }
  });
});
