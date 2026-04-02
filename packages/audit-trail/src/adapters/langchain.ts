import type { AuditAdapter, LogEventOptions } from '../types.js';

/**
 * LangChain audit adapter.
 *
 * Provides logging methods that map LangChain callback events
 * to audit trail entries. Use alongside LangChain's callback system.
 *
 * This adapter does NOT import LangChain directly — it works with
 * plain objects matching LangChain event shapes.
 */
export interface LangChainChainEvent {
  chainName: string;
  inputs: unknown;
  outputs?: unknown;
  runId?: string;
}

export interface LangChainToolEvent {
  toolName: string;
  input: unknown;
  output?: unknown;
  runId?: string;
}

/**
 * Create an audit adapter that logs LangChain chain/tool events.
 *
 * Usage:
 * ```ts
 * const trail = new AuditTrail({ ... });
 * const adapter = createLangChainAdapter(trail);
 *
 * // In your LangChain callback handler:
 * adapter.logChainStart({ chainName: 'RetrievalQA', inputs: { query: '...' } });
 * adapter.logChainEnd({ chainName: 'RetrievalQA', inputs: { query: '...' }, outputs: { answer: '...' } });
 * adapter.logToolStart({ toolName: 'arweave_store', input: { data: '...' } });
 * adapter.logToolEnd({ toolName: 'arweave_store', input: { data: '...' }, output: { txId: '...' } });
 * ```
 */
export function createLangChainAdapter(target: AuditAdapter) {
  return {
    logChainStart(event: LangChainChainEvent): Promise<string> {
      return target.onEvent({
        eventType: 'chain_start',
        action: `Chain start: ${event.chainName}`,
        input: event.inputs,
        metadata: {
          chainName: event.chainName,
          ...(event.runId ? { runId: event.runId } : {}),
        },
      });
    },

    logChainEnd(event: LangChainChainEvent): Promise<string> {
      return target.onEvent({
        eventType: 'chain_end',
        action: `Chain end: ${event.chainName}`,
        input: event.inputs,
        output: event.outputs,
        metadata: {
          chainName: event.chainName,
          ...(event.runId ? { runId: event.runId } : {}),
        },
      });
    },

    logToolStart(event: LangChainToolEvent): Promise<string> {
      return target.onEvent({
        eventType: 'tool_call',
        action: `Tool call: ${event.toolName}`,
        input: event.input,
        metadata: {
          toolName: event.toolName,
          ...(event.runId ? { runId: event.runId } : {}),
        },
      });
    },

    logToolEnd(event: LangChainToolEvent): Promise<string> {
      return target.onEvent({
        eventType: 'tool_result',
        action: `Tool result: ${event.toolName}`,
        input: event.input,
        output: event.output,
        metadata: {
          toolName: event.toolName,
          ...(event.runId ? { runId: event.runId } : {}),
        },
      });
    },
  };
}
