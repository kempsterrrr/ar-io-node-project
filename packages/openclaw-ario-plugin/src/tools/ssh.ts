/**
 * SSH Tools for Gateway Operations
 *
 * Provides tools to manage the AR.IO gateway via SSH from a separate server.
 * These tools allow the agent to execute commands, check status, restart services,
 * view logs, and update the gateway.
 */

import { spawn } from 'child_process';

/** SSH configuration */
export interface SSHConfig {
  host: string;
  user: string;
  keyPath: string;
}

/** Tool content block */
interface ToolContent {
  type: 'text';
  text: string;
}

/** Tool result format */
interface ToolResult {
  content: ToolContent[];
}

/** OpenClaw plugin API for tool registration */
interface OpenClawPluginApi {
  registerTool(tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (id: string, params: Record<string, unknown>) => Promise<ToolResult>;
  }): void;
}

/** Validates a service name to prevent command injection */
function isValidServiceName(service: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(service);
}

/** Helper to format tool results */
function toolResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/** Helper to format error results */
function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: message }) }],
  };
}

/**
 * Execute an SSH command on the gateway server
 */
async function executeSSH(
  config: SSHConfig,
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i',
      config.keyPath,
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'ConnectTimeout=10',
      `${config.user}@${config.host}`,
      command,
    ];

    const proc = spawn('ssh', args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code, signal) => {
      // If process was terminated by signal, treat as error (exit code 128 + signal number convention)
      // If code is null without signal, default to 1 (unknown error)
      let exitCode = code ?? 1;
      if (signal) {
        // Common signal numbers: SIGTERM=15, SIGKILL=9, SIGINT=2
        const signalNumbers: Record<string, number> = {
          SIGHUP: 1,
          SIGINT: 2,
          SIGQUIT: 3,
          SIGKILL: 9,
          SIGTERM: 15,
        };
        exitCode = 128 + (signalNumbers[signal] ?? 0);
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Register SSH tools with OpenClaw
 */
export function registerSSHTools(api: OpenClawPluginApi, sshConfig: SSHConfig): void {
  // Tool: gateway_ssh_execute
  api.registerTool({
    name: 'gateway_ssh_execute',
    description:
      'Execute a command on the gateway server via SSH. Use with caution - prefer the specialized tools (gateway_status, gateway_restart, gateway_logs, gateway_update) when possible.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute on the gateway server',
        },
      },
      required: ['command'],
    },
    execute: async (_id, params) => {
      try {
        const command = params.command as string;
        const result = await executeSSH(sshConfig, command);
        return toolResult({
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_status
  api.registerTool({
    name: 'gateway_status',
    description:
      'Get the status of Docker containers running on the gateway server. Shows container names, status, ports, and health.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_id) => {
      try {
        const result = await executeSSH(sshConfig, 'cd ~/ar-io-node && docker compose ps');
        return toolResult({
          success: result.exitCode === 0,
          output: result.stdout,
          error: result.stderr || undefined,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_restart
  api.registerTool({
    name: 'gateway_restart',
    description:
      'Restart Docker containers on the gateway server. Can restart all containers or a specific service.',
    parameters: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description:
            'Optional service name to restart (e.g., "core", "envoy"). If not specified, restarts all containers.',
        },
      },
    },
    execute: async (_id, params) => {
      try {
        const service = params.service as string | undefined;
        if (service && !isValidServiceName(service)) {
          return toolResult({
            success: false,
            error:
              'Invalid service name. Only alphanumeric characters, hyphens, and underscores allowed.',
          });
        }
        const command = service
          ? `cd ~/ar-io-node && docker compose restart ${service}`
          : 'cd ~/ar-io-node && docker compose restart';
        const result = await executeSSH(sshConfig, command);
        return toolResult({
          success: result.exitCode === 0,
          message: service ? `Restarted ${service}` : 'Restarted all containers',
          output: result.stdout,
          error: result.stderr || undefined,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_logs
  api.registerTool({
    name: 'gateway_logs',
    description:
      'Get recent logs from gateway Docker containers. Can view logs from all containers or a specific service.',
    parameters: {
      type: 'object',
      properties: {
        service: {
          type: 'string',
          description:
            'Optional service name to get logs from (e.g., "core", "envoy"). If not specified, shows logs from all containers.',
        },
        lines: {
          type: 'number',
          description: 'Number of recent log lines to show. Default is 50.',
        },
      },
    },
    execute: async (_id, params) => {
      try {
        const service = params.service as string | undefined;
        if (service && !isValidServiceName(service)) {
          return toolResult({
            success: false,
            error:
              'Invalid service name. Only alphanumeric characters, hyphens, and underscores allowed.',
          });
        }
        const lines = (params.lines as number) ?? 50;
        const command = service
          ? `cd ~/ar-io-node && docker compose logs --tail=${lines} ${service}`
          : `cd ~/ar-io-node && docker compose logs --tail=${lines}`;
        const result = await executeSSH(sshConfig, command);
        return toolResult({
          success: result.exitCode === 0,
          logs: result.stdout,
          error: result.stderr || undefined,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });

  // Tool: gateway_update
  api.registerTool({
    name: 'gateway_update',
    description:
      'Update the gateway to the latest version by pulling new Docker images and restarting containers.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_id) => {
      try {
        // Pull latest images
        const pullResult = await executeSSH(sshConfig, 'cd ~/ar-io-node && docker compose pull');
        if (pullResult.exitCode !== 0) {
          return toolResult({
            success: false,
            stage: 'pull',
            error: pullResult.stderr || pullResult.stdout,
          });
        }

        // Restart with new images
        const upResult = await executeSSH(sshConfig, 'cd ~/ar-io-node && docker compose up -d');
        return toolResult({
          success: upResult.exitCode === 0,
          message: 'Gateway updated and restarted',
          pullOutput: pullResult.stdout,
          upOutput: upResult.stdout,
          error: upResult.stderr || undefined,
        });
      } catch (error) {
        return toolError(error);
      }
    },
  });
}
