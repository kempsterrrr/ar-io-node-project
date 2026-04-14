/**
 * Extract C2PA manifest info from an image file.
 * Usage: pnpm exec tsx scripts/extract-c2pa-info.ts <image-path>
 */

import { Reader, createVerifySettings, settingsToJson } from '@contentauth/c2pa-node';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: pnpm exec tsx scripts/extract-c2pa-info.ts <image-path>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(imagePath);
  const buf = fs.readFileSync(resolvedPath);
  console.log(`Reading C2PA from: ${resolvedPath} (${buf.length} bytes)`);

  const settings = createVerifySettings({ verifyAfterSign: false, verifyTrust: false });
  const reader = await Reader.fromAsset(
    { buffer: buf, mimeType: 'image/jpeg' },
    settingsToJson(settings)
  );

  const raw = typeof reader.json === 'function' ? reader.json() : reader.json;
  const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
  console.log('\n=== C2PA Manifest Info ===');
  console.log('Active manifest:', json.active_manifest);
  console.log('Manifest count:', Object.keys(json.manifests || {}).length);

  const activeManifest = json.manifests?.[json.active_manifest];
  if (activeManifest) {
    console.log('\n--- Active Manifest ---');
    console.log('Claim generator:', activeManifest.claim_generator);
    console.log('Title:', activeManifest.title);
    console.log(
      'Assertions:',
      activeManifest.assertions?.map((a: { label: string }) => a.label)
    );

    // Look for any URL references in the manifest
    console.log('\n--- Full manifest JSON ---');
    console.log(JSON.stringify(json, null, 2));
  } else {
    console.log('No active manifest found');
    console.log(JSON.stringify(json, null, 2));
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
