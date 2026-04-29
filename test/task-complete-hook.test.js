import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createCortexServer } from '../src/server.js';

const hookScriptPath = fileURLToPath(new URL('../hooks/task-complete.sh', import.meta.url));

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

async function runHook(args, env = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn('bash', [hookScriptPath, ...args], {
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        status: code,
        stdout,
        stderr,
        body: stdout ? JSON.parse(stdout) : null,
      });
    });
  });
}

test('task-complete hook reports green completion without local token writeback and dedupes on retry', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-task-complete-hook-green-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-02T11:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ingested = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex-hook-green',
    target_type: 'page',
    target_id: 'page-hook-green',
    page_id: 'page-hook-green',
    discussion_id: 'discussion-hook-green',
    comment_id: 'comment-hook-green',
    body: '@胖虎 帮我继续推进这条任务',
    owner_agent: 'agent-panghu',
    source_url: 'notion://page/page-hook-green/discussion/discussion-hook-green/comment/comment-hook-green',
  });

  const env = {
    CORTEX_BASE_URL: baseUrl,
    PROJECT_ID: 'PRJ-cortex-hook-green',
    SESSION_ID: 'hook-green@local',
    TARGET: 'hook-green@local',
    AGENT_NAME: 'agent-panghu',
    REPLY_TEXT: '胖虎已完成这条任务并回到评论里。',
    NEXT_STEP: '可以继续派发下一条任务。',
  };

  const firstRun = await runHook(
    [
      ingested.body.commandId,
      'green',
      'green hook completed',
      'green hook details',
      '{"processed_count":2,"success_count":2}',
    ],
    env,
  );

  assert.equal(firstRun.status, 0, firstRun.stderr);
  assert.equal(firstRun.body.ok, true);
  assert.equal(firstRun.body.command.status, 'done');
  assert.equal(firstRun.body.command.receipt_count, 1);
  assert.deepEqual(firstRun.body.receipt.payload.metrics, {
    processed_count: 2,
    success_count: 2,
  });
  assert.equal(firstRun.body.reply_id, null);
  assert.equal(firstRun.body.notion_feedback_mode, 'docs_only');

  const receipts = await getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(ingested.body.commandId)}`);
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.receipts.length, 1);
  assert.equal(receipts.body.receipts[0].status, 'completed');
  assert.equal(receipts.body.receipts[0].receipt_type, 'result');

  const secondRun = await runHook(
    [
      ingested.body.commandId,
      'green',
      'green hook completed',
      'green hook details',
      '{"processed_count":2,"success_count":2}',
    ],
    env,
  );

  assert.equal(secondRun.status, 0, secondRun.stderr);
  assert.equal(secondRun.body.status, 'already_recorded');

  const receiptsAfterRetry = await getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(ingested.body.commandId)}`);
  assert.equal(receiptsAfterRetry.body.receipts.length, 1);
});

test('task-complete hook can escalate red alerts into decisions', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-task-complete-hook-red-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-02T11:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ingested = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex-hook-red',
    text: '执行热点池写入',
    session_id: 'hook-red@local',
    message_id: 'hook-red-msg-001',
  });

  const env = {
    CORTEX_BASE_URL: baseUrl,
    PROJECT_ID: 'PRJ-cortex-hook-red',
    SESSION_ID: 'hook-red@local',
    TARGET: 'hook-red@local',
    AGENT_NAME: 'agent-panghu',
    ARTIFACTS_JSON: '["https://example.com/api/feed/hot/pool"]',
    DECISION_CONTEXT_JSON:
      '{"question":"热点池服务不可用，如何处理？","options":["A) 等待5分钟后重试","B) 跳过本次入池，记录待处理"],"recommendation":"A) 等待5分钟后重试，服务通常很快恢复"}',
  };

  const result = await runHook(
    [
      ingested.body.commandId,
      'red',
      'hook red alert',
      '热点池写入失败：API 返回 500',
      '{"processed_count":1,"failed_count":1}',
    ],
    env,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.receipt.signal, 'red');
  assert.equal(result.body.command.status, 'failed');
  assert.equal(result.body.decision.signal_level, 'red');
  assert.equal(result.body.decision.question, '热点池服务不可用，如何处理？');

  const receipts = await getJson(baseUrl, '/receipts?project_id=PRJ-cortex-hook-red&limit=10');
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.receipts.length, 1);
  assert.deepEqual(receipts.body.receipts[0].payload.artifacts, [
    'https://example.com/api/feed/hot/pool',
  ]);

  const outbox = await getJson(baseUrl, '/outbox');
  assert.equal(outbox.status, 200);
  assert.ok(outbox.body.pending.some((item) => item.priority === 'urgent'));
});

test('task-complete hook can post directly to callback_url from handoff payload', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-task-complete-hook-callback-url-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-02T12:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ingested = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex-hook-callback',
    text: '继续执行 callback_url smoke',
    session_id: 'hook-callback@local',
    message_id: 'hook-callback-msg-001',
  });

  const result = await runHook(
    [
      ingested.body.commandId,
      'green',
      'callback url hook completed',
      '通过 callback_url 回写',
      '{"processed_count":1}',
    ],
    {
      CALLBACK_URL: `${baseUrl}/webhook/agent-receipt`,
      PROJECT_ID: 'PRJ-cortex-hook-callback',
      SESSION_ID: 'hook-callback@local',
      TARGET: 'hook-callback@local',
      AGENT_NAME: 'agent-panghu',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.command.status, 'done');
  assert.equal(result.body.receipt.payload.summary, 'callback url hook completed');

  const receipts = await getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(ingested.body.commandId)}`);
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.receipts.length, 1);
  assert.equal(receipts.body.receipts[0].status, 'completed');
});
