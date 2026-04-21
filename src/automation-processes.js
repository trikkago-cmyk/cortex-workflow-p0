import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultAgentRegistryFile, deriveExecutorPoolFromAgentRegistry } from './agent-registry.js';
import { loadExecutorPoolConfig } from './executor-pool.js';
import { resolvePanghuRuntimeConfig } from './panghu-runtime.js';
import { loadProjectEnv } from './project-env.js';
import { isLocalNotificationChannel } from './local-notification.js';
import { notionCommentPollingEnabled } from './notion-collaboration-mode.js';
import { createStore } from './store.js';

export function defaultRuntimeDir(cwd = process.cwd()) {
  return resolve(cwd, 'tmp', 'automation-runtime');
}

export function panghuPollerEnabled(env = process.env) {
  return String(env.PANGHU_POLL_ENABLE ?? '1').trim() !== '0';
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

function normalizeProjectId(value, fallback = 'PRJ-cortex') {
  const text = String(value || '').trim();
  return text || fallback;
}

export function notionLoopProcessName(projectId) {
  const suffix = normalizeProjectId(projectId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `notion-loop-${suffix}`;
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
      notionApiKey: process.env.NOTION_API_KEY,
      notionBaseUrl: process.env.NOTION_BASE_URL,
      notionVersion: process.env.NOTION_VERSION,
    }).workers.map((worker) => `executor-worker-${worker.agentName}`);
  }

  if (existsSync(executorPoolFile)) {
    return loadExecutorPoolConfig(executorPoolFile).workers.map((worker) => `executor-worker-${worker.agentName}`);
  }

  return [];
}

function notionEnabledProject(project) {
  return Boolean(
    project?.notionReviewPageId ||
      project?.notionMemoryPageId ||
      project?.notionScanPageId ||
      project?.rootPageUrl,
  );
}

export function listNotionLoopProjects({
  cwd = process.cwd(),
  dbPath = process.env.CORTEX_DB_PATH || resolve(cwd, 'db', 'cortex.db'),
  defaultProjectId = process.env.CORTEX_DEFAULT_PROJECT_ID || 'PRJ-cortex',
} = {}) {
  const projects = [];

  if (dbPath && existsSync(dbPath)) {
    try {
      const store = createStore({ dbPath });
      projects.push(...store.listProjects().filter(notionEnabledProject));
    } catch {}
  }

  if (projects.length === 0) {
    return [
      {
        projectId: normalizeProjectId(defaultProjectId),
      },
    ];
  }

  const deduped = new Map();
  for (const project of projects) {
    deduped.set(project.projectId, project);
  }
  return [...deduped.values()];
}

export function listManagedProcessNames({ cwd = process.cwd(), runtimeDir = defaultRuntimeDir(cwd) } = {}) {
  loadProjectEnv(cwd);

  const names = new Set([
    'cortex-server',
    'executor-multi-agent-handler',
  ]);

  if (notionCommentPollingEnabled(process.env)) {
    for (const project of listNotionLoopProjects({ cwd })) {
      names.add(notionLoopProcessName(project.projectId));
    }
  }

  if (panghuPollerShouldRun(process.env)) {
    names.add('panghu-poller');
  }
  if (localNotificationPollerEnabled(process.env, { cwd })) {
    names.add('local-notifier');
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
