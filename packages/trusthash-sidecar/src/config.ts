import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3003),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  DUCKDB_PATH: z.string().default('./data/provenance.duckdb'),

  // Gateway
  GATEWAY_URL: z.string().url().default('http://localhost:3000'),

  // Image Processing
  MAX_IMAGE_SIZE_MB: z.coerce.number().default(50),

  // Reference Fetch
  REFERENCE_FETCH_TIMEOUT_MS: z.coerce.number().default(10000),
  REMOTE_MANIFEST_CACHE_TTL_MS: z.coerce.number().default(300000),
  REMOTE_MANIFEST_CACHE_MAX_ENTRIES: z.coerce.number().default(200),
  REMOTE_MANIFEST_MAX_BYTES: z.coerce.number().default(25 * 1024 * 1024),

  // Integration/Testing
  ALLOW_INSECURE_REFERENCE_URL: z.coerce.boolean().default(false),

  // Feature flags
  ENABLE_PROOF_LOCATOR_ARTIFACTS: z.coerce.boolean().default(true),
  ENABLE_BY_REFERENCE: z.coerce.boolean().default(true),

  // Signing oracle
  ENABLE_SIGNING: z.coerce.boolean().default(false),
  SIGNING_ALGORITHM: z.enum(['ES256', 'ES384']).default('ES256'),
  SIGNING_CERT_PEM: z.string().optional(),
  SIGNING_PRIVATE_KEY_PEM: z.string().optional(),
  KMS_KEY_ARN: z.string().optional(),
  KMS_REGION: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }

  const config = result.data;
  validateDockerGateway(config);
  validateSigningConfig(config);
  return config;
}

export const config = loadConfig();

function isRunningInDocker(): boolean {
  if (process.env.DOCKER || process.env.CONTAINER) {
    return true;
  }

  if (existsSync('/.dockerenv')) {
    return true;
  }

  try {
    const cgroup = readFileSync('/proc/1/cgroup', 'utf8');
    return (
      cgroup.includes('docker') || cgroup.includes('containerd') || cgroup.includes('kubepods')
    );
  } catch {
    return false;
  }
}

function isLocalhostHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower.endsWith('.localhost')
  );
}

function validateSigningConfig(config: Config): void {
  if (!config.ENABLE_SIGNING) {
    return;
  }

  if (!config.SIGNING_CERT_PEM) {
    console.error('ENABLE_SIGNING=true requires SIGNING_CERT_PEM to be set.');
    process.exit(1);
  }

  if (!config.SIGNING_PRIVATE_KEY_PEM && !config.KMS_KEY_ARN) {
    console.error(
      'ENABLE_SIGNING=true requires either SIGNING_PRIVATE_KEY_PEM (dev) or KMS_KEY_ARN (prod).'
    );
    process.exit(1);
  }
}

function validateDockerGateway(config: Config): void {
  if (!isRunningInDocker()) {
    return;
  }

  try {
    const url = new URL(config.GATEWAY_URL);
    if (isLocalhostHost(url.hostname)) {
      console.error(
        'Invalid GATEWAY_URL for Docker: localhost resolves to the container itself. ' +
          'Use the gateway service hostname (e.g. http://core:4000).'
      );
      process.exit(1);
    }
  } catch {
    console.error('Invalid GATEWAY_URL configuration.');
    process.exit(1);
  }
}
