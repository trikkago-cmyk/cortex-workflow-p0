import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildAgentWebhookUrl,
  deriveExecutorPoolFromAgentRegistry,
  loadAgentRegistry,
  resolveExecutorRouteFromAgentRegistry,
} from '../src/agent-registry.js';
import { createCortexServer } from '../src/server.js';
import { createMultiAgentExecutor } from '../src/executor-multi-agent-handler.js';
import { buildExecutorWorkerEnv } from '../src/executor-pool.js';
import { createExecutorWorker } from '../src/executor-worker.js';

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test('loadAgentRegistry normalizes agents and derives direct webhook routes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-agent-registry-'));
  const registryFile = join(dir, 'agent-registry.json');
  writeFileSync(
    registryFile,
    JSON.stringify(
      {
        defaults: {
          project_id: 'PRJ-cortex',
          source: 'notion_comment',
          mode: 'webhook',
          poll_interval_ms: 2500,
        },
        agents: [
          {
            agent_name: 'agent-router',
            handler_kind: 'router',
            owner_agent: null,
            only_unassigned: true,
          },
          {
            agent_name: 'agent-reviewer',
            handler_kind: 'pm',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const registry = loadAgentRegistry(registryFile);
  assert.equal(registry.agents.length, 2);
  assert.deepEqual(registry.agents[0], {
    agentName: 'agent-router',
    enabled: true,
    handlerKind: 'router',
    projectId: 'PRJ-cortex',
    source: 'notion_comment',
    targetType: null,
    channel: null,
    ownerAgent: null,
    includeUnassigned: false,
    onlyUnassigned: true,
    mode: 'webhook',
    pollIntervalMs: 2500,
    routingFile: null,
    webhookUrl: null,
    webhookToken: null,
    notionApiKey: null,
    notionBaseUrl: null,
    notionVersion: null,
    extraEnv: {},
  });

  const pool = deriveExecutorPoolFromAgentRegistry(registryFile, {
    fallbackWebhookUrl: 'http://127.0.0.1:3010/handle',
    fallbackWebhookToken: 'registry-token',
  });

  assert.equal(pool.workers.length, 2);
  assert.equal(pool.workers[0].webhookUrl, 'http://127.0.0.1:3010/handle/agent-router');
  assert.equal(pool.workers[1].webhookUrl, 'http://127.0.0.1:3010/handle/agent-reviewer');
  assert.equal(pool.workers[1].webhookToken, 'registry-token');

  const env = buildExecutorWorkerEnv(pool.workers[1]);
  assert.equal(env.AGENT_NAME, 'agent-reviewer');
  assert.equal(env.AGENT_REGISTRY_FILE, registryFile);
  assert.equal(buildAgentWebhookUrl('http://127.0.0.1:3010/handle', 'agent-reviewer'), pool.workers[1].webhookUrl);
});

test('resolveExecutorRouteFromAgentRegistry returns per-agent route and token', () => {
  const route = resolveExecutorRouteFromAgentRegistry({
    agentName: 'agent-reviewer',
    registry: {
      defaults: {
        webhook_url: 'http://127.0.0.1:3010/handle',
        webhook_token: 'default-token',
      },
      agents: [
        {
          agentName: 'agent-reviewer',
          enabled: true,
          webhookUrl: null,
          webhookToken: null,
        },
      ],
    },
  });

  assert.deepEqual(route, {
    url: 'http://127.0.0.1:3010/handle/agent-reviewer',
    token: 'default-token',
  });
});

test('executor worker can route via agent registry without executor-routing.json', async (t) => {
  const received = [];
  const webhookServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    received.push({
      headers: req.headers,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, status: 'done', result_summary: 'registry route handled' }));
  });

  await new Promise((resolve) => webhookServer.listen(0, '127.0.0.1', resolve));
  t.after(() => webhookServer.close());

  const registryDir = mkdtempSync(join(tmpdir(), 'cortex-agent-registry-worker-'));
  const registryFile = join(registryDir, 'agent-registry.json');
  writeFileSync(
    registryFile,
    JSON.stringify(
      {
        defaults: {
          webhook_url: `http://127.0.0.1:${webhookServer.address().port}/handle`,
          webhook_token: 'registry-token',
        },
        agents: [
          {
            agent_name: 'agent-pm',
            handler_kind: 'pm',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-agent-registry-worker-db-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-30T09:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  const command = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-pm',
    page_id: 'page-pm',
    discussion_id: 'discussion-registry-route',
    comment_id: 'comment-registry-route',
    body: '[agent: agent-pm] [continue] 继续处理 registry 路由',
    context_quote: 'registry route test',
    source_url: 'notion://page/page-pm/discussion/discussion-registry-route/comment/comment-registry-route',
  });

  assert.equal(command.status, 200);

  const worker = createExecutorWorker({
    baseUrl,
    agentName: 'agent-pm',
    source: 'notion_comment',
    mode: 'webhook',
    agentRegistryFile: registryFile,
    notionApiKey: 'test-notion-key',
    notionReply: async () => ({ id: 'reply-registry-route' }),
    logger: { info() {}, error() {} },
  });

  const result = await worker.pollOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.handled.status, 'done');
  assert.equal(received.length, 1);
  assert.equal(received[0].headers.authorization, 'Bearer registry-token');
  assert.equal(received[0].body.agent_name, 'agent-pm');
});

test('multi-agent executor dispatches registry-defined handler kinds', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-agent-registry-handler-'));
  const registryFile = join(dir, 'agent-registry.json');
  writeFileSync(
    registryFile,
    JSON.stringify(
      {
        defaults: {
          project_id: 'PRJ-cortex',
        },
        agents: [
          {
            agent_name: 'agent-reviewer',
            handler_kind: 'pm',
            owner_agent: 'agent-reviewer',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-agent-registry-handler-db-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-30T10:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  const runScriptCalls = [];
  const executor = createMultiAgentExecutor({
    cortexBaseUrl: baseUrl,
    agentRegistryFile: registryFile,
    runScript(scriptName) {
      runScriptCalls.push(scriptName);
      return { scriptName };
    },
  });

  const result = await executor({
    agentName: 'agent-reviewer',
    projectId: 'PRJ-cortex',
    command: {
      command_id: 'CMD-registry-handler-001',
      instruction: '把这段需求整理成 why/context/what',
      context_quote: '这里是需求背景',
      source: 'notion_comment',
      source_url: 'notion://page/page-001/discussion/discussion-001/comment/comment-001',
      target_type: 'page',
      target_id: 'page-001',
    },
  });

  assert.equal(result.status, 'done');
  assert.match(result.reply_text, /已转成 PM 任务简报/);
  assert.deepEqual(runScriptCalls, []);
});
