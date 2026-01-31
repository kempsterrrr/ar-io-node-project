/**
 * AR.IO Gateway Plugin for OpenClaw
 *
 * Provides tools for interacting with AR.IO gateways and Arweave.
 * See: https://docs.openclaw.ai/plugin
 */

import { GatewayClient } from './gateway/client.js';
import { registerGatewayTools } from './tools/index.js';

/** Plugin configuration */
interface PluginConfig {
  gatewayUrl: string;
  timeout?: number;
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
        description: 'URL of the AR.IO gateway',
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
      },
    },
    required: ['gatewayUrl'],
  },

  register(api: OpenClawPluginApi, pluginConfig?: PluginConfig) {
    // Try to get config from multiple sources
    const config: PluginConfig = pluginConfig ??
      api.config?.plugins?.entries?.['ario-gateway']?.config ?? {
        gatewayUrl: process.env.ARIO_GATEWAY_URL ?? 'http://core:4000',
        timeout: 30000,
      };

    // Validate required config
    if (!config.gatewayUrl) {
      api.logger.error('AR.IO Gateway plugin: gatewayUrl is required');
      return;
    }

    const gateway = new GatewayClient({
      baseUrl: config.gatewayUrl,
      timeout: config.timeout ?? 30000,
    });

    registerGatewayTools(api, gateway);

    api.logger.info(`AR.IO Gateway plugin registered (${config.gatewayUrl})`);
  },
};

// Re-export for direct usage
export { GatewayClient } from './gateway/client.js';
export type { GatewayClientOptions } from './gateway/client.js';
export type { GatewayInfo, ArweaveTransaction, ArNSResolution } from './types/index.js';
