/**
 * AR.IO Gateway Plugin for OpenClaw
 *
 * v0.2.0 — Refactored to use @agenticway/sdk instead of raw HTTP calls.
 *
 * Provides tools for:
 * - Gateway info, data retrieval, ArNS resolution, transaction search (via SDK)
 * - Permanent data storage and integrity anchoring on Arweave (new)
 * - SSH-based gateway management (unchanged)
 */

import { AgenticWay } from '@agenticway/sdk';
import { registerGatewayTools } from './tools/gateway.js';
import { registerStorageTools } from './tools/storage.js';
import { registerSSHTools, type SSHConfig } from './tools/ssh.js';
import type { OpenClawPluginApi, PluginConfig } from './types.js';

export default {
  id: 'openclaw-ario-plugin',
  name: 'AR.IO Gateway Plugin',

  configSchema: {
    type: 'object',
    properties: {
      gatewayUrl: {
        type: 'string',
        description: 'URL of the AR.IO gateway. Defaults to https://arweave.net',
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
      },
      turboWallet: {
        type: 'string',
        description:
          'Ethereum private key for Turbo uploads (hex string). Required for store/anchor.',
      },
      trusthashUrl: {
        type: 'string',
        description: 'Trusthash sidecar URL for C2PA provenance and similarity search.',
      },
      ssh: {
        type: 'object',
        description: 'SSH configuration for gateway management',
        properties: {
          host: {
            type: 'string',
            description: 'Gateway server hostname or IP',
          },
          user: {
            type: 'string',
            description: 'SSH username',
            default: 'root',
          },
          keyPath: {
            type: 'string',
            description: 'Path to SSH private key file',
          },
          workingDirectory: {
            type: 'string',
            description:
              'Path to ar-io-node directory on gateway server. Defaults to ~/ar-io-gateway',
          },
        },
        required: ['host', 'keyPath'],
      },
    },
  },

  register(api: OpenClawPluginApi, pluginConfig?: PluginConfig) {
    const config: PluginConfig = pluginConfig ??
      api.config?.plugins?.entries?.['openclaw-ario-plugin']?.config ?? {
        gatewayUrl: 'https://arweave.net',
        timeout: 30000,
      };

    const gatewayUrl = config.gatewayUrl ?? 'https://arweave.net';

    // Initialize the @agenticway/sdk
    const sdk = new AgenticWay({
      gatewayUrl,
      timeoutMs: config.timeout ?? 30000,
      turboWallet: config.turboWallet,
      trusthashUrl: config.trusthashUrl,
    });

    // Register gateway tools (info, fetch, resolve, search)
    registerGatewayTools(api, sdk);
    api.logger.info(`AR.IO Gateway plugin: gateway tools registered (${gatewayUrl})`);

    // Register storage & integrity tools (store, verify, anchor, verifyAnchor)
    registerStorageTools(api, sdk);
    api.logger.info('AR.IO Gateway plugin: storage & integrity tools registered');

    // Register SSH tools if configured
    if (config.ssh) {
      if (!config.ssh.host || !config.ssh.keyPath) {
        api.logger.warn('AR.IO Gateway plugin: SSH config incomplete (need host and keyPath)');
      } else {
        const sshConfig: SSHConfig = {
          host: config.ssh.host,
          user: config.ssh.user ?? 'root',
          keyPath: config.ssh.keyPath,
          workingDirectory: config.ssh.workingDirectory ?? '~/ar-io-gateway',
        };
        registerSSHTools(api, sshConfig);
        api.logger.info(
          `AR.IO Gateway plugin: SSH tools registered (${sshConfig.user}@${sshConfig.host})`
        );
      }
    } else {
      api.logger.info('AR.IO Gateway plugin: SSH tools not configured (optional)');
    }
  },
};

// Re-export SDK for direct usage
export { AgenticWay } from '@agenticway/sdk';
export type { SSHConfig } from './tools/ssh.js';
export type { PluginConfig, OpenClawPluginApi } from './types.js';
