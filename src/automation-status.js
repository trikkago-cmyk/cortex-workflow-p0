import { existsSync, readFileSync } from 'node:fs';
import { defaultRuntimeDir, listManagedProcessNames, logFilePath, pidFilePath } from './automation-processes.js';
import {
  findRepoNodeScriptListenerPid,
  matchesRepoCortexServerCommand,
  readProcessCommand,
  readProcessWorkingDirectory,
  resolveListeningPid,
} from './automation-runtime-ports.js';

const DEFAULT_CORTEX_BASE_URL = 'http://127.0.0.1:19100';

function compact(value) {
  return String(value ?? '').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readPidFromRuntimeDir(runtimeDir, name) {
  const file = pidFilePath(runtimeDir, name);
  if (!existsSync(file)) {
    return null;
  }

  const value = Number(readFileSync(file, 'utf8').trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isPidRunning(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function probeCortexServerHealth(baseUrl = DEFAULT_CORTEX_BASE_URL, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${compact(baseUrl).replace(/\/+$/, '') || DEFAULT_CORTEX_BASE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const payload = await response.json().catch(() => null);
    return {
      ok: response.ok && payload?.ok === true && payload?.service === 'cortex-p0',
      status: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      payload: null,
      error: error.message,
    };
  }
}

function processCoveredByHealthProbe(processState, healthProbe) {
  return (
    processState?.name === 'cortex-server' &&
    processState.running !== true &&
    healthProbe?.ok === true
  );
}

function resolvePortFromBaseUrl(baseUrl) {
  try {
    const parsed = new URL(compact(baseUrl).replace(/\/+$/, '') || DEFAULT_CORTEX_BASE_URL);
    if (parsed.port) {
      return parsed.port;
    }
    return parsed.protocol === 'https:' ? '443' : '80';
  } catch {
    return '19100';
  }
}

function listenerSpecForProcess(name, { cortexBaseUrl = DEFAULT_CORTEX_BASE_URL, env = process.env } = {}) {
  if (name === 'cortex-server') {
    return {
      port: resolvePortFromBaseUrl(cortexBaseUrl),
      scriptRelativePath: 'src/server.js',
    };
  }
  if (name === 'cortex-custom-agent-mcp') {
    return {
      port: String(env.CORTEX_MCP_PORT || 19101),
      scriptRelativePath: 'src/cortex-mcp-server.js',
    };
  }
  if (name === 'executor-multi-agent-handler') {
    return {
      port: String(env.EXECUTOR_WEBHOOK_PORT || 3010),
      scriptRelativePath: 'src/executor-multi-agent-handler.js',
    };
  }
  return null;
}

export async function buildAutomationStatus({
  cwd = process.cwd(),
  runtimeDir = defaultRuntimeDir(cwd),
  cortexBaseUrl = process.env.CORTEX_BASE_URL || DEFAULT_CORTEX_BASE_URL,
  fetchImpl = fetch,
  names = null,
  readPid = (name) => readPidFromRuntimeDir(runtimeDir, name),
  isRunning = isPidRunning,
  logFilePathFn = logFilePath,
  resolveListeningPidFn = ({ port }) => resolveListeningPid({ port }),
  findRepoNodeScriptListenerPidFn = (options) => findRepoNodeScriptListenerPid(options),
  readProcessCommandFn = (pid) => readProcessCommand(pid),
  readProcessWorkingDirectoryFn = (pid) => readProcessWorkingDirectory(pid),
} = {}) {
  const managedNames = Array.isArray(names)
    ? names
    : listManagedProcessNames({
        cwd,
        runtimeDir,
      });

  const rawProcesses = managedNames.map((name) => {
    const pid = readPid(name);
    return {
      name,
      pid,
      running: isRunning(pid),
      logPath: logFilePathFn(runtimeDir, name),
    };
  });

  const listenerRecoveredProcesses = rawProcesses.map((processState) => {
    if (processState.running) {
      return processState;
    }

    const listenerSpec = listenerSpecForProcess(processState.name, {
      cortexBaseUrl,
    });
    if (!listenerSpec) {
      return processState;
    }

    const listenerPid = findRepoNodeScriptListenerPidFn({
      cwd,
      port: listenerSpec.port,
      scriptRelativePath: listenerSpec.scriptRelativePath,
    });
    if (!listenerPid) {
      return processState;
    }

    return {
      ...processState,
      pid: listenerPid,
      running: true,
      covered_by: 'listener_probe',
      coveredBy: 'listener_probe',
    };
  });

  const shouldProbeHealth = listenerRecoveredProcesses.some(
    (processState) => processState.name === 'cortex-server' && !processState.running,
  );
  const healthProbe = shouldProbeHealth ? await probeCortexServerHealth(cortexBaseUrl, fetchImpl) : null;

  const processes = listenerRecoveredProcesses.map((processState) => {
    if (!processCoveredByHealthProbe(processState, healthProbe)) {
      return processState;
    }

    return {
      ...processState,
      running: true,
      covered_by: 'health_probe',
      coveredBy: 'health_probe',
    };
  });

  const listenerPort = resolvePortFromBaseUrl(cortexBaseUrl);
  const listenerPid = resolveListeningPidFn({ port: listenerPort });
  const listenerCommand = listenerPid ? readProcessCommandFn(listenerPid) : null;
  const listenerWorkingDirectory = listenerPid ? readProcessWorkingDirectoryFn(listenerPid) : null;
  const managedCortexServer = processes.find((processState) => processState.name === 'cortex-server') || null;
  const listenerMatchesRepo = matchesRepoCortexServerCommand(listenerCommand, {
    cwd,
    processCwd: listenerWorkingDirectory,
  });
  const managedPidMatchesListener = Boolean(
    managedCortexServer?.pid &&
      listenerPid &&
      Number(managedCortexServer.pid) === Number(listenerPid),
  );
  const driftDetected = Boolean(
    listenerPid &&
      managedCortexServer &&
      managedCortexServer.running === true &&
      managedCortexServer.pid &&
      Number(managedCortexServer.pid) !== Number(listenerPid),
  );

  return {
    ok: true,
    runtimeDir,
    ...(healthProbe ? { healthProbe } : {}),
    processes,
    liveListener: {
      port: listenerPort,
      pid: listenerPid,
      command: listenerCommand,
      workingDirectory: listenerWorkingDirectory,
      matchesRepoServer: listenerMatchesRepo,
      matchesManagedPid: managedPidMatchesListener,
      driftDetected,
    },
  };
}

export async function waitForAutomationStackReady({
  cwd = process.cwd(),
  runtimeDir = defaultRuntimeDir(cwd),
  cortexBaseUrl = process.env.CORTEX_BASE_URL || DEFAULT_CORTEX_BASE_URL,
  timeoutMs = 12_000,
  intervalMs = 250,
  names = null,
  buildStatus = (options) => buildAutomationStatus(options),
  probeHealth = (baseUrl) => probeCortexServerHealth(baseUrl),
} = {}) {
  const deadline = Date.now() + Math.max(1_000, Number(timeoutMs) || 12_000);
  const pollIntervalMs = Math.max(50, Number(intervalMs) || 250);
  let attempts = 0;
  let lastStatus = null;
  let lastHealth = null;

  while (Date.now() <= deadline) {
    attempts += 1;
    lastStatus = await buildStatus({
      cwd,
      runtimeDir,
      cortexBaseUrl,
      names,
    });
    lastHealth = await probeHealth(cortexBaseUrl);

    const allRunning = lastStatus.processes.every((processState) => processState.running === true);
    const listenerHealthy =
      lastStatus.liveListener?.matchesRepoServer !== false &&
      lastStatus.liveListener?.driftDetected !== true;

    if (allRunning && listenerHealthy && lastHealth.ok === true) {
      return {
        ok: true,
        attempts,
        status: lastStatus,
        health: lastHealth,
      };
    }

    if (Date.now() >= deadline) {
      break;
    }

    await sleep(pollIntervalMs);
  }

  return {
    ok: false,
    attempts,
    status: lastStatus,
    health: lastHealth,
  };
}
