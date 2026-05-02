import type { AuditLogEntry, BatchConfig } from '../types.js';

/** Resolved batch configuration with all defaults applied. */
interface ResolvedBatchConfig {
  maxEntries: number;
  maxIntervalMs: number;
  autoFlush: boolean;
}

const DEFAULTS: ResolvedBatchConfig = {
  maxEntries: 100,
  maxIntervalMs: 300_000, // 5 minutes
  autoFlush: true,
};

/**
 * Manages batching of audit log entries with configurable time-based
 * and count-based flush triggers.
 */
export class BatchManager {
  private entries: AuditLogEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private config: ResolvedBatchConfig;
  private onFlush: (entries: AuditLogEntry[]) => Promise<void>;
  private flushing = false;

  constructor(
    config: BatchConfig | undefined,
    onFlush: (entries: AuditLogEntry[]) => Promise<void>
  ) {
    this.config = {
      maxEntries: config?.maxEntries ?? DEFAULTS.maxEntries,
      maxIntervalMs: config?.maxIntervalMs ?? DEFAULTS.maxIntervalMs,
      autoFlush: config?.autoFlush ?? DEFAULTS.autoFlush,
    };
    this.onFlush = onFlush;
  }

  /** Add an entry to the current batch. Auto-flushes when thresholds are met. */
  add(entry: AuditLogEntry): void {
    this.entries.push(entry);

    if (this.config.autoFlush) {
      // Start interval timer on first entry
      if (this.entries.length === 1) {
        this.startTimer();
      }

      // Count-based flush
      if (this.entries.length >= this.config.maxEntries) {
        void this.flush();
      }
    }
  }

  /** Flush all pending entries. Returns without error if empty. */
  async flush(): Promise<void> {
    if (this.entries.length === 0 || this.flushing) return;

    this.flushing = true;
    this.clearTimer();

    const batch = this.entries.slice();
    this.entries = [];

    try {
      await this.onFlush(batch);
    } finally {
      this.flushing = false;
    }
  }

  /** Number of entries currently pending. */
  get pending(): number {
    return this.entries.length;
  }

  /** Stop timers and release resources. Does NOT flush pending entries. */
  destroy(): void {
    this.clearTimer();
    this.entries = [];
  }

  private startTimer(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.config.maxIntervalMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
