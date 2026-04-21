import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';

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

test('serves the P0 HTTP loop for commands, red decisions, and outbox ack', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-p0-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-23T12:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await getJson(baseUrl, '/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);

  const projects = await getJson(baseUrl, '/projects');
  assert.equal(projects.status, 200);
  assert.equal(projects.body.ok, true);
  assert.equal(projects.body.projects.length, 1);
  assert.equal(projects.body.projects[0].project_id, 'PRJ-cortex');

  const namedProject = await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-dark-luxury-itinerary',
    name: 'Dark Luxury Itinerary',
  });
  assert.equal(namedProject.status, 200);
  assert.equal(namedProject.body.project.name, 'Dark Luxury Itinerary');

  const namedProjectReview = await getJson(baseUrl, '/project-review?project_id=PRJ-dark-luxury-itinerary');
  assert.equal(namedProjectReview.status, 200);
  assert.equal(namedProjectReview.body.project.name, 'Dark Luxury Itinerary');

  const normalCodexMessage = await postJson(baseUrl, '/webhook/codex-message', {
    channel: 'hiredcity',
    target: 'your-target@example.com',
    text: '🟢 普通消息内容',
    priority: 'normal',
  });

  assert.equal(normalCodexMessage.status, 200);
  assert.equal(normalCodexMessage.body.ok, true);
  assert.equal(normalCodexMessage.body.priority, 'normal');

  const urgentCodexMessage = await postJson(baseUrl, '/webhook/codex-message', {
    channel: 'hiredcity',
    target: 'your-target@example.com',
    text: '🔴 红灯决策需拍板',
    priority: 'urgent',
  });

  assert.equal(urgentCodexMessage.status, 200);
  assert.equal(urgentCodexMessage.body.ok, true);
  assert.equal(urgentCodexMessage.body.priority, 'urgent');

  const codexOutbox = await getJson(baseUrl, '/outbox');
  assert.equal(codexOutbox.body.pending.length, 2);
  assert.equal(codexOutbox.body.pending[0].priority, 'urgent');
  assert.equal(codexOutbox.body.pending[0].text, '🔴 红灯决策需拍板');
  assert.equal(codexOutbox.body.pending[1].priority, 'normal');

  const brief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: 'P0 执行内核任务简报',
    why: '先把企业 IM 到 Cortex 的执行闭环跑通，避免方案只停留在文档层。',
    context: '当前 OpenClaw 企业 IM 对话流已跑通，本地 Cortex 已具备 Commands、Decision Requests、Outbox 和 SQLite 持久化。',
    what: '交付一个可本地联调的执行中枢服务，支持 IM 入站、红灯推送、胖虎轮询 ack 和基础验证脚本。',
    owner_agent: 'agent-router',
    session_id: 'your-user@corp',
    target_type: 'milestone',
    target_id: 'M-20260323-p0',
  });

  assert.equal(brief.status, 200);
  assert.equal(brief.body.ok, true);
  assert.equal(brief.body.isDuplicate, false);
  assert.match(brief.body.brief.brief_id, /^TB-/);
  assert.equal(brief.body.brief.status, 'draft');

  const duplicateBrief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    why: '先把企业 IM 到 Cortex 的执行闭环跑通，避免方案只停留在文档层。',
    context: '当前 OpenClaw 企业 IM 对话流已跑通，本地 Cortex 已具备 Commands、Decision Requests、Outbox 和 SQLite 持久化。',
    what: '交付一个可本地联调的执行中枢服务，支持 IM 入站、红灯推送、胖虎轮询 ack 和基础验证脚本。',
  });

  assert.equal(duplicateBrief.status, 200);
  assert.equal(duplicateBrief.body.isDuplicate, true);
  assert.equal(duplicateBrief.body.brief.brief_id, brief.body.brief.brief_id);

  const briefs = await getJson(baseUrl, '/task-briefs?project_id=PRJ-cortex');
  assert.equal(briefs.status, 200);
  assert.equal(briefs.body.briefs.length, 1);
  assert.equal(briefs.body.briefs[0].title, 'P0 执行内核任务简报');

  const firstMessage = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex',
    target_type: 'milestone',
    target_id: 'M-20260323-p0',
    text: '继续推进 P0 数据流梳理',
    session_id: 'your-user@corp',
    message_id: 'msg-001',
    user_id: 'your-user@corp',
  });

  assert.equal(firstMessage.status, 200);
  assert.equal(firstMessage.body.ok, true);
  assert.equal(firstMessage.body.isDuplicate, false);
  assert.match(firstMessage.body.commandId, /^CMD-/);

  const duplicateMessage = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex',
    text: '继续推进 P0 数据流梳理',
    session_id: 'your-user@corp',
    message_id: 'msg-001',
  });

  assert.equal(duplicateMessage.status, 200);
  assert.equal(duplicateMessage.body.isDuplicate, true);
  assert.equal(duplicateMessage.body.commandId, firstMessage.body.commandId);

  const claim = await postJson(baseUrl, '/commands/claim', {
    command_id: firstMessage.body.commandId,
    agent_name: 'agent-router',
  });
  assert.equal(claim.body.command.status, 'claimed');

  const start = await postJson(baseUrl, '/commands/start', {
    command_id: firstMessage.body.commandId,
    agent_name: 'agent-router',
  });
  assert.equal(start.body.command.status, 'executing');

  const complete = await postJson(baseUrl, '/commands/complete', {
    command_id: firstMessage.body.commandId,
    agent_name: 'agent-router',
    result_summary: 'P0 数据流已落库并完成 ack 闭环。',
  });
  assert.equal(complete.body.command.status, 'done');
  assert.equal(complete.body.command.ack, `ack:${firstMessage.body.commandId}`);

  const commands = await getJson(baseUrl, '/commands?project_id=PRJ-cortex');
  assert.equal(commands.body.commands.length, 1);
  assert.equal(commands.body.commands[0].status, 'done');

  const actionCommand = await postJson(baseUrl, '/webhook/im-action', {
    project_id: 'PRJ-cortex',
    target_type: 'decision',
    target_id: 'DR-local-001',
    action: 'approve_1',
    instruction: '按推荐方案推进',
    session_id: 'your-user@corp',
    message_id: 'msg-action-001',
    user_id: 'your-user@corp',
  });

  assert.equal(actionCommand.status, 200);
  assert.equal(actionCommand.body.ok, true);
  assert.equal(actionCommand.body.isDuplicate, false);

  const duplicateAction = await postJson(baseUrl, '/webhook/im-action', {
    project_id: 'PRJ-cortex',
    target_type: 'decision',
    target_id: 'DR-local-001',
    action: 'approve_1',
    instruction: '按推荐方案推进',
    session_id: 'your-user@corp',
    message_id: 'msg-action-001',
  });

  assert.equal(duplicateAction.status, 200);
  assert.equal(duplicateAction.body.isDuplicate, true);
  assert.equal(duplicateAction.body.commandId, actionCommand.body.commandId);

  const commandsAfterAction = await getJson(baseUrl, '/commands?project_id=PRJ-cortex');
  assert.equal(commandsAfterAction.body.commands.length, 2);
  const ingestedAction = commandsAfterAction.body.commands.find((command) => command.source === 'openclaw_im_action');
  assert.ok(ingestedAction);
  assert.equal(ingestedAction.parsed_action, 'continue');
  assert.equal(ingestedAction.target_id, 'DR-local-001');

  const decision = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    blocking_level: 'Sync',
    question: '是否切换 hybrid 召回？',
    options: ['保持 dense', '切换 hybrid'],
    recommendation: '建议切换，避免召回路径继续漂。',
    impact_scope: 'cross_module',
    irreversible: false,
    downstream_contamination: true,
    session_id: 'your-user@corp',
  });

  assert.equal(decision.status, 200);
  assert.equal(decision.body.ok, true);
  assert.equal(decision.body.decision.signal_level, 'red');
  assert.equal(decision.body.decision.blocking_level, 'Sync');
  assert.equal(decision.body._redAlert.type, 'red_alert');
  assert.equal(decision.body._syncAlert.type, 'sync_alert');

  const syncDecisions = await getJson(baseUrl, '/sync-decisions?project_id=PRJ-cortex');
  assert.equal(syncDecisions.body.decisions.length, 1);
  assert.equal(syncDecisions.body.decisions[0].signal_level, 'red');

  const outbox = await getJson(baseUrl, '/outbox');
  assert.equal(outbox.body.pending.length, 3);
  const redDecisionMessage = outbox.body.pending.find((item) => item.session_id === 'your-user@corp');
  assert.ok(redDecisionMessage);
  assert.match(redDecisionMessage.text, /需要你拍板/);

  const duplicateDecision = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    blocking_level: 'Sync',
    question: '是否切换 hybrid 召回？',
    options: ['保持 dense', '切换 hybrid'],
    recommendation: '建议切换，避免召回路径继续漂。',
    impact_scope: 'cross_module',
    irreversible: false,
    downstream_contamination: true,
    session_id: 'your-user@corp',
  });

  assert.equal(duplicateDecision.body.isDuplicate, true);
  assert.equal(duplicateDecision.body.decision.decision_id, decision.body.decision.decision_id);

  const outboxAfterDuplicate = await getJson(baseUrl, '/outbox');
  assert.equal(outboxAfterDuplicate.body.pending.length, 3);

  const ack = await postJson(baseUrl, '/outbox/ack', {
    id: redDecisionMessage.id,
  });
  assert.equal(ack.body.status, 'sent');

  const sentOutbox = await getJson(baseUrl, '/outbox?status=sent&limit=5');
  assert.equal(sentOutbox.status, 200);
  assert.equal(sentOutbox.body.messages.length, 1);
  assert.equal(sentOutbox.body.messages[0].status, 'sent');
  assert.equal(sentOutbox.body.messages[0].id, redDecisionMessage.id);

  const outboxAfterAck = await getJson(baseUrl, '/outbox');
  assert.equal(outboxAfterAck.body.pending.length, 2);
  assert.deepEqual(
    outboxAfterAck.body.stats.find((item) => item.status === 'sent'),
    { status: 'sent', count: 1 },
  );
});

test('webhook/codex-message can bridge executor webhook payloads into outbox handoff', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-codex-bridge-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-01T09:30:00.000Z'),
    defaultProjectId: 'PRJ-cortex',
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

  const bridged = await postJson(baseUrl, '/webhook/codex-message', {
    agent_name: 'agent-panghu',
    project_id: 'PRJ-cortex',
    command: {
      command_id: 'CMD-20260401-888',
      instruction: '@胖虎 帮我继续推进这个任务',
      source: 'notion_comment',
      owner_agent: 'agent-panghu',
      source_url: 'notion://page/demo',
    },
  });

  assert.equal(bridged.status, 200);
  assert.equal(bridged.body.ok, true);
  assert.equal(bridged.body.status, 'done');
  assert.match(bridged.body.reply_text, /已转交给 agent-panghu/);
  assert.match(bridged.body.result_summary, /forwarded command CMD-20260401-888/);

  const outbox = await getJson(baseUrl, '/outbox');
  assert.equal(outbox.body.pending.length, 1);
  assert.match(outbox.body.pending[0].text, /\[Cortex Handoff -> agent-panghu\]/);
  assert.match(outbox.body.pending[0].text, /命令：CMD-20260401-888/);
  assert.match(outbox.body.pending[0].text, /任务：@胖虎 帮我继续推进这个任务/);
  assert.equal(outbox.body.pending[0].payload.handoff_agent, 'agent-panghu');
  assert.equal(outbox.body.pending[0].payload.command_id, 'CMD-20260401-888');
  assert.match(outbox.body.pending[0].payload.callback_url, /\/webhook\/agent-receipt$/);
});

test('webhook/agent-receipt records checkpoint and replies back to notion discussion', async (t) => {
  const replies = [];
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-agent-receipt-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-01T10:00:00.000Z'),
    notionApiKey: 'test-notion-key',
    notionReply: async ({ discussionId, text }) => {
      replies.push({ discussionId, text });
      return { id: 'reply-001' };
    },
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
    body: '@胖虎 帮我继续推进这个任务',
    owner_agent: 'agent-panghu',
    source_url: 'notion://page/page-001/discussion/discussion-001/comment/comment-001',
  });

  const receipt = await postJson(baseUrl, '/webhook/agent-receipt', {
    command_id: ingested.body.commandId,
    agent_name: 'agent-panghu',
    status: 'done',
    signal_level: 'green',
    result_summary: '胖虎已完成企业 IM 侧执行。',
    reply_text: '胖虎已处理完成，结果已回传。',
    next_step: '可以继续下一轮任务。',
  });

  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.ok, true);
  assert.equal(receipt.body.receipt.status, 'completed');
  assert.equal(receipt.body.command.status, 'done');
  assert.equal(receipt.body.command.result_summary, '胖虎已完成企业 IM 侧执行。');
  assert.equal(receipt.body.command.receipt_count, 1);
  assert.equal(receipt.body.checkpoint.signal_level, 'green');
  assert.match(receipt.body.checkpoint.title, /agent-panghu 回执/);
  assert.equal(receipt.body.reply_id, 'reply-001');
  assert.deepEqual(replies, [
    {
      discussionId: 'discussion-001',
      text: '胖虎已处理完成，结果已回传。',
    },
  ]);
});

test('webhook/agent-receipt persists receipt history and dedupes by idempotency key', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-receipts-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-02T08:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ingested = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex',
    text: '继续推进胖虎自动回执',
    session_id: 'your-target@example.com',
    message_id: 'msg-receipt-001',
  });

  const firstReceipt = await postJson(baseUrl, '/webhook/agent-receipt', {
    command_id: ingested.body.commandId,
    agent_name: 'agent-panghu',
    status: 'acknowledged',
    receipt_type: 'status_update',
    payload: {
      summary: '已收到命令，正在执行。',
    },
    signal: 'yellow',
    channel: 'hiredcity',
    target: 'your-target@example.com',
    idempotency_key: 'panghu-receipt-001',
  });

  assert.equal(firstReceipt.status, 200);
  assert.equal(firstReceipt.body.receipt.status, 'acknowledged');
  assert.equal(firstReceipt.body.command.receipt_count, 1);
  assert.equal(firstReceipt.body.command.status, 'new');

  const duplicateReceipt = await postJson(baseUrl, '/webhook/agent-receipt', {
    command_id: ingested.body.commandId,
    agent_name: 'agent-panghu',
    status: 'acknowledged',
    receipt_type: 'status_update',
    payload: {
      summary: '已收到命令，正在执行。',
    },
    signal: 'yellow',
    channel: 'hiredcity',
    target: 'your-target@example.com',
    idempotency_key: 'panghu-receipt-001',
  });

  assert.equal(duplicateReceipt.status, 200);
  assert.equal(duplicateReceipt.body.status, 'already_recorded');

  const receiptHistory = await getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(ingested.body.commandId)}`);
  assert.equal(receiptHistory.status, 200);
  assert.equal(receiptHistory.body.receipts.length, 1);
  assert.equal(receiptHistory.body.receipts[0].receipt_type, 'status_update');

  const command = await getJson(baseUrl, `/commands?command_id=${encodeURIComponent(ingested.body.commandId)}`);
  assert.equal(command.status, 200);
  assert.equal(command.body.commands[0].receipt_count, 1);
  assert.ok(command.body.commands[0].last_receipt_at);
});

test('webhook/agent-receipt accepts lightweight callback payload aliases and top-level fields', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-receipt-lightweight-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-02T12:45:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ingested = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex-lightweight',
    text: 'lightweight receipt callback smoke',
    session_id: 'lightweight@local',
    message_id: 'msg-lightweight-001',
  });

  const receipt = await postJson(baseUrl, '/webhook/agent-receipt', {
    commandId: ingested.body.commandId,
    agent: 'agent-panghu',
    status: 'success',
    signalLevel: 'green',
    summary: 'lightweight callback completed',
    details: 'sent from a minimal panghu callback payload',
    metrics: {
      processed_count: 1,
    },
    artifacts: ['https://example.com/artifact'],
    sessionId: 'lightweight@local',
    idempotencyKey: 'panghu-lightweight-001',
  });

  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.ok, true);
  assert.equal(receipt.body.command.status, 'done');
  assert.equal(receipt.body.receipt.status, 'completed');
  assert.equal(receipt.body.receipt.payload.summary, 'lightweight callback completed');
  assert.equal(receipt.body.receipt.payload.details, 'sent from a minimal panghu callback payload');
  assert.deepEqual(receipt.body.receipt.payload.metrics, {
    processed_count: 1,
  });
  assert.deepEqual(receipt.body.receipt.payload.artifacts, ['https://example.com/artifact']);

  const receipts = await getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(ingested.body.commandId)}`);
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.receipts.length, 1);
  assert.equal(receipts.body.receipts[0].status, 'completed');
});

test('webhook/agent-receipt accepts outbox delivery callbacks and derives handoff context', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-receipt-outbox-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-03T05:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex-e2e-live',
    notification_channel: 'hiredcity',
    notification_target: 'your-target@example.com',
  });

  const ingested = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex-e2e-live',
    text: '真实E2E验证：请胖虎接手并在发送后自动回写receipt',
    session_id: 'your-target@example.com',
    message_id: 'msg-e2e-outbox-001',
  });

  const handoff = await postJson(baseUrl, '/webhook/codex-message', {
    agent_name: 'agent-panghu',
    project_id: 'PRJ-cortex-e2e-live',
    callback_base_url: baseUrl,
    command: {
      command_id: ingested.body.commandId,
      instruction: '@胖虎 真实E2E验证：请接手这条任务，发完企业IM消息后自动回写receipt',
      source: 'openclaw_im_message',
      owner_agent: 'agent-panghu',
      source_url: 'im://session/your-target@example.com/message/msg-e2e-outbox-001',
    },
  });

  assert.equal(handoff.status, 200);
  assert.equal(handoff.body.outbox_id, 1);
  assert.match(handoff.body.callback_url, /\/webhook\/agent-receipt$/);

  const receipt = await postJson(baseUrl, '/webhook/agent-receipt', {
    outbox_id: handoff.body.outbox_id,
    status: 'delivered',
    delivered_at: 1743650000,
    channel: 'hiredcity',
    session_id: 'your-target@example.com',
  });

  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.ok, true);
  assert.equal(receipt.body.command_id, ingested.body.commandId);
  assert.equal(receipt.body.receipt.status, 'delivered');
  assert.equal(receipt.body.receipt.receipt_type, 'status_update');
  assert.equal(receipt.body.command.claimed_by, 'agent-panghu');
  assert.equal(receipt.body.command.status, 'new');
  assert.equal(receipt.body.command.receipt_count, 1);
  assert.equal(receipt.body.outbox.status, 'sent');
  assert.equal(receipt.body.receipt.payload.outbox_id, 1);
  assert.equal(receipt.body.receipt.payload.delivered_at, 1743650000);

  const sentOutbox = await getJson(baseUrl, '/outbox?status=sent&limit=5');
  assert.equal(sentOutbox.status, 200);
  assert.equal(sentOutbox.body.messages.length, 1);
  assert.equal(sentOutbox.body.messages[0].id, 1);

  const receipts = await getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(ingested.body.commandId)}`);
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.receipts.length, 1);
  assert.equal(receipts.body.receipts[0].status, 'delivered');
});

test('red alert receipts auto-create red decisions and urgent outbox alerts', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-receipt-red-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-02T08:30:00.000Z'),
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
    text: '执行热点池写入',
    session_id: 'your-target@example.com',
    message_id: 'msg-receipt-red-001',
  });

  const redReceipt = await postJson(baseUrl, '/webhook/agent-receipt', {
    command_id: ingested.body.commandId,
    agent_name: 'agent-panghu',
    status: 'failed',
    receipt_type: 'alert',
    payload: {
      summary: '热点池写入失败：API 返回 500',
      artifacts: ['https://example.com/api/feed/hot/pool'],
      decision_context: {
        question: '热点池服务不可用，如何处理？',
        options: ['A) 等待5分钟后重试', 'B) 跳过本次入池，记录待处理'],
        recommendation: 'A) 等待5分钟后重试，服务通常很快恢复',
      },
    },
    signal: 'red',
    channel: 'hiredcity',
    target: 'your-target@example.com',
    session_id: 'your-target@example.com',
    idempotency_key: 'panghu-receipt-red-001',
  });

  assert.equal(redReceipt.status, 200);
  assert.equal(redReceipt.body.receipt.signal, 'red');
  assert.equal(redReceipt.body.command.status, 'failed');
  assert.equal(redReceipt.body.decision.signal_level, 'red');
  assert.equal(redReceipt.body.decision.question, '热点池服务不可用，如何处理？');

  const decisions = await getJson(baseUrl, '/decisions?project_id=PRJ-cortex&signal_level=red');
  assert.equal(decisions.status, 200);
  assert.equal(decisions.body.decisions.length, 1);

  const receipts = await getJson(baseUrl, '/receipts?project_id=PRJ-cortex');
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.receipts.length, 1);
  assert.equal(receipts.body.receipts[0].status, 'failed');

  const outbox = await getJson(baseUrl, '/outbox');
  assert.equal(outbox.status, 200);
  assert.ok(outbox.body.pending.some((item) => item.priority === 'urgent'));
});

test('uses project-level default routing for codex messages and red decisions', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-routing-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-24T08:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const projectUpdate = await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notification_channel: 'hiredcity',
    notification_target: 'your-target@example.com',
    notion_review_page_id: 'review-page-001',
    notion_parent_page_id: 'parent-page-001',
  });

  assert.equal(projectUpdate.status, 200);
  assert.equal(projectUpdate.body.project.notification_channel, 'hiredcity');
  assert.equal(projectUpdate.body.project.notification_target, 'your-target@example.com');
  assert.equal(projectUpdate.body.project.notion_review_page_id, 'review-page-001');
  assert.equal(projectUpdate.body.project.notion_parent_page_id, 'parent-page-001');

  const codexMessage = await postJson(baseUrl, '/webhook/codex-message', {
    project_id: 'PRJ-cortex',
    text: '项目默认路由普通消息',
  });

  assert.equal(codexMessage.status, 200);
  assert.equal(codexMessage.body.ok, true);
  assert.equal(codexMessage.body.priority, 'normal');

  const redDecision = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否执行默认通知路由红灯告警？',
    recommendation: '建议直接验证项目默认通知配置。',
    impact_scope: 'cross_module',
  });

  assert.equal(redDecision.status, 200);
  assert.equal(redDecision.body.ok, true);
  assert.equal(redDecision.body.decision.signal_level, 'red');

  const outbox = await getJson(baseUrl, '/outbox');
  assert.equal(outbox.status, 200);
  assert.equal(outbox.body.pending.length, 2);

  const urgentMessage = outbox.body.pending.find((item) => item.priority === 'urgent');
  const normalMessage = outbox.body.pending.find((item) => item.priority === 'normal');

  assert.ok(urgentMessage);
  assert.ok(normalMessage);
  assert.equal(urgentMessage.channel, 'hiredcity');
  assert.equal(urgentMessage.session_id, 'your-target@example.com');
  assert.match(urgentMessage.text, /需要你拍板/);
  assert.equal(normalMessage.channel, 'hiredcity');
  assert.equal(normalMessage.session_id, 'your-target@example.com');
  assert.equal(normalMessage.text, '项目默认路由普通消息');
});

test('routes notion comments to owner_agent queues without relying on @mentions', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-routing-comment-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-25T07:20:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const routedComment = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-001',
    page_id: 'page-001',
    discussion_id: 'discussion-001',
    comment_id: 'comment-001',
    body: '[agent: agent-pm] [continue] 继续执行吧',
    context_quote: '下一步',
    anchor_block_id: 'block-001',
  });

  assert.equal(routedComment.status, 200);
  assert.equal(routedComment.body.ok, true);

  const listed = await getJson(baseUrl, '/commands?project_id=PRJ-cortex&source=notion_comment&owner_agent=agent-pm');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.commands.length, 1);
  assert.equal(listed.body.commands[0].owner_agent, 'agent-pm');
  assert.equal(listed.body.commands[0].instruction, '继续执行吧');
  assert.equal(listed.body.commands[0].parsed_action, 'continue');

  const wrongAgent = await postJson(baseUrl, '/commands/claim-next', {
    project_id: 'PRJ-cortex',
    source: 'notion_comment',
    owner_agent: 'agent-dev',
    agent_name: 'agent-dev',
  });
  assert.equal(wrongAgent.status, 200);
  assert.equal(wrongAgent.body.command, null);

  const rightAgent = await postJson(baseUrl, '/commands/claim-next', {
    project_id: 'PRJ-cortex',
    source: 'notion_comment',
    owner_agent: 'agent-pm',
    agent_name: 'agent-pm',
  });
  assert.equal(rightAgent.status, 200);
  assert.equal(rightAgent.body.command.command_id, routedComment.body.commandId);
  assert.equal(rightAgent.body.command.owner_agent, 'agent-pm');
  assert.equal(rightAgent.body.command.claimed_by, 'agent-pm');
});

test('defaults red decisions to local notification when no IM route is configured', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-red-route-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-24T09:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const redDecision = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '没有通知路由时是否允许红灯落库？',
    recommendation: '走系统通知，避免静默通过。',
  });

  assert.equal(redDecision.status, 200);
  assert.equal(redDecision.body.ok, true);
  assert.equal(redDecision.body.decision.signal_level, 'red');

  const outbox = await getJson(baseUrl, '/outbox');
  assert.equal(outbox.status, 200);
  assert.equal(outbox.body.pending.length, 1);
  assert.equal(outbox.body.pending[0].channel, 'local_notification');
  assert.equal(outbox.body.pending[0].session_id, null);
  assert.match(outbox.body.pending[0].text, /需要你拍板/);
});

test('maps IM decision actions back into decision status', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-decision-status-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-24T09:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notification_target: 'your-target@example.com',
  });

  const redDecision = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否按推荐方案推进？',
    recommendation: '建议按推荐方案推进。',
  });

  assert.equal(redDecision.status, 200);
  const decisionId = redDecision.body.decision.decision_id;

  const approveAction = await postJson(baseUrl, '/webhook/im-action', {
    project_id: 'PRJ-cortex',
    target_type: 'decision',
    target_id: decisionId,
    action: 'approve',
    instruction: '按推荐方案推进',
    session_id: 'your-user@corp',
    message_id: 'msg-action-approve-001',
  });

  assert.equal(approveAction.status, 200);
  assert.equal(approveAction.body.ok, true);

  const approvedDecisions = await getJson(baseUrl, '/decisions?project_id=PRJ-cortex&status=approved');
  assert.equal(approvedDecisions.status, 200);
  assert.equal(approvedDecisions.body.decisions.length, 1);
  assert.equal(approvedDecisions.body.decisions[0].decision_id, decisionId);

  const pendingRedDecisions = await getJson(baseUrl, '/sync-decisions?project_id=PRJ-cortex');
  assert.equal(pendingRedDecisions.status, 200);
  assert.equal(pendingRedDecisions.body.decisions.length, 0);
});

test('supports manual reconciliation of decision and command statuses', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-reconcile-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-24T10:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notification_target: 'your-target@example.com',
  });

  const command = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex',
    text: '继续推进旧任务',
    session_id: 'your-user@corp',
    message_id: 'msg-reconcile-001',
  });

  const decision = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否保留旧红灯事项？',
    recommendation: '建议归档，避免污染当前 review。',
  });

  assert.equal(command.status, 200);
  assert.equal(decision.status, 200);

  const completeCommand = await postJson(baseUrl, '/commands/update-status', {
    command_id: command.body.commandId,
    status: 'done',
    result_summary: '旧任务已完成并归档到历史。',
  });

  const archiveDecision = await postJson(baseUrl, '/decisions/update-status', {
    decision_id: decision.body.decision.decision_id,
    status: 'archived',
  });

  assert.equal(completeCommand.status, 200);
  assert.equal(completeCommand.body.command.status, 'done');
  assert.equal(completeCommand.body.command.ack, `ack:${command.body.commandId}`);
  assert.equal(archiveDecision.status, 200);
  assert.equal(archiveDecision.body.decision.status, 'archived');

  const review = await getJson(baseUrl, '/project-review?project_id=PRJ-cortex');
  assert.equal(review.status, 200);
  assert.equal(review.body.summary.red_decisions.length, 0);
  assert.equal(review.body.summary.active_commands.length, 0);
});

test('supports command filtering and claim-next for agent inbox polling', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-command-inbox-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-24T10:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'milestone',
    target_id: 'M-1',
    page_id: 'page-001',
    discussion_id: 'discussion-001',
    comment_id: 'comment-001',
    body: '[improve: 把摘要再压短一点]',
    context_quote: '旧摘要太长',
    anchor_block_id: 'block-001',
  });

  await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex',
    text: '继续推进另一条企业 IM 任务',
    session_id: 'your-user@corp',
    message_id: 'msg-inbox-001',
  });

  const notionCommands = await getJson(baseUrl, '/commands?project_id=PRJ-cortex&source=notion_comment&status=new');
  assert.equal(notionCommands.status, 200);
  assert.equal(notionCommands.body.commands.length, 1);
  assert.equal(notionCommands.body.commands[0].source, 'notion_comment');
  assert.equal(notionCommands.body.commands[0].context_quote, '旧摘要太长');
  assert.match(notionCommands.body.commands[0].source_url, /discussion-001/);

  const claimed = await postJson(baseUrl, '/commands/claim-next', {
    project_id: 'PRJ-cortex',
    source: 'notion_comment',
    agent_name: 'agent-notion-worker',
  });

  assert.equal(claimed.status, 200);
  assert.ok(claimed.body.command);
  assert.equal(claimed.body.command.source, 'notion_comment');
  assert.equal(claimed.body.command.status, 'claimed');
  assert.equal(claimed.body.command.claimed_by, 'agent-notion-worker');

  const remainingNewNotion = await getJson(baseUrl, '/commands?project_id=PRJ-cortex&source=notion_comment&status=new');
  assert.equal(remainingNewNotion.status, 200);
  assert.equal(remainingNewNotion.body.commands.length, 0);

  const noMoreClaims = await postJson(baseUrl, '/commands/claim-next', {
    project_id: 'PRJ-cortex',
    source: 'notion_comment',
    agent_name: 'agent-notion-worker',
  });

  assert.equal(noMoreClaims.status, 200);
  assert.equal(noMoreClaims.body.command, null);
});

test('records run and checkpoint lifecycle via HTTP endpoints', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-runs-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-31T09:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const run = await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    command_id: 'CMD-20260331-001',
    agent_name: 'agent-pm',
    role: 'planner',
    phase: 'plan',
    status: 'running',
    title: '任务简报收口',
    summary: '正在把 why/context/what 收口成显式 brief。',
    feedback_source: 'notion_comment',
  });

  assert.equal(run.status, 200);
  assert.equal(run.body.run.role, 'planner');
  assert.equal(run.body.run.status, 'running');

  const runUpdated = await postJson(baseUrl, '/runs/update-status', {
    run_id: run.body.run.run_id,
    status: 'completed',
    summary: 'Why / Context / What 已收口完成。',
    quality_grade: 'draft',
    anomaly_level: 'low',
    feedback_source: 'notion_comment',
    completed_at: '2026-03-31T09:05:00.000Z',
  });

  assert.equal(runUpdated.status, 200);
  assert.equal(runUpdated.body.run.status, 'completed');
  assert.equal(runUpdated.body.run.quality_grade, 'draft');

  const checkpoint = await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    run_id: run.body.run.run_id,
    command_id: 'CMD-20260331-001',
    signal_level: 'green',
    stage: 'plan',
    status: 'aligned',
    title: '方向对齐完成',
    summary: '任务简报已对齐完成，可以进入细节执行阶段。',
    next_step: '按 brief 继续推进执行。',
    quality_grade: 'draft',
    anomaly_level: 'low',
    feedback_source: 'notion_comment',
    created_by: 'agent-pm',
    evidence: ['任务简报已写入', 'why/context/what 已补齐'],
  });

  assert.equal(checkpoint.status, 200);
  assert.equal(checkpoint.body.checkpoint.stage, 'plan');
  assert.equal(checkpoint.body.checkpoint.signal_level, 'green');

  const runs = await getJson(baseUrl, '/runs?project_id=PRJ-cortex');
  assert.equal(runs.status, 200);
  assert.equal(runs.body.runs.length, 1);
  assert.equal(runs.body.runs[0].status, 'completed');

  const checkpoints = await getJson(baseUrl, '/checkpoints?project_id=PRJ-cortex');
  assert.equal(checkpoints.status, 200);
  assert.equal(checkpoints.body.checkpoints.length, 1);
  assert.equal(checkpoints.body.checkpoints[0].next_step, '按 brief 继续推进执行。');

  const review = await getJson(baseUrl, '/project-review?project_id=PRJ-cortex');
  assert.equal(review.status, 200);
  assert.equal(review.body.summary.latest_checkpoint.title, '方向对齐完成');
  assert.equal(review.body.summary.run_role_progress[0].role, 'planner');
  assert.match(review.body.markdown, /当前阶段：plan \/ aligned \/ draft \/ low/);
  assert.match(review.body.markdown, /角色进度：planner\(完成 1\)/);
});
