#!/usr/bin/env bun
/**
 * C2PA Sign + Upload Demo
 *
 * Signs an image with C2PA credentials via the sidecar's signing oracle,
 * then uploads the signed image to Arweave via Turbo SDK.
 *
 * Prerequisites:
 *   1. Sidecar running with signing enabled (see packages/trusthash-sidecar)
 *   2. ETH_PRIVATE_KEY set in .env (Ethereum wallet with Turbo credits)
 *   3. Dev certs generated (run generate-dev-cert.sh in trusthash-sidecar)
 *
 * Usage:
 *   bun run scripts/demo-upload.ts <image-path>
 *
 * Environment:
 *   ETH_PRIVATE_KEY       — Ethereum private key (required)
 *   SIDECAR_URL           — Sidecar base URL (default: http://localhost:3003)
 *   GATEWAY_URL           — Gateway for viewing (default: https://arweave.net)
 *   C2PA_TRUST_ANCHOR_PEM — Base64 CA cert for dev signing (from generate-dev-cert.sh)
 *   MANIFEST_REPO_URL     — SBR API base URL (default: SIDECAR_URL + /v1)
 */

import fs from 'node:fs';
import path from 'node:path';
import { RemoteSigner } from '../src/signer.js';
import { signAndPrepare } from '../src/mode-full.js';
import { uploadToArweave } from '../src/upload.js';

function log(step: string, msg: string) {
  console.log(`\n[${'='.repeat(3)} ${step} ${'='.repeat(3)}] ${msg}`);
}

function fail(msg: string): never {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

async function main() {
  // Parse args
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.log('Usage: bun run scripts/demo-upload.ts <image-path>');
    console.log('');
    console.log('Required env vars:');
    console.log('  ETH_PRIVATE_KEY       Ethereum private key');
    console.log('  C2PA_TRUST_ANCHOR_PEM Base64 CA cert (from generate-dev-cert.sh)');
    console.log('');
    console.log('Optional env vars:');
    console.log('  SIDECAR_URL           default: http://localhost:3003');
    console.log('  GATEWAY_URL           default: https://arweave.net');
    console.log('  MANIFEST_REPO_URL     default: SIDECAR_URL/v1');
    process.exit(1);
  }

  const ethPrivateKey = process.env.ETH_PRIVATE_KEY;
  if (!ethPrivateKey) fail('ETH_PRIVATE_KEY environment variable is required');

  const trustAnchorB64 = process.env.C2PA_TRUST_ANCHOR_PEM;
  const trustAnchorPem = trustAnchorB64
    ? Buffer.from(trustAnchorB64, 'base64').toString('utf-8')
    : undefined;

  const sidecarUrl = process.env.SIDECAR_URL || 'http://localhost:3003';
  const gatewayUrl = process.env.GATEWAY_URL || 'https://turbo-gateway.com';
  const manifestRepoUrl = process.env.MANIFEST_REPO_URL || `${sidecarUrl}/v1`;

  console.log('C2PA Sign + Upload Demo');
  console.log(`  Image:    ${imagePath}`);
  console.log(`  Sidecar:  ${sidecarUrl}`);
  console.log(`  Gateway:  ${gatewayUrl}`);

  // 1. Read image
  log('1/5', 'Reading image');
  const resolvedPath = path.resolve(imagePath);
  if (!fs.existsSync(resolvedPath)) fail(`File not found: ${resolvedPath}`);
  const imageBuffer = Buffer.from(fs.readFileSync(resolvedPath));
  console.log(`  Size: ${imageBuffer.length.toLocaleString()} bytes`);

  // 2. Check sidecar health
  log('2/5', 'Connecting to sidecar');
  try {
    const healthRes = await fetch(`${sidecarUrl}/health`);
    if (!healthRes.ok) fail(`Sidecar health check failed: ${healthRes.status}`);
    console.log(`  Sidecar healthy at ${sidecarUrl}`);
  } catch (err) {
    fail(`Cannot reach sidecar at ${sidecarUrl}: ${(err as Error).message}`);
  }

  // 3. Sign image
  // Identity assertion (cawg.identity) is disabled by default — c2pa-rs validation
  // is not yet implemented. Pass --identity flag to enable (experimental).
  const includeIdentity = process.argv.includes('--identity');
  log(
    '3/5',
    `Signing image with C2PA credentials${includeIdentity ? ' + identity assertion' : ''}`
  );
  const remoteSigner = new RemoteSigner(sidecarUrl);

  const signResult = await signAndPrepare({
    imageBuffer,
    remoteSigner,
    manifestRepoUrl,
    claimGenerator: 'turbo-c2pa-demo/0.1.0',
    trustAnchorPem,
    ethPrivateKey,
    includeIdentity,
  });

  console.log(`  Content type:   ${signResult.contentType}`);
  console.log(`  Manifest ID:    ${signResult.manifestId}`);
  console.log(`  Asset hash:     ${signResult.assetHash.slice(0, 20)}...`);
  console.log(`  Store hash:     ${signResult.manifestStoreHash.slice(0, 20)}...`);
  console.log(`  pHash:          ${signResult.pHashHex}`);
  console.log(`  Signed size:    ${signResult.signedBuffer.length.toLocaleString()} bytes`);
  console.log(
    `  Size increase:  +${(signResult.signedBuffer.length - imageBuffer.length).toLocaleString()} bytes (manifest)`
  );

  // Save signed image locally
  const signedPath = resolvedPath.replace(/(\.\w+)$/, '.signed$1');
  fs.writeFileSync(signedPath, signResult.signedBuffer);
  console.log(`  Saved locally:  ${signedPath}`);

  // 4. Upload to Arweave
  log('4/5', 'Uploading to Arweave via Turbo SDK');
  console.log(`  Tags: ${signResult.tags.length} ANS-104 tags`);

  const uploadResult = await uploadToArweave({
    signedBuffer: signResult.signedBuffer,
    tags: signResult.tags,
    ethPrivateKey,
    gatewayUrl,
  });

  console.log(`  TX ID:    ${uploadResult.txId}`);
  console.log(`  View URL: ${uploadResult.viewUrl}`);
  console.log(`  Owner:    ${uploadResult.owner}`);

  // 5. Summary
  log('5/5', 'Done!');
  console.log(`
  The image has been signed with C2PA credentials and uploaded to Arweave.

  View the image:
    ${uploadResult.viewUrl}

  Verify C2PA credentials:
    https://contentcredentials.org/verify
    (download the image from the gateway URL and upload it to verify)

  Arweave TX ID: ${uploadResult.txId}
  Manifest ID:   ${signResult.manifestId}

  Tags uploaded:
${signResult.tags.map((t) => `    ${t.name}: ${t.value}`).join('\n')}

  Once the gateway indexes this transaction, query the SBR API:
    curl '${manifestRepoUrl}/matches/byBinding?alg=org.ar-io.phash&value=${encodeURIComponent(signResult.tags.find((t) => t.name === 'C2PA-Soft-Binding-Value')?.value || '')}'
`);
}

main().catch((err) => {
  console.error('\nDemo failed:', err);
  process.exit(1);
});
