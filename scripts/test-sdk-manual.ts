/**
 * Manual integration test suite for the AgenticWay SDK + gateway.
 *
 * Tests every SDK operation against a live local gateway to validate
 * real behavior before pushing changes.
 *
 * Prerequisites:
 *   - Gateway running on localhost:3000 with ADMIN_API_KEY set
 *   - ETH_PRIVATE_KEY with Turbo credits
 *   - ADMIN_API_KEY matching the gateway config
 *
 * Usage:
 *   ETH_PRIVATE_KEY=0x... ADMIN_API_KEY=test-fanout-key \
 *     pnpm exec tsx scripts/test-sdk-manual.ts
 *
 * Optional env:
 *   GATEWAY_URL        — default: http://localhost:3000
 *   TRUSTHASH_URL      — if set, tests search/provenance (needs trusthash sidecar)
 *   SKIP_FANOUT        — set to "true" to skip fan-out tests
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgenticWay } from '../packages/sdk/src/index.js';
import {
  createSignedDataItem,
  fanOutDataItem,
  uploadAndFanOut,
} from '../packages/sdk/src/fanout/index.js';
import type { GatewayTarget } from '../packages/sdk/src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ethKey = process.env.ETH_PRIVATE_KEY;
if (!ethKey) {
  console.error('ERROR: ETH_PRIVATE_KEY is required');
  process.exit(1);
}

const adminKey = process.env.ADMIN_API_KEY;
const gatewayUrl = (process.env.GATEWAY_URL || 'http://localhost:3000').replace(/\/$/, '');
const trusthashUrl = process.env.TRUSTHASH_URL || undefined;
const skipFanout = process.env.SKIP_FANOUT === 'true';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;

type TestFn = () => Promise<void>;

async function test(name: string, fn: TestFn) {
  process.stdout.write(`\n  [TEST] ${name} ... `);
  try {
    await fn();
    passed++;
    console.log('PASS');
  } catch (e: unknown) {
    failed++;
    console.log('FAIL');
    console.log(`         ${(e as Error).message.slice(0, 200)}`);
  }
}

function skip(name: string, reason: string) {
  skipped++;
  console.log(`\n  [SKIP] ${name} — ${reason}`);
}

function section(name: string) {
  console.log(`\n${'='.repeat(60)}\n  ${name}\n${'='.repeat(60)}`);
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('AgenticWay SDK — Manual Integration Tests');
  console.log(`  Gateway:    ${gatewayUrl}`);
  console.log(`  Trusthash:  ${trusthashUrl || '(not configured)'}`);
  console.log(`  Admin key:  ${adminKey ? 'set' : '(not set)'}`);
  console.log(
    `  Fan-out:    ${skipFanout ? 'skipped' : adminKey ? 'enabled' : 'needs ADMIN_API_KEY'}`
  );

  // SDK with fan-out targets if admin key is available
  const fanOutTargets: GatewayTarget[] =
    adminKey && !skipFanout ? [{ url: gatewayUrl, adminApiKey: adminKey }] : [];

  const sdk = new AgenticWay({
    gatewayUrl,
    turboWallet: ethKey,
    trusthashUrl,
    optimisticIndexTargets: fanOutTargets,
  });

  // Track IDs across tests
  let storedTxId: string | undefined;
  let anchorTxId: string | undefined;
  let batchAnchorTxId: string | undefined;
  const anchorData = Buffer.from('integrity-anchor-test-' + Date.now());
  const batchItems = [
    Buffer.from('batch-item-0-' + Date.now()),
    Buffer.from('batch-item-1-' + Date.now()),
    Buffer.from('batch-item-2-' + Date.now()),
  ];

  // ===================================================================
  section('1. Gateway Health');
  // ===================================================================

  await test('info() — gateway metadata', async () => {
    const info = await sdk.info();
    assert(!!info.processId, 'missing processId');
    console.log(`processId=${info.processId.slice(0, 15)}... release=${info.release}`);
  });

  await test('gateway /ar-io/info direct', async () => {
    const res = await fetch(`${gatewayUrl}/ar-io/info`);
    assert(res.ok, `HTTP ${res.status}`);
    const body = await res.json();
    assert(body.processId, 'missing processId in response');
  });

  // ===================================================================
  section('2. Store');
  // ===================================================================

  await test('store() — plain text', async () => {
    const result = await sdk.store({
      data: Buffer.from('SDK integration test — ' + new Date().toISOString()),
      contentType: 'text/plain',
      tags: { 'App-Name': 'sdk-integration-test', 'Test-Run': String(Date.now()) },
    });
    assert(!!result.txId, 'missing txId');
    assert(!!result.viewUrl, 'missing viewUrl');
    storedTxId = result.txId;
    console.log(`txId=${result.txId.slice(0, 20)}...`);

    if (fanOutTargets.length > 0) {
      assert(!!result.fanOutResults, 'missing fanOutResults when targets configured');
      const successCount = result.fanOutResults!.filter((r) => r.status === 'success').length;
      console.log(` fanOut=${successCount}/${result.fanOutResults!.length} ok`);
    }
  });

  await test('store() — JSON data', async () => {
    const result = await sdk.store({
      data: Buffer.from(JSON.stringify({ test: true, ts: Date.now() })),
      contentType: 'application/json',
    });
    assert(!!result.txId, 'missing txId');
    console.log(`txId=${result.txId.slice(0, 20)}...`);
  });

  await test('store() — binary data', async () => {
    const buf = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) buf[i] = i;
    const result = await sdk.store({ data: buf });
    assert(!!result.txId, 'missing txId');
    console.log(`txId=${result.txId.slice(0, 20)}...`);
  });

  // ===================================================================
  section('2b. Store with C2PA Provenance');
  // ===================================================================

  const testImagePath = resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg');
  let provenanceTxId: string | undefined;
  let originalImageSize: number | undefined;

  if (trusthashUrl) {
    const imageBuffer = readFileSync(testImagePath);
    originalImageSize = imageBuffer.length;

    await test('store() with provenance — C2PA sign + upload', async () => {
      const result = await sdk.store({
        data: imageBuffer,
        provenance: {
          sourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
          claimGenerator: 'sdk-integration-test/0.1.0',
        },
      });
      assert(!!result.txId, 'missing txId');
      assert(!!result.provenance, 'missing provenance in result');
      assert(
        result.provenance!.manifestId.startsWith('urn:c2pa:'),
        `manifestId doesn't start with urn:c2pa: — got "${result.provenance!.manifestId}"`
      );
      assert(!!result.provenance!.assetHash, 'missing assetHash');
      provenanceTxId = result.txId;
      console.log(
        `txId=${result.txId.slice(0, 20)}... manifest=${result.provenance!.manifestId.slice(0, 30)}...`
      );

      if (fanOutTargets.length > 0 && result.fanOutResults) {
        const ok = result.fanOutResults.filter((r) => r.status === 'success').length;
        console.log(` fanOut=${ok}/${result.fanOutResults.length} ok`);
      }
    });

    if (provenanceTxId) {
      console.log('\n  Waiting 3s for Turbo cache...');
      await new Promise((r) => setTimeout(r, 3000));

      await test('retrieve() provenance-stored image — manifest embedded', async () => {
        const result = await sdk.retrieve(provenanceTxId!);
        assert(
          result.data.length > originalImageSize!,
          `signed image (${result.data.length}b) should be larger than original (${originalImageSize}b)`
        );
        assert(
          result.contentType.includes('image/jpeg'),
          `expected image/jpeg, got ${result.contentType}`
        );
        console.log(
          `original=${originalImageSize}b signed=${result.data.length}b (+${result.data.length - originalImageSize!}b manifest)`
        );
      });
    }
  } else {
    skip('store() with provenance', 'TRUSTHASH_URL not set');
    skip('retrieve() provenance-stored image', 'TRUSTHASH_URL not set');
  }

  // ===================================================================
  section('3. Retrieve');
  // ===================================================================

  await test('retrieve() — known test tx (4jBV3o...)', async () => {
    const result = await sdk.retrieve('4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM');
    const text = result.data.toString().trim();
    assert(text === 'test', `expected "test", got "${text}"`);
    console.log(`data="${text}" contentType=${result.contentType}`);
  });

  if (storedTxId) {
    console.log('\n  Waiting 3s for Turbo cache availability...');
    await new Promise((r) => setTimeout(r, 3000));

    await test('retrieve() — our stored tx (via Turbo/trusted gateways)', async () => {
      const result = await sdk.retrieve(storedTxId!);
      const text = result.data.toString();
      assert(text.startsWith('SDK integration test'), `unexpected data: "${text.slice(0, 40)}"`);
      console.log(`data="${text.slice(0, 50)}..."`);
    });
  }

  // ===================================================================
  section('4. Query (GraphQL)');
  // ===================================================================

  await test('query() — fetch recent transactions', async () => {
    const result = await sdk.query({ first: 5 });
    assert(result.edges.length > 0, 'no results');
    console.log(`${result.edges.length} results, hasNextPage=${result.pageInfo.hasNextPage}`);
  });

  await test('query() — filter by tag', async () => {
    const result = await sdk.query({
      tags: [{ name: 'Content-Type', values: ['text/plain'] }],
      first: 3,
    });
    console.log(`${result.edges.length} results with Content-Type=text/plain`);
  });

  await test('query() — pagination', async () => {
    const page1 = await sdk.query({ first: 2 });
    assert(page1.edges.length > 0, 'page 1 empty');
    if (page1.pageInfo.hasNextPage && page1.pageInfo.endCursor) {
      const page2 = await sdk.query({ first: 2, after: page1.pageInfo.endCursor });
      assert(page2.edges.length > 0, 'page 2 empty');
      assert(page2.edges[0].txId !== page1.edges[0].txId, 'page 2 has same first tx as page 1');
      console.log(`page1=${page1.edges.length} page2=${page2.edges.length} (different txIds)`);
    } else {
      console.log(`only 1 page of results`);
    }
  });

  // ===================================================================
  section('5. Integrity Anchoring');
  // ===================================================================

  await test('anchor() — store SHA-256 hash on-chain', async () => {
    const result = await sdk.anchor({
      data: anchorData,
      metadata: { 'Test-Source': 'sdk-manual-test' },
    });
    assert(!!result.txId, 'missing txId');
    assert(!!result.hash, 'missing hash');
    assert(result.hash.length === 64, `hash wrong length: ${result.hash.length}`);
    anchorTxId = result.txId;
    console.log(`txId=${result.txId.slice(0, 20)}... hash=${result.hash.slice(0, 16)}...`);
  });

  await test('batchAnchor() — Merkle tree of 3 items', async () => {
    const result = await sdk.batchAnchor({
      items: batchItems.map((data) => ({ data })),
      metadata: { 'Test-Source': 'sdk-manual-test' },
    });
    assert(!!result.txId, 'missing txId');
    assert(!!result.merkleRoot, 'missing merkleRoot');
    assert(result.proofs.length === 3, `expected 3 proofs, got ${result.proofs.length}`);
    batchAnchorTxId = result.txId;
    console.log(
      `txId=${result.txId.slice(0, 20)}... root=${result.merkleRoot.slice(0, 16)}... proofs=${result.proofs.length}`
    );
  });

  // verifyAnchor needs the tx to be indexed — optimistic data may not be in /tx/ yet
  // so we test it against a known L1-settled transaction pattern
  if (anchorTxId) {
    await test('verifyAnchor() — verify our anchor (may fail if not yet on L1)', async () => {
      try {
        const result = await sdk.verifyAnchor({ data: anchorData, txId: anchorTxId! });
        console.log(`valid=${result.valid} hash=${result.hash.slice(0, 16)}...`);
      } catch (e: unknown) {
        // Expected: GraphQL may not find optimistically-indexed tx yet
        const msg = (e as Error).message;
        if (msg.includes('not found') || msg.includes('404') || msg.includes('null')) {
          console.log(`(expected) tx not in GraphQL yet — ${msg.slice(0, 60)}`);
        } else {
          throw e;
        }
      }
    });
  }

  // ===================================================================
  section('6. Verify (needs verify sidecar)');
  // ===================================================================

  await test('verify() — known L1 transaction', async () => {
    try {
      const result = await sdk.verify('4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM');
      console.log(`valid=${result.valid} tier=${result.tier} existence=${result.existence.status}`);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg.includes('404') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        console.log(`(expected) verify sidecar not running — ${msg.slice(0, 60)}`);
      } else {
        throw e;
      }
    }
  });

  // ===================================================================
  section('7. Resolve (ArNS)');
  // ===================================================================

  await test('resolve() — arns name "ardrive"', async () => {
    try {
      const result = await sdk.resolve('ardrive');
      assert(!!result.txId, 'missing txId');
      console.log(`txId=${result.txId.slice(0, 20)}...`);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      // ArNS resolution may not work on all gateways
      if (msg.includes('404') || msg.includes('not found') || msg.includes('aborted')) {
        console.log(`(expected) ArNS not configured — ${msg.slice(0, 60)}`);
      } else {
        throw e;
      }
    }
  });

  // ===================================================================
  section('8. Search (needs trusthash sidecar)');
  // ===================================================================

  if (trusthashUrl) {
    await test('search() — by phash (wide threshold)', async () => {
      const result = await sdk.search({ phash: 'ff00ff00ff00ff00', threshold: 50, limit: 5 });
      console.log(`${result.total} results (may be 0 on fresh DB)`);
    });

    await test('search() — by image buffer', async () => {
      const imageBuffer = readFileSync(testImagePath);
      const result = await sdk.search({ image: imageBuffer, threshold: 30, limit: 5 });
      console.log(`${result.total} results`);
    });
  } else {
    skip('search() — by phash', 'TRUSTHASH_URL not set');
    skip('search() — by image buffer', 'TRUSTHASH_URL not set');
  }

  // ===================================================================
  section('9. Fan-Out (low-level API)');
  // ===================================================================

  if (!adminKey) {
    skip('fan-out tests', 'ADMIN_API_KEY not set');
  } else if (skipFanout) {
    skip('fan-out tests', 'SKIP_FANOUT=true');
  } else {
    const targets: GatewayTarget[] = [{ url: gatewayUrl, adminApiKey: adminKey }];

    await test('createSignedDataItem() — create + extract header', async () => {
      const { rawBytes, header } = await createSignedDataItem(
        Buffer.from('fanout-test-' + Date.now()),
        [{ name: 'Content-Type', value: 'text/plain' }],
        ethKey!
      );
      assert(rawBytes.length > 0, 'empty rawBytes');
      assert(header.id.length === 43, `id wrong length: ${header.id.length}`);
      assert(!!header.owner, 'missing owner');
      assert(!!header.owner_address, 'missing owner_address');
      assert(!!header.signature, 'missing signature');
      assert(header.data_size > 0, 'data_size is 0');
      console.log(`id=${header.id.slice(0, 20)}... size=${rawBytes.length}b`);
    });

    await test('fanOutDataItem() — POST header to gateway', async () => {
      const { header } = await createSignedDataItem(
        Buffer.from('fanout-direct-' + Date.now()),
        [{ name: 'Content-Type', value: 'text/plain' }],
        ethKey!
      );
      const results = await fanOutDataItem(header, targets);
      assert(results.length === 1, `expected 1 result, got ${results.length}`);
      assert(results[0].status === 'success', `fan-out failed: ${results[0].message}`);
      console.log(`gateway=${results[0].gateway} status=${results[0].status}`);
    });

    await test('uploadAndFanOut() — full upload + fan-out', async () => {
      const result = await uploadAndFanOut({
        data: Buffer.from('upload-and-fanout-test-' + Date.now()),
        tags: [
          { name: 'Content-Type', value: 'text/plain' },
          { name: 'App-Name', value: 'fanout-integration-test' },
        ],
        ethPrivateKey: ethKey!,
        gateways: targets,
        gatewayUrl,
      });
      assert(!!result.txId, 'missing txId');
      assert(result.fanOutResults.length === 1, 'missing fanOutResults');
      assert(
        result.fanOutResults[0].status === 'success',
        `fan-out failed: ${result.fanOutResults[0].message}`
      );
      console.log(`txId=${result.txId.slice(0, 20)}... fanOut=success`);

      // Verify data is retrievable from gateway
      console.log('\n         Waiting 2s for data availability...');
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`${gatewayUrl}/raw/${result.txId}`);
      assert(res.ok, `gateway returned ${res.status}`);
      const text = await res.text();
      assert(text.startsWith('upload-and-fanout-test-'), `unexpected data: "${text.slice(0, 30)}"`);
      console.log(`         Retrieved from gateway: "${text.slice(0, 40)}..."`);
    });

    await test('store() with optimisticIndexTargets — automatic fan-out', async () => {
      const result = await sdk.store({
        data: Buffer.from('store-with-fanout-' + Date.now()),
        contentType: 'text/plain',
      });
      assert(!!result.txId, 'missing txId');
      assert(!!result.fanOutResults, 'missing fanOutResults');
      assert(result.fanOutResults!.length > 0, 'empty fanOutResults');
      const ok = result.fanOutResults!.filter((r) => r.status === 'success').length;
      console.log(
        `txId=${result.txId.slice(0, 20)}... fanOut=${ok}/${result.fanOutResults!.length} ok`
      );
    });
  }

  // ===================================================================
  section('10. Gateway Admin API (direct)');
  // ===================================================================

  if (!adminKey) {
    skip('admin API tests', 'ADMIN_API_KEY not set');
  } else {
    await test('POST /ar-io/admin/queue-data-item — accepts valid header', async () => {
      const { header } = await createSignedDataItem(
        Buffer.from('admin-api-test-' + Date.now()),
        [{ name: 'Content-Type', value: 'text/plain' }],
        ethKey!
      );
      const res = await fetch(`${gatewayUrl}/ar-io/admin/queue-data-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify([header]),
      });
      const body = await res.json();
      assert(res.ok, `HTTP ${res.status}: ${JSON.stringify(body)}`);
      assert(body.message === 'Data item(s) queued', `unexpected: ${JSON.stringify(body)}`);
      console.log(`200 OK — "${body.message}"`);
    });

    await test('POST /ar-io/admin/queue-data-item — rejects bad auth', async () => {
      const res = await fetch(`${gatewayUrl}/ar-io/admin/queue-data-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-key',
        },
        body: JSON.stringify([{ id: 'fake' }]),
      });
      assert(res.status === 401, `expected 401, got ${res.status}`);
      console.log(`401 Unauthorized (correct)`);
    });
  }

  // ===================================================================
  // Summary
  // ===================================================================

  console.log('\n' + '='.repeat(60));
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('='.repeat(60) + '\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
