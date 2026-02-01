/**
 * SSH Tools Unit Tests
 *
 * Tests the SSH tools with mocked child_process.spawn.
 * Verifies correct command construction, output parsing, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Import after mocking
import { registerSSHTools, type SSHConfig } from '../src/tools/ssh.js';

// Test SSH config
const testConfig: SSHConfig = {
  host: '10.0.0.2',
  user: 'root',
  keyPath: '/home/node/.ssh/gateway_key',
  workingDirectory: '~/ar-io-gateway',
};

// Mock OpenClaw API
function createMockApi() {
  const tools: Map<
    string,
    { execute: (id: string, params: Record<string, unknown>) => Promise<unknown> }
  > = new Map();

  return {
    registerTool: vi.fn((tool) => {
      tools.set(tool.name, tool);
    }),
    getTool: (name: string) => tools.get(name),
    tools,
  };
}

// Helper to create a mock spawn process
function createMockProcess(stdout: string, stderr: string, exitCode: number): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as NodeJS.ReadableStream;
  proc.stderr = new EventEmitter() as NodeJS.ReadableStream;

  // Emit data and close after a tick
  setImmediate(() => {
    (proc.stdout as EventEmitter).emit('data', Buffer.from(stdout));
    (proc.stderr as EventEmitter).emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  });

  return proc;
}

describe('SSH Tools', () => {
  let mockApi: ReturnType<typeof createMockApi>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = createMockApi();
    registerSSHTools(mockApi, testConfig);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register all SSH tools', () => {
      expect(mockApi.registerTool).toHaveBeenCalledTimes(5);

      const toolNames = Array.from(mockApi.tools.keys());
      expect(toolNames).toContain('gateway_ssh_execute');
      expect(toolNames).toContain('gateway_status');
      expect(toolNames).toContain('gateway_restart');
      expect(toolNames).toContain('gateway_logs');
      expect(toolNames).toContain('gateway_update');
    });
  });

  describe('gateway_ssh_execute', () => {
    it('should execute arbitrary commands via SSH', async () => {
      const mockOutput = 'command output';
      vi.mocked(spawn).mockReturnValue(createMockProcess(mockOutput, '', 0));

      const tool = mockApi.getTool('gateway_ssh_execute');
      const result = await tool?.execute('test-id', { command: 'echo hello' });

      // Verify spawn was called with correct args
      expect(spawn).toHaveBeenCalledWith('ssh', [
        '-i',
        '/home/node/.ssh/gateway_key',
        '-o',
        'StrictHostKeyChecking=accept-new',
        '-o',
        'ConnectTimeout=10',
        'root@10.0.0.2',
        'echo hello',
      ]);

      // Verify result
      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.stdout).toBe(mockOutput);
      expect(parsed.exitCode).toBe(0);
    });

    it('should handle command failure', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('', 'command not found', 127));

      const tool = mockApi.getTool('gateway_ssh_execute');
      const result = await tool?.execute('test-id', { command: 'nonexistent-command' });

      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.exitCode).toBe(127);
      expect(parsed.stderr).toBe('command not found');
    });
  });

  describe('gateway_status', () => {
    it('should run docker compose ps', async () => {
      const mockOutput = `NAME                STATUS
core                running
envoy               running`;
      vi.mocked(spawn).mockReturnValue(createMockProcess(mockOutput, '', 0));

      const tool = mockApi.getTool('gateway_status');
      const result = await tool?.execute('test-id', {});

      // Verify the command
      expect(spawn).toHaveBeenCalledWith(
        'ssh',
        expect.arrayContaining(['cd ~/ar-io-gateway && docker compose ps'])
      );

      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.output).toContain('core');
      expect(parsed.output).toContain('envoy');
    });
  });

  describe('gateway_restart', () => {
    it('should restart all containers when no service specified', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('Restarting...', '', 0));

      const tool = mockApi.getTool('gateway_restart');
      const result = await tool?.execute('test-id', {});

      expect(spawn).toHaveBeenCalledWith(
        'ssh',
        expect.arrayContaining(['cd ~/ar-io-gateway && docker compose restart'])
      );

      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe('Restarted all containers');
    });

    it('should restart specific service when specified', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('Restarting core...', '', 0));

      const tool = mockApi.getTool('gateway_restart');
      const result = await tool?.execute('test-id', { service: 'core' });

      expect(spawn).toHaveBeenCalledWith(
        'ssh',
        expect.arrayContaining(['cd ~/ar-io-gateway && docker compose restart core'])
      );

      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe('Restarted core');
    });
  });

  describe('gateway_logs', () => {
    it('should get logs with default line count', async () => {
      const mockLogs = '[2024-01-01] Server started\n[2024-01-01] Ready';
      vi.mocked(spawn).mockReturnValue(createMockProcess(mockLogs, '', 0));

      const tool = mockApi.getTool('gateway_logs');
      const result = await tool?.execute('test-id', {});

      expect(spawn).toHaveBeenCalledWith(
        'ssh',
        expect.arrayContaining(['cd ~/ar-io-gateway && docker compose logs --tail=50'])
      );

      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.logs).toContain('Server started');
    });

    it('should get logs for specific service with custom line count', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('core logs...', '', 0));

      const tool = mockApi.getTool('gateway_logs');
      const result = await tool?.execute('test-id', { service: 'core', lines: 100 });

      expect(spawn).toHaveBeenCalledWith(
        'ssh',
        expect.arrayContaining(['cd ~/ar-io-gateway && docker compose logs --tail=100 core'])
      );

      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('gateway_update', () => {
    it('should pull and restart containers', async () => {
      // First call for pull, second for up
      vi.mocked(spawn)
        .mockReturnValueOnce(createMockProcess('Pulling images...', '', 0))
        .mockReturnValueOnce(createMockProcess('Starting containers...', '', 0));

      const tool = mockApi.getTool('gateway_update');
      const result = await tool?.execute('test-id', {});

      // Verify both commands were called
      expect(spawn).toHaveBeenCalledTimes(2);
      expect(spawn).toHaveBeenNthCalledWith(
        1,
        'ssh',
        expect.arrayContaining(['cd ~/ar-io-gateway && docker compose pull'])
      );
      expect(spawn).toHaveBeenNthCalledWith(
        2,
        'ssh',
        expect.arrayContaining(['cd ~/ar-io-gateway && docker compose up -d'])
      );

      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe('Gateway updated and restarted');
    });

    it('should fail if pull fails', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('', 'Pull failed', 1));

      const tool = mockApi.getTool('gateway_update');
      const result = await tool?.execute('test-id', {});

      // Should only call pull, not up
      expect(spawn).toHaveBeenCalledTimes(1);

      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.stage).toBe('pull');
    });
  });

  describe('Error Handling', () => {
    it('should handle SSH connection errors', async () => {
      const proc = new EventEmitter() as ChildProcess;
      proc.stdout = new EventEmitter() as NodeJS.ReadableStream;
      proc.stderr = new EventEmitter() as NodeJS.ReadableStream;

      setImmediate(() => {
        proc.emit('error', new Error('Connection refused'));
      });

      vi.mocked(spawn).mockReturnValue(proc);

      const tool = mockApi.getTool('gateway_status');
      const result = await tool?.execute('test-id', {});

      const parsed = JSON.parse((result as { content: { text: string }[] }).content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Connection refused');
    });
  });
});
