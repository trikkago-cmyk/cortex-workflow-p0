import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutomationStatus, waitForAutomationStackReady } from '../src/automation-status.js';

test('automation status marks cortex-server running when health probe confirms live runtime', async () => {
  const status = await buildAutomationStatus({
    cwd: '/tmp/cortex-test',
    runtimeDir: '/tmp/cortex-test/runtime',
    names: ['cortex-server', 'executor-multi-agent-handler'],
    readPid: (name) => (name === 'executor-multi-agent-handler' ? 4321 : 1234),
    isRunning: (pid) => pid === 4321,
    logFilePathFn: (_runtimeDir, name) => `/tmp/logs/${name}.log`,
    resolveListeningPidFn: () => 8765,
    readProcessCommandFn: () => 'node /tmp/cortex-test/src/server.js',
    readProcessWorkingDirectoryFn: () => '/tmp/cortex-test',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        service: 'cortex-p0',
      }),
    }),
  });

  const cortexServer = status.processes.find((processState) => processState.name === 'cortex-server');
  const worker = status.processes.find((processState) => processState.name === 'executor-multi-agent-handler');

  assert.equal(status.ok, true);
  assert.equal(status.healthProbe.ok, true);
  assert.equal(cortexServer.running, true);
  assert.equal(cortexServer.covered_by, 'health_probe');
  assert.equal(worker.running, true);
  assert.equal(status.liveListener.pid, 8765);
  assert.equal(status.liveListener.matchesRepoServer, true);
  assert.equal(status.liveListener.workingDirectory, '/tmp/cortex-test');
  assert.equal(status.liveListener.driftDetected, true);
});

test('automation status keeps cortex-server stopped when health probe does not confirm cortex runtime', async () => {
  const status = await buildAutomationStatus({
    cwd: '/tmp/cortex-test',
    runtimeDir: '/tmp/cortex-test/runtime',
    names: ['cortex-server'],
    readPid: () => 9999,
    isRunning: () => false,
    logFilePathFn: (_runtimeDir, name) => `/tmp/logs/${name}.log`,
    resolveListeningPidFn: () => null,
    readProcessCommandFn: () => null,
    readProcessWorkingDirectoryFn: () => null,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        service: 'someone-else',
      }),
    }),
  });

  const cortexServer = status.processes[0];

  assert.equal(status.ok, true);
  assert.equal(status.healthProbe.ok, false);
  assert.equal(cortexServer.running, false);
  assert.equal(cortexServer.covered_by, undefined);
  assert.equal(status.liveListener.pid, null);
  assert.equal(status.liveListener.driftDetected, false);
});

test('automation status treats repo-relative server command as current repo when listener cwd matches', async () => {
  const status = await buildAutomationStatus({
    cwd: '/tmp/cortex-test',
    runtimeDir: '/tmp/cortex-test/runtime',
    names: ['cortex-server'],
    readPid: () => 8765,
    isRunning: () => true,
    logFilePathFn: (_runtimeDir, name) => `/tmp/logs/${name}.log`,
    resolveListeningPidFn: () => 8765,
    readProcessCommandFn: () => 'node src/server.js',
    readProcessWorkingDirectoryFn: () => '/tmp/cortex-test',
    fetchImpl: async () => {
      throw new Error('health probe should not run');
    },
  });

  assert.equal(status.liveListener.matchesRepoServer, true);
  assert.equal(status.liveListener.matchesManagedPid, true);
  assert.equal(status.liveListener.driftDetected, false);
});

test('automation status does not trust repo-relative server command when listener cwd differs', async () => {
  const status = await buildAutomationStatus({
    cwd: '/tmp/cortex-test',
    runtimeDir: '/tmp/cortex-test/runtime',
    names: ['cortex-server'],
    readPid: () => 8765,
    isRunning: () => true,
    logFilePathFn: (_runtimeDir, name) => `/tmp/logs/${name}.log`,
    resolveListeningPidFn: () => 8765,
    readProcessCommandFn: () => 'node src/server.js',
    readProcessWorkingDirectoryFn: () => '/tmp/other-project',
    fetchImpl: async () => {
      throw new Error('health probe should not run');
    },
  });

  assert.equal(status.liveListener.matchesRepoServer, false);
  assert.equal(status.liveListener.matchesManagedPid, true);
  assert.equal(status.liveListener.driftDetected, false);
});

test('automation status recovers managed listener processes beyond cortex-server when pid files drift', async () => {
  const status = await buildAutomationStatus({
    cwd: '/tmp/cortex-test',
    runtimeDir: '/tmp/cortex-test/runtime',
    names: ['cortex-custom-agent-mcp', 'executor-multi-agent-handler'],
    readPid: () => null,
    isRunning: () => false,
    logFilePathFn: (_runtimeDir, name) => `/tmp/logs/${name}.log`,
    resolveListeningPidFn: ({ port }) => {
      if (port === '19100') {
        return null;
      }
      throw new Error(`unexpected listener port lookup: ${port}`);
    },
    findRepoNodeScriptListenerPidFn: ({ port, scriptRelativePath }) => {
      if (port === '19101' && scriptRelativePath === 'src/cortex-mcp-server.js') {
        return 51001;
      }
      if (port === '3010' && scriptRelativePath === 'src/executor-multi-agent-handler.js') {
        return 53010;
      }
      return null;
    },
    readProcessCommandFn: () => null,
    readProcessWorkingDirectoryFn: () => null,
    fetchImpl: async () => {
      throw new Error('health probe should not run');
    },
  });

  const mcp = status.processes.find((processState) => processState.name === 'cortex-custom-agent-mcp');
  const handler = status.processes.find((processState) => processState.name === 'executor-multi-agent-handler');

  assert.equal(mcp.running, true);
  assert.equal(mcp.pid, 51001);
  assert.equal(mcp.covered_by, 'listener_probe');
  assert.equal(handler.running, true);
  assert.equal(handler.pid, 53010);
  assert.equal(handler.covered_by, 'listener_probe');
});

test('waitForAutomationStackReady waits until all processes and health probe are ready', async () => {
  const snapshots = [
    {
      ok: true,
      processes: [
        { name: 'cortex-server', running: true },
        { name: 'executor-multi-agent-handler', running: false },
      ],
      liveListener: {
        matchesRepoServer: true,
        driftDetected: false,
      },
    },
    {
      ok: true,
      processes: [
        { name: 'cortex-server', running: true },
        { name: 'executor-multi-agent-handler', running: true },
      ],
      liveListener: {
        matchesRepoServer: true,
        driftDetected: false,
      },
    },
  ];
  const healthChecks = [{ ok: false }, { ok: true }];
  let buildStatusCalls = 0;
  let healthCalls = 0;

  const readiness = await waitForAutomationStackReady({
    timeoutMs: 500,
    intervalMs: 1,
    buildStatus: async () => snapshots[Math.min(buildStatusCalls++, snapshots.length - 1)],
    probeHealth: async () => healthChecks[Math.min(healthCalls++, healthChecks.length - 1)],
  });

  assert.equal(readiness.ok, true);
  assert.equal(readiness.attempts, 2);
  assert.equal(readiness.status.processes.every((processState) => processState.running), true);
  assert.equal(readiness.health.ok, true);
});

test('waitForAutomationStackReady times out when listener remains unhealthy', async () => {
  const readiness = await waitForAutomationStackReady({
    timeoutMs: 50,
    intervalMs: 1,
    buildStatus: async () => ({
      ok: true,
      processes: [{ name: 'cortex-server', running: true }],
      liveListener: {
        matchesRepoServer: false,
        driftDetected: true,
      },
    }),
    probeHealth: async () => ({ ok: true }),
  });

  assert.equal(readiness.ok, false);
  assert.equal(readiness.status.liveListener.matchesRepoServer, false);
  assert.equal(readiness.health.ok, true);
});
