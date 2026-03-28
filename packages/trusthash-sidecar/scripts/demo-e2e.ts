#!/usr/bin/env tsx
/**
 * End-to-end demo of the C2PA signing oracle + webhook + SBR pipeline.
 *
 * Prerequisites:
 *   ENABLE_SIGNING=true
 *   SIGNING_CERT_PEM=<base64 PEM>
 *   SIGNING_PRIVATE_KEY_PEM=<base64 PEM>
 *
 * Usage:
 *   # Generate dev certs first:
 *   ./scripts/generate-dev-cert.sh
 *
 *   # Then run (sidecar must be running):
 *   pnpm exec tsx scripts/demo-e2e.ts
 *
 *   # Or with custom base URL:
 *   BASE_URL=http://localhost:3003 pnpm exec tsx scripts/demo-e2e.ts
 */

import {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  TAG_PROTOCOL,
  TAG_PROTOCOL_VERSION,
  TAG_MANIFEST_ID,
  TAG_STORAGE_MODE,
  TAG_ASSET_HASH,
  TAG_MANIFEST_STORE_HASH,
  TAG_MANIFEST_REPO_URL,
  TAG_SOFT_BINDING_ALG,
  TAG_SOFT_BINDING_VALUE,
  TAG_CLAIM_GENERATOR,
  ALG_PHASH,
} from '@ar-io/c2pa-protocol';
import crypto from 'node:crypto';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3003';

function log(step: string, message: string) {
  console.log(`\n[${'='.repeat(3)} ${step} ${'='.repeat(3)}] ${message}`);
}

function ok(detail: string) {
  console.log(`  OK: ${detail}`);
}

function fail(detail: string): never {
  console.error(`  FAIL: ${detail}`);
  process.exit(1);
}

async function main() {
  console.log('C2PA Sidecar E2E Demo');
  console.log(`Base URL: ${BASE_URL}`);

  // Step 1: Health check
  log('1/7', 'Health check');
  const healthRes = await fetch(`${BASE_URL}/health`);
  if (!healthRes.ok) fail(`Health check failed: ${healthRes.status}`);
  const health = (await healthRes.json()) as { success: boolean };
  ok(`Sidecar is healthy: ${JSON.stringify(health)}`);

  // Step 2: Get certificate
  log('2/7', 'Retrieve signing certificate');
  const certRes = await fetch(`${BASE_URL}/v1/cert`);
  if (certRes.status === 501) fail('Signing is not enabled. Set ENABLE_SIGNING=true');
  if (!certRes.ok) fail(`Cert retrieval failed: ${certRes.status}`);
  const certPem = await certRes.text();
  ok(`Certificate retrieved (${certPem.length} bytes, ${certRes.headers.get('content-type')})`);

  // Step 3: Sign a test payload
  log('3/7', 'Sign a COSE payload');
  const testPayload = Buffer.from('COSE_Sign1_Sig_structure_demo_payload');
  const signRes = await fetch(`${BASE_URL}/v1/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: testPayload,
  });
  if (!signRes.ok) fail(`Signing failed: ${signRes.status}`);
  const sigBytes = Buffer.from(await signRes.arrayBuffer());
  ok(`Signature: ${sigBytes.length} bytes (expected 64 for ES256/P-256)`);
  if (sigBytes.length !== 64) fail('Unexpected signature length');

  // Step 4: Simulate a webhook with new schema tags
  log('4/7', 'Simulate webhook (new schema tags)');

  const manifestId = `urn:c2pa:demo-${Date.now()}`;
  const txId = `demo-tx-${Date.now()}`;
  const pHashBytes = crypto.randomBytes(8);
  const pHashB64 = pHashBytes.toString('base64');
  const assetHash = crypto.randomBytes(32).toString('base64url');
  const storeHash = crypto.randomBytes(32).toString('base64url');
  const repoUrl = `${BASE_URL}/v1`;

  const webhookRes = await fetch(`${BASE_URL}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_id: txId,
      tags: [
        { name: TAG_PROTOCOL, value: PROTOCOL_NAME },
        { name: TAG_PROTOCOL_VERSION, value: PROTOCOL_VERSION },
        { name: 'Content-Type', value: 'application/c2pa' },
        { name: TAG_MANIFEST_ID, value: manifestId },
        { name: TAG_STORAGE_MODE, value: 'manifest' },
        { name: TAG_ASSET_HASH, value: assetHash },
        { name: TAG_MANIFEST_STORE_HASH, value: storeHash },
        { name: TAG_MANIFEST_REPO_URL, value: repoUrl },
        { name: TAG_SOFT_BINDING_ALG, value: ALG_PHASH },
        { name: TAG_SOFT_BINDING_VALUE, value: pHashB64 },
        { name: TAG_CLAIM_GENERATOR, value: 'demo-e2e/1.0' },
      ],
      owner: 'demo-owner-address',
      block_height: 9999999,
      block_timestamp: Math.floor(Date.now() / 1000),
    }),
  });

  if (!webhookRes.ok) fail(`Webhook failed: ${webhookRes.status}`);
  const webhookBody = (await webhookRes.json()) as {
    success: boolean;
    data?: { action: string };
  };
  if (webhookBody.data?.action !== 'indexed')
    fail(`Webhook not indexed: ${JSON.stringify(webhookBody)}`);
  ok(`Manifest indexed: ${manifestId} (tx: ${txId})`);

  // Step 5: Query SBR API by binding
  log('5/7', 'Query SBR /matches/byBinding');
  const bindingUrl = `${BASE_URL}/v1/matches/byBinding?alg=${encodeURIComponent(ALG_PHASH)}&value=${encodeURIComponent(pHashB64)}`;
  const bindingRes = await fetch(bindingUrl);
  if (!bindingRes.ok) fail(`byBinding query failed: ${bindingRes.status}`);
  const bindingBody = (await bindingRes.json()) as {
    matches: Array<{ manifestId: string }>;
  };
  const found = bindingBody.matches.some((m) => m.manifestId === manifestId);
  if (!found) fail(`Manifest not found in byBinding results: ${JSON.stringify(bindingBody)}`);
  ok(`Found ${bindingBody.matches.length} match(es) — manifest ${manifestId} present`);

  // Step 6: Query search-similar
  log('6/7', 'Query /search-similar by pHash');
  const pHashHex = pHashBytes.toString('hex');
  const searchRes = await fetch(`${BASE_URL}/v1/search-similar?phash=${pHashHex}&threshold=0`);
  if (!searchRes.ok) fail(`Search failed: ${searchRes.status}`);
  const searchBody = (await searchRes.json()) as {
    data: { results: Array<{ manifestId: string; distance: number }> };
  };
  const results = searchBody.data?.results || [];
  const searchFound = results.some((m) => m.manifestId === manifestId);
  if (!searchFound) fail(`Manifest not found in similarity search: ${JSON.stringify(searchBody)}`);
  ok(`Found in similarity search (distance: ${results[0]?.distance})`);

  // Step 7: Summary
  log('7/7', 'Summary');
  console.log(`
  All steps passed:
    Certificate:  served (${certPem.split('\n').length} lines)
    Signature:    ${sigBytes.length} bytes (IEEE P1363)
    Webhook:      indexed ${manifestId}
    SBR byBinding: found
    Similarity:   found (distance 0)

  The C2PA signing oracle + webhook + SBR pipeline is working end-to-end.
`);
}

main().catch((err) => {
  console.error('\nDemo failed:', err);
  process.exit(1);
});
