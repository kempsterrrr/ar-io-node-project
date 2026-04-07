/**
 * Fan-Out PoC — Prove the full flow:
 *   1. Create + sign an ANS-104 DataItem with arbundles
 *   2. Upload to Turbo via uploadSignedDataItem
 *   3. Extract headers and POST to gateway queue-data-item admin API
 *
 * Usage:
 *   ETH_PRIVATE_KEY=0x... ADMIN_API_KEY=test-fanout-key \
 *     pnpm exec tsx scripts/test-fanout-poc.ts
 *
 * Environment:
 *   ETH_PRIVATE_KEY  — Ethereum private key (required)
 *   ADMIN_API_KEY    — Gateway admin API key (required)
 *   GATEWAY_URL      — Gateway base URL (default: http://localhost:3000)
 */

import { createData, EthereumSigner, keccak256 } from '@dha-team/arbundles';
import { TurboFactory } from '@ardrive/turbo-sdk';
import { Readable } from 'node:stream';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ethKey = process.env.ETH_PRIVATE_KEY;
if (!ethKey) {
  console.error('ERROR: ETH_PRIVATE_KEY is required');
  process.exit(1);
}
const adminKey = process.env.ADMIN_API_KEY;
if (!adminKey) {
  console.error('ERROR: ADMIN_API_KEY is required');
  process.exit(1);
}
const gatewayUrl = (process.env.GATEWAY_URL || 'http://localhost:3000').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveOwnerAddress(ownerB64url: string): string {
  const pubKeyBytes = Buffer.from(ownerB64url, 'base64url');
  // Ethereum: keccak256(uncompressed pubkey minus 0x04 prefix) → last 20 bytes
  const hash = keccak256(pubKeyBytes.slice(1));
  return Buffer.from(hash.slice(-20)).toString('base64url');
}

function log(step: string, msg: string) {
  console.log(`\n[${step}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const normalizedKey = ethKey!.startsWith('0x') ? ethKey! : `0x${ethKey}`;

  // 1. Create and sign a DataItem
  log('1/4', 'Creating and signing DataItem');

  const signer = new EthereumSigner(normalizedKey);
  const payload = Buffer.from('Hello from fan-out PoC — ' + new Date().toISOString());
  const tags = [
    { name: 'Content-Type', value: 'text/plain' },
    { name: 'App-Name', value: 'fanout-poc' },
    { name: 'App-Version', value: '0.1.0' },
  ];

  const dataItem = createData(payload, signer, { tags });
  await dataItem.sign(signer);

  const ownerAddress = deriveOwnerAddress(dataItem.owner);

  console.log(`  ID:            ${dataItem.id}`);
  console.log(`  Owner:         ${dataItem.owner.slice(0, 20)}...`);
  console.log(`  Owner Address: ${ownerAddress}`);
  console.log(`  Signature:     ${dataItem.signature.slice(0, 20)}...`);
  console.log(`  Data size:     ${dataItem.rawData.length} bytes`);
  console.log(`  Raw size:      ${dataItem.getRaw().length} bytes`);
  console.log(`  Tags:          ${dataItem.tags.length}`);

  // 2. Upload to Turbo
  log('2/4', 'Uploading to Turbo via uploadSignedDataItem');

  const turbo = TurboFactory.authenticated({
    privateKey: normalizedKey,
    token: 'ethereum',
  });

  const raw = dataItem.getRaw();
  const uploadResult = await turbo.uploadSignedDataItem({
    dataItemStreamFactory: () => Readable.from(raw),
    dataItemSizeFactory: () => raw.length,
  });

  console.log(`  Turbo TX ID:   ${uploadResult.id}`);
  console.log(`  Owner:         ${uploadResult.owner}`);
  console.log(`  Winc charged:  ${uploadResult.winc}`);
  console.log(`  Data caches:   ${uploadResult.dataCaches?.join(', ') || 'none'}`);

  // 3. Fan out to gateway
  log('3/4', `Fanning out to gateway at ${gatewayUrl}`);

  const header = {
    id: dataItem.id,
    owner: dataItem.owner,
    owner_address: ownerAddress,
    signature: dataItem.signature,
    data_size: dataItem.rawData.length,
    tags: dataItem.tags,
  };

  console.log(`  POST ${gatewayUrl}/ar-io/admin/queue-data-item`);
  console.log(
    `  Header payload: ${JSON.stringify(header, null, 2).split('\n').slice(0, 5).join('\n')}  ...`
  );

  const fanoutRes = await fetch(`${gatewayUrl}/ar-io/admin/queue-data-item`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify([header]),
  });

  const fanoutBody = await fanoutRes.text();
  console.log(`  Status:        ${fanoutRes.status} ${fanoutRes.statusText}`);
  console.log(`  Response:      ${fanoutBody}`);

  if (!fanoutRes.ok) {
    console.error(`\nFan-out FAILED (${fanoutRes.status}): ${fanoutBody}`);
    process.exit(1);
  }

  // 4. Summary
  log('4/4', 'Done!');
  console.log(`
  Data item uploaded to Turbo and fanned out to gateway.

  TX ID: ${dataItem.id}
  View:  ${gatewayUrl}/${dataItem.id}

  To verify indexing (may take a moment):
    curl -s ${gatewayUrl}/${dataItem.id}
    # Expected: "${payload.toString().slice(0, 40)}..."
`);
}

main().catch((err) => {
  console.error('\nPoC failed:', err);
  process.exit(1);
});
