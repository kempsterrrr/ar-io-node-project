#!/usr/bin/env tsx
/**
 * C2PA Sign + Upload Demo
 *
 * Four modes:
 *   1. Sign mode (default): Signs an image with C2PA credentials via the sidecar,
 *      then uploads to Arweave.
 *   2. Store mode (--store): Preserves an image's existing C2PA manifest and
 *      uploads to Arweave for durable storage and SBR discovery.
 *   3. Manifest mode (--manifest): Signs an image but uploads only the manifest
 *      bytes to Arweave (not the image itself).
 *   4. Proof mode (--proof): Creates a proof-locator record pointing to a remote
 *      manifest URL (e.g. Adobe's repository).
 *
 * Prerequisites:
 *   1. For sign/manifest mode: Sidecar running with signing enabled
 *   2. ETH_PRIVATE_KEY set in .env (Ethereum wallet with Turbo credits)
 *   3. For sign/manifest mode: Dev certs generated (run generate-dev-cert.sh in trusthash-sidecar)
 *
 * Usage:
 *   pnpm exec tsx scripts/demo-upload.ts <image-path> [options]
 *
 * Options:
 *   --store                   Store mode — preserve existing C2PA manifest
 *   --manifest                Manifest mode — upload only the manifest bytes
 *   --proof                   Proof mode — create proof-locator to remote manifest
 *   --manifest-fetch-url <u>  Remote manifest URL (required for --proof)
 *   --manifest-id <id>        Manifest URN (required for --proof)
 *   --manifest-store-hash <h> SHA-256 of remote manifest (optional for --proof; auto-fetched if omitted)
 *   --source-type <type>      Digital source type for sign/manifest mode (e.g. digitalCapture)
 *   --identity                Include cawg.identity assertion (EXPERIMENTAL)
 *   --allow-invalid           Store mode — allow manifests that fail validation
 *
 * Environment:
 *   ETH_PRIVATE_KEY       — Ethereum private key (required)
 *   SIDECAR_URL           — Sidecar base URL (default: http://localhost:3003)
 *   GATEWAY_URL           — Gateway for viewing (default: https://turbo-gateway.com)
 *   UPLOAD_SERVICE_URL    — Custom bundler URL (e.g. https://ario.agenticway.io/bundler)
 *   C2PA_TRUST_ANCHOR_PEM — Base64 CA cert for dev signing (from generate-dev-cert.sh)
 *   MANIFEST_REPO_URL     — SBR API base URL (default: SIDECAR_URL + /v1)
 *   DIGITAL_SOURCE_TYPE   — Default digital source type (overridden by --source-type)
 */

import fs from 'node:fs';
import path from 'node:path';
import { RemoteSigner } from '../src/signer.js';
import { signAndPrepare } from '../src/mode-full.js';
import { storeAndPrepare } from '../src/mode-store.js';
import { signManifestAndPrepare } from '../src/mode-manifest.js';
import { proofAndPrepare } from '../src/mode-proof.js';
import { extractProvenanceUrl } from '../src/xmp.js';
import { uploadToArweave } from '../src/upload.js';

/** IPTC digital source type shorthand → full URI mapping. */
const SOURCE_TYPE_MAP: Record<string, string> = {
  digitalCapture: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
  trainedAlgorithmicMedia: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  compositeSynthetic: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic',
  algorithmicMedia: 'http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia',
  dataDrivenMedia: 'http://cv.iptc.org/newscodes/digitalsourcetype/dataDrivenMedia',
  digitalArt: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalArt',
  virtualRecording: 'http://cv.iptc.org/newscodes/digitalsourcetype/virtualRecording',
  minorHumanEdits: 'http://cv.iptc.org/newscodes/digitalsourcetype/minorHumanEdits',
  compositeWithTrainedAlgorithmicMedia:
    'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
};

function log(step: string, msg: string) {
  console.log(`\n[${'='.repeat(3)} ${step} ${'='.repeat(3)}] ${msg}`);
}

function fail(msg: string): never {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

function getArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function resolveSourceType(raw: string): string {
  return SOURCE_TYPE_MAP[raw] || raw;
}

async function main() {
  // Parse args
  const imagePath = process.argv[2];
  if (!imagePath || imagePath.startsWith('--')) {
    console.log('C2PA Sign + Upload Demo');
    console.log('');
    console.log('Usage: pnpm exec tsx scripts/demo-upload.ts <image-path> [options]');
    console.log('');
    console.log('Modes:');
    console.log('  (default)    Sign mode — create new C2PA manifest and upload');
    console.log('  --store      Store mode — preserve existing C2PA manifest and upload');
    console.log('  --manifest   Manifest mode — sign image, upload only manifest bytes');
    console.log('  --proof      Proof mode — create proof-locator to remote manifest');
    console.log('');
    console.log('Sign/Manifest mode options:');
    console.log('  --source-type <type>  Digital source type (e.g. digitalCapture)');
    console.log('  --identity            Include cawg.identity assertion (EXPERIMENTAL)');
    console.log('');
    console.log('Proof mode options:');
    console.log('  --manifest-fetch-url <url>  Remote manifest URL (required)');
    console.log('  --manifest-id <id>          Manifest URN (required)');
    console.log(
      '  --manifest-store-hash <h>   SHA-256 of remote manifest (auto-fetched if omitted)'
    );
    console.log('');
    console.log('Store mode options:');
    console.log('  --allow-invalid       Allow manifests that fail signature validation');
    console.log('');
    console.log('Digital source types (shorthand or full IPTC URI):');
    for (const [short, uri] of Object.entries(SOURCE_TYPE_MAP)) {
      console.log(`  ${short.padEnd(45)} ${uri}`);
    }
    console.log('');
    console.log('Required env vars:');
    console.log('  ETH_PRIVATE_KEY       Ethereum private key');
    console.log('');
    console.log('Optional env vars:');
    console.log('  SIDECAR_URL           default: http://localhost:3003');
    console.log('  GATEWAY_URL           default: https://turbo-gateway.com');
    console.log('  UPLOAD_SERVICE_URL    custom bundler (e.g. https://ario.agenticway.io/bundler)');
    console.log('  MANIFEST_REPO_URL     default: SIDECAR_URL/v1');
    console.log('  C2PA_TRUST_ANCHOR_PEM Base64 CA cert (sign/manifest mode only)');
    console.log('  DIGITAL_SOURCE_TYPE   Default source type (sign/manifest mode)');
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
  const uploadServiceUrl = process.env.UPLOAD_SERVICE_URL;
  const manifestRepoUrl = process.env.MANIFEST_REPO_URL || `${sidecarUrl}/v1`;

  const isStoreMode = process.argv.includes('--store');
  const isManifestMode = process.argv.includes('--manifest');
  const isProofMode = process.argv.includes('--proof');
  const includeIdentity = process.argv.includes('--identity');
  const allowInvalid = process.argv.includes('--allow-invalid');
  const sourceTypeArg = getArgValue('--source-type') || process.env.DIGITAL_SOURCE_TYPE;
  const manifestFetchUrlArg = getArgValue('--manifest-fetch-url');
  const manifestIdArg = getArgValue('--manifest-id');
  const manifestStoreHashArg = getArgValue('--manifest-store-hash');

  const mode = isProofMode ? 'PROOF' : isManifestMode ? 'MANIFEST' : isStoreMode ? 'STORE' : 'SIGN';
  const modeDescriptions: Record<string, string> = {
    SIGN: 'Sign (create new manifest and upload image)',
    STORE: 'Store (preserve existing manifest)',
    MANIFEST: 'Manifest (sign image, upload manifest only)',
    PROOF: 'Proof (create proof-locator to remote manifest)',
  };
  console.log(`C2PA ${mode} + Upload Demo`);
  console.log(`  Image:    ${imagePath}`);
  console.log(`  Mode:     ${modeDescriptions[mode]}`);
  if (!isStoreMode && !isProofMode) console.log(`  Sidecar:  ${sidecarUrl}`);
  console.log(`  Gateway:  ${gatewayUrl}`);
  if (uploadServiceUrl) console.log(`  Bundler:  ${uploadServiceUrl} (ar-io-bundler)`);

  // 1. Read image
  log('1/5', 'Reading image');
  const resolvedPath = path.resolve(imagePath);
  if (!fs.existsSync(resolvedPath)) fail(`File not found: ${resolvedPath}`);
  const imageBuffer = Buffer.from(fs.readFileSync(resolvedPath));
  console.log(`  Size: ${imageBuffer.length.toLocaleString()} bytes`);

  let uploadBuffer: Buffer;
  let tags: { name: string; value: string }[];
  let manifestId: string;
  let assetHash: string;
  let manifestStoreHash: string;
  let contentType: string;
  let pHashHex: string;

  if (isProofMode) {
    // ===== PROOF MODE =====
    if (!manifestIdArg) fail('--manifest-id is required for proof mode');

    // Auto-detect manifest fetch URL from XMP if not provided
    let resolvedFetchUrl = manifestFetchUrlArg;
    if (!resolvedFetchUrl) {
      const xmpUrl = extractProvenanceUrl(imageBuffer);
      if (xmpUrl) {
        resolvedFetchUrl = xmpUrl;
        console.log(`  Auto-detected manifest URL from XMP: ${xmpUrl}`);
      } else {
        fail('--manifest-fetch-url is required (or use an image with dcterms:provenance in XMP)');
      }
    }

    log('2/5', 'Creating proof-locator record');
    console.log(`  Fetch URL: ${resolvedFetchUrl}`);
    console.log(`  Manifest ID: ${manifestIdArg}`);

    const proofResult = await proofAndPrepare({
      imageBuffer,
      manifestFetchUrl: resolvedFetchUrl,
      manifestId: manifestIdArg,
      manifestRepoUrl,
      manifestStoreHash: manifestStoreHashArg,
      fetchAndVerifyManifest: !manifestStoreHashArg,
      claimGenerator: 'turbo-c2pa-demo/0.1.0',
    });

    uploadBuffer = proofResult.proofPayload;
    tags = proofResult.tags;
    manifestId = proofResult.manifestId;
    assetHash = proofResult.assetHash;
    manifestStoreHash = proofResult.manifestStoreHash;
    contentType = proofResult.contentType;
    pHashHex = proofResult.pHashHex;

    console.log(`  Content type:     ${contentType}`);
    console.log(`  Asset content:    ${proofResult.assetContentType}`);
    console.log(`  Manifest ID:      ${manifestId}`);
    console.log(`  Fetch URL:        ${proofResult.manifestFetchUrl}`);
    console.log(`  Store hash:       ${manifestStoreHash.slice(0, 20)}...`);
    console.log(`  pHash:            ${pHashHex}`);
    console.log(`  Payload size:     ${uploadBuffer.length} bytes`);

    log('3/5', 'Skipping signing — proof-locator points to remote manifest');
  } else if (isManifestMode) {
    // ===== MANIFEST MODE =====
    log('2/5', 'Connecting to sidecar');
    try {
      const healthRes = await fetch(`${sidecarUrl}/health`);
      if (!healthRes.ok) fail(`Sidecar health check failed: ${healthRes.status}`);
      console.log(`  Sidecar healthy at ${sidecarUrl}`);
    } catch (err) {
      fail(`Cannot reach sidecar at ${sidecarUrl}: ${(err as Error).message}`);
    }

    const digitalSourceType = sourceTypeArg ? resolveSourceType(sourceTypeArg) : undefined;

    log('3/5', 'Signing image and extracting manifest bytes');
    if (digitalSourceType) {
      console.log(`  Source type: ${digitalSourceType}`);
    } else {
      console.log('  WARNING: No --source-type provided. digitalSourceType will be omitted.');
    }

    const remoteSigner = new RemoteSigner(sidecarUrl);

    const manifestResult = await signManifestAndPrepare({
      imageBuffer,
      remoteSigner,
      manifestRepoUrl,
      claimGenerator: 'turbo-c2pa-demo/0.1.0',
      trustAnchorPem,
      ethPrivateKey,
      includeIdentity,
      digitalSourceType,
    });

    uploadBuffer = manifestResult.manifestBytes;
    tags = manifestResult.tags;
    manifestId = manifestResult.manifestId;
    assetHash = manifestResult.assetHash;
    manifestStoreHash = manifestResult.manifestStoreHash;
    contentType = manifestResult.contentType;
    pHashHex = manifestResult.pHashHex;

    console.log(`  Content type:     ${contentType}`);
    console.log(`  Asset content:    ${manifestResult.assetContentType}`);
    console.log(`  Manifest ID:      ${manifestId}`);
    console.log(`  Asset hash:       ${assetHash.slice(0, 20)}...`);
    console.log(`  Store hash:       ${manifestStoreHash.slice(0, 20)}...`);
    console.log(`  pHash:            ${pHashHex}`);
    console.log(`  Manifest size:    ${uploadBuffer.length.toLocaleString()} bytes`);
  } else if (isStoreMode) {
    // ===== STORE MODE =====
    log('2/5', 'Validating existing C2PA manifest');

    const storeResult = await storeAndPrepare({
      imageBuffer,
      manifestRepoUrl,
      claimGenerator: 'turbo-c2pa-demo/0.1.0',
      // Default: false (store manifests regardless of trust status).
      // --allow-invalid is now only relevant if someone sets requireValidSignature: true.
      requireValidSignature: allowInvalid ? false : undefined,
      trustAnchorPem,
    });

    uploadBuffer = storeResult.imageBuffer;
    tags = storeResult.tags;
    manifestId = storeResult.manifestId;
    assetHash = storeResult.assetHash;
    manifestStoreHash = storeResult.manifestStoreHash;
    contentType = storeResult.contentType;
    pHashHex = storeResult.pHashHex;

    console.log(`  Content type:       ${contentType}`);
    console.log(`  Manifest ID:        ${manifestId}`);
    console.log(`  Existing generator: ${storeResult.existingClaimGenerator || 'unknown'}`);
    console.log(`  Validation:         ${storeResult.validation.valid ? 'VALID' : 'INVALID'}`);
    if (!storeResult.validation.valid) {
      console.log(`  Validation errors:  ${storeResult.validation.errors.join(', ')}`);
    }
    console.log(`  Asset hash:         ${assetHash.slice(0, 20)}...`);
    console.log(`  pHash:              ${pHashHex}`);

    log('3/5', 'Skipping signing — preserving existing manifest');
  } else {
    // ===== SIGN MODE =====
    log('2/5', 'Connecting to sidecar');
    try {
      const healthRes = await fetch(`${sidecarUrl}/health`);
      if (!healthRes.ok) fail(`Sidecar health check failed: ${healthRes.status}`);
      console.log(`  Sidecar healthy at ${sidecarUrl}`);
    } catch (err) {
      fail(`Cannot reach sidecar at ${sidecarUrl}: ${(err as Error).message}`);
    }

    const digitalSourceType = sourceTypeArg ? resolveSourceType(sourceTypeArg) : undefined;

    log(
      '3/5',
      `Signing image with C2PA credentials${includeIdentity ? ' + identity assertion' : ''}`
    );
    if (digitalSourceType) {
      console.log(`  Source type: ${digitalSourceType}`);
    } else {
      console.log('  WARNING: No --source-type provided. digitalSourceType will be omitted.');
      console.log(
        '           This is non-compliant with C2PA spec. Use --source-type for production.'
      );
    }

    const remoteSigner = new RemoteSigner(sidecarUrl);

    const signResult = await signAndPrepare({
      imageBuffer,
      remoteSigner,
      manifestRepoUrl,
      claimGenerator: 'turbo-c2pa-demo/0.1.0',
      trustAnchorPem,
      ethPrivateKey,
      includeIdentity,
      digitalSourceType,
    });

    uploadBuffer = signResult.signedBuffer;
    tags = signResult.tags;
    manifestId = signResult.manifestId;
    assetHash = signResult.assetHash;
    manifestStoreHash = signResult.manifestStoreHash;
    contentType = signResult.contentType;
    pHashHex = signResult.pHashHex;

    console.log(`  Content type:   ${contentType}`);
    console.log(`  Manifest ID:    ${manifestId}`);
    console.log(`  Asset hash:     ${assetHash.slice(0, 20)}...`);
    console.log(`  Store hash:     ${manifestStoreHash.slice(0, 20)}...`);
    console.log(`  pHash:          ${pHashHex}`);
    console.log(`  Signed size:    ${uploadBuffer.length.toLocaleString()} bytes`);
    console.log(
      `  Size increase:  +${(uploadBuffer.length - imageBuffer.length).toLocaleString()} bytes (manifest)`
    );

    // Save signed image locally
    const signedPath = resolvedPath.replace(/(\.\w+)$/, '.signed$1');
    fs.writeFileSync(signedPath, uploadBuffer);
    console.log(`  Saved locally:  ${signedPath}`);
  }

  // 4. Upload to Arweave
  log('4/5', 'Uploading to Arweave via Turbo SDK');
  console.log(`  Tags: ${tags.length} ANS-104 tags`);

  const uploadResult = await uploadToArweave({
    dataBuffer: uploadBuffer,
    tags,
    ethPrivateKey,
    gatewayUrl,
    uploadServiceUrl,
  });

  console.log(`  TX ID:    ${uploadResult.txId}`);
  console.log(`  View URL: ${uploadResult.viewUrl}`);
  console.log(`  Owner:    ${uploadResult.owner}`);

  // 5. Summary
  log('5/5', 'Done!');
  const modeMessages: Record<string, string> = {
    SIGN: 'signed with C2PA credentials and uploaded',
    STORE: 'stored with its existing C2PA manifest',
    MANIFEST: 'signed and its manifest uploaded separately',
    PROOF: 'registered as a proof-locator pointing to a remote manifest',
  };
  console.log(`
  The image has been ${modeMessages[mode]} to Arweave.

  View the image:
    ${uploadResult.viewUrl}

  Verify C2PA credentials:
    https://contentcredentials.org/verify
    (download the image from the gateway URL and upload it to verify)

  Arweave TX ID: ${uploadResult.txId}
  Manifest ID:   ${manifestId}

  Tags uploaded:
${tags.map((t) => `    ${t.name}: ${t.value}`).join('\n')}

  Once the gateway indexes this transaction, query the SBR API:
    curl '${manifestRepoUrl}/matches/byBinding?alg=org.ar-io.phash&value=${encodeURIComponent(tags.find((t) => t.name === 'C2PA-Soft-Binding-Value')?.value || '')}'
`);
}

main().catch((err) => {
  console.error('\nDemo failed:', err);
  process.exit(1);
});
