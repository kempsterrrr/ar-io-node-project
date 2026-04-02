/**
 * Shared types for the OpenClaw AR.IO plugin.
 */

export interface ToolContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
}

export interface OpenClawPluginApi {
  config?: {
    plugins?: {
      entries?: {
        'openclaw-ario-plugin'?: {
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
    execute: (id: string, params: Record<string, unknown>) => Promise<ToolResult>;
  }): void;
}

export interface SSHPluginConfig {
  host: string;
  user?: string;
  keyPath: string;
  workingDirectory?: string;
}

export interface PluginConfig {
  gatewayUrl?: string;
  timeout?: number;
  turboWallet?: string;
  trusthashUrl?: string;
  ssh?: SSHPluginConfig;
}

export function toolResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }) }],
  };
}
