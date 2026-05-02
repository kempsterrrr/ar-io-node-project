import { describe, it, expect, vi } from 'vitest';
import { createVercelAiAdapter } from '../src/adapters/vercel-ai.js';
import { createLangChainAdapter } from '../src/adapters/langchain.js';
import type { AuditAdapter, LogEventOptions } from '../src/types.js';

function makeMockTarget(): AuditAdapter & { calls: LogEventOptions[] } {
  const calls: LogEventOptions[] = [];
  return {
    calls,
    onEvent: vi.fn(async (event: LogEventOptions) => {
      calls.push(event);
      return `id-${calls.length}`;
    }),
  };
}

describe('createVercelAiAdapter', () => {
  it('logToolCall sends tool_call event', async () => {
    const target = makeMockTarget();
    const adapter = createVercelAiAdapter(target);

    const id = await adapter.logToolCall({
      toolName: 'arweaveStore',
      args: { data: 'hello' },
    });

    expect(id).toBe('id-1');
    expect(target.calls).toHaveLength(1);
    expect(target.calls[0].eventType).toBe('tool_call');
    expect(target.calls[0].action).toBe('Tool call: arweaveStore');
    expect(target.calls[0].input).toEqual({ data: 'hello' });
    expect(target.calls[0].metadata?.toolName).toBe('arweaveStore');
  });

  it('logToolResult sends tool_result event', async () => {
    const target = makeMockTarget();
    const adapter = createVercelAiAdapter(target);

    await adapter.logToolResult({
      toolName: 'arweaveStore',
      args: { data: 'hello' },
      result: { txId: 'tx-001' },
    });

    expect(target.calls[0].eventType).toBe('tool_result');
    expect(target.calls[0].input).toEqual({ data: 'hello' });
    expect(target.calls[0].output).toEqual({ txId: 'tx-001' });
  });

  it('logModelRequest sends model_request event', async () => {
    const target = makeMockTarget();
    const adapter = createVercelAiAdapter(target);

    await adapter.logModelRequest({
      model: 'gpt-4o',
      prompt: 'Store data on Arweave',
    });

    expect(target.calls[0].eventType).toBe('model_request');
    expect(target.calls[0].metadata?.model).toBe('gpt-4o');
  });

  it('logModelResponse sends model_response event', async () => {
    const target = makeMockTarget();
    const adapter = createVercelAiAdapter(target);

    await adapter.logModelResponse({
      model: 'gpt-4o',
      response: { text: 'Done!' },
      tokensUsed: 150,
    });

    expect(target.calls[0].eventType).toBe('model_response');
    expect(target.calls[0].metadata?.tokensUsed).toBe('150');
  });
});

describe('createLangChainAdapter', () => {
  it('logChainStart sends chain_start event', async () => {
    const target = makeMockTarget();
    const adapter = createLangChainAdapter(target);

    await adapter.logChainStart({
      chainName: 'RetrievalQA',
      inputs: { query: 'What is stored?' },
      runId: 'run-abc',
    });

    expect(target.calls[0].eventType).toBe('chain_start');
    expect(target.calls[0].action).toBe('Chain start: RetrievalQA');
    expect(target.calls[0].metadata?.chainName).toBe('RetrievalQA');
    expect(target.calls[0].metadata?.runId).toBe('run-abc');
  });

  it('logChainEnd sends chain_end event', async () => {
    const target = makeMockTarget();
    const adapter = createLangChainAdapter(target);

    await adapter.logChainEnd({
      chainName: 'RetrievalQA',
      inputs: { query: 'What?' },
      outputs: { answer: 'Found it!' },
    });

    expect(target.calls[0].eventType).toBe('chain_end');
    expect(target.calls[0].output).toEqual({ answer: 'Found it!' });
  });

  it('logToolStart sends tool_call event', async () => {
    const target = makeMockTarget();
    const adapter = createLangChainAdapter(target);

    await adapter.logToolStart({
      toolName: 'arweave_store',
      input: { data: 'hello' },
    });

    expect(target.calls[0].eventType).toBe('tool_call');
    expect(target.calls[0].metadata?.toolName).toBe('arweave_store');
  });

  it('logToolEnd sends tool_result event', async () => {
    const target = makeMockTarget();
    const adapter = createLangChainAdapter(target);

    await adapter.logToolEnd({
      toolName: 'arweave_store',
      input: { data: 'hello' },
      output: { txId: 'tx-001' },
    });

    expect(target.calls[0].eventType).toBe('tool_result');
    expect(target.calls[0].output).toEqual({ txId: 'tx-001' });
  });
});
