import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultAgentRegistryFile, deriveExecutorPoolFromAgentRegistry } from '../src/agent-registry.js';
import {
  defaultServerDirectLaunchAgentPath,
  defaultServerDirectLaunchdLabel,
  launchctlDomain,
} from '../src/launchd.js';
import { findRepoNodeScriptListenerPid } from '../src/automation-runtime-ports.js';
import {
  clearAutomationEnsurePause,
  customAgentMcpEnabled,
  localNotificationPollerEnabled,
  notionCommentPollerShouldRun,
  panghuPollerEnabled,
  readAutomationEnsurePause,
} from '../src/automation-processes.js';
import { waitForAutomationStackReady } from '../src/automation-status.js';
import { notionCollaborationMode } from '../src/notion-collaboration-mode.js';
import { buildExecutorWorkerEnv, loadExecutorPoolConfig } from '../src/executor-pool.js';
import { resolvePanghuRuntimeConfig } from '../src/panghu-runtime.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

const cwd = process.cwd();
const runtimeDir = resolve(cwd, 'tmp', 'automation-runtime');
const notionBaseUrl = process.env.NOTION_BASE_URL || '';
const notionVersion = process.env.NOTION_VERSION || '';
const cortexBaseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const cortexDbPath = process.env.CORTEX_DB_PATH || resolve(cwd, 'db', 'cortex.db');
const cortexDefaultProjectId = process.env.CORTEX_DEFAULT_PROJECT_ID || 'PRJ-cortex';
const cortexDefaultChannel = process.env.CORTEX_DEFAULT_CHANNEL || 'hiredcity';
const projectIndexDatabaseId = process.env.NOTION_PROJECT_INDEX_DATABASE_ID || '';
const notionCollabMode = notionCollaborationMode(process.env);
const executorWebhookHost = process.env.EXECUTOR_WEBHOOK_HOST || '127.0.0.1';
const executorWebhookPort = String(process.env.EXECUTOR_WEBHOOK_PORT || 3010);
const executorWebhookUrl =
  process.env.EXECUTOR_WEBHOOK_URL || `http://${executorWebhookHost}:${executorWebhookPort}/handle`;
const executorWebhookToken = process.env.EXECUTOR_WEBHOOK_TOKEN || '';
const executorRoutingFile = process.env.EXECUTOR_ROUTING_FILE || resolve(cwd, 'docs', 'executor-routing.json');
const executorPoolFile = process.env.EXECUTOR_POOL_FILE || resolve(cwd, 'docs', 'executor-workers.json');
const agentRegistryFile = process.env.AGENT_REGISTRY_FILE || defaultAgentRegistryFile(cwd);
const notificationChannel = process.env.NOTIFICATION_CHANNEL || '';
const notificationTarget = process.env.NOTIFICATION_TARGET || '';
const panghuSendMode = process.env.PANGHU_SEND_MODE || 'stdout';
const panghuSendFile = process.env.PANGHU_SEND_FILE || resolve(cwd, 'tmp', 'panghu-sent-messages.jsonl');
const panghuSendCommand = process.env.PANGHU_SEND_COMMAND || '';
const panghuSendUrl = process.env.PANGHU_SEND_URL || '';
const panghuSendToken = process.env.PANGHU_SEND_TOKEN || '';
const panghuPollIntervalMs = String(process.env.PANGHU_POLL_INTERVAL_MS || 1500);
const panghuAllowDryRun = process.env.PANGHU_ALLOW_DRY_RUN || '';
const localNotificationPollIntervalMs = String(process.env.LOCAL_NOTIFICATION_POLL_INTERVAL_MS || 1000);
const notionCommentPollIntervalMs = String(process.env.NOTION_COMMENT_POLLER_INTERVAL_MS || 5000);
const notionCommentPollStatePath = process.env.NOTION_COMMENT_POLLER_STATE_PATH || '';
const cortexMcpHost = process.env.CORTEX_MCP_HOST || '127.0.0.1';
const cortexMcpPort = String(process.env.CORTEX_MCP_PORT || 19101);
const cortexMcpAllowedHosts = process.env.CORTEX_MCP_ALLOWED_HOSTS || '';
const cortexMcpBearerToken = process.env.CORTEX_MCP_BEARER_TOKEN || '';
const panghuRuntime = resolvePanghuRuntimeConfig({
  sendMode: panghuSendMode,
  sendFile: panghuSendFile,
  sendCommand: panghuSendCommand,
  sendUrl: panghuSendUrl,
  requireRealSender: '1',
  allowDryRun: panghuAllowDryRun,
});
const startSource = String(process.env.AUTOMATION_START_SOURCE || 'manual').trim() || 'manual';
const serverDirectLabel = process.env.CORTEX_SERVER_DIRECT_LABEL || defaultServerDirectLaunchdLabel();
const serverDirectPlistPath =
  process.env.CORTEX_SERVER_DIRECT_PLIST || defaultServerDirectLaunchAgentPath({ label: serverDirectLabel });
const launchdDomain = launchctlDomain();
const ensurePause = readAutomationEnsurePause({ runtimeDir });

if (ensurePause.active && startSource === 'automation_ensure' && ensurePause.payload?.reason === 'manual_stop') {
  console.log(
    JSON.stringify(
      {
        ok: true,
        runtimeDir,
        notionCollabMode,
        paused: true,
        pause: ensurePause.payload,
        startSource,
        results: [],
        readiness: null,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const clearedEnsurePause = ensurePause.active ? clearAutomationEnsurePause(runtimeDir) : false;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function inspectServerDirect() {
  const printResult = spawnSync('launchctl', ['print', `${launchdDomain}/${serverDirectLabel}`], {
    cwd,
    encoding: 'utf8',
  });
  return {
    label: serverDirectLabel,
    plistPath: serverDirectPlistPath,
    loaded: printResult.status === 0,
    status: printResult.status ?? 1,
    stdout: printResult.stdout.trim() || null,
    stderr: printResult.stderr.trim() || null,
  };
}

async function ensureServerDirectAvailable() {
  const initial = inspectServerDirect();
  if (!existsSync(serverDirectPlistPath)) {
    return {
      ...initial,
      action: 'missing_plist',
      ready: false,
      listenerPid: null,
    };
  }

  if (!initial.loaded) {
    const bootstrapResult = spawnSync('launchctl', ['bootstrap', launchdDomain, serverDirectPlistPath], {
      cwd,
      encoding: 'utf8',
    });
    const afterBootstrap = inspectServerDirect();
    if (bootstrapResult.status !== 0 && afterBootstrap.loaded !== true) {
      return {
        ...afterBootstrap,
        action: 'bootstrap_failed',
        ready: false,
        listenerPid: null,
        bootstrap: {
          status: bootstrapResult.status ?? 1,
          stdout: bootstrapResult.stdout.trim() || null,
          stderr: bootstrapResult.stderr.trim() || null,
        },
      };
    }
  }

  const deadline = Date.now() + 5_000;
  while (Date.now() <= deadline) {
    const listenerPid = resolveExistingRepoListenerPid('cortex-server');
    if (listenerPid) {
      return {
        ...inspectServerDirect(),
        action: initial.loaded ? 'already_loaded' : 'bootstrapped',
        ready: true,
        listenerPid,
      };
    }
    await sleep(150);
  }

  return {
    ...inspectServerDirect(),
    action: initial.loaded ? 'already_loaded' : 'bootstrapped',
    ready: false,
    listenerPid: null,
  };
}

const serverDirect = startSource === 'automation_ensure' ? null : await ensureServerDirectAvailable();

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

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function pidFileFor(name) {
  return join(runtimeDir, `${name}.pid`);
}

function logFileFor(name) {
  return join(runtimeDir, `${name}.log`);
}

function readPid(file) {
  if (!existsSync(file)) {
    return null;
  }

  const value = Number(readFileSync(file, 'utf8').trim());
  return Number.isFinite(value) && value > 0 ? value : null;
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

function listenerSpecForProcess(name) {
  if (name === 'cortex-server') {
    return {
      port: resolveCortexPort(cortexBaseUrl),
      scriptRelativePath: 'src/server.js',
    };
  }
  if (name === 'cortex-custom-agent-mcp') {
    return {
      port: cortexMcpPort,
      scriptRelativePath: 'src/cortex-mcp-server.js',
    };
  }
  if (name === 'executor-multi-agent-handler') {
    return {
      port: executorWebhookPort,
      scriptRelativePath: 'src/executor-multi-agent-handler.js',
    };
  }
  return null;
}

function resolveExistingRepoListenerPid(name) {
  const spec = listenerSpecForProcess(name);
  if (!spec) {
    return null;
  }

  return findRepoNodeScriptListenerPid({
    cwd,
    port: spec.port,
    scriptRelativePath: spec.scriptRelativePath,
  });
}

function spawnDetached(name, args, extraEnv = {}) {
  ensureDir(runtimeDir);
  const pidFile = pidFileFor(name);
  const currentPid = readPid(pidFile);
  if (isRunning(currentPid)) {
    return { name, status: 'already_running', pid: currentPid };
  }

  const listenerPid = resolveExistingRepoListenerPid(name);
  if (listenerPid) {
    writeFileSync(pidFile, `${listenerPid}\n`, 'utf8');
    return {
      name,
      status: 'listener_reused',
      pid: listenerPid,
      logPath: logFileFor(name),
      recoveredBy: 'repo_listener',
    };
  }

  const logPath = logFileFor(name);
  const out = openSync(logPath, 'a');
  const child = spawn('node', args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    detached: true,
    stdio: ['ignore', out, out],
  });

  child.unref();
  writeFileSync(pidFile, `${child.pid}\n`, 'utf8');
  return { name, status: 'started', pid: child.pid, logPath };
}

const results = [];

results.push(
  serverDirect?.ready
    ? {
        name: 'cortex-server',
        status: 'listener_reused',
        pid: serverDirect.listenerPid,
        logPath: logFileFor('cortex-server'),
        recoveredBy: 'server_direct_launchd',
      }
    : spawnDetached('cortex-server', ['src/server.js'], {
        PORT: resolveCortexPort(cortexBaseUrl),
        CORTEX_DB_PATH: cortexDbPath,
        CORTEX_DEFAULT_PROJECT_ID: cortexDefaultProjectId,
        CORTEX_DEFAULT_CHANNEL: cortexDefaultChannel,
      }),
);

if (customAgentMcpEnabled(process.env)) {
  results.push(
    spawnDetached('cortex-custom-agent-mcp', ['src/cortex-mcp-server.js'], {
      CORTEX_BASE_URL: cortexBaseUrl,
      CORTEX_MCP_HOST: cortexMcpHost,
      CORTEX_MCP_PORT: cortexMcpPort,
      CORTEX_MCP_ALLOWED_HOSTS: cortexMcpAllowedHosts,
      CORTEX_MCP_BEARER_TOKEN: cortexMcpBearerToken,
    }),
  );
}

results.push(
  spawnDetached('executor-multi-agent-handler', ['src/executor-multi-agent-handler.js'], {
    EXECUTOR_HANDLER_HOST: executorWebhookHost,
    EXECUTOR_HANDLER_PORT: executorWebhookPort,
    CORTEX_BASE_URL: cortexBaseUrl,
    NOTION_BASE_URL: notionBaseUrl,
    NOTION_VERSION: notionVersion,
    NOTION_PROJECT_INDEX_DATABASE_ID: projectIndexDatabaseId,
    CORTEX_DISPLAY_TIMEZONE: process.env.CORTEX_DISPLAY_TIMEZONE || 'Asia/Shanghai',
    NOTIFICATION_CHANNEL: notificationChannel,
    NOTIFICATION_TARGET: notificationTarget,
    ...(existsSync(agentRegistryFile) ? { AGENT_REGISTRY_FILE: agentRegistryFile } : {}),
  }),
);

if (panghuPollerEnabled(process.env)) {
  if (panghuRuntime.startAllowed) {
    results.push(
      spawnDetached('panghu-poller', ['src/panghu-poller.js'], {
        CORTEX_BASE_URL: cortexBaseUrl,
        PANGHU_POLL_INTERVAL_MS: panghuPollIntervalMs,
        PANGHU_SEND_MODE: panghuSendMode,
        PANGHU_SEND_FILE: panghuSendFile,
        PANGHU_SEND_COMMAND: panghuSendCommand,
        PANGHU_SEND_URL: panghuSendUrl,
        PANGHU_SEND_TOKEN: panghuSendToken,
        PANGHU_REQUIRE_REAL_SENDER: '1',
        PANGHU_ALLOW_DRY_RUN: panghuAllowDryRun,
      }),
    );
  } else {
    results.push({
      name: 'panghu-poller',
      status: 'skipped',
      reason: panghuRuntime.reason,
      sendMode: panghuRuntime.sendMode,
      realSenderConfigured: panghuRuntime.realSenderConfigured,
      allowDryRun: panghuRuntime.allowDryRun,
    });
  }
}

if (localNotificationPollerEnabled(process.env, { cwd, dbPath: cortexDbPath })) {
  results.push(
    spawnDetached('local-notifier', ['src/local-notification-poller.js'], {
      CORTEX_BASE_URL: cortexBaseUrl,
      LOCAL_NOTIFICATION_POLL_INTERVAL_MS: localNotificationPollIntervalMs,
    }),
  );
}

if (notionCommentPollerShouldRun(process.env, { cwd, dbPath: cortexDbPath })) {
  results.push(
    spawnDetached('notion-comment-poller', ['src/notion-comment-poller.js'], {
      CORTEX_BASE_URL: cortexBaseUrl,
      CORTEX_DB_PATH: cortexDbPath,
      NOTION_COMMENT_POLLER_INTERVAL_MS: notionCommentPollIntervalMs,
      ...(notionCommentPollStatePath ? { NOTION_COMMENT_POLLER_STATE_PATH: notionCommentPollStatePath } : {}),
    }),
  );
}

if (existsSync(agentRegistryFile) || existsSync(executorPoolFile)) {
  const pool = existsSync(agentRegistryFile)
    ? deriveExecutorPoolFromAgentRegistry(agentRegistryFile, {
        fallbackWebhookUrl: executorWebhookUrl,
        fallbackWebhookToken: executorWebhookToken,
        notionBaseUrl,
        notionVersion,
      })
    : loadExecutorPoolConfig(executorPoolFile);
  for (const worker of pool.workers) {
    results.push(
      spawnDetached(`executor-worker-${worker.agentName}`, ['src/executor-worker.js'], {
        CORTEX_BASE_URL: cortexBaseUrl,
        ...buildExecutorWorkerEnv({
          ...worker,
          routingFile: worker.routingFile,
          webhookUrl: worker.webhookUrl || executorWebhookUrl,
          webhookToken: worker.webhookToken || executorWebhookToken,
          notionBaseUrl: worker.notionBaseUrl || notionBaseUrl,
          notionVersion: worker.notionVersion || notionVersion,
        }),
      }),
    );
  }
}

const expectedNames = results
  .filter((result) => result.status !== 'skipped')
  .map((result) => result.name);

const readiness = await waitForAutomationStackReady({
  cwd,
  runtimeDir,
  cortexBaseUrl,
  names: expectedNames,
});

const payload = {
  ok: readiness.ok,
  runtimeDir,
  notionCollabMode,
  startSource,
  clearedEnsurePause,
  serverDirect,
  results,
  readiness,
};

console.log(JSON.stringify(payload, null, 2));

if (!readiness.ok) {
  process.exitCode = 1;
}
