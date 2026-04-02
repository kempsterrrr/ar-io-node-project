/**
 * OpenClaw Storage & Integrity Tools — powered by @agenticway/sdk
 *
 * New tools that expose SDK store, verify, anchor, and verifyAnchor
 * operations as OpenClaw agent tools.
 */

import type { AgenticWay } from '@agenticway/sdk';
import type { OpenClawPluginApi } from '../types.js';
import { toolResult, toolError } from '../types.js';

export function registerStorageTools(api: OpenClawPluginApi, sdk: AgenticWay): void {
  // Tool: arweave_store
  api.registerTool({
    name: 'arweave_store',
    description:
      'Store data permanently on Arweave. Supports text, JSON, or binary data. Returns the transaction ID and a URL to view the stored data.',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'The data to store (text or base64-encoded binary).',
        },
        contentType: {
          type: 'string',
          description:
            "Content type of the data (e.g., 'text/plain', 'application/json', 'image/png'). Auto-detected if omitted.",
        },
        isBase64: {
          type: 'boolean',
          description: 'Set to true if data is base64-encoded binary. Default is false (text).',
        },
        tags: {
          type: 'object',
          description: 'Optional key-value tags to include on the Arweave transaction.',
        },
      },
      required: ['data'],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const rawData = params.data as string;
        const isBase64 = (params.isBase64 as boolean) ?? false;
        const contentType = params.contentType as string | undefined;
        const tags = params.tags as Record<string, string> | undefined;

        const data = isBase64 ? Buffer.from(rawData, 'base64') : Buffer.from(rawData, 'utf-8');

        const result = await sdk.store({ data, contentType, tags });

        return toolResult({
          success: true,
          data: {
            txId: result.txId,
            viewUrl: result.viewUrl,
            provenance: result.provenance ?? null,
          },
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: arweave_verify
  api.registerTool({
    name: 'arweave_verify',
    description:
      'Verify the on-chain existence and integrity of an Arweave transaction. Checks that the transaction exists, its data is intact, and returns provenance metadata.',
    parameters: {
      type: 'object',
      properties: {
        txId: {
          type: 'string',
          description: 'The Arweave transaction ID to verify.',
        },
      },
      required: ['txId'],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const txId = params.txId as string;
        const result = await sdk.verify(txId);

        return toolResult({
          success: true,
          data: {
            valid: result.valid,
            tier: result.tier,
            existence: result.existence,
            integrity: result.integrity,
            metadata: result.metadata,
            links: result.links,
          },
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: arweave_anchor
  api.registerTool({
    name: 'arweave_anchor',
    description:
      'Anchor data on Arweave by storing its SHA-256 hash. Creates a permanent integrity proof that the data existed at anchor time. The data itself is NOT stored — only its hash.',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'The data to anchor (text or base64-encoded binary).',
        },
        isBase64: {
          type: 'boolean',
          description: 'Set to true if data is base64-encoded binary. Default is false.',
        },
        metadata: {
          type: 'object',
          description: 'Optional metadata tags to store alongside the integrity proof.',
        },
      },
      required: ['data'],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const rawData = params.data as string;
        const isBase64 = (params.isBase64 as boolean) ?? false;
        const metadata = params.metadata as Record<string, string> | undefined;

        const data = isBase64 ? Buffer.from(rawData, 'base64') : Buffer.from(rawData, 'utf-8');

        const result = await sdk.anchor({ data, metadata });

        return toolResult({
          success: true,
          data: {
            txId: result.txId,
            hash: result.hash,
            timestamp: result.timestamp,
          },
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: arweave_verify_anchor
  api.registerTool({
    name: 'arweave_verify_anchor',
    description:
      'Verify data against an existing integrity anchor on Arweave. Re-hashes the provided data and compares it against the hash stored on-chain to prove the data has not been tampered with.',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'The data to verify against the anchor.',
        },
        txId: {
          type: 'string',
          description: 'The Arweave transaction ID of the integrity proof to verify against.',
        },
        isBase64: {
          type: 'boolean',
          description: 'Set to true if data is base64-encoded binary. Default is false.',
        },
      },
      required: ['data', 'txId'],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      try {
        const rawData = params.data as string;
        const txId = params.txId as string;
        const isBase64 = (params.isBase64 as boolean) ?? false;

        const data = isBase64 ? Buffer.from(rawData, 'base64') : Buffer.from(rawData, 'utf-8');

        const result = await sdk.verifyAnchor({ data, txId });

        return toolResult({
          success: true,
          data: {
            valid: result.valid,
            hash: result.hash,
            anchoredHash: result.anchoredHash,
            blockHeight: result.blockHeight,
            timestamp: result.timestamp,
          },
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
