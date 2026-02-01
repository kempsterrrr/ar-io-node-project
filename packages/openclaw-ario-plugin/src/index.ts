/**
 * AR.IO Gateway Plugin for OpenClaw
 *
 * Provides tools for interacting with AR.IO gateways and Arweave,
 * including SSH-based gateway management operations.
 *
 * See: https://docs.openclaw.ai/plugin
 */

import { GatewayClient } from './gateway/client.js';
import { registerGatewayTools } from './tools/index.js';
import { registerSSHTools, type SSHConfig } from './tools/ssh.js';

/** SSH configuration */
interface SSHPluginConfig {
  host: string;
  user?: string;
  keyPath: string;
  workingDirectory?: string;
}

/** Plugin configuration */
interface PluginConfig {
  gatewayUrl?: string;
  timeout?: number;
  ssh?: SSHPluginConfig;
}

/** OpenClaw plugin API */
interface OpenClawPluginApi {
  config?: {
    plugins?: {
      entries?: {
        'ario-gateway'?: {
          config?: PluginConfig;
        };
      };
    };
  };
  logger: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  registerTool(tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (id: string, params: Record<string, unknown>) => Promise<unknown>;
  }): void;
}

/** OpenClaw plugin export format */
export default {
  id: 'ario-gateway',
  name: 'AR.IO Gateway Plugin',

  // JSON Schema for plugin configuration (must match openclaw.plugin.json)
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
    // Try to get config from multiple sources with sensible defaults
    const config: PluginConfig = pluginConfig ??
      api.config?.plugins?.entries?.['ario-gateway']?.config ?? {
        gatewayUrl: 'https://arweave.net',
        timeout: 30000,
      };

    // Use default gateway URL if not provided
    const gatewayUrl = config.gatewayUrl ?? 'https://arweave.net';

    // Register gateway API tools
    const gateway = new GatewayClient({
      baseUrl: gatewayUrl,
      timeout: config.timeout ?? 30000,
    });

    registerGatewayTools(api, gateway);
    api.logger.info(`AR.IO Gateway plugin: API tools registered (${gatewayUrl})`);

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

// Re-export for direct usage
export { GatewayClient } from './gateway/client.js';
export type { GatewayClientOptions } from './gateway/client.js';
export type { GatewayInfo, ArweaveTransaction, ArNSResolution } from './types/index.js';
export type { SSHConfig } from './tools/ssh.js';
