/**
 * Run the manual SDK test suite against production.
 *
 * Loads credentials from local .env files and sets production defaults.
 * Any env var can be overridden from the shell:
 *
 *   pnpm test:production
 *   SKIP_FANOUT=true pnpm test:production
 *   GATEWAY_URL=http://localhost:3000 pnpm test:production
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Parse .env files (simple key=value, ignores comments and empty lines)
// ---------------------------------------------------------------------------

function parseEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const vars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      vars[key] = val;
    }
    return vars;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Load from .env files (lower priority → higher priority → shell env wins)
// ---------------------------------------------------------------------------

const turboC2paEnv = parseEnv(resolve(root, 'packages/turbo-c2pa/.env'));
const gatewayEnv = parseEnv(resolve(root, 'apps/gateway/.env'));

// Production defaults
const defaults = {
  GATEWAY_URL: 'https://ario.agenticway.io',
  TRUSTHASH_URL: 'https://ario.agenticway.io/trusthash',
};

// Merge: defaults < .env files < shell env
const merged = {
  ...defaults,
  ETH_PRIVATE_KEY: turboC2paEnv.ETH_PRIVATE_KEY,
  ADMIN_API_KEY: gatewayEnv.ADMIN_API_KEY,
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) =>
        ['ETH_PRIVATE_KEY', 'ADMIN_API_KEY', 'GATEWAY_URL', 'TRUSTHASH_URL', 'SKIP_FANOUT'].includes(k)
    )
  ),
};

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

if (!merged.ETH_PRIVATE_KEY) {
  console.error('ERROR: ETH_PRIVATE_KEY not found in packages/turbo-c2pa/.env or shell env');
  process.exit(1);
}

if (!merged.ADMIN_API_KEY) {
  console.error('ERROR: ADMIN_API_KEY not found in apps/gateway/.env or shell env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('Production Test Runner');
console.log(`  Gateway:    ${merged.GATEWAY_URL}`);
console.log(`  Trusthash:  ${merged.TRUSTHASH_URL}`);
console.log(`  Admin key:  ${'*'.repeat(Math.min(merged.ADMIN_API_KEY.length, 20))}`);
console.log(`  Fan-out:    ${merged.SKIP_FANOUT === 'true' ? 'skipped' : 'enabled'}`);
console.log();

try {
  execSync('pnpm exec tsx scripts/test-sdk-manual.ts', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...merged },
  });
} catch {
  process.exit(1);
}
