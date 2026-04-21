import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';
import { createPanghuPoller, createSender } from '../src/panghu-poller.js';

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return response.json();
}

test('panghu poller rejects dry-run sender when real sender is required', () => {
  assert.throws(
    () =>
      createPanghuPoller({
        sendMode: 'stdout',
        requireRealSender: true,
        logger: {
          log() {},
          info() {},
          error() {},
        },
      }),
    /dry-run sender is not allowed/i,
  );
});

test('panghu poller sends pending outbox messages and acks them', async (t) => {
  const sent = [];
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-panghu-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-24T08:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否开启新的评测集？',
    recommendation: '建议开启，避免质量判断继续漂。',
    impact_scope: 'module',
    session_id: 'your-user@corp',
  });

  const before = await getJson(baseUrl, '/outbox');
  assert.equal(before.pending.length, 1);

  const poller = createPanghuPoller({
    baseUrl,
    sender: async (message) => {
      sent.push(message);
    },
    logger: {
      log() {},
      info() {},
      error() {},
    },
  });

  const result = await poller.pollOnce();
  assert.equal(result.pendingCount, 1);
  assert.deepEqual(result.handled, [{ id: before.pending[0].id, status: 'sent' }]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /需要你拍板/);

  const after = await getJson(baseUrl, '/outbox');
  assert.equal(after.pending.length, 0);
  assert.deepEqual(
    after.stats.find((item) => item.status === 'sent'),
    { status: 'sent', count: 1 },
  );
});

test('panghu poller processes urgent outbox messages before normal ones', async (t) => {
  const sent = [];
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-panghu-priority-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-24T08:02:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/webhook/codex-message', {
    channel: 'hiredcity',
    target: 'your-target@example.com',
    text: 'normal message',
    priority: 'normal',
  });

  await postJson(baseUrl, '/webhook/codex-message', {
    channel: 'hiredcity',
    target: 'your-target@example.com',
    text: 'urgent message',
    priority: 'urgent',
  });

  const before = await getJson(baseUrl, '/outbox');
  assert.equal(before.pending.length, 2);
  assert.equal(before.pending[0].priority, 'urgent');
  assert.equal(before.pending[1].priority, 'normal');

  const poller = createPanghuPoller({
    baseUrl,
    sender: async (message) => {
      sent.push(message.text);
    },
    logger: {
      log() {},
      info() {},
      error() {},
    },
  });

  const result = await poller.pollOnce();
  assert.equal(result.pendingCount, 2);
  assert.deepEqual(sent, ['urgent message', 'normal message']);
});

test('panghu poller can deliver pending outbox messages via http sender mode', async (t) => {
  const received = [];
  const receiver = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    received.push({
      headers: req.headers,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  t.after(() => receiver.close());

  const receiverAddress = receiver.address();
  const sendUrl = `http://127.0.0.1:${receiverAddress.port}/send`;

  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-panghu-http-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-24T08:05:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否发送到真实网关？',
    recommendation: '建议发送，验证 http sender。',
    impact_scope: 'module',
    session_id: 'your-user@corp',
  });

  const before = await getJson(baseUrl, '/outbox');
  assert.equal(before.pending.length, 1);

  const poller = createPanghuPoller({
    baseUrl,
    sendMode: 'http',
    sendUrl,
    sendToken: 'test-token',
    logger: {
      log() {},
      info() {},
      error() {},
    },
  });

  const result = await poller.pollOnce();
  assert.equal(result.pendingCount, 1);
  assert.deepEqual(result.handled, [{ id: before.pending[0].id, status: 'sent' }]);
  assert.equal(received.length, 1);
  assert.equal(received[0].headers.authorization, 'Bearer test-token');
  assert.equal(received[0].body.session_id, 'your-user@corp');
  assert.match(received[0].body.text, /需要你拍板/);
  assert.equal(received[0].body.token, 'test-token');

  const after = await getJson(baseUrl, '/outbox');
  assert.equal(after.pending.length, 0);
  assert.deepEqual(
    after.stats.find((item) => item.status === 'sent'),
    { status: 'sent', count: 1 },
  );
});

test('panghu poller command sender exports legacy env aliases', async (t) => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'cortex-panghu-command-'));
  const envDumpPath = join(tmpDir, 'command-env.json');
  const commandScriptPath = join(tmpDir, 'capture-env.sh');

  writeFileSync(
    commandScriptPath,
    `#!/bin/bash
set -euo pipefail
python3 - <<'PY' > "${envDumpPath}"
import json
import os
print(json.dumps({
  "MESSAGE_ID": os.environ.get("MESSAGE_ID"),
  "CHANNEL": os.environ.get("CHANNEL"),
  "SESSION_ID": os.environ.get("SESSION_ID"),
  "CHAT_ID": os.environ.get("CHAT_ID"),
  "TARGET": os.environ.get("TARGET"),
  "TEXT": os.environ.get("TEXT"),
  "PAYLOAD_JSON": os.environ.get("PAYLOAD_JSON"),
  "CALLBACK_URL": os.environ.get("CALLBACK_URL"),
}))
PY
`,
    'utf8',
  );

  chmodSync(commandScriptPath, 0o755);

  const sender = createSender({
    sendMode: 'command',
    sendCommand: commandScriptPath,
    logger: {
      log() {},
      info() {},
      error() {},
    },
  });

  await sender({
    id: 42,
    channel: 'hiredcity',
    session_id: 'your-target@example.com',
    chat_id: '',
    text: 'legacy alias env test',
    payload: {
      callback_url: 'http://127.0.0.1:19100/webhook/agent-receipt',
      extra: 'demo',
    },
  });

  const dumped = JSON.parse(readFileSync(envDumpPath, 'utf8'));
  assert.equal(dumped.MESSAGE_ID, '42');
  assert.equal(dumped.CHANNEL, 'hiredcity');
  assert.equal(dumped.SESSION_ID, 'your-target@example.com');
  assert.equal(dumped.CHAT_ID, '');
  assert.equal(dumped.TARGET, 'your-target@example.com');
  assert.equal(dumped.TEXT, 'legacy alias env test');
  assert.equal(dumped.CALLBACK_URL, 'http://127.0.0.1:19100/webhook/agent-receipt');
  assert.deepEqual(JSON.parse(dumped.PAYLOAD_JSON), {
    callback_url: 'http://127.0.0.1:19100/webhook/agent-receipt',
    extra: 'demo',
  });
});

test('panghu poller forwards outbox payload to http sender', async (t) => {
  const received = [];
  const receiver = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  t.after(() => receiver.close());

  const receiverAddress = receiver.address();
  const sendUrl = `http://127.0.0.1:${receiverAddress.port}/send`;

  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-panghu-http-payload-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-01T10:05:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notification_channel: 'hiredcity',
    notification_target: 'your-target@example.com',
  });

  await postJson(baseUrl, '/webhook/codex-message', {
    agent_name: 'agent-panghu',
    project_id: 'PRJ-cortex',
    command: {
      command_id: 'CMD-20260401-999',
      instruction: '@胖虎 接手这条任务',
      source: 'notion_comment',
      owner_agent: 'agent-panghu',
      source_url: 'notion://page/demo/discussion/demo/comment/demo',
    },
  });

  const poller = createPanghuPoller({
    baseUrl,
    sendMode: 'http',
    sendUrl,
    logger: {
      log() {},
      info() {},
      error() {},
    },
  });

  const result = await poller.pollOnce();
  assert.equal(result.pendingCount, 1);
  assert.equal(received.length, 1);
  assert.equal(received[0].payload.handoff_agent, 'agent-panghu');
  assert.equal(received[0].payload.command_id, 'CMD-20260401-999');
  assert.match(received[0].payload.callback_url, /\/webhook\/agent-receipt$/);
});

test('panghu poller can send message and immediately callback delivery receipt for handoff', async (t) => {
  const sent = [];
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-panghu-callback-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-02T12:40:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notification_channel: 'hiredcity',
    notification_target: 'your-target@example.com',
  });

  const ingested = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex',
    text: '请胖虎接手这条任务，发完消息后立刻回执',
    session_id: 'your-target@example.com',
    message_id: 'panghu-callback-live-001',
    user_id: 'your-target@example.com',
  });
  assert.match(ingested.commandId, /^CMD-/);

  await postJson(baseUrl, '/webhook/codex-message', {
    agent_name: 'agent-panghu',
    project_id: 'PRJ-cortex',
    callback_base_url: baseUrl,
    command: {
      command_id: ingested.commandId,
      instruction: '@胖虎 帮我接手这条任务，发完消息后立刻回执',
      source: 'openclaw_im_message',
      owner_agent: 'agent-panghu',
      source_url: 'im://session/your-target@example.com/message/panghu-callback-live-001',
    },
  });

  const before = await getJson(baseUrl, '/outbox');
  assert.equal(before.pending.length, 1);
  assert.equal(before.pending[0].payload.command_id, ingested.commandId);
  assert.match(before.pending[0].payload.callback_url, /\/webhook\/agent-receipt$/);

  const poller = createPanghuPoller({
    baseUrl,
    sender: async (message) => {
      sent.push(message);
    },
    logger: {
      log() {},
      info() {},
      error() {},
    },
  });

  const result = await poller.pollOnce();
  assert.equal(result.pendingCount, 1);
  assert.deepEqual(result.handled, [{ id: before.pending[0].id, status: 'sent' }]);
  assert.deepEqual(result.callbacks, [
    {
      id: before.pending[0].id,
      status: 'delivered',
      callback_url: before.pending[0].payload.callback_url,
    },
  ]);
  assert.equal(sent.length, 1);

  const command = await getJson(baseUrl, `/commands?command_id=${encodeURIComponent(ingested.commandId)}`);
  assert.equal(command.commands.length, 1);
  assert.equal(command.commands[0].command_id, ingested.commandId);
  assert.equal(command.commands[0].status, 'new');
  assert.equal(command.commands[0].claimed_by, 'agent-panghu');
  assert.equal(command.commands[0].receipt_count, 1);
  assert.equal(command.commands[0].result_summary, 'agent-panghu 已收到交接消息。');

  const receipts = await getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(ingested.commandId)}`);
  assert.equal(receipts.receipts.length, 1);
  assert.equal(receipts.receipts[0].status, 'delivered');
  assert.equal(receipts.receipts[0].receipt_type, 'status_update');
  assert.equal(receipts.receipts[0].payload.outbox_id, before.pending[0].id);

  const after = await getJson(baseUrl, '/outbox');
  assert.equal(after.pending.length, 0);
  assert.deepEqual(
    after.stats.find((item) => item.status === 'sent'),
    { status: 'sent', count: 1 },
  );
});
