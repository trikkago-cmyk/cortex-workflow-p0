import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';

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

test('notion custom agent context exposes the event-driven async contract', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-21T08:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const context = await getJson(baseUrl, '/notion/custom-agent/context?project_id=PRJ-cortex');
  assert.equal(context.status, 200);
  assert.equal(context.body.ok, true);
  assert.equal(context.body.collaboration_mode, 'custom_agent');
  assert.equal(context.body.async_contract.ingress, 'event_driven');
  assert.equal(context.body.async_contract.ingress_webhook, '/webhook/notion-custom-agent');
  assert.equal(context.body.async_contract.loop_guard.ignore_self_comments, true);
  assert.equal(context.body.async_contract.scope_guard.enforce_known_project_pages, false);
});

test('notion custom agent webhook ingests agent-triggered comments without polling', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-webhook-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-21T08:10:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const response = await postJson(baseUrl, '/webhook/notion-custom-agent', {
    project_id: 'PRJ-cortex',
    page_id: 'page-001',
    discussion_id: 'discussion-001',
    comment_id: 'comment-001',
    body: '@cortex 请把这条 review 推进到下一步',
    owner_agent: 'agent-router',
    invoked_agent: 'Cortex Router',
    source_url: 'notion://page/page-001/discussion/discussion-001/comment/comment-001',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.collaboration_mode, 'custom_agent');
  assert.equal(response.body.workflow_path, 'command');
  assert.equal(response.body.signal_level, 'green');
  assert.equal(response.body.owner_agent, 'agent-router');
  assert.match(response.body.command_id, /^CMD-/);
  assert.match(response.body.commandId, /^CMD-/);
});

test('notion custom agent webhook upgrades red-risk discussions into decision requests', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-red-webhook-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-21T08:20:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const response = await postJson(baseUrl, '/webhook/notion-custom-agent', {
    project_id: 'PRJ-cortex',
    page_id: 'page-002',
    discussion_id: 'discussion-002',
    comment_id: 'comment-002',
    body: '直接覆盖当前公开 README 结构。',
    owner_agent: 'agent-router',
    invoked_agent: 'Cortex Router',
    signal_level: 'red',
    decision_context: {
      question: '是否直接覆盖当前公开 README 结构？',
      options: ['继续覆盖', '先保留旧结构并增量迁移'],
      recommendation: '先保留旧结构并增量迁移，避免公开文档突然失真。',
      requested_human_action: '请拍板 README 迁移方案。',
      impact_scope: 'cross_module',
      evidence_refs: ['doc:README', 'doc:notion-custom-agents-collaboration'],
    },
    source_url: 'notion://page/page-002/discussion/discussion-002/comment/comment-002',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.workflow_path, 'decision_request');
  assert.equal(response.body.signal_level, 'red');
  assert.equal(response.body.command_id, null);
  assert.equal(response.body.commandId, null);
  assert.match(response.body.decision_id, /^DR-/);
  assert.equal(response.body.decision.question, '是否直接覆盖当前公开 README 结构？');
  assert.equal(response.body.decision.signal_level, 'red');
  assert.equal(response.body.decision.impact_scope, 'cross_module');
  assert.equal(response.body.owner_agent, 'agent-router');
  assert.equal(response.body.outbox_queued, true);

  const decisions = await getJson(baseUrl, '/decisions?project_id=PRJ-cortex&signal_level=red');
  assert.equal(decisions.status, 200);
  assert.equal(decisions.body.decisions.length, 1);
  assert.equal(decisions.body.decisions[0].decision_id, response.body.decision_id);

  const commands = await getJson(baseUrl, '/commands?project_id=PRJ-cortex');
  assert.equal(commands.status, 200);
  assert.equal(commands.body.commands.length, 0);
});

test('notion custom agent treats decision_context without explicit signal as yellow review flow', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-yellow-webhook-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-21T08:25:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const response = await postJson(baseUrl, '/webhook/notion-custom-agent', {
    project_id: 'PRJ-cortex',
    page_id: 'page-003',
    discussion_id: 'discussion-003',
    comment_id: 'comment-003',
    body: '这块方案我不确定，先请你给个建议再继续。',
    owner_agent: 'agent-router',
    decision_context: {
      question: '是否需要先补联调 checklist，再继续推进接入？',
      recommendation: '建议先补 checklist，避免后续多人协作时反复返工。',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.workflow_path, 'decision_request');
  assert.equal(response.body.signal_level, 'yellow');
  assert.equal(response.body.decision.signal_level, 'yellow');
  assert.equal(response.body.outbox_queued, false);

  const hub = await getJson(baseUrl, '/decision-hub?project_id=PRJ-cortex');
  assert.equal(hub.status, 200);
  assert.equal(hub.body.summary.yellow_count, 1);
  assert.equal(hub.body.summary.decide_queue_open_count, 1);
});

test('notion custom agent webhook ignores self-authored agent comments to avoid loops', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-self-loop-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-23T09:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const response = await postJson(baseUrl, '/webhook/notion-custom-agent', {
    project_id: 'PRJ-cortex',
    page_id: 'page-004',
    discussion_id: 'discussion-004',
    comment_id: 'comment-004',
    body: '这是 Cortex Router 刚刚自己回帖的内容。',
    invoked_agent: 'Cortex Router',
    created_by: {
      id: 'notion-user-router-001',
      type: 'bot',
      name: 'Cortex Router',
    },
    invoked_agent_actor_id: 'notion-user-router-001',
    source_url: 'notion://page/page-004/discussion/discussion-004/comment/comment-004',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.skipped, true);
  assert.equal(response.body.skip_reason, 'self_authored_comment');
  assert.equal(response.body.workflow_path, 'ignored');
  assert.equal(response.body.command_id, null);
  assert.equal(response.body.decision_id, null);

  const commands = await getJson(baseUrl, '/commands?project_id=PRJ-cortex');
  assert.equal(commands.status, 200);
  assert.equal(commands.body.commands.length, 0);

  const decisions = await getJson(baseUrl, '/decisions?project_id=PRJ-cortex');
  assert.equal(decisions.status, 200);
  assert.equal(decisions.body.decisions.length, 0);
});

test('notion custom agent context exposes configured project scope ids', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-scope-context-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-23T10:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const upsert = await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    name: 'Cortex',
    root_page_url: 'https://www.notion.so/Cortex-11111111111111111111111111111111',
    notion_parent_page_id: '22222222-2222-2222-2222-222222222222',
    notion_review_page_id: '33333333-3333-3333-3333-333333333333',
    notion_memory_page_id: '44444444-4444-4444-4444-444444444444',
    notion_scan_page_id: '55555555-5555-5555-5555-555555555555',
  });
  assert.equal(upsert.status, 200);

  const context = await getJson(baseUrl, '/notion/custom-agent/context?project_id=PRJ-cortex');
  assert.equal(context.status, 200);
  assert.equal(context.body.async_contract.scope_guard.enforce_known_project_pages, true);
  assert.deepEqual(
    context.body.async_contract.scope_guard.configured_page_ids.sort(),
    [
      '11111111111111111111111111111111',
      '22222222222222222222222222222222',
      '33333333333333333333333333333333',
      '44444444444444444444444444444444',
      '55555555555555555555555555555555',
    ].sort(),
  );
});

test('notion custom agent webhook ignores out-of-scope pages when project scope is configured', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-out-of-scope-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-23T10:10:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const upsert = await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notion_parent_page_id: '22222222-2222-2222-2222-222222222222',
  });
  assert.equal(upsert.status, 200);

  const response = await postJson(baseUrl, '/webhook/notion-custom-agent', {
    project_id: 'PRJ-cortex',
    page_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    discussion_id: 'discussion-005',
    comment_id: 'comment-005',
    body: '这条评论来自另一个无关页面。',
    source_url: 'notion://page/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/discussion/discussion-005/comment/comment-005',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.skipped, true);
  assert.equal(response.body.skip_reason, 'out_of_scope_page');
  assert.equal(response.body.workflow_path, 'ignored');
  assert.deepEqual(response.body.project_scope_page_ids, ['22222222222222222222222222222222']);
  assert.deepEqual(response.body.incoming_scope_page_ids, ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);

  const commands = await getJson(baseUrl, '/commands?project_id=PRJ-cortex');
  assert.equal(commands.status, 200);
  assert.equal(commands.body.commands.length, 0);
});

test('notion custom agent webhook accepts project child pages when ancestry includes the scoped parent', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-in-scope-child-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-23T10:20:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const upsert = await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    notion_parent_page_id: '22222222-2222-2222-2222-222222222222',
  });
  assert.equal(upsert.status, 200);

  const response = await postJson(baseUrl, '/webhook/notion-custom-agent', {
    project_id: 'PRJ-cortex',
    page_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    page_ancestry_ids: [
      '99999999-9999-9999-9999-999999999999',
      '22222222-2222-2222-2222-222222222222',
    ],
    discussion_id: 'discussion-006',
    comment_id: 'comment-006',
    body: '来自项目子页面的正常评论。',
    owner_agent: 'agent-router',
    source_url: 'notion://page/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/discussion/discussion-006/comment/comment-006',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.workflow_path, 'command');
  assert.equal(response.body.skipped || false, false);

  const commands = await getJson(baseUrl, '/commands?project_id=PRJ-cortex');
  assert.equal(commands.status, 200);
  assert.equal(commands.body.commands.length, 1);
});
