import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';
import { createExecutorWorker } from '../src/executor-worker.js';
import { buildExecutorWorkerEnv, loadExecutorPoolConfig } from '../src/executor-pool.js';

test('loadExecutorPoolConfig applies defaults and normalizes worker settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-executor-pool-'));
  const filePath = join(dir, 'executor-workers.json');
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        defaults: {
          project_id: 'PRJ-cortex',
          source: 'notion_comment',
          mode: 'webhook',
          poll_interval_ms: 5000,
          routing_file: './docs/executor-routing.json',
        },
        workers: [
          {
            agent_name: 'agent-router',
            owner_agent: null,
            only_unassigned: true,
          },
          {
            agent_name: 'agent-pm',
            owner_agent: 'agent-pm',
            include_unassigned: false,
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const config = loadExecutorPoolConfig(filePath);
  assert.equal(config.workers.length, 2);
  assert.deepEqual(config.workers[0], {
    agentName: 'agent-router',
    projectId: 'PRJ-cortex',
    source: 'notion_comment',
    targetType: null,
    channel: null,
    ownerAgent: null,
    includeUnassigned: false,
    onlyUnassigned: true,
    mode: 'webhook',
    pollIntervalMs: 5000,
    routingFile: './docs/executor-routing.json',
    webhookUrl: null,
    webhookToken: null,
    notionBaseUrl: null,
    notionVersion: null,
    extraEnv: {},
  });
});

test('buildExecutorWorkerEnv converts normalized worker config into process env', () => {
  const env = buildExecutorWorkerEnv({
    agentName: 'agent-pm',
    projectId: 'PRJ-cortex',
    source: 'notion_comment',
    targetType: null,
    channel: null,
    ownerAgent: 'agent-pm',
    includeUnassigned: false,
    onlyUnassigned: false,
    mode: 'webhook',
    pollIntervalMs: 3000,
    routingFile: './docs/executor-routing.json',
    webhookUrl: 'http://127.0.0.1:3010/handle',
    webhookToken: 'token',
    notionBaseUrl: 'https://api.notion.com',
    notionVersion: '2026-03-11',
    extraEnv: {
      FOO: 'bar',
    },
  });

  assert.equal(env.AGENT_NAME, 'agent-pm');
  assert.equal(env.PROJECT_ID, 'PRJ-cortex');
  assert.equal(env.OWNER_AGENT, 'agent-pm');
  assert.equal(env.EXECUTOR_MODE, 'webhook');
  assert.equal(env.EXECUTOR_ROUTING_FILE, './docs/executor-routing.json');
  assert.equal(env.EXECUTOR_WEBHOOK_URL, 'http://127.0.0.1:3010/handle');
  assert.equal(env.EXECUTOR_WEBHOOK_TOKEN, 'token');
  assert.equal(env.FOO, 'bar');
});

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

test('executor pool config supports router worker for unassigned and dedicated workers for owned queues', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-executor-pool-smoke-'));
  const filePath = join(dir, 'executor-workers.json');
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        defaults: {
          project_id: 'PRJ-cortex',
          source: 'notion_comment',
          mode: 'echo',
        },
        workers: [
          {
            agent_name: 'agent-router',
            owner_agent: null,
            only_unassigned: true,
          },
          {
            agent_name: 'agent-pm',
            owner_agent: 'agent-pm',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const pool = loadExecutorPoolConfig(filePath);
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-executor-pool-db-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-26T08:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-unassigned',
    page_id: 'page-unassigned',
    discussion_id: 'discussion-unassigned',
    comment_id: 'comment-unassigned',
    body: '[continue] 继续处理未分配任务',
    context_quote: '未分配评论',
  });

  await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-pm',
    page_id: 'page-pm',
    discussion_id: 'discussion-pm',
    comment_id: 'comment-pm',
    body: '[agent: agent-pm] [continue] 继续处理 PM 队列',
    context_quote: 'PM 评论',
  });

  const routerWorkerConfig = pool.workers.find((worker) => worker.agentName === 'agent-router');
  const pmWorkerConfig = pool.workers.find((worker) => worker.agentName === 'agent-pm');

  const routerWorker = createExecutorWorker({
    baseUrl,
    agentName: routerWorkerConfig.agentName,
    source: routerWorkerConfig.source,
    ownerAgent: routerWorkerConfig.ownerAgent,
    onlyUnassigned: routerWorkerConfig.onlyUnassigned,
    includeUnassigned: routerWorkerConfig.includeUnassigned,
    mode: 'echo',
    logger: { info() {}, error() {} },
  });

  const pmWorker = createExecutorWorker({
    baseUrl,
    agentName: pmWorkerConfig.agentName,
    source: pmWorkerConfig.source,
    ownerAgent: pmWorkerConfig.ownerAgent,
    onlyUnassigned: pmWorkerConfig.onlyUnassigned,
    includeUnassigned: pmWorkerConfig.includeUnassigned,
    mode: 'echo',
    logger: { info() {}, error() {} },
  });

  const routerResult = await routerWorker.pollOnce();
  const pmResult = await pmWorker.pollOnce();

  assert.equal(routerResult.claimed, true);
  assert.equal(routerResult.handled.status, 'done');
  assert.match(routerResult.handled.resultSummary, /agent-router/);

  assert.equal(pmResult.claimed, true);
  assert.equal(pmResult.handled.status, 'done');
  assert.match(pmResult.handled.resultSummary, /agent-pm/);
});
