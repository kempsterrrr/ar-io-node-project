/**
 * C2PA Signer Service
 *
 * Provides cryptographic signing functionality for C2PA manifests
 * using the @contentauth/c2pa-node LocalSigner.
 *
 * Supports:
 * - ES256 (ECDSA P-256) signing
 * - X.509 certificate chains
 * - Optional timestamp authority (TSA) integration
 */

import { LocalSigner, type Signer } from '@contentauth/c2pa-node';
import { readFile } from 'fs/promises';
import { access, constants } from 'fs/promises';
import { dirname, resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// Get package root directory for resolving relative paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '../..');

/**
 * Signer configuration
 */
export interface SignerConfig {
  /** Path to X.509 certificate file (PEM format) */
  certPath: string;
  /** Path to private key file (PEM format) */
  keyPath: string;
  /** Signing algorithm (default: es256) */
  algorithm?: 'es256' | 'es384' | 'es512' | 'ps256' | 'ps384' | 'ps512';
  /** Optional timestamp authority URL */
  tsaUrl?: string;
}

/**
 * Signer status information
 */
export interface SignerStatus {
  /** Whether the signer is configured and ready */
  configured: boolean;
  /** Certificate file path */
  certPath: string;
  /** Whether certificate file exists */
  certExists: boolean;
  /** Whether key file exists */
  keyExists: boolean;
  /** Algorithm being used */
  algorithm: string;
  /** Whether TSA is configured */
  hasTsa: boolean;
  /** Error message if not configured */
  error?: string;
}

// Singleton signer instance (lazily initialized)
let cachedSigner: Signer | null = null;
let signerConfig: SignerConfig | null = null;

/**
 * Check if a file exists and is readable.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a path relative to package root if not absolute.
 */
function resolvePath(path: string): string {
  if (isAbsolute(path)) {
    return path;
  }
  // Strip leading ./ if present and resolve relative to package root
  const cleanPath = path.replace(/^\.\//, '');
  return resolve(PACKAGE_ROOT, cleanPath);
}

/**
 * Get the signer configuration from environment.
 */
export function getSignerConfig(): SignerConfig {
  return {
    certPath: resolvePath(config.C2PA_CERT_PATH),
    keyPath: resolvePath(config.C2PA_KEY_PATH),
    algorithm: 'es256',
    tsaUrl: config.C2PA_TSA_URL,
  };
}

/**
 * Check signer status without creating the signer.
 */
export async function getSignerStatus(): Promise<SignerStatus> {
  const cfg = getSignerConfig();

  const [certExists, keyExists] = await Promise.all([
    fileExists(cfg.certPath),
    fileExists(cfg.keyPath),
  ]);

  const configured = certExists && keyExists;

  return {
    configured,
    certPath: cfg.certPath,
    certExists,
    keyExists,
    algorithm: cfg.algorithm || 'es256',
    hasTsa: !!cfg.tsaUrl,
    error: configured
      ? undefined
      : `Missing files: ${!certExists ? cfg.certPath : ''} ${!keyExists ? cfg.keyPath : ''}`.trim(),
  };
}

/**
 * Initialize the C2PA signer with configuration.
 *
 * Uses LocalSigner from @contentauth/c2pa-node with:
 * - X.509 certificate (PEM format)
 * - Private key (PEM format)
 * - ES256 algorithm (ECDSA P-256)
 * - Optional timestamp authority
 *
 * @throws Error if certificate or key files are missing
 */
export async function initializeSigner(): Promise<Signer> {
  const cfg = getSignerConfig();

  // Check if files exist
  const status = await getSignerStatus();
  if (!status.configured) {
    throw new Error(
      `Signer not configured: ${status.error}. ` +
        `Generate certificates with: openssl ecparam -name prime256v1 -genkey -noout -out ${cfg.keyPath} && ` +
        `openssl req -new -x509 -key ${cfg.keyPath} -out ${cfg.certPath} -days 365 -subj "/CN=Trusthash Development/O=AR.IO/C=US"`
    );
  }

  try {
    // Load certificate and key files
    const [certificate, privateKey] = await Promise.all([
      readFile(cfg.certPath),
      readFile(cfg.keyPath),
    ]);

    logger.info(
      {
        certPath: cfg.certPath,
        algorithm: cfg.algorithm,
        hasTsa: !!cfg.tsaUrl,
      },
      'Initializing C2PA signer'
    );

    // Create LocalSigner
    const signer = LocalSigner.newSigner(
      certificate,
      privateKey,
      cfg.algorithm || 'es256',
      cfg.tsaUrl
    );

    signerConfig = cfg;
    cachedSigner = signer;

    logger.info('C2PA signer initialized successfully');

    return signer;
  } catch (error) {
    logger.error(
      { error, certPath: cfg.certPath, keyPath: cfg.keyPath },
      'Failed to create signer'
    );
    throw new Error(`Failed to initialize signer: ${(error as Error).message}`);
  }
}

/**
 * Get the cached signer instance, initializing if needed.
 */
export async function getSigner(): Promise<Signer> {
  if (cachedSigner) {
    return cachedSigner;
  }

  return initializeSigner();
}

/**
 * Reset the cached signer (useful for testing or reconfiguration).
 */
export function resetSigner(): void {
  cachedSigner = null;
  signerConfig = null;
}

/**
 * Check if the signer is ready to use.
 */
export async function isSignerReady(): Promise<boolean> {
  const status = await getSignerStatus();
  return status.configured;
}
