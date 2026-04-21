import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultAgentRegistryFile, deriveExecutorPoolFromAgentRegistry } from '../src/agent-registry.js';
import { listNotionLoopProjects, localNotificationPollerEnabled, notionLoopProcessName, panghuPollerEnabled } from '../src/automation-processes.js';
import { notionCollaborationMode, notionCommentPollingEnabled } from '../src/notion-collaboration-mode.js';
import { buildExecutorWorkerEnv, loadExecutorPoolConfig } from '../src/executor-pool.js';
import { resolvePanghuRuntimeConfig } from '../src/panghu-runtime.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

const cwd = process.cwd();
const runtimeDir = resolve(cwd, 'tmp', 'automation-runtime');
const notionApiKey = process.env.NOTION_API_KEY || '';
const notionBaseUrl = process.env.NOTION_BASE_URL || '';
const notionVersion = process.env.NOTION_VERSION || '';
const cortexBaseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const cortexDbPath = process.env.CORTEX_DB_PATH || resolve(cwd, 'db', 'cortex.db');
const cortexDefaultProjectId = process.env.CORTEX_DEFAULT_PROJECT_ID || 'PRJ-cortex';
const cortexDefaultChannel = process.env.CORTEX_DEFAULT_CHANNEL || 'hiredcity';
const projectIndexDatabaseId = process.env.NOTION_PROJECT_INDEX_DATABASE_ID || '';
const notionLoopIntervalMs = String(process.env.LOOP_INTERVAL_MS || 3000);
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
const panghuRuntime = resolvePanghuRuntimeConfig({
  sendMode: panghuSendMode,
  sendFile: panghuSendFile,
  sendCommand: panghuSendCommand,
  sendUrl: panghuSendUrl,
  requireRealSender: '1',
  allowDryRun: panghuAllowDryRun,
});

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

function spawnDetached(name, args, extraEnv = {}) {
  ensureDir(runtimeDir);
  const pidFile = pidFileFor(name);
  const currentPid = readPid(pidFile);
  if (isRunning(currentPid)) {
    return { name, status: 'already_running', pid: currentPid };
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
  spawnDetached('cortex-server', ['src/server.js'], {
    PORT: resolveCortexPort(cortexBaseUrl),
    CORTEX_DB_PATH: cortexDbPath,
    CORTEX_DEFAULT_PROJECT_ID: cortexDefaultProjectId,
    CORTEX_DEFAULT_CHANNEL: cortexDefaultChannel,
  }),
);

results.push(
  spawnDetached('executor-multi-agent-handler', ['src/executor-multi-agent-handler.js'], {
    EXECUTOR_HANDLER_HOST: executorWebhookHost,
    EXECUTOR_HANDLER_PORT: executorWebhookPort,
    CORTEX_BASE_URL: cortexBaseUrl,
    NOTION_API_KEY: notionApiKey,
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

if (notionApiKey && notionCommentPollingEnabled(process.env)) {
  for (const project of listNotionLoopProjects({
    cwd,
    dbPath: cortexDbPath,
    defaultProjectId: cortexDefaultProjectId,
  })) {
    results.push(
      spawnDetached(notionLoopProcessName(project.projectId), ['scripts/notion-loop.js'], {
        CORTEX_BASE_URL: cortexBaseUrl,
        NOTION_API_KEY: notionApiKey,
        NOTION_BASE_URL: notionBaseUrl,
        NOTION_VERSION: notionVersion,
        LOOP_INTERVAL_MS: notionLoopIntervalMs,
        NOTION_PROJECT_INDEX_DATABASE_ID: projectIndexDatabaseId,
        PROJECT_ID: project.projectId,
        ...(project.name ? { PROJECT_NAME: project.name } : {}),
      }),
    );
  }
}

if (existsSync(agentRegistryFile) || existsSync(executorPoolFile)) {
  const pool = existsSync(agentRegistryFile)
    ? deriveExecutorPoolFromAgentRegistry(agentRegistryFile, {
        fallbackWebhookUrl: executorWebhookUrl,
        fallbackWebhookToken: executorWebhookToken,
        notionApiKey,
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
          notionApiKey: worker.notionApiKey || notionApiKey,
          notionBaseUrl: worker.notionBaseUrl || notionBaseUrl,
          notionVersion: worker.notionVersion || notionVersion,
        }),
      }),
    );
  }
}

console.log(JSON.stringify({ ok: true, runtimeDir, notionCollabMode, results }, null, 2));
