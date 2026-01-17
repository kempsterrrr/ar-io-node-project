/**
 * ArNS (Arweave Name System) service for undername management.
 *
 * Handles registration and management of ArNS undernames for
 * storing C2PA manifests with human-readable URLs.
 *
 * Uses @ar.io/sdk for ANT (Arweave Name Token) operations.
 */

import {
  ANT,
  ARIO,
  ARIO_TESTNET_PROCESS_ID,
  ARIO_MAINNET_PROCESS_ID,
  ArweaveSigner,
  AoSigner,
} from '@ar.io/sdk';
import Arweave from 'arweave';
import { v4 as uuidv4 } from 'uuid';
import { config, isArnsTestnet } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Result of registering an undername
 */
export interface UndernameResult {
  /** The undername created (e.g., "th-a3f2b1c4") */
  undername: string;
  /** Full ArNS URL (e.g., "https://th-a3f2b1c4_mygateway.arweave.net") */
  fullUrl: string;
  /** Transaction ID of the undername registration */
  registrationTxId?: string;
  /** Whether the registration is pending confirmation */
  pending: boolean;
}

/**
 * Options for creating an undername
 */
export interface CreateUndernameOptions {
  /** Transaction ID the undername should point to */
  transactionId: string;
  /** TTL in seconds (default: 3600 = 1 hour) */
  ttlSeconds?: number;
  /** Optional display name for the undername */
  displayName?: string;
  /** Optional description */
  description?: string;
}

// Singleton instances (lazily initialized)
let antInstance: Awaited<ReturnType<typeof ANT.init>> | null = null;
let walletAddress: string | null = null;
let cachedProcessId: string | null = null;

/**
 * Get the ARIO process ID based on current environment.
 */
function getArioProcessId(): string {
  return isArnsTestnet() ? ARIO_TESTNET_PROCESS_ID : ARIO_MAINNET_PROCESS_ID;
}

/**
 * Look up the ANT process ID for the configured ArNS name.
 * Caches the result to avoid repeated lookups.
 */
async function getAntProcessId(): Promise<string> {
  if (cachedProcessId) {
    return cachedProcessId;
  }

  if (!config.ARNS_ROOT_NAME) {
    throw new Error('ARNS_ROOT_NAME is required for ArNS operations');
  }

  const arioProcessId = getArioProcessId();
  const network = isArnsTestnet() ? 'testnet' : 'mainnet';

  logger.info(
    {
      arnsName: config.ARNS_ROOT_NAME,
      network,
      arioProcessId,
    },
    'Looking up ANT process ID from ArNS registry'
  );

  try {
    const ario = ARIO.init({
      processId: arioProcessId,
    });

    const record = await ario.getArNSRecord({ name: config.ARNS_ROOT_NAME });

    if (!record || !record.processId) {
      throw new Error(`ArNS name not found: ${config.ARNS_ROOT_NAME}`);
    }

    cachedProcessId = record.processId;

    logger.info(
      {
        arnsName: config.ARNS_ROOT_NAME,
        processId: cachedProcessId,
        network,
      },
      'ANT process ID resolved'
    );

    return cachedProcessId;
  } catch (error) {
    logger.error({ error, arnsName: config.ARNS_ROOT_NAME }, 'Failed to look up ArNS record');
    throw new Error(`Failed to look up ArNS name: ${(error as Error).message}`);
  }
}

/**
 * Initialize the ANT instance with signer from wallet file.
 * Lazily loaded on first use.
 */
async function getANT(): Promise<Awaited<ReturnType<typeof ANT.init>>> {
  if (antInstance) {
    return antInstance;
  }

  // Dynamically look up the ANT process ID from the ArNS name
  const processId = await getAntProcessId();

  try {
    // Load wallet from file
    const walletFile = Bun.file(config.ARWEAVE_WALLET_FILE);
    if (!(await walletFile.exists())) {
      throw new Error(`Wallet file not found: ${config.ARWEAVE_WALLET_FILE}`);
    }

    const jwk = await walletFile.json();

    // Get wallet address for ownership
    const arweave = Arweave.init({});
    walletAddress = await arweave.wallets.jwkToAddress(jwk);

    // Create signer
    const signer = new ArweaveSigner(jwk);

    // Initialize ANT with the dynamically resolved process ID
    antInstance = ANT.init({
      signer: signer as AoSigner,
      processId,
    });

    logger.info(
      {
        processId,
        walletAddress,
        network: isArnsTestnet() ? 'testnet' : 'mainnet',
      },
      'ANT instance initialized'
    );

    return antInstance;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize ANT instance');
    throw new Error(`ANT initialization failed: ${(error as Error).message}`);
  }
}

/**
 * Get the wallet address used for ArNS operations.
 */
export async function getWalletAddress(): Promise<string> {
  if (!walletAddress) {
    // Try to get address from ANT if ArNS is configured
    if (config.ARNS_ROOT_NAME) {
      await getANT();
    } else {
      // Load wallet address directly without ArNS
      try {
        const walletFile = Bun.file(config.ARWEAVE_WALLET_FILE);
        if (await walletFile.exists()) {
          const jwk = await walletFile.json();
          const arweave = Arweave.init({});
          walletAddress = await arweave.wallets.jwkToAddress(jwk);
          logger.debug({ walletAddress }, 'Loaded wallet address directly');
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to load wallet address');
      }
    }
  }
  if (!walletAddress) {
    throw new Error('Wallet address not available');
  }
  return walletAddress;
}

/**
 * Generate a unique undername for a provenance manifest.
 * Format: "th-{short-uuid}"
 */
export function generateUndername(): string {
  const uuid = uuidv4();
  const shortId = uuid.split('-')[0]; // First segment of UUID (8 chars)
  return `th-${shortId}`;
}

/**
 * Build the full ArNS URL for an undername.
 *
 * @param undername - The undername (e.g., "th-a3f2b1c4")
 * @returns Full URL (e.g., "https://th-a3f2b1c4_mygateway.arweave.net")
 */
export function buildArnsUrl(undername: string): string {
  if (!config.ARNS_ROOT_NAME) {
    throw new Error('ARNS_ROOT_NAME is required to build ArNS URLs');
  }

  // ArNS undernames use underscore separator
  // Format: {undername}_{rootname}.arweave.net
  return `https://${undername}_${config.ARNS_ROOT_NAME}.arweave.net`;
}

/**
 * Create and register a new undername pointing to a transaction.
 *
 * @param options - Undername creation options
 * @returns Registration result with undername and full URL
 */
export async function createUndername(options: CreateUndernameOptions): Promise<UndernameResult> {
  const { transactionId, ttlSeconds = 3600, displayName, description } = options;

  const undername = generateUndername();
  const fullUrl = buildArnsUrl(undername);

  logger.info(
    {
      undername,
      transactionId,
      ttlSeconds,
    },
    'Creating ArNS undername'
  );

  try {
    const ant = await getANT();
    const owner = await getWalletAddress();

    // Register the undername with the ANT
    const result = await ant.setUndernameRecord({
      undername,
      transactionId,
      ttlSeconds,
      owner,
      displayName: displayName || `Provenance: ${undername}`,
      description: description || 'C2PA manifest for image provenance',
    });

    logger.info(
      {
        undername,
        fullUrl,
        txId: result.id,
      },
      'ArNS undername registered'
    );

    return {
      undername,
      fullUrl,
      registrationTxId: result.id,
      pending: false,
    };
  } catch (error) {
    logger.error({ error, undername }, 'Failed to register ArNS undername');

    // Return as pending - the undername was generated but not registered
    return {
      undername,
      fullUrl,
      pending: true,
    };
  }
}

/**
 * Update an existing undername to point to a new transaction.
 *
 * @param undername - The undername to update
 * @param transactionId - New transaction ID to point to
 * @param ttlSeconds - New TTL (optional, default: 3600)
 * @returns Update result
 */
export async function updateUndername(
  undername: string,
  transactionId: string,
  ttlSeconds = 3600
): Promise<{ success: boolean; txId?: string; error?: string }> {
  logger.info({ undername, transactionId }, 'Updating ArNS undername');

  try {
    const ant = await getANT();
    const owner = await getWalletAddress();

    const result = await ant.setUndernameRecord({
      undername,
      transactionId,
      ttlSeconds,
      owner,
    });

    logger.info({ undername, txId: result.id }, 'ArNS undername updated');

    return {
      success: true,
      txId: result.id,
    };
  } catch (error) {
    logger.error({ error, undername }, 'Failed to update ArNS undername');
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get the record for an undername.
 *
 * @param undername - The undername to look up
 * @returns Record data or null if not found
 */
export async function getUndernameRecord(
  undername: string
): Promise<{ transactionId: string; ttlSeconds: number } | null> {
  try {
    const ant = await getANT();
    const record = await ant.getRecord({ undername });

    if (record) {
      return {
        transactionId: record.transactionId,
        ttlSeconds: record.ttlSeconds,
      };
    }

    return null;
  } catch (error) {
    logger.debug({ error, undername }, 'Failed to get undername record');
    return null;
  }
}

/**
 * Check if the ArNS service is configured and ready.
 */
export function isArnsConfigured(): boolean {
  return !!config.ARNS_ROOT_NAME;
}

/**
 * Get ArNS configuration status for health checks.
 */
export function getArnsStatus(): {
  configured: boolean;
  rootName?: string;
  network: 'testnet' | 'mainnet';
  processId?: string;
} {
  return {
    configured: isArnsConfigured(),
    rootName: config.ARNS_ROOT_NAME,
    network: isArnsTestnet() ? 'testnet' : 'mainnet',
    processId: cachedProcessId || undefined,
  };
}

/**
 * Parse an ArNS URL to extract components.
 *
 * @param url - Full ArNS URL
 * @returns Parsed components or null if invalid
 */
export function parseArnsUrl(url: string): {
  undername: string;
  rootName: string;
} | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Format: {undername}_{rootname}.arweave.net
    const match = hostname.match(/^([^_]+)_([^.]+)\.arweave\.net$/);
    if (match) {
      return {
        undername: match[1],
        rootName: match[2],
      };
    }

    return null;
  } catch {
    return null;
  }
}
