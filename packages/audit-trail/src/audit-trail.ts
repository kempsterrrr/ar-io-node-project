import { AgenticWay } from '@agenticway/sdk';
import { randomUUID } from 'node:crypto';
import { BatchManager } from './batcher/batch-manager.js';
import { executeFlushBatch } from './operations/flush-batch.js';
import { executeVerifyEntry } from './operations/verify-entry.js';
import { executeQueryLogs } from './operations/query-logs.js';
import type {
  AuditTrailConfig,
  AuditLogEntry,
  LogEventOptions,
  FlushResult,
  VerifyEntryOptions,
  VerifyEntryResult,
  QueryLogsOptions,
  QueryLogsResult,
  AuditAdapter,
} from './types.js';

/**
 * Tamper-evident activity logging for AI agents.
 *
 * Collects agent activity events into batches, builds Merkle trees,
 * and anchors batch roots to Arweave for permanent, verifiable audit trails.
 */
export class AuditTrail implements AuditAdapter {
  private sdk: AgenticWay;
  private batcher: BatchManager;
  private agentId: string;
  private sessionId: string | undefined;
  private lastFlushResult: FlushResult | null = null;

  constructor(config: AuditTrailConfig) {
    this.sdk = new AgenticWay({
      gatewayUrl: config.gatewayUrl,
      turboWallet: config.turboWallet,
    });
    this.agentId = config.agentId;
    this.sessionId = config.sessionId;

    this.batcher = new BatchManager(config.batch, async (entries) => {
      this.lastFlushResult = await executeFlushBatch(this.sdk, entries);
    });
  }

  /**
   * Log an agent activity event.
   * The entry is added to the current batch and auto-flushed per config.
   * Returns the generated entry ID.
   */
  async log(options: LogEventOptions): Promise<string> {
    const entry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      agentId: options.agentId ?? this.agentId,
      sessionId: options.sessionId ?? this.sessionId,
      eventType: options.eventType,
      action: options.action,
      input: options.input,
      output: options.output,
      metadata: options.metadata,
      parentEventId: options.parentEventId,
    };

    this.batcher.add(entry);
    return entry.id;
  }

  /** AuditAdapter interface implementation. */
  async onEvent(event: LogEventOptions): Promise<string> {
    return this.log(event);
  }

  /** Manually flush all pending entries to Arweave. */
  async flush(): Promise<FlushResult | null> {
    await this.batcher.flush();
    return this.lastFlushResult;
  }

  /** Verify a single log entry against its Arweave-anchored batch. */
  async verifyEntry(options: VerifyEntryOptions): Promise<VerifyEntryResult> {
    return executeVerifyEntry(this.sdk, options);
  }

  /** Query anchored audit log batches from Arweave. */
  async queryLogs(options?: QueryLogsOptions): Promise<QueryLogsResult> {
    return executeQueryLogs(this.sdk, options);
  }

  /** Number of entries pending in the current batch. */
  get pending(): number {
    return this.batcher.pending;
  }

  /** Result of the most recent flush, or null if never flushed. */
  get lastFlush(): FlushResult | null {
    return this.lastFlushResult;
  }

  /** Stop timers and release resources. Call flush() first if you want to persist pending entries. */
  destroy(): void {
    this.batcher.destroy();
  }
}
