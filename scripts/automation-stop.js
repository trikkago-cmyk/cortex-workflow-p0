import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import {
  defaultRuntimeDir,
  listManagedProcessNames,
  pidFilePath,
  writeAutomationEnsurePause,
} from '../src/automation-processes.js';
import {
  defaultServerDirectLaunchAgentPath,
  defaultServerDirectLaunchdLabel,
  launchctlDomain,
} from '../src/launchd.js';
import { findRepoNodeScriptListenerPid } from '../src/automation-runtime-ports.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

const runtimeDir = defaultRuntimeDir(process.cwd());
const cortexBaseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const stopReason = String(process.env.AUTOMATION_STOP_REASON || 'manual_stop').trim() || 'manual_stop';
const stopSource = String(process.env.AUTOMATION_STOP_SOURCE || 'scripts/automation-stop.js').trim() || 'scripts/automation-stop.js';
const stopPauseTtlMs = process.env.AUTOMATION_STOP_PAUSE_TTL_MS || undefined;
const serverDirectLabel = process.env.CORTEX_SERVER_DIRECT_LABEL || defaultServerDirectLaunchdLabel();
const serverDirectPlistPath =
  process.env.CORTEX_SERVER_DIRECT_PLIST || defaultServerDirectLaunchAgentPath({ label: serverDirectLabel });
const launchdDomain = launchctlDomain();
const ensurePause = writeAutomationEnsurePause({
  runtimeDir,
  reason: stopReason,
  ttlMs: stopPauseTtlMs,
  metadata: {
    source: stopSource,
  },
});

function serverDirectControl(action) {
  const loaded = spawnSync('launchctl', ['print', `${launchdDomain}/${serverDirectLabel}`], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).status === 0;

  if (!existsSync(serverDirectPlistPath) && !loaded) {
    return {
      action,
      label: serverDirectLabel,
      plistPath: serverDirectPlistPath,
      loaded,
      skipped: true,
      reason: 'missing_plist',
    };
  }

  if (action === 'bootout' && !loaded) {
    return {
      action,
      label: serverDirectLabel,
      plistPath: serverDirectPlistPath,
      loaded,
      skipped: true,
      reason: 'already_unloaded',
    };
  }

  const args =
    action === 'bootout'
      ? ['bootout', launchdDomain, serverDirectPlistPath]
      : ['bootstrap', launchdDomain, serverDirectPlistPath];
  const result = spawnSync('launchctl', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return {
    action,
    label: serverDirectLabel,
    plistPath: serverDirectPlistPath,
    loaded,
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout.trim() || null,
    stderr: result.stderr.trim() || null,
  };
}

const serverDirect = stopReason === 'manual_stop' ? serverDirectControl('bootout') : null;

function resolveCortexPort(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.port) {
      return parsed.port;
    }
    return parsed.protocol === 'https:' ? '443' : '80';
  } catch {
    return '19100';
  }
}

function resolveExecutorWebhookPort() {
  return String(process.env.EXECUTOR_WEBHOOK_PORT || 3010);
}

function resolveCortexMcpPort() {
  return String(process.env.CORTEX_MCP_PORT || 19101);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPid(name) {
  const file = pidFilePath(runtimeDir, name);
  if (!existsSync(file)) {
    return null;
  }

  const value = Number(readFileSync(file, 'utf8').trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

function stopPid(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function isRunning(pid) {
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

async function waitForExit(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) {
      return true;
    }
    await sleep(100);
  }
  return !isRunning(pid);
}

const names = listManagedProcessNames({
  cwd: process.cwd(),
  runtimeDir,
});

function listenerSpecForProcess(name) {
  if (name === 'cortex-server') {
    return {
      port: resolveCortexPort(cortexBaseUrl),
      scriptRelativePath: 'src/server.js',
    };
  }
  if (name === 'cortex-custom-agent-mcp') {
    return {
      port: resolveCortexMcpPort(),
      scriptRelativePath: 'src/cortex-mcp-server.js',
    };
  }
  if (name === 'executor-multi-agent-handler') {
    return {
      port: resolveExecutorWebhookPort(),
      scriptRelativePath: 'src/executor-multi-agent-handler.js',
    };
  }
  return null;
}

const pendingResults = names.map((name) => {
  const pid = readPid(name);
  const listenerSpec = listenerSpecForProcess(name);
  const recoveredListenerPid = listenerSpec
    ? findRepoNodeScriptListenerPid({
        cwd: process.cwd(),
        port: listenerSpec.port,
        scriptRelativePath: listenerSpec.scriptRelativePath,
      })
    : null;
  const fallbackPid = recoveredListenerPid && recoveredListenerPid !== pid ? recoveredListenerPid : null;
  const primaryStopped = stopPid(pid);
  const fallbackStopped = !primaryStopped && fallbackPid ? stopPid(fallbackPid) : false;
  const stopTargetPid = primaryStopped ? pid : fallbackStopped ? fallbackPid : null;
  return {
    name,
    pid,
    fallbackPid,
    stopTargetPid,
    stopped: primaryStopped || fallbackStopped,
  };
});

const results = [];
for (const entry of pendingResults) {
  results.push({
    ...entry,
    exited: entry.stopped && entry.stopTargetPid ? await waitForExit(entry.stopTargetPid) : !entry.stopTargetPid,
  });
}

for (const name of names) {
  const file = pidFilePath(runtimeDir, name);
  if (existsSync(file)) {
    rmSync(file, { force: true });
  }
}

console.log(JSON.stringify({ ok: true, runtimeDir, ensurePause, serverDirect, results }, null, 2));
