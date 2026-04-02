// Main class
export { AuditTrail } from './audit-trail.js';

// Types
export type {
  AgentEventType,
  AuditLogEntry,
  AuditTrailConfig,
  BatchConfig,
  LogEventOptions,
  FlushResult,
  EntryProof,
  VerifyEntryOptions,
  VerifyEntryResult,
  QueryLogsOptions,
  QueryLogsResult,
  AuditLogEdge,
  AuditAdapter,
} from './types.js';

// Tag constants
export { TAG_NAMES, TAG_VALUES } from './tags.js';

// Schema
export { EVENT_TYPE_LABELS, VALID_EVENT_TYPES, isValidEventType } from './schema/index.js';

// Operations (for advanced/direct use)
export { serializeEntry } from './operations/index.js';

// Framework adapters
export { createVercelAiAdapter } from './adapters/vercel-ai.js';
export type { VercelToolCallEvent, VercelToolResultEvent } from './adapters/vercel-ai.js';
export { createLangChainAdapter } from './adapters/langchain.js';
export type { LangChainChainEvent, LangChainToolEvent } from './adapters/langchain.js';
