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

/**
 * Undername capacity information
 */
export interface UndernameCapacity {
  /** Maximum undernames allowed for this ArNS name */
  limit: number;
  /** Current number of undernames in use */
  used: number;
  /** Available slots remaining */
  available: number;
  /** Whether capacity is available */
  hasCapacity: boolean;
}

// Singleton instances (lazily initialized)
let antInstance: Awaited<ReturnType<typeof ANT.init>> | null = null;
let walletAddress: string | null = null;
let cachedProcessId: string | null = null;
let cachedUndernameLimit: number | null = null;

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

    // Also cache the undername limit from the record
    if (typeof record.undernameLimit === 'number') {
      cachedUndernameLimit = record.undernameLimit;
      logger.debug(
        { undernameLimit: cachedUndernameLimit },
        'Cached undername limit from ArNS record'
      );
    }

    return cachedProcessId;
  } catch (error) {
    logger.error({ error, arnsName: config.ARNS_ROOT_NAME }, 'Failed to look up ArNS record');
    throw new Error(`Failed to look up ArNS name: ${(error as Error).message}`);
  }
}

/**
 * Get the undername capacity for the configured ArNS name.
 *
 * Checks the ArNS record for the undername limit and compares
 * against the current number of registered undernames.
 *
 * @returns Capacity information including limit, used, and available slots
 */
export async function getUndernameCapacity(): Promise<UndernameCapacity> {
  if (!config.ARNS_ROOT_NAME) {
    throw new Error('ARNS_ROOT_NAME is required for capacity check');
  }

  try {
    // Ensure we have the ANT initialized (which also caches the limit)
    const ant = await getANT();

    // Get the undername limit (from cache or fetch fresh)
    let limit = cachedUndernameLimit;
    if (limit === null) {
      // Fetch fresh from ARIO if not cached
      const arioProcessId = getArioProcessId();
      const ario = ARIO.init({ processId: arioProcessId });
      const record = await ario.getArNSRecord({ name: config.ARNS_ROOT_NAME });

      if (!record) {
        throw new Error(`ArNS name not found: ${config.ARNS_ROOT_NAME}`);
      }

      limit = typeof record.undernameLimit === 'number' ? record.undernameLimit : 10;
      cachedUndernameLimit = limit;
    }

    // Get current records from the ANT
    const records = await ant.getRecords();

    // Count undernames (exclude the base '@' record)
    const recordEntries = Object.entries(records);
    const undernameCount = recordEntries.filter(([key]) => key !== '@').length;

    const available = Math.max(0, limit - undernameCount);

    logger.debug(
      {
        limit,
        used: undernameCount,
        available,
        hasCapacity: available > 0,
      },
      'Checked undername capacity'
    );

    return {
      limit,
      used: undernameCount,
      available,
      hasCapacity: available > 0,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to check undername capacity');
    throw new Error(`Capacity check failed: ${(error as Error).message}`);
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
 * Result of checking capacity purchase cost
 */
export interface CapacityCostResult {
  /** Cost in mARIO (milli-ARIO tokens) */
  mARIO: number;
  /** Cost in ARIO tokens */
  ario: number;
  /** Number of undernames to purchase */
  qty: number;
}

/**
 * Result of purchasing capacity
 */
export interface CapacityPurchaseResult {
  success: boolean;
  txId?: string;
  newLimit?: number;
  error?: string;
}

/**
 * Get the cost to increase undername capacity.
 *
 * @param qty - Number of additional undernames to purchase
 * @returns Cost in mARIO and ARIO
 */
export async function getCapacityCost(qty: number): Promise<CapacityCostResult> {
  if (!config.ARNS_ROOT_NAME) {
    throw new Error('ARNS_ROOT_NAME is required for capacity cost check');
  }

  try {
    const arioProcessId = getArioProcessId();
    const ario = ARIO.init({ processId: arioProcessId });

    const cost = await ario.getTokenCost({
      intent: 'Increase-Undername-Limit',
      name: config.ARNS_ROOT_NAME,
      quantity: qty,
    });

    // Cost is returned in mARIO (milli-ARIO)
    const mARIO = Number(cost);
    const ario_tokens = mARIO / 1_000_000; // Convert to ARIO

    logger.debug(
      {
        qty,
        mARIO,
        ario: ario_tokens,
        arnsName: config.ARNS_ROOT_NAME,
      },
      'Checked undername capacity cost'
    );

    return {
      mARIO,
      ario: ario_tokens,
      qty,
    };
  } catch (error) {
    logger.error({ error, qty }, 'Failed to get capacity cost');
    throw new Error(`Failed to get capacity cost: ${(error as Error).message}`);
  }
}

/**
 * Purchase additional undername capacity for the configured ArNS name.
 *
 * Uses ARIO tokens from the configured wallet to increase the undername limit.
 *
 * @param qty - Number of additional undernames to purchase
 * @returns Purchase result with transaction ID
 */
export async function purchaseUndernameCapacity(qty: number): Promise<CapacityPurchaseResult> {
  if (!config.ARNS_ROOT_NAME) {
    throw new Error('ARNS_ROOT_NAME is required for capacity purchase');
  }

  logger.info(
    {
      qty,
      arnsName: config.ARNS_ROOT_NAME,
    },
    'Purchasing additional undername capacity'
  );

  try {
    // Load wallet and create signer
    const walletFile = Bun.file(config.ARWEAVE_WALLET_FILE);
    if (!(await walletFile.exists())) {
      throw new Error(`Wallet file not found: ${config.ARWEAVE_WALLET_FILE}`);
    }

    const jwk = await walletFile.json();
    const signer = new ArweaveSigner(jwk);

    // Initialize ARIO with signer for write operations
    const arioProcessId = getArioProcessId();
    const ario = ARIO.init({
      processId: arioProcessId,
      signer: signer as AoSigner,
    });

    // Purchase the capacity increase
    const result = await ario.increaseUndernameLimit({
      name: config.ARNS_ROOT_NAME,
      qty,
    });

    // Update cached limit
    if (cachedUndernameLimit !== null) {
      cachedUndernameLimit += qty;
    }

    logger.info(
      {
        txId: result.id,
        qty,
        newLimit: cachedUndernameLimit,
        arnsName: config.ARNS_ROOT_NAME,
      },
      'Successfully purchased undername capacity'
    );

    return {
      success: true,
      txId: result.id,
      newLimit: cachedUndernameLimit ?? undefined,
    };
  } catch (error) {
    logger.error({ error, qty }, 'Failed to purchase undername capacity');
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Ensure sufficient undername capacity, auto-purchasing if needed.
 *
 * If capacity is below the threshold and auto-purchase is enabled,
 * automatically purchases additional capacity.
 *
 * @returns The current capacity after any purchases
 */
async function ensureCapacity(): Promise<UndernameCapacity> {
  const capacity = await getUndernameCapacity();

  // Check if we need to auto-purchase
  if (capacity.available < config.ARNS_CAPACITY_THRESHOLD && config.ARNS_AUTO_PURCHASE_CAPACITY) {
    logger.warn(
      {
        available: capacity.available,
        threshold: config.ARNS_CAPACITY_THRESHOLD,
        purchaseQty: config.ARNS_CAPACITY_PURCHASE_QTY,
      },
      'Undername capacity below threshold, attempting auto-purchase'
    );

    const purchaseResult = await purchaseUndernameCapacity(config.ARNS_CAPACITY_PURCHASE_QTY);

    if (purchaseResult.success) {
      // Refresh capacity after purchase
      return await getUndernameCapacity();
    } else {
      logger.error(
        { error: purchaseResult.error },
        'Auto-purchase failed, continuing with current capacity'
      );
    }
  }

  return capacity;
}

/**
 * Create and register a new undername pointing to a transaction.
 *
 * Checks undername capacity before attempting registration.
 * If capacity is low and auto-purchase is enabled, purchases more.
 * If capacity is exhausted and purchase fails, returns an error.
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
    // Check and ensure capacity (auto-purchase if needed)
    const capacity = await ensureCapacity();

    if (!capacity.hasCapacity) {
      logger.error(
        {
          limit: capacity.limit,
          used: capacity.used,
          undername,
          autoPurchaseEnabled: config.ARNS_AUTO_PURCHASE_CAPACITY,
        },
        'ArNS undername capacity exhausted and auto-purchase failed or disabled'
      );

      throw new Error(
        `Undername capacity exhausted: ${capacity.used}/${capacity.limit} undernames in use. ` +
          (config.ARNS_AUTO_PURCHASE_CAPACITY
            ? 'Auto-purchase failed. Check wallet balance and try again.'
            : 'Enable ARNS_AUTO_PURCHASE_CAPACITY or manually purchase more capacity.')
      );
    }

    logger.debug(
      {
        available: capacity.available,
        limit: capacity.limit,
        used: capacity.used,
      },
      'Undername capacity available'
    );

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
