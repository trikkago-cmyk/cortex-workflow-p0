import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';
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

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test('executor worker claims notion comment, records result, and leaves writeback to docs/custom agent', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-executor-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-25T09:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ingested = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-001',
    page_id: 'page-001',
    discussion_id: 'discussion-001',
    comment_id: 'comment-001',
    body: '[agent: agent-notion-worker] [continue] 继续执行吧',
    context_quote: '执行摘要',
    source_url: 'notion://page/page-001/discussion/discussion-001/comment/comment-001',
  });

  assert.equal(ingested.status, 200);

  const worker = createExecutorWorker({
    baseUrl,
    agentName: 'agent-notion-worker',
    source: 'notion_comment',
    notionWritebackEnabled: false,
    executor: async ({ command }) => ({
      status: 'done',
      replyText: `已处理：${command.instruction}`,
      resultSummary: '评论任务已完成',
    }),
    logger: {
      info() {},
      error() {},
    },
  });

  const result = await worker.pollOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.handled.status, 'done');
  assert.equal(result.handled.replied, false);
  assert.equal(result.handled.replySkipped, true);
  assert.equal(result.handled.replySkipReason, 'discussion_writeback_removed');
  assert.equal(result.handled.receiptRecorded, true);
  assert.ok(result.handled.receiptId);
  assert.ok(result.handled.checkpointId);
  assert.equal(result.handled.notionFeedbackMode, 'docs_only');

  const commandList = await getJson(baseUrl, '/commands?command_id=' + encodeURIComponent(ingested.body.commandId));
  assert.equal(commandList.status, 200);
  assert.equal(commandList.body.commands[0].status, 'done');
  assert.equal(commandList.body.commands[0].ack, `ack:${ingested.body.commandId}`);
  assert.equal(commandList.body.commands[0].result_summary, '评论任务已完成');
  assert.equal(commandList.body.commands[0].receipt_count, 1);

  const receipts = await getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(ingested.body.commandId)}`);
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.receipts.length, 1);
  assert.equal(receipts.body.receipts[0].status, 'completed');
  assert.equal(receipts.body.receipts[0].payload.summary, '评论任务已完成');
});

test('executor worker no longer depends on token-based notion reply in custom-agent mode', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-executor-custom-agent-no-token-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-23T09:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ingested = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-custom-agent',
    page_id: 'page-custom-agent',
    discussion_id: 'discussion-custom-agent',
    comment_id: 'comment-custom-agent',
    body: '[agent: agent-notion-worker] [continue] 按 custom agent 主路径继续',
    context_quote: 'custom agent path',
    source_url: 'notion://page/page-custom-agent/discussion/discussion-custom-agent/comment/comment-custom-agent',
  });

  assert.equal(ingested.status, 200);

  const worker = createExecutorWorker({
    baseUrl,
    agentName: 'agent-notion-worker',
    source: 'notion_comment',
    notionWritebackEnabled: false,
    logger: {
      info() {},
      error() {},
    },
    executor: async ({ command }) => ({
      status: 'done',
      replyText: `已处理：${command.instruction}`,
      resultSummary: 'custom agent path completed',
    }),
  });

  const result = await worker.pollOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.handled.status, 'done');
  assert.equal(result.handled.replied, false);
  assert.equal(result.handled.replySkipped, true);
  assert.equal(result.handled.replySkipReason, 'discussion_writeback_removed');
  assert.equal(result.handled.receiptRecorded, true);

  const commandList = await getJson(baseUrl, '/commands?command_id=' + encodeURIComponent(ingested.body.commandId));
  assert.equal(commandList.status, 200);
  assert.equal(commandList.body.commands[0].status, 'done');
  assert.equal(commandList.body.commands[0].result_summary, 'custom agent path completed');
  assert.equal(commandList.body.commands[0].receipt_count, 1);
});

test('executor worker can write completion reply back to Notion discussion when enabled', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-executor-notion-writeback-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-23T09:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const notionCalls = [];

  const ingested = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-custom-agent',
    page_id: 'page-custom-agent',
    discussion_id: 'discussion-custom-agent',
    comment_id: 'comment-custom-agent',
    body: '[agent: agent-notion-worker] [continue] 写回 Notion discussion',
    context_quote: 'custom agent path',
    source_url: 'notion://page/page-custom-agent/discussion/discussion-custom-agent/comment/comment-custom-agent',
  });

  assert.equal(ingested.status, 200);

  const worker = createExecutorWorker({
    baseUrl,
    agentName: 'agent-notion-worker',
    source: 'notion_comment',
    notionWritebackEnabled: true,
    notionApiKey: 'secret-notion-token',
    notionBaseUrl: 'https://notion.example.test',
    notionVersion: '2026-03-11',
    notionFetchImpl: async (url, init) => {
      notionCalls.push({
        url,
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      return new Response(JSON.stringify({ id: 'reply-001' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    executor: async ({ command }) => ({
      status: 'done',
      replyText: `已处理：${command.command_id}`,
      resultSummary: 'custom agent path completed',
    }),
  });

  const result = await worker.pollOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.handled.status, 'done');
  assert.equal(result.handled.replied, true);
  assert.equal(result.handled.replySkipped, false);
  assert.equal(result.handled.replyId, 'reply-001');
  assert.equal(result.handled.notionFeedbackMode, 'discussion_writeback');
  assert.equal(notionCalls.length, 1);
  assert.equal(notionCalls[0].url, 'https://notion.example.test/v1/comments');
  assert.equal(notionCalls[0].body.discussion_id, 'discussion-custom-agent');
  assert.match(notionCalls[0].body.rich_text[0].text.content, /已处理/);
});

test('executor worker webhook mode sends command payload and completes command', async (t) => {
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
    res.end(
      JSON.stringify({
        ok: true,
        status: 'done',
        result_summary: 'webhook handled',
      }),
    );
  });

  await new Promise((resolve) => webhookServer.listen(0, '127.0.0.1', resolve));
  t.after(() => webhookServer.close());

  const webhookAddress = webhookServer.address();
  const webhookUrl = `http://127.0.0.1:${webhookAddress.port}/handle`;

  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-executor-webhook-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-25T09:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const command = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex',
    text: '继续推进 webhook worker',
    session_id: 'your-user@corp',
    message_id: 'msg-executor-webhook-001',
  });

  assert.equal(command.status, 200);

  const worker = createExecutorWorker({
    baseUrl,
    agentName: 'agent-im-worker',
    source: 'openclaw_im_message',
    ownerAgent: null,
    mode: 'webhook',
    webhookUrl,
    webhookToken: 'executor-token',
    logger: {
      info() {},
      error() {},
    },
  });

  const result = await worker.pollOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.handled.status, 'done');
  assert.equal(received.length, 1);
  assert.equal(received[0].headers.authorization, 'Bearer executor-token');
  assert.equal(received[0].body.agent_name, 'agent-im-worker');
  assert.equal(received[0].body.command.command_id, command.body.commandId);

  const commandList = await getJson(baseUrl, '/commands?command_id=' + encodeURIComponent(command.body.commandId));
  assert.equal(commandList.status, 200);
  assert.equal(commandList.body.commands[0].status, 'done');
  assert.equal(commandList.body.commands[0].result_summary, 'webhook handled');
  assert.equal(commandList.body.commands[0].receipt_count, 1);
});

test('executor worker webhook mode resolves agent-specific route from routing file', async (t) => {
  const defaultReceived = [];
  const agentReceived = [];
  const createWebhookServer = (bucket, resultSummary) =>
    http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }

      bucket.push({
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          status: 'done',
          result_summary: resultSummary,
        }),
      );
    });

  const defaultWebhookServer = createWebhookServer(defaultReceived, 'default route handled');
  const agentWebhookServer = createWebhookServer(agentReceived, 'agent route handled');

  await new Promise((resolve) => defaultWebhookServer.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve) => agentWebhookServer.listen(0, '127.0.0.1', resolve));
  t.after(() => defaultWebhookServer.close());
  t.after(() => agentWebhookServer.close());

  const defaultWebhookUrl = `http://127.0.0.1:${defaultWebhookServer.address().port}/handle`;
  const agentWebhookUrl = `http://127.0.0.1:${agentWebhookServer.address().port}/handle`;

  const routingDir = mkdtempSync(join(tmpdir(), 'cortex-executor-routing-'));
  const routingFile = join(routingDir, 'executor-routing.json');
  writeFileSync(
    routingFile,
    JSON.stringify(
      {
        default: {
          url: defaultWebhookUrl,
          token: 'default-token',
        },
        agents: {
          'agent-pm': {
            url: agentWebhookUrl,
            token: 'agent-token',
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-executor-routing-db-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-25T10:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const command = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-001',
    page_id: 'page-001',
    discussion_id: 'discussion-routing-001',
    comment_id: 'comment-routing-001',
    body: '[agent: agent-pm] [continue] 继续推进多 agent 执行',
    context_quote: '路由测试',
    source_url:
      'notion://page/page-001/discussion/discussion-routing-001/comment/comment-routing-001',
  });

  assert.equal(command.status, 200);

  const worker = createExecutorWorker({
    baseUrl,
    agentName: 'agent-pm',
    source: 'notion_comment',
    mode: 'webhook',
    routingFile,
    logger: {
      info() {},
      error() {},
    },
  });

  const result = await worker.pollOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.handled.status, 'done');
  assert.equal(defaultReceived.length, 0);
  assert.equal(agentReceived.length, 1);
  assert.equal(agentReceived[0].headers.authorization, 'Bearer agent-token');
  assert.equal(agentReceived[0].body.agent_name, 'agent-pm');

  const commandList = await getJson(baseUrl, '/commands?command_id=' + encodeURIComponent(command.body.commandId));
  assert.equal(commandList.status, 200);
  assert.equal(commandList.body.commands[0].status, 'done');
  assert.equal(commandList.body.commands[0].result_summary, 'agent route handled');
  assert.equal(commandList.body.commands[0].receipt_count, 1);
});

test('executor worker honors onlyUnassigned without defaulting owner to agent name', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-executor-unassigned-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-31T09:40:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-unassigned-live',
    page_id: 'page-unassigned-live',
    discussion_id: 'discussion-unassigned-live',
    comment_id: 'comment-unassigned-live',
    body: '[continue] 继续处理这条未分配评论',
    context_quote: '未分配评论 smoke',
  });

  const worker = createExecutorWorker({
    baseUrl,
    agentName: 'agent-router',
    source: 'notion_comment',
    onlyUnassigned: true,
    executor: async () => ({
      status: 'done',
      replyText: 'router 已处理未分配评论',
      resultSummary: 'router handled unassigned command',
    }),
    logger: {
      info() {},
      error() {},
    },
  });

  const result = await worker.pollOnce();
  assert.equal(result.claimed, true);

  const commandList = await getJson(baseUrl, '/commands?project_id=PRJ-cortex&source=notion_comment&limit=1');
  assert.equal(commandList.status, 200);
  assert.equal(commandList.body.commands[0].claimed_by, 'agent-router');
  assert.equal(commandList.body.commands[0].status, 'done');
  assert.equal(commandList.body.commands[0].receipt_count, 1);
});

test('executor worker can claim router-owned comments while still covering unassigned queue', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-executor-router-owned-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-15T11:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-router-owned',
    page_id: 'page-router-owned',
    discussion_id: 'discussion-router-owned',
    comment_id: 'comment-router-owned',
    owner_agent: 'agent-router',
    body: '@cortex 是否能正常回流执行？',
    context_quote: 'router owned comment smoke',
  });

  const worker = createExecutorWorker({
    baseUrl,
    agentName: 'agent-router',
    source: 'notion_comment',
    ownerAgent: 'agent-router',
    includeUnassigned: true,
    executor: async () => ({
      status: 'done',
      replyText: 'router 已处理 agent-router 队列评论',
      resultSummary: 'router handled owned-or-unassigned command',
    }),
    logger: {
      info() {},
      error() {},
    },
  });

  const result = await worker.pollOnce();
  assert.equal(result.claimed, false);
  assert.equal(result.handled, null);

  const commandList = await getJson(
    baseUrl,
    '/commands?project_id=PRJ-cortex&source=notion_comment&owner_agent=agent-router&limit=1',
  );
  assert.equal(commandList.status, 200);
  assert.equal(commandList.body.commands[0].claimed_by, null);
  assert.equal(commandList.body.commands[0].status, 'archived');
  assert.equal(commandList.body.commands[0].comment_intent, 'question');
  assert.equal(commandList.body.commands[0].comment_execution_policy, 'inbox_only');
});

test('executor worker webhook mode falls back to default route from routing file', async (t) => {
  const received = [];
  const defaultWebhookServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    received.push({
      headers: req.headers,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        status: 'done',
        result_summary: 'default route handled',
      }),
    );
  });

  await new Promise((resolve) => defaultWebhookServer.listen(0, '127.0.0.1', resolve));
  t.after(() => defaultWebhookServer.close());

  const defaultWebhookUrl = `http://127.0.0.1:${defaultWebhookServer.address().port}/handle`;
  const routingDir = mkdtempSync(join(tmpdir(), 'cortex-executor-routing-default-'));
  const routingFile = join(routingDir, 'executor-routing.json');
  writeFileSync(
    routingFile,
    JSON.stringify(
      {
        default: {
          url: defaultWebhookUrl,
          token: 'default-token',
        },
        agents: {},
      },
      null,
      2,
    ),
    'utf8',
  );

  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-executor-routing-default-db-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-25T10:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const command = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex',
    text: '继续推进默认路由',
    session_id: 'your-user@corp',
    message_id: 'msg-executor-routing-default-001',
  });

  assert.equal(command.status, 200);

  const worker = createExecutorWorker({
    baseUrl,
    agentName: 'agent-architect',
    source: 'openclaw_im_message',
    ownerAgent: null,
    mode: 'webhook',
    routingFile,
    logger: {
      info() {},
      error() {},
    },
  });

  const result = await worker.pollOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.handled.status, 'done');
  assert.equal(received.length, 1);
  assert.equal(received[0].headers.authorization, 'Bearer default-token');
  assert.equal(received[0].body.agent_name, 'agent-architect');

  const commandList = await getJson(baseUrl, '/commands?command_id=' + encodeURIComponent(command.body.commandId));
  assert.equal(commandList.status, 200);
  assert.equal(commandList.body.commands[0].status, 'done');
  assert.equal(commandList.body.commands[0].result_summary, 'default route handled');
  assert.equal(commandList.body.commands[0].receipt_count, 1);
});
