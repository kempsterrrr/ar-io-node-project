/**
 * Diagnostic script: isolate why gateway P2P retrieval from Turbo CDN is slow.
 *
 * Three experiments:
 *   A — Isolate gateway P2P: local fetch vs gateway fetch of the same txId
 *   B — Size correlation: tiny payload vs large payload through same pipeline
 *   C — No-burst control: provenance store+retrieve with no prior requests
 *
 * Usage:
 *   ETH_PRIVATE_KEY=0x... ADMIN_API_KEY=... pnpm exec tsx scripts/diagnose-retrieval.ts
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uploadAndFanOut } from '../packages/sdk/src/fanout/upload-and-fanout.js';
import { signAndPrepare } from '../packages/turbo-c2pa/src/mode-full.js';
import { RemoteSigner } from '../packages/turbo-c2pa/src/signer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ethKey = process.env.ETH_PRIVATE_KEY!;
const adminKey = process.env.ADMIN_API_KEY!;
const gatewayUrl = process.env.GATEWAY_URL || 'https://ario.agenticway.io';
const trusthashUrl = process.env.TRUSTHASH_URL || 'https://ario.agenticway.io/trusthash';

if (!ethKey || !adminKey) {
  console.error('ERROR: ETH_PRIVATE_KEY and ADMIN_API_KEY required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function elapsed(t0: number): string {
  return ((Date.now() - t0) / 1000).toFixed(1) + 's';
}

/** Poll a URL with HEAD until 200/302 or timeout. Returns elapsed ms or null. */
async function pollUntilAvailable(
  url: string,
  label: string,
  maxPolls: number,
  intervalMs: number,
  t0: number
): Promise<number | null> {
  for (let i = 1; i <= maxPolls; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
      if (res.status === 200 || res.status === 302) {
        const ms = Date.now() - t0;
        console.log(`    ${label}: ${res.status} at ${elapsed(t0)}`);
        return ms;
      }
      if (i % 3 === 0) console.log(`    ${label}: ${res.status} at ${elapsed(t0)}`);
    } catch {
      if (i % 3 === 0) console.log(`    ${label}: error at ${elapsed(t0)}`);
    }
  }
  console.log(`    ${label}: TIMEOUT after ${elapsed(t0)}`);
  return null;
}

/** Upload buffer with C2PA provenance via signAndPrepare + uploadAndFanOut. */
async function uploadProvenance(imageBuffer: Buffer, label: string) {
  const remoteSigner = new RemoteSigner(trusthashUrl);
  const result = await signAndPrepare({
    imageBuffer,
    remoteSigner,
    manifestRepoUrl: trusthashUrl,
    claimGenerator: 'diagnose-retrieval/0.1.0',
    digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
  });

  const { buildTags } = await import('../packages/sdk/src/c2pa/tags.js');
  const tags = buildTags({
    contentType: result.contentType,
    manifestId: result.manifestId,
    storageMode: 'full',
    assetHash: result.assetHash,
    manifestStoreHash: result.manifestStoreHash,
    manifestRepoUrl: trusthashUrl,
    softBindingAlg: result.pHashHex ? 'org.ar-io.phash' : undefined,
    softBindingValue: result.pHashHex
      ? Buffer.from(result.pHashHex, 'hex').toString('base64')
      : undefined,
    claimGenerator: 'diagnose-retrieval/0.1.0',
  });

  const uploadResult = await uploadAndFanOut({
    data: result.signedBuffer,
    tags,
    ethPrivateKey: ethKey,
    gateways: [{ url: gatewayUrl, adminApiKey: adminKey }],
    gatewayUrl,
  });

  console.log(`  ${label}: uploaded txId=${uploadResult.txId} (${result.signedBuffer.length}b)`);
  return { txId: uploadResult.txId, size: result.signedBuffer.length };
}

// ---------------------------------------------------------------------------
// Experiment A: Isolate gateway P2P vs local fetch
// ---------------------------------------------------------------------------

async function experimentA() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT A: Isolate gateway P2P (local fetch vs gateway fetch)');
  console.log('='.repeat(70));
  console.log('  Hypothesis: gateway IP is rate-limited by Turbo, our local IP is not\n');

  const imageBuffer = readFileSync(resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg'));
  const { txId, size } = await uploadProvenance(imageBuffer, 'Upload');
  const t0 = Date.now();

  // Wait for Turbo CDN first
  const turboMs = await pollUntilAvailable(
    `https://turbo-gateway.com/${txId}`,
    'Turbo CDN (direct)',
    30,
    2000,
    t0
  );
  if (!turboMs) return;

  // Now race: local fetch vs gateway fetch
  console.log('\n  Racing local fetch vs gateway P2P fetch...');

  const localStart = Date.now();
  const localRes = await fetch(`https://turbo-gateway.com/${txId}`, { redirect: 'manual' });
  const localMs = Date.now() - localStart;
  console.log(`    Local → Turbo CDN:  ${localRes.status} in ${localMs}ms`);

  const gwMs = await pollUntilAvailable(
    `${gatewayUrl}/${txId}`,
    'Gateway → Turbo (P2P)',
    20,
    3000,
    Date.now()
  );

  console.log(`\n  RESULT A:`);
  console.log(`    Data size:     ${size}b`);
  console.log(`    Turbo CDN:     available at ${turboMs}ms`);
  console.log(`    Local fetch:   ${localMs}ms`);
  console.log(`    Gateway P2P:   ${gwMs ? gwMs + 'ms' : 'TIMEOUT'}`);
  if (gwMs && localMs < 1000 && gwMs > 5000) {
    console.log(
      `    → Gateway IP is ${(gwMs / Math.max(localMs, 1)).toFixed(0)}x slower — rate-limiting confirmed`
    );
  }
}

// ---------------------------------------------------------------------------
// Experiment B: Size correlation (tiny vs large)
// ---------------------------------------------------------------------------

async function experimentB() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT B: Size correlation (tiny 1KB vs large 133KB)');
  console.log('='.repeat(70));
  console.log('  Hypothesis: 20 KB/sec data rate limit means larger files take longer\n');

  // Create a tiny 1x1 JPEG (smallest valid JPEG)
  // This is a minimal valid JPEG: SOI + APP0 + DQT + SOF0 + DHT + SOS + image data + EOI
  // Easier: use a 1-pixel PNG-like buffer, but signAndPrepare needs a real image.
  // Instead, use a small crop of the test image or create a tiny buffer.
  // For a valid test we'll just use the same image but compare with a plain text upload.
  const imageBuffer = readFileSync(resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg'));

  // Upload small plain text via same uploadAndFanOut (no C2PA, just raw data + fan-out)
  console.log('  Uploading small payload (plain text, ~50 bytes)...');
  const smallData = Buffer.from('size-test-small-' + Date.now());
  const { buildTags } = await import('../packages/sdk/src/c2pa/tags.js');
  const smallTags = [{ name: 'Content-Type', value: 'text/plain' }];
  const smallResult = await uploadAndFanOut({
    data: smallData,
    tags: smallTags,
    ethPrivateKey: ethKey,
    gateways: [{ url: gatewayUrl, adminApiKey: adminKey }],
    gatewayUrl,
  });
  console.log(`    Small: txId=${smallResult.txId} (${smallData.length}b)`);

  // Wait 5s to let rate limit budget recover
  console.log('  Waiting 5s for rate limit recovery...');
  await new Promise((r) => setTimeout(r, 5000));

  // Upload large provenance image
  console.log('  Uploading large payload (C2PA signed image, ~133KB)...');
  const { txId: largeTxId, size: largeSize } = await uploadProvenance(imageBuffer, 'Large');

  // Time both gateway retrievals
  console.log('\n  Timing gateway retrieval for both...');

  const t0Small = Date.now();
  const smallGwMs = await pollUntilAvailable(
    `${gatewayUrl}/${smallResult.txId}`,
    'Gateway (small)',
    15,
    2000,
    t0Small
  );

  const t0Large = Date.now();
  const largeGwMs = await pollUntilAvailable(
    `${gatewayUrl}/${largeTxId}`,
    'Gateway (large)',
    20,
    3000,
    t0Large
  );

  console.log(`\n  RESULT B:`);
  console.log(
    `    Small (${smallData.length}b):  gateway retrieval ${smallGwMs ? smallGwMs + 'ms' : 'TIMEOUT'}`
  );
  console.log(
    `    Large (${largeSize}b): gateway retrieval ${largeGwMs ? largeGwMs + 'ms' : 'TIMEOUT'}`
  );
  if (smallGwMs && largeGwMs) {
    console.log(`    → Large is ${(largeGwMs / Math.max(smallGwMs, 1)).toFixed(1)}x slower`);
    if (largeGwMs > smallGwMs * 3) {
      console.log(`    → Size-dependent slowdown supports data rate limit hypothesis`);
    }
  }
}

// ---------------------------------------------------------------------------
// Experiment C: No-burst control (isolated provenance, no prior requests)
// ---------------------------------------------------------------------------

async function experimentC() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT C: No-burst control (isolated store+retrieve)');
  console.log('='.repeat(70));
  console.log('  Hypothesis: prior test requests exhaust rate limit budget\n');
  console.log('  Waiting 30s for rate limit budget to fully recover...');
  await new Promise((r) => setTimeout(r, 30000));

  const imageBuffer = readFileSync(resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg'));
  const { txId, size } = await uploadProvenance(imageBuffer, 'Upload (cold)');

  const t0 = Date.now();

  // Wait for Turbo CDN
  const turboMs = await pollUntilAvailable(
    `https://turbo-gateway.com/${txId}`,
    'Turbo CDN',
    15,
    2000,
    t0
  );
  if (!turboMs) return;

  // Immediately try gateway
  const gwMs = await pollUntilAvailable(`${gatewayUrl}/${txId}`, 'Gateway (cold)', 20, 3000, t0);

  console.log(`\n  RESULT C (after 30s rate limit recovery):`);
  console.log(`    Data size:    ${size}b`);
  console.log(`    Turbo CDN:    ${turboMs}ms`);
  console.log(`    Gateway P2P:  ${gwMs ? gwMs + 'ms' : 'TIMEOUT'}`);
  if (gwMs && gwMs < 15000) {
    console.log(`    → Fast retrieval after budget recovery — burst exhaustion confirmed`);
  } else if (gwMs && gwMs > 30000) {
    console.log(`    → Still slow after recovery — rate limit is tighter than expected`);
  }
}

// ---------------------------------------------------------------------------
// Experiment D: Follow full redirect chain with GET (like the SDK does)
// ---------------------------------------------------------------------------

async function experimentD() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT D: Full redirect chain analysis (GET, like SDK)');
  console.log('='.repeat(70));
  console.log('  Question: Does the 404 come from the gateway or the ArNS redirect?\n');

  const imageBuffer = readFileSync(resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg'));
  const { txId, size } = await uploadProvenance(imageBuffer, 'Upload');
  const t0 = Date.now();

  // Wait for Turbo CDN
  await pollUntilAvailable(`https://turbo-gateway.com/${txId}`, 'Turbo CDN', 15, 2000, t0);

  // Now do full GET requests, tracing each hop
  const maxAttempts = 15;
  const delayMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const url = `${gatewayUrl}/${txId}`;

    // Step 1: Gateway response (no redirect follow)
    const gwRes = await fetch(url, { redirect: 'manual' });
    const gwHeaders: Record<string, string> = {};
    gwRes.headers.forEach((v, k) => {
      gwHeaders[k] = v;
    });
    const gwLocation = gwRes.headers.get('location');

    console.log(`\n    Attempt ${attempt} at ${elapsed(t0)}:`);
    console.log(`      Gateway: ${gwRes.status} ${gwRes.statusText}`);
    if (gwLocation) console.log(`      Location: ${gwLocation}`);

    // Log any rate-limit headers
    const rateLimitHeaders = Object.entries(gwHeaders).filter(
      ([k]) =>
        k.includes('ratelimit') ||
        k.includes('rate-limit') ||
        k.includes('retry-after') ||
        k.includes('x-ratelimit')
    );
    if (rateLimitHeaders.length > 0) {
      console.log(
        `      Rate-limit headers: ${JSON.stringify(Object.fromEntries(rateLimitHeaders))}`
      );
    }

    if (gwRes.status === 404) {
      console.log(`      → 404 at gateway level (before any redirect)`);
      continue;
    }

    // Step 2: Follow redirect if 302
    if (gwRes.status === 302 && gwLocation) {
      const redirectRes = await fetch(gwLocation, { redirect: 'manual' });
      const redirectHeaders: Record<string, string> = {};
      redirectRes.headers.forEach((v, k) => {
        redirectHeaders[k] = v;
      });

      console.log(`      Redirect target: ${redirectRes.status} ${redirectRes.statusText}`);

      const rlHeaders2 = Object.entries(redirectHeaders).filter(
        ([k]) =>
          k.includes('ratelimit') ||
          k.includes('rate-limit') ||
          k.includes('retry-after') ||
          k.includes('x-ratelimit')
      );
      if (rlHeaders2.length > 0) {
        console.log(
          `      Redirect rate-limit headers: ${JSON.stringify(Object.fromEntries(rlHeaders2))}`
        );
      }

      if (redirectRes.status === 404) {
        console.log(`      → 404 at ArNS subdomain redirect target (not gateway)`);
      } else if (redirectRes.status === 200) {
        const ct = redirectRes.headers.get('content-type');
        const cl = redirectRes.headers.get('content-length');
        console.log(`      → SUCCESS: ${ct}, ${cl}b`);
        break;
      } else if (redirectRes.status === 302) {
        const loc2 = redirectRes.headers.get('location');
        console.log(`      → Double redirect to: ${loc2}`);
        // Follow second redirect
        if (loc2) {
          const res3 = await fetch(loc2, { redirect: 'manual' });
          console.log(`      → Final: ${res3.status} ${res3.statusText}`);
        }
      }
    }

    // Step 3: Also try full auto-follow (like SDK does)
    try {
      const fullRes = await fetch(url, { redirect: 'follow' });
      if (fullRes.ok) {
        const ct = fullRes.headers.get('content-type');
        const buf = await fullRes.arrayBuffer();
        console.log(
          `      SDK-style (follow redirects): ${fullRes.status}, ${ct}, ${buf.byteLength}b`
        );
        break;
      } else {
        console.log(`      SDK-style (follow redirects): ${fullRes.status}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`      SDK-style (follow redirects): error — ${msg.slice(0, 80)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Experiment E: Rate-limit header capture from Turbo CDN
// ---------------------------------------------------------------------------

async function experimentE() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT E: Turbo CDN rate-limit headers');
  console.log('='.repeat(70));
  console.log('  Question: Does Turbo return rate-limit headers or 429s?\n');

  // Use a known tx that definitely exists
  const knownTx = '4jBV3ofWh41KhuTs2pFvj-KBZWUkbrbCYlJH0vLA6LM';

  // Make 5 rapid requests to Turbo CDN and capture all headers
  for (let i = 1; i <= 5; i++) {
    const t0 = Date.now();
    const res = await fetch(`https://turbo-gateway.com/${knownTx}`, { redirect: 'manual' });
    const ms = Date.now() - t0;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    console.log(`  Request ${i}: ${res.status} in ${ms}ms`);

    // Log all interesting headers
    const interesting = Object.entries(headers).filter(
      ([k]) =>
        k.includes('ratelimit') ||
        k.includes('rate-limit') ||
        k.includes('retry') ||
        k.includes('x-') ||
        k.includes('ar-io')
    );
    if (interesting.length > 0) {
      for (const [k, v] of interesting) {
        console.log(`    ${k}: ${v}`);
      }
    } else {
      console.log(`    (no rate-limit or x-* headers)`);
    }

    // No delay — we want to see if rapid requests trigger throttling
  }

  // Now try via our gateway (5 rapid requests)
  console.log('\n  Same via our gateway:');
  for (let i = 1; i <= 5; i++) {
    const t0 = Date.now();
    const res = await fetch(`${gatewayUrl}/${knownTx}`, { redirect: 'manual' });
    const ms = Date.now() - t0;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    console.log(`  Request ${i}: ${res.status} in ${ms}ms`);

    const interesting = Object.entries(headers).filter(
      ([k]) =>
        k.includes('ratelimit') ||
        k.includes('rate-limit') ||
        k.includes('retry') ||
        k.includes('x-') ||
        k.includes('ar-io')
    );
    if (interesting.length > 0) {
      for (const [k, v] of interesting) {
        console.log(`    ${k}: ${v}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Experiment F: Gateway caching — is second fetch instant?
// ---------------------------------------------------------------------------

async function experimentF() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT F: Gateway caching after first successful fetch');
  console.log('='.repeat(70));
  console.log('  Question: Once data is fetched via P2P, is it cached locally?\n');

  const imageBuffer = readFileSync(resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg'));
  const { txId } = await uploadProvenance(imageBuffer, 'Upload');

  // Wait for gateway to be able to serve it
  const t0 = Date.now();
  await pollUntilAvailable(`https://turbo-gateway.com/${txId}`, 'Turbo CDN', 15, 2000, t0);
  await pollUntilAvailable(`${gatewayUrl}/${txId}`, 'Gateway (1st)', 20, 3000, t0);

  console.log(`\n  First fetch succeeded. Now testing cache with 3 immediate re-fetches:`);

  for (let i = 1; i <= 3; i++) {
    const fetchStart = Date.now();
    const res = await fetch(`${gatewayUrl}/${txId}`, { redirect: 'follow' });
    const fetchMs = Date.now() - fetchStart;
    const buf = await res.arrayBuffer();
    console.log(`    Fetch ${i}: ${res.status} in ${fetchMs}ms (${buf.byteLength}b)`);
  }
}

// ---------------------------------------------------------------------------
// Experiment G: Reproduce burst pattern — mimic full test suite, trace 404s
// ---------------------------------------------------------------------------

async function experimentG() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT G: Reproduce burst pattern (mimic test suite)');
  console.log('='.repeat(70));
  console.log('  Goal: fire uploads like the test suite does, then trace the 404\n');

  const imageBuffer = readFileSync(resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg'));

  // Mimic sections 2 + 2b: 3 plain stores back-to-back, then 1 provenance store
  console.log('  Simulating test suite burst...');
  for (let i = 1; i <= 3; i++) {
    const smallData = Buffer.from(`burst-plain-${i}-${Date.now()}`);
    const result = await uploadAndFanOut({
      data: smallData,
      tags: [{ name: 'Content-Type', value: 'text/plain' }],
      ethPrivateKey: ethKey,
      gateways: [{ url: gatewayUrl, adminApiKey: adminKey }],
      gatewayUrl,
    });
    console.log(`    Plain store ${i}: txId=${result.txId}`);
  }

  // Now the provenance store (like 2b)
  const { txId, size } = await uploadProvenance(imageBuffer, 'Provenance store');
  const t0 = Date.now();

  // Confirm Turbo has it
  await pollUntilAvailable(`https://turbo-gateway.com/${txId}`, 'Turbo CDN', 15, 2000, t0);

  // Now trace every gateway attempt with full detail
  console.log('\n  Tracing gateway retrieval (full redirect chain)...');
  const maxAttempts = 25;
  const delayMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const url = `${gatewayUrl}/${txId}`;
    const at = elapsed(t0);

    // Step 1: initial request, don't follow redirects
    const gwRes = await fetch(url, { redirect: 'manual' });
    const gwLocation = gwRes.headers.get('location');
    const gwCache = gwRes.headers.get('x-cache-status') || '-';

    if (gwRes.status === 404) {
      console.log(`    ${at} attempt ${attempt}: gateway 404 (cache=${gwCache})`);
      continue;
    }

    if (gwRes.status === 302 && gwLocation) {
      // Step 2: follow the redirect manually
      try {
        const rdRes = await fetch(gwLocation, { redirect: 'manual' });
        const rdCache = rdRes.headers.get('x-cache-status') || '-';

        if (rdRes.status === 404) {
          console.log(
            `    ${at} attempt ${attempt}: gateway 302 → redirect target 404 (gw-cache=${gwCache} rd-cache=${rdCache})`
          );
          console.log(`      redirect URL: ${gwLocation}`);
          continue;
        }

        if (rdRes.status === 200) {
          const cl = rdRes.headers.get('content-length');
          console.log(
            `    ${at} attempt ${attempt}: gateway 302 → redirect 200 (${cl}b, gw-cache=${gwCache} rd-cache=${rdCache})`
          );
          console.log(`\n  SUCCESS at ${at} after ${attempt} attempts`);
          return;
        }

        if (rdRes.status === 302) {
          const loc2 = rdRes.headers.get('location');
          // Third hop
          const rd2Res = await fetch(loc2!, { redirect: 'manual' });
          const rd2Cache = rd2Res.headers.get('x-cache-status') || '-';
          if (rd2Res.status === 200) {
            const cl = rd2Res.headers.get('content-length');
            console.log(
              `    ${at} attempt ${attempt}: gateway 302 → 302 → 200 (${cl}b, rd2-cache=${rd2Cache})`
            );
            console.log(`\n  SUCCESS at ${at} after ${attempt} attempts`);
            return;
          }
          console.log(
            `    ${at} attempt ${attempt}: gateway 302 → 302 → ${rd2Res.status} (rd2-cache=${rd2Cache})`
          );
          console.log(`      hop1: ${gwLocation}`);
          console.log(`      hop2: ${loc2}`);
          continue;
        }

        console.log(`    ${at} attempt ${attempt}: gateway 302 → ${rdRes.status} (unexpected)`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(
          `    ${at} attempt ${attempt}: gateway 302 → redirect error: ${msg.slice(0, 80)}`
        );
      }
      continue;
    }

    if (gwRes.status === 200) {
      const cl = gwRes.headers.get('content-length');
      console.log(`    ${at} attempt ${attempt}: gateway 200 directly (${cl}b, cache=${gwCache})`);
      console.log(`\n  SUCCESS at ${at} after ${attempt} attempts`);
      return;
    }

    console.log(`    ${at} attempt ${attempt}: gateway ${gwRes.status} (unexpected)`);
  }

  console.log(
    `\n  TIMEOUT: gateway never returned 200/302 within ${(maxAttempts * delayMs) / 1000}s`
  );
}

// ---------------------------------------------------------------------------
// Experiment H: Repeat G multiple times to catch variance
// ---------------------------------------------------------------------------

async function experimentH() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT H: Repeated burst+retrieve (3 rounds, catch variance)');
  console.log('='.repeat(70));
  console.log('  Goal: see if retrieval time varies across rounds\n');

  const imageBuffer = readFileSync(resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg'));
  const results: { round: number; turboMs: number; gwMs: number | null; attempts: number }[] = [];

  for (let round = 1; round <= 3; round++) {
    console.log(`\n  --- Round ${round}/3 ---`);

    // Burst: 3 plain + 1 provenance (same as test suite)
    for (let i = 1; i <= 3; i++) {
      await uploadAndFanOut({
        data: Buffer.from(`round${round}-plain-${i}-${Date.now()}`),
        tags: [{ name: 'Content-Type', value: 'text/plain' }],
        ethPrivateKey: ethKey,
        gateways: [{ url: gatewayUrl, adminApiKey: adminKey }],
        gatewayUrl,
      });
    }
    console.log(`    3 plain stores done`);

    const { txId } = await uploadProvenance(imageBuffer, `Round ${round}`);
    const t0 = Date.now();

    // Turbo CDN poll
    const turboMs = await pollUntilAvailable(
      `https://turbo-gateway.com/${txId}`,
      'Turbo CDN',
      15,
      2000,
      t0
    );

    // Gateway poll with attempt counter
    let gwMs: number | null = null;
    let attempts = 0;
    for (let i = 1; i <= 25; i++) {
      attempts = i;
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await fetch(`${gatewayUrl}/${txId}`, { redirect: 'follow' });
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 0) {
            gwMs = Date.now() - t0;
            console.log(`    Gateway: 200 at ${elapsed(t0)} (${buf.byteLength}b, attempt ${i})`);
            break;
          }
        }
        if (i % 3 === 0) console.log(`    Gateway: ${res.status} at ${elapsed(t0)} (attempt ${i})`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (i % 3 === 0) console.log(`    Gateway: error at ${elapsed(t0)} — ${msg.slice(0, 50)}`);
      }
    }

    results.push({ round, turboMs: turboMs || 0, gwMs, attempts });

    // Brief pause between rounds
    if (round < 3) {
      console.log('    Waiting 10s between rounds...');
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  console.log('\n  RESULTS SUMMARY:');
  console.log('  Round | Turbo CDN | Gateway  | Attempts');
  console.log('  ------|-----------|----------|--------');
  for (const r of results) {
    console.log(
      `    ${r.round}   | ${(r.turboMs / 1000).toFixed(1).padStart(7)}s | ${r.gwMs ? (r.gwMs / 1000).toFixed(1).padStart(6) + 's' : ' TIMEOUT'} | ${r.attempts}`
    );
  }

  const gwTimes = results.filter((r) => r.gwMs).map((r) => r.gwMs!);
  if (gwTimes.length > 0) {
    const min = Math.min(...gwTimes);
    const max = Math.max(...gwTimes);
    console.log(`\n  Gateway range: ${(min / 1000).toFixed(1)}s – ${(max / 1000).toFixed(1)}s`);
    if (max > min * 5) {
      console.log(
        `  → High variance (${(max / min).toFixed(1)}x) — non-deterministic pipeline delay`
      );
    } else {
      console.log(`  → Low variance — consistent pipeline latency`);
    }
  }
}

// ---------------------------------------------------------------------------
// Experiment I: Use /raw/{txId} to bypass sandbox redirect, compare with /{txId}
// ---------------------------------------------------------------------------

async function experimentI() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT I: /raw/{txId} vs /{txId} — bypass sandbox redirect');
  console.log('='.repeat(70));
  console.log('  Goal: isolate data availability from redirect overhead\n');

  const imageBuffer = readFileSync(resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg'));

  // Burst: 3 plain + 1 provenance (same as test suite)
  console.log('  Simulating test suite burst...');
  for (let i = 1; i <= 3; i++) {
    await uploadAndFanOut({
      data: Buffer.from(`exp-i-plain-${i}-${Date.now()}`),
      tags: [{ name: 'Content-Type', value: 'text/plain' }],
      ethPrivateKey: ethKey,
      gateways: [{ url: gatewayUrl, adminApiKey: adminKey }],
      gatewayUrl,
    });
  }
  console.log('    3 plain stores done');

  const { txId, size } = await uploadProvenance(imageBuffer, 'Provenance');
  const t0 = Date.now();

  // Confirm Turbo CDN has it
  await pollUntilAvailable(`https://turbo-gateway.com/${txId}`, 'Turbo CDN', 15, 2000, t0);

  // Poll both endpoints simultaneously
  console.log('\n  Polling /raw/{txId} and /{txId} in parallel...');
  const maxAttempts = 30;
  const delayMs = 2000;
  let rawFirstSuccess: string | null = null;
  let sandboxFirstSuccess: string | null = null;

  for (let i = 1; i <= maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const at = elapsed(t0);

    // /raw/{txId} — direct bytes, no redirect
    const rawRes = await fetch(`${gatewayUrl}/raw/${txId}`).catch(() => null);
    const rawStatus = rawRes ? rawRes.status : 'err';
    if (rawRes && rawRes.ok && !rawFirstSuccess) {
      const buf = await rawRes.arrayBuffer();
      rawFirstSuccess = at;
      console.log(`    ${at}: /raw/ = ${rawStatus} (${buf.byteLength}b) ← FIRST SUCCESS`);
    } else if (rawRes && !rawRes.ok) {
      // consume body to avoid leak
      await rawRes.text().catch(() => {});
    }

    // /{txId} — sandbox redirect, follow it (like SDK does)
    const sdkRes = await fetch(`${gatewayUrl}/${txId}`, { redirect: 'follow' }).catch(() => null);
    const sdkStatus = sdkRes ? sdkRes.status : 'err';
    if (sdkRes && sdkRes.ok && !sandboxFirstSuccess) {
      const buf = await sdkRes.arrayBuffer();
      sandboxFirstSuccess = at;
      console.log(`    ${at}: /{txId} = ${sdkStatus} (${buf.byteLength}b) ← FIRST SUCCESS`);
    } else if (sdkRes && !sdkRes.ok) {
      await sdkRes.text().catch(() => {});
    }

    // Log progress periodically
    if (!rawFirstSuccess || !sandboxFirstSuccess) {
      if (i % 3 === 0) {
        console.log(`    ${at}: /raw/=${rawStatus} /{txId}=${sdkStatus}`);
      }
    }

    if (rawFirstSuccess && sandboxFirstSuccess) break;
  }

  console.log(`\n  RESULT I:`);
  console.log(`    Data size:       ${size}b`);
  console.log(`    /raw/{txId}:     first 200 at ${rawFirstSuccess || 'TIMEOUT'}`);
  console.log(`    /{txId} (SDK):   first 200 at ${sandboxFirstSuccess || 'TIMEOUT'}`);
}

// ---------------------------------------------------------------------------
// Experiment J: 5 consecutive provenance uploads, retrieve each immediately
// ---------------------------------------------------------------------------

async function experimentJ() {
  console.log('\n' + '='.repeat(70));
  console.log('  EXPERIMENT J: 5 consecutive uploads, immediate /raw/ retrieval');
  console.log('='.repeat(70));
  console.log('  Goal: stress the gateway pipeline, reproduce long delays\n');

  const imageBuffer = readFileSync(resolve(__dirname, '../packages/turbo-c2pa/test-image.jpg'));
  const results: { round: number; turboMs: number | null; rawMs: number | null }[] = [];

  for (let round = 1; round <= 5; round++) {
    const { txId } = await uploadProvenance(imageBuffer, `Upload ${round}`);
    const t0 = Date.now();

    // Check Turbo CDN
    const turboMs = await pollUntilAvailable(
      `https://turbo-gateway.com/${txId}`,
      `R${round} Turbo`,
      10,
      2000,
      t0
    );

    // Check /raw/ on gateway
    let rawMs: number | null = null;
    for (let i = 1; i <= 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`${gatewayUrl}/raw/${txId}`);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          rawMs = Date.now() - t0;
          console.log(
            `    R${round} Gateway /raw/: 200 at ${elapsed(t0)} (${buf.byteLength}b, attempt ${i})`
          );
          break;
        }
        if (i % 5 === 0)
          console.log(
            `    R${round} Gateway /raw/: ${res.status} at ${elapsed(t0)} (attempt ${i})`
          );
        await res.text().catch(() => {});
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (i % 5 === 0)
          console.log(`    R${round} Gateway /raw/: error at ${elapsed(t0)} — ${msg.slice(0, 50)}`);
      }
    }

    results.push({ round, turboMs, rawMs });

    // NO pause between rounds — we want to stress the pipeline
  }

  console.log('\n  RESULTS SUMMARY:');
  console.log('  Round | Turbo CDN | Gateway /raw/');
  console.log('  ------|-----------|-------------');
  for (const r of results) {
    console.log(
      `    ${r.round}   | ${r.turboMs ? (r.turboMs / 1000).toFixed(1).padStart(7) + 's' : ' TIMEOUT'} | ${r.rawMs ? (r.rawMs / 1000).toFixed(1).padStart(7) + 's' : ' TIMEOUT'}`
    );
  }

  const rawTimes = results.filter((r) => r.rawMs).map((r) => r.rawMs!);
  if (rawTimes.length > 1) {
    const min = Math.min(...rawTimes);
    const max = Math.max(...rawTimes);
    const avg = rawTimes.reduce((a, b) => a + b, 0) / rawTimes.length;
    console.log(
      `\n  Gateway /raw/ stats: min=${(min / 1000).toFixed(1)}s avg=${(avg / 1000).toFixed(1)}s max=${(max / 1000).toFixed(1)}s`
    );
    if (max > 30000) {
      console.log(`  → Long delay reproduced! Pipeline backs up under sustained load`);
    } else if (max > min * 3) {
      console.log(
        `  → Moderate variance (${(max / min).toFixed(1)}x) — pipeline contention under load`
      );
    } else {
      console.log(`  → Consistent latency — pipeline handles sustained load`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Retrieval Diagnostic — Long Delay Analysis');
  console.log(`  Gateway:   ${gatewayUrl}`);
  console.log(`  Trusthash: ${trusthashUrl}`);

  await experimentI();
  await experimentJ();

  console.log('\n' + '='.repeat(70));
  console.log('  DIAGNOSTIC COMPLETE');
  console.log('='.repeat(70));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
