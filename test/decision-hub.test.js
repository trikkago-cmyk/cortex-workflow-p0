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

test('decision hub returns structured decision packets with joined decide inbox items', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-decision-hub-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-17T10:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notification_target: 'your-user@corp',
  });

  const created = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否启用 Decision Hub packet？',
    context: '当前红灯事项已经需要带上证据、推荐项和截止时间，方便人类在 IM 里快速拍板。',
    options: ['保持旧结构', '切到 packet 结构'],
    recommendation: '建议切到 packet 结构，避免上下文继续散落在多个对象里。',
    recommended_option: '切到 packet 结构',
    why_now: '下一步就要接 Decision Hub 和 IM 拍板链路。',
    impact_scope: 'cross_module',
    downstream_contamination: true,
    evidence_refs: ['checkpoint:CP-20260417-001', 'memory:MEM-20260417-001'],
    requested_human_action: '请确认是否按推荐方案推进',
    due_at: '2026-04-18T10:00:00.000Z',
    session_id: 'your-user@corp',
  });

  assert.equal(created.status, 200);
  assert.equal(created.body.decision.context, '当前红灯事项已经需要带上证据、推荐项和截止时间，方便人类在 IM 里快速拍板。');
  assert.deepEqual(created.body.decision.evidence_refs, ['checkpoint:CP-20260417-001', 'memory:MEM-20260417-001']);
  assert.equal(created.body.decision.recommended_option, '切到 packet 结构');

  const hub = await getJson(baseUrl, '/decision-hub?project_id=PRJ-cortex');
  assert.equal(hub.status, 200);
  assert.equal(hub.body.ok, true);
  assert.equal(hub.body.view, 'open');
  assert.equal(hub.body.summary.total_count, 1);
  assert.equal(hub.body.summary.open_count, 1);
  assert.equal(hub.body.summary.red_count, 1);
  assert.equal(hub.body.summary.decide_queue_open_count, 1);

  const packet = hub.body.decisions[0];
  assert.equal(packet.question, '是否启用 Decision Hub packet？');
  assert.equal(packet.context, '当前红灯事项已经需要带上证据、推荐项和截止时间，方便人类在 IM 里快速拍板。');
  assert.equal(packet.blocking_scope, 'cross_module');
  assert.equal(packet.recommended_option, '切到 packet 结构');
  assert.deepEqual(packet.evidence_refs, ['checkpoint:CP-20260417-001', 'memory:MEM-20260417-001']);
  assert.equal(packet.requested_human_action, '请确认是否按推荐方案推进');
  assert.equal(packet.due_at, '2026-04-18T10:00:00.000Z');
  assert.equal(packet.inbox_status, 'open');
  assert.equal(packet.inbox_item.queue, 'decide');
  assert.equal(packet.inbox_item.payload.recommended_option, '切到 packet 结构');
  assert.equal(packet.inbox_item.payload.requested_human_action, '请确认是否按推荐方案推进');
});

test('decision hub closed view preserves human decision audit and resolves decide inbox', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-decision-hub-review-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-17T12:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notification_target: 'your-user@corp',
  });

  const created = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否把 IM 拍板写回决策审计？',
    recommendation: '建议写回，避免后续无法判断 durable memory 的准入依据。',
    recommended_option: '写回决策审计',
    impact_scope: 'cross_module',
    session_id: 'your-user@corp',
  });

  const decisionId = created.body.decision.decision_id;

  const updated = await postJson(baseUrl, '/decisions/update-status', {
    decision_id: decisionId,
    status: 'approved',
    decided_by: 'your-user@corp',
    decision_note: '确认按推荐方案推进，并把审计写回 packet。',
    selected_option: '写回决策审计',
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.decision.status, 'approved');
  assert.equal(updated.body.decision.decided_by, 'your-user@corp');
  assert.equal(updated.body.decision.selected_option, '写回决策审计');

  const hub = await getJson(baseUrl, '/decision-hub?project_id=PRJ-cortex&view=closed');
  assert.equal(hub.status, 200);
  assert.equal(hub.body.summary.total_count, 1);
  assert.equal(hub.body.summary.terminal_count, 1);

  const packet = hub.body.decisions[0];
  assert.equal(packet.status, 'approved');
  assert.equal(packet.decided_by, 'your-user@corp');
  assert.equal(packet.decision_note, '确认按推荐方案推进，并把审计写回 packet。');
  assert.equal(packet.selected_option, '写回决策审计');
  assert.ok(packet.decided_at);
  assert.equal(packet.inbox_status, 'resolved');
  assert.equal(packet.inbox_item.status, 'resolved');
  assert.equal(packet.inbox_item.payload.decision_status, 'approved');
});

test('IM decision actions update decision hub audit trail through the same decision status path', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-decision-im-audit-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-17T13:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notification_target: 'your-user@corp',
  });

  const created = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否允许 IM 直接拍板红灯？',
    recommendation: '允许，但必须把 operator 和说明写回 decision audit。',
    impact_scope: 'module',
    session_id: 'your-user@corp',
  });

  const decisionId = created.body.decision.decision_id;

  const action = await postJson(baseUrl, '/webhook/im-action', {
    project_id: 'PRJ-cortex',
    target_type: 'decision',
    target_id: decisionId,
    action: 'approve',
    instruction: '按推荐方案推进',
    session_id: 'your-user@corp',
    message_id: 'msg-im-action-approve-001',
    user_id: 'your-user@corp',
  });

  assert.equal(action.status, 200);
  assert.equal(action.body.decision.status, 'approved');
  assert.equal(action.body.decision.decided_by, 'your-user@corp');
  assert.equal(action.body.decision.decision_note, '按推荐方案推进');

  const hub = await getJson(baseUrl, '/decision-hub?project_id=PRJ-cortex&view=closed');
  assert.equal(hub.status, 200);
  assert.equal(hub.body.decisions.length, 1);
  assert.equal(hub.body.decisions[0].decision_id, decisionId);
  assert.equal(hub.body.decisions[0].decided_by, 'your-user@corp');
  assert.equal(hub.body.decisions[0].decision_note, '按推荐方案推进');
  assert.equal(hub.body.decisions[0].inbox_status, 'resolved');
});
