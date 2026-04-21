import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defaultAgentRegistryFile, deriveExecutorPoolFromAgentRegistry } from '../src/agent-registry.js';
import { listNotionLoopProjects } from '../src/automation-processes.js';
import { notionCollaborationMode, notionCommentPollingEnabled } from '../src/notion-collaboration-mode.js';
import { buildExecutorWorkerEnv, loadExecutorPoolConfig } from '../src/executor-pool.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

const cwd = process.cwd();
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const port = String(process.env.PORT || 19100);
const dbPath = process.env.CORTEX_DB_PATH || join(cwd, 'db/cortex.db');
const pollIntervalMs = String(process.env.PANGHU_POLL_INTERVAL_MS || 1500);
const sendMode = process.env.PANGHU_SEND_MODE || 'stdout';
const sendFile = process.env.PANGHU_SEND_FILE || join(cwd, 'tmp/panghu-sent-messages.jsonl');
const sendCommand = process.env.PANGHU_SEND_COMMAND || '';
const sendUrl = process.env.PANGHU_SEND_URL || '';
const sendToken = process.env.PANGHU_SEND_TOKEN || '';
const notionApiKey = process.env.NOTION_API_KEY || '';
const notionBaseUrl = process.env.NOTION_BASE_URL || '';
const notionVersion = process.env.NOTION_VERSION || '';
const notionLoopIntervalMs = String(process.env.LOOP_INTERVAL_MS || 3000);
const notionCollabMode = notionCollaborationMode(process.env);
const projectIndexDatabaseId = process.env.NOTION_PROJECT_INDEX_DATABASE_ID || '';
const executorEnabled = process.env.EXECUTOR_ENABLE === '1';
const executorPoolEnable = process.env.EXECUTOR_POOL_ENABLE === '1';
const executorMode = process.env.EXECUTOR_MODE || 'webhook';
const executorAgentName = process.env.EXECUTOR_AGENT_NAME || 'agent-notion-worker';
const executorProjectId = process.env.EXECUTOR_PROJECT_ID || process.env.PROJECT_ID || 'PRJ-cortex';
const executorSource = process.env.EXECUTOR_SOURCE || 'notion_comment';
const executorOwnerAgent = process.env.EXECUTOR_OWNER_AGENT || executorAgentName;
const executorIncludeUnassigned = process.env.EXECUTOR_INCLUDE_UNASSIGNED || '1';
const executorPollIntervalMs = String(process.env.EXECUTOR_POLL_INTERVAL_MS || 1000);
const executorWebhookPort = String(process.env.EXECUTOR_WEBHOOK_PORT || 3010);
const executorWebhookHost = process.env.EXECUTOR_WEBHOOK_HOST || '127.0.0.1';
const executorWebhookToken = process.env.EXECUTOR_WEBHOOK_TOKEN || '';
const defaultExecutorRoutingFile = join(cwd, 'docs/executor-routing.json');
const executorRoutingFile = process.env.EXECUTOR_ROUTING_FILE || defaultExecutorRoutingFile;
const usingDefaultExecutorRoutingFile = !process.env.EXECUTOR_ROUTING_FILE;
const defaultExecutorPoolFile = join(cwd, 'docs/executor-workers.json');
const executorPoolFile = process.env.EXECUTOR_POOL_FILE || defaultExecutorPoolFile;
const agentRegistryFile = process.env.AGENT_REGISTRY_FILE || defaultAgentRegistryFile(cwd);
const executorWebhookUrl =
  process.env.EXECUTOR_WEBHOOK_URL || `http://${executorWebhookHost}:${executorWebhookPort}/handle`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        return;
      }
    } catch {}
    await sleep(200);
  }

  throw new Error(`Timed out waiting for ${url}/health`);
}

function spawnProcess(name, args, env) {
  const child = spawn('node', args, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[dev-stack] ${name} exited via ${signal}`);
      return;
    }
    console.log(`[dev-stack] ${name} exited with code ${code}`);
  });

  return child;
}

const server = spawnProcess('cortex-server', ['src/server.js'], {
  PORT: port,
  CORTEX_DB_PATH: dbPath,
});

let poller;
let notionLoops = [];
let executorStub;
let executorWorker;
let executorWorkers = [];
let shuttingDown = false;

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  executorWorker?.kill(signal);
  for (const worker of executorWorkers) {
    worker.kill(signal);
  }
  executorStub?.kill(signal);
  for (const notionLoop of notionLoops) {
    notionLoop.kill(signal);
  }
  poller?.kill(signal);
  server.kill(signal);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  await waitForHealth(baseUrl);
  poller = spawnProcess('panghu-poller', ['src/panghu-poller.js'], {
    CORTEX_BASE_URL: baseUrl,
    PANGHU_POLL_INTERVAL_MS: pollIntervalMs,
    PANGHU_SEND_MODE: sendMode,
    PANGHU_SEND_FILE: sendFile,
    PANGHU_SEND_COMMAND: sendCommand,
    PANGHU_SEND_URL: sendUrl,
    PANGHU_SEND_TOKEN: sendToken,
  });

  if (notionApiKey && notionCommentPollingEnabled(process.env)) {
    notionLoops = listNotionLoopProjects({
      cwd,
      dbPath,
      defaultProjectId: process.env.CORTEX_DEFAULT_PROJECT_ID || 'PRJ-cortex',
    }).map((project) =>
      spawnProcess(`notion-loop:${project.projectId}`, ['scripts/notion-loop.js'], {
        CORTEX_BASE_URL: baseUrl,
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

  if (
    executorEnabled &&
    executorMode === 'webhook' &&
    !process.env.EXECUTOR_WEBHOOK_URL &&
    usingDefaultExecutorRoutingFile &&
    existsSync(defaultExecutorRoutingFile)
  ) {
    executorStub = spawnProcess('executor-webhook-stub', ['src/executor-webhook-stub.js'], {
      EXECUTOR_WEBHOOK_HOST: executorWebhookHost,
      EXECUTOR_WEBHOOK_PORT: executorWebhookPort,
    });

    await waitForHealth(`http://${executorWebhookHost}:${executorWebhookPort}`);
  }

  if (executorEnabled && executorPoolEnable && (existsSync(agentRegistryFile) || existsSync(executorPoolFile))) {
    const poolConfig = existsSync(agentRegistryFile)
      ? deriveExecutorPoolFromAgentRegistry(agentRegistryFile, {
          fallbackWebhookUrl: executorWebhookUrl,
          fallbackWebhookToken: executorWebhookToken,
          notionApiKey,
          notionBaseUrl,
          notionVersion,
        })
      : loadExecutorPoolConfig(executorPoolFile);
    executorWorkers = poolConfig.workers.map((worker) =>
      spawnProcess(`executor-worker:${worker.agentName}`, ['src/executor-worker.js'], {
        CORTEX_BASE_URL: baseUrl,
        ...buildExecutorWorkerEnv({
          ...worker,
          mode: worker.mode || executorMode,
          routingFile: worker.routingFile,
          webhookUrl: worker.webhookUrl || executorWebhookUrl,
          webhookToken: worker.webhookToken || executorWebhookToken,
          notionApiKey: worker.notionApiKey || notionApiKey,
          notionBaseUrl: worker.notionBaseUrl || notionBaseUrl,
          notionVersion: worker.notionVersion || notionVersion,
        }),
      }),
    );
  } else if (executorEnabled) {
    executorWorker = spawnProcess('executor-worker', ['src/executor-worker.js'], {
      CORTEX_BASE_URL: baseUrl,
      AGENT_NAME: executorAgentName,
      PROJECT_ID: executorProjectId,
      SOURCE: executorSource,
      OWNER_AGENT: executorOwnerAgent,
      INCLUDE_UNASSIGNED: executorIncludeUnassigned,
      EXECUTOR_MODE: executorMode,
      EXECUTOR_ROUTING_FILE: executorRoutingFile,
      EXECUTOR_WEBHOOK_URL: executorWebhookUrl,
      EXECUTOR_WEBHOOK_TOKEN: executorWebhookToken,
      EXECUTOR_POLL_INTERVAL_MS: executorPollIntervalMs,
      NOTION_API_KEY: notionApiKey,
      NOTION_BASE_URL: notionBaseUrl,
      NOTION_VERSION: notionVersion,
    });
  }

  console.log(`[dev-stack] cortex ready at ${baseUrl}`);
  console.log(`[dev-stack] panghu sender mode: ${sendMode}`);
  console.log(
    `[dev-stack] notion collaboration: ${notionCollabMode}${
      notionApiKey && notionCommentPollingEnabled(process.env)
        ? ' (legacy notion-loop enabled)'
        : notionApiKey
          ? ' (custom agent mode, no poller)'
          : ' (NOTION_API_KEY unset)'
    }`,
  );
  console.log(
    `[dev-stack] executor worker: ${
      executorEnabled
        ? executorPoolEnable && (existsSync(agentRegistryFile) || existsSync(executorPoolFile))
          ? `pool enabled (${executorWorkers.length} workers)`
          : `enabled (${executorMode})`
        : 'disabled'
    }`,
  );
  console.log('[dev-stack] press Ctrl+C to stop');
} catch (error) {
  console.error('[dev-stack] failed to start stack', error);
  shutdown('SIGTERM');
  process.exitCode = 1;
}
