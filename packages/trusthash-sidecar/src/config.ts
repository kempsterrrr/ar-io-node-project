import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3003),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  DUCKDB_PATH: z.string().default('./data/provenance.duckdb'),

  // Gateway
  GATEWAY_URL: z.string().url().default('http://localhost:3000'),

  // Turbo
  TURBO_GATEWAY_URL: z.string().url().default('https://turbo.ardrive.io'),

  // Wallet
  ARWEAVE_WALLET_FILE: z.string().default('./wallets/arweave-wallet.json'),

  // ArNS
  ARNS_ROOT_NAME: z.string().optional(),
  // Auto-purchase undername capacity when running low
  ARNS_AUTO_PURCHASE_CAPACITY: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  // Number of undernames to purchase at a time
  ARNS_CAPACITY_PURCHASE_QTY: z.coerce.number().min(1).max(1000).default(100),
  // Threshold to trigger auto-purchase (purchase when available < threshold)
  ARNS_CAPACITY_THRESHOLD: z.coerce.number().min(1).default(10),

  // Image Processing
  MAX_IMAGE_SIZE_MB: z.coerce.number().default(50),
  THUMBNAIL_WIDTH: z.coerce.number().default(400),
  THUMBNAIL_QUALITY: z.coerce.number().min(1).max(100).default(80),

  // C2PA
  C2PA_CERT_PATH: z.string().default('./certs/certificate.pem'),
  C2PA_KEY_PATH: z.string().default('./certs/private-key.pem'),
  C2PA_TSA_URL: z.string().url().optional(), // Optional timestamp authority URL
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

/**
 * Determine if we're using ArNS testnet based on environment.
 * - development/test → testnet
 * - production → mainnet
 */
export function isArnsTestnet(): boolean {
  return config.NODE_ENV !== 'production';
}
