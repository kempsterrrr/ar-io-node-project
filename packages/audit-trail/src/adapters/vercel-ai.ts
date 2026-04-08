import type { AuditAdapter, LogEventOptions } from '../types.js';

/**
 * Vercel AI SDK audit adapter.
 *
 * Wraps tool execution results from the Vercel AI SDK to automatically
 * capture tool_call and tool_result events. Pass the returned adapter's
 * `onEvent` into your orchestration loop, or use the helper
 * `wrapVercelTools()` to auto-instrument tools.
 *
 * This adapter does NOT import `ai` directly — it works with the
 * plain objects/types that the Vercel AI SDK produces.
 */
export interface VercelToolCallEvent {
  toolName: string;
  args: unknown;
}

export interface VercelToolResultEvent {
  toolName: string;
  args: unknown;
  result: unknown;
}

/**
 * Create an audit adapter that logs Vercel AI SDK tool calls.
 *
 * Usage:
 * ```ts
 * const trail = new AuditTrail({ ... });
 * const adapter = createVercelAiAdapter(trail);
 *
 * // In your tool execution loop:
 * adapter.logToolCall({ toolName: 'arweaveStore', args: { data: '...' } });
 * adapter.logToolResult({ toolName: 'arweaveStore', args: { data: '...' }, result: { txId: '...' } });
 * ```
 */
export function createVercelAiAdapter(target: AuditAdapter) {
  return {
    logToolCall(event: VercelToolCallEvent): Promise<string> {
      return target.onEvent({
        eventType: 'tool_call',
        action: `Tool call: ${event.toolName}`,
        input: event.args,
        metadata: { toolName: event.toolName },
      });
    },

    logToolResult(event: VercelToolResultEvent): Promise<string> {
      return target.onEvent({
        eventType: 'tool_result',
        action: `Tool result: ${event.toolName}`,
        input: event.args,
        output: event.result,
        metadata: { toolName: event.toolName },
      });
    },

    logModelRequest(options: { model: string; prompt: string }): Promise<string> {
      return target.onEvent({
        eventType: 'model_request',
        action: `Model request: ${options.model}`,
        input: { prompt: options.prompt },
        metadata: { model: options.model },
      });
    },

    logModelResponse(options: {
      model: string;
      response: unknown;
      tokensUsed?: number;
    }): Promise<string> {
      return target.onEvent({
        eventType: 'model_response',
        action: `Model response: ${options.model}`,
        output: options.response,
        metadata: {
          model: options.model,
          ...(options.tokensUsed != null ? { tokensUsed: String(options.tokensUsed) } : {}),
        },
      });
    },
  };
}
