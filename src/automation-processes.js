import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultAgentRegistryFile, deriveExecutorPoolFromAgentRegistry } from './agent-registry.js';
import { loadExecutorPoolConfig } from './executor-pool.js';
import { resolvePanghuRuntimeConfig } from './panghu-runtime.js';
import { loadProjectEnv } from './project-env.js';
import { isLocalNotificationChannel } from './local-notification.js';
import { createStore } from './store.js';
import { notionCommentPollerEnabled, resolveNotionCommentPollTargets } from './notion-comment-poller.js';

export function defaultRuntimeDir(cwd = process.cwd()) {
  return resolve(cwd, 'tmp', 'automation-runtime');
}

export function automationEnsurePauseFilePath(runtimeDir) {
  return join(runtimeDir, 'automation-ensure.pause.json');
}

function normalizePauseTtlMs(value, fallback = 45_000) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.max(1_000, Math.round(numericValue));
}

export function writeAutomationEnsurePause({
  runtimeDir = defaultRuntimeDir(),
  reason = 'manual_stop',
  ttlMs = 45_000,
  now = Date.now(),
  metadata = {},
} = {}) {
  mkdirSync(runtimeDir, { recursive: true });

  const normalizedNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const normalizedTtlMs = normalizePauseTtlMs(ttlMs);
  const pauseUntilMs = normalizedNow + normalizedTtlMs;
  const filePath = automationEnsurePauseFilePath(runtimeDir);
  const payload = {
    reason: String(reason || 'manual_stop'),
    ttl_ms: normalizedTtlMs,
    paused_at: new Date(normalizedNow).toISOString(),
    pause_until: new Date(pauseUntilMs).toISOString(),
    ...metadata,
  };

  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    filePath,
    payload: {
      ...payload,
      pauseUntilMs,
    },
  };
}

export function clearAutomationEnsurePause(runtimeDir = defaultRuntimeDir()) {
  const filePath = automationEnsurePauseFilePath(runtimeDir);
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
    return true;
  }
  return false;
}

export function readAutomationEnsurePause({
  runtimeDir = defaultRuntimeDir(),
  now = Date.now(),
  autoCleanupExpired = true,
} = {}) {
  const filePath = automationEnsurePauseFilePath(runtimeDir);
  if (!existsSync(filePath)) {
    return {
      filePath,
      active: false,
      payload: null,
      expired: false,
    };
  }

  try {
    const payload = JSON.parse(readFileSync(filePath, 'utf8'));
    const pauseUntilMs = Date.parse(String(payload?.pause_until || ''));
    const normalizedNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const active = Number.isFinite(pauseUntilMs) && pauseUntilMs > normalizedNow;
    const expired = Number.isFinite(pauseUntilMs) && pauseUntilMs <= normalizedNow;

    if (expired && autoCleanupExpired) {
      rmSync(filePath, { force: true });
    }

    return {
      filePath,
      active,
      expired,
      payload: {
        ...payload,
        pauseUntilMs: Number.isFinite(pauseUntilMs) ? pauseUntilMs : null,
      },
    };
  } catch (error) {
    if (autoCleanupExpired) {
      rmSync(filePath, { force: true });
    }

    return {
      filePath,
      active: false,
      expired: false,
      payload: null,
      error: error.message,
    };
  }
}

export function panghuPollerEnabled(env = process.env) {
  return String(env.PANGHU_POLL_ENABLE ?? '1').trim() !== '0';
}

export function customAgentMcpEnabled(env = process.env) {
  const explicit = String(env.CORTEX_MCP_ENABLE ?? '').trim().toLowerCase();
  if (explicit === '0' || explicit === 'false' || explicit === 'no' || explicit === 'off') {
    return false;
  }
  return true;
}

export function panghuPollerShouldRun(env = process.env) {
  if (!panghuPollerEnabled(env)) {
    return false;
  }

  return resolvePanghuRuntimeConfig(
    {
      requireRealSender: env.PANGHU_REQUIRE_REAL_SENDER ?? '1',
      allowDryRun: env.PANGHU_ALLOW_DRY_RUN,
      sendMode: env.PANGHU_SEND_MODE,
      sendUrl: env.PANGHU_SEND_URL,
      sendCommand: env.PANGHU_SEND_COMMAND,
      sendFile: env.PANGHU_SEND_FILE,
    },
    env,
  ).startAllowed;
}

function anyProjectUsesLocalNotification({
  cwd = process.cwd(),
  dbPath = process.env.CORTEX_DB_PATH || resolve(cwd, 'db', 'cortex.db'),
} = {}) {
  if (!dbPath || !existsSync(dbPath)) {
    return false;
  }

  try {
    const store = createStore({ dbPath });
    const enabled = store.listProjects().some((project) => isLocalNotificationChannel(project.notificationChannel));
    store.close();
    return enabled;
  } catch {
    return false;
  }
}

export function localNotificationPollerEnabled(env = process.env, options = {}) {
  const explicit = String(env.LOCAL_NOTIFICATION_ENABLE ?? '').trim().toLowerCase();
  if (explicit === '1' || explicit === 'true' || explicit === 'yes' || explicit === 'on') {
    return true;
  }
  if (explicit === '0' || explicit === 'false' || explicit === 'no' || explicit === 'off') {
    return false;
  }

  const channel = String(env.NOTIFICATION_CHANNEL || '').trim().toLowerCase();
  if (isLocalNotificationChannel(channel)) {
    return true;
  }

  return anyProjectUsesLocalNotification(options);
}

export function notionCommentPollerShouldRun(env = process.env, options = {}) {
  if (!notionCommentPollerEnabled(env)) {
    return false;
  }

  if (!String(env.NOTION_API_KEY || '').trim()) {
    return false;
  }

  try {
    return resolveNotionCommentPollTargets({
      cwd: options.cwd || process.cwd(),
      env,
      dbPath: options.dbPath,
    }).length > 0;
  } catch {
    return false;
  }
}

function normalizeProjectId(value, fallback = 'PRJ-cortex') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeName(name) {
  const value = String(name || '').trim();
  return value || null;
}

function namesFromRuntimePidFiles(runtimeDir) {
  if (!runtimeDir || !existsSync(runtimeDir)) {
    return [];
  }

  return readdirSync(runtimeDir)
    .filter((fileName) => fileName.endsWith('.pid'))
    .map((fileName) => normalizeName(fileName.slice(0, -4)))
    .filter(Boolean);
}

function collectFilesRecursively(dirPath, predicate, results = []) {
  if (!dirPath || !existsSync(dirPath)) {
    return results;
  }

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(entryPath, predicate, results);
      continue;
    }

    if (!predicate || predicate(entryPath, entry)) {
      results.push(entryPath);
    }
  }

  return results;
}

function dedupeExistingFiles(files = []) {
  const resolved = new Set();

  for (const filePath of files) {
    const normalized = filePath ? resolve(filePath) : null;
    if (normalized && existsSync(normalized)) {
      resolved.add(normalized);
    }
  }

  return [...resolved].sort();
}

function namesFromConfiguredWorkers(cwd = process.cwd()) {
  loadProjectEnv(cwd);

  const agentRegistryFile = process.env.AGENT_REGISTRY_FILE || defaultAgentRegistryFile(cwd);
  const executorPoolFile = process.env.EXECUTOR_POOL_FILE || resolve(cwd, 'docs', 'executor-workers.json');

  if (existsSync(agentRegistryFile)) {
    return deriveExecutorPoolFromAgentRegistry(agentRegistryFile, {
      fallbackWebhookUrl: process.env.EXECUTOR_WEBHOOK_URL,
      fallbackWebhookToken: process.env.EXECUTOR_WEBHOOK_TOKEN,
      notionBaseUrl: process.env.NOTION_BASE_URL,
      notionVersion: process.env.NOTION_VERSION,
    }).workers.map((worker) => `executor-worker-${worker.agentName}`);
  }

  if (existsSync(executorPoolFile)) {
    return loadExecutorPoolConfig(executorPoolFile).workers.map((worker) => `executor-worker-${worker.agentName}`);
  }

  return [];
}

export function listManagedProcessNames({ cwd = process.cwd(), runtimeDir = defaultRuntimeDir(cwd) } = {}) {
  loadProjectEnv(cwd);

  const names = new Set([
    'cortex-server',
    'cortex-custom-agent-mcp',
    'executor-multi-agent-handler',
  ]);

  if (!customAgentMcpEnabled(process.env)) {
    names.delete('cortex-custom-agent-mcp');
  }

  if (panghuPollerShouldRun(process.env)) {
    names.add('panghu-poller');
  }
  if (localNotificationPollerEnabled(process.env, { cwd })) {
    names.add('local-notifier');
  }
  if (notionCommentPollerShouldRun(process.env, { cwd })) {
    names.add('notion-comment-poller');
  }

  for (const name of namesFromConfiguredWorkers(cwd)) {
    names.add(name);
  }

  for (const name of namesFromRuntimePidFiles(runtimeDir)) {
    names.add(name);
  }

  return [...names].filter(Boolean).sort();
}

export function listManagedStackWatchFiles({ cwd = process.cwd() } = {}) {
  loadProjectEnv(cwd);

  const srcDir = resolve(cwd, 'src');
  const scriptsDir = resolve(cwd, 'scripts');
  const docsDir = resolve(cwd, 'docs');

  const jsFiles = [
    ...collectFilesRecursively(srcDir, (filePath) => filePath.endsWith('.js')),
    ...collectFilesRecursively(scriptsDir, (filePath) => filePath.endsWith('.js')),
  ];

  return dedupeExistingFiles([
    ...jsFiles,
    resolve(cwd, 'package.json'),
    process.env.AGENT_REGISTRY_FILE || defaultAgentRegistryFile(cwd),
    process.env.EXECUTOR_POOL_FILE || resolve(docsDir, 'executor-workers.json'),
    process.env.EXECUTOR_ROUTING_FILE || resolve(docsDir, 'executor-routing.json'),
    resolve(docsDir, 'notion-routing.json'),
    resolve(cwd, '.env'),
    resolve(cwd, '.env.local'),
    resolve(cwd, '.env.development'),
    resolve(cwd, '.env.production'),
  ]);
}

export function pidFilePath(runtimeDir, name) {
  return join(runtimeDir, `${name}.pid`);
}

export function logFilePath(runtimeDir, name) {
  return join(runtimeDir, `${name}.log`);
}
