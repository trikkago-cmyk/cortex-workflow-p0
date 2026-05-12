import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore } from '../src/store.js';
import { CortexEngine } from '../src/engine.js';
import { createCortexServer } from '../src/server.js';
import { CortexProjector } from '../src/projector.js';

function createHarnessContext() {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-vnext-'));
  const clock = () => new Date('2026-04-13T10:00:00.000Z');
  const store = createStore({
    dbPath: join(dbDir, 'cortex.db'),
    clock,
  });
  const engine = new CortexEngine({ store, clock });
  return { store, engine };
}

test('phase 1 memory model stores sources and backfills checkpoint / brief references', () => {
  const { store, engine } = createHarnessContext();

  const brief = engine.createTaskBrief({
    projectId: 'PRJ-cortex',
    title: 'Harness 化重构任务简报',
    why: '把 Cortex 从执行内核升级成可治理的协作系统。',
    context: '已有 commands / decisions / checkpoints / receipts，需要接 memory / inbox / suggestion。',
    what: '落一版 Phase 1 backend。',
  }).brief;

  const checkpoint = engine.recordCheckpoint({
    projectId: 'PRJ-cortex',
    briefId: brief.briefId,
    stage: 'execute',
    status: 'passed',
    title: 'Schema 方案通过',
    summary: 'memory / inbox / suggestion 的对象模型已经稳定。',
    evidence: ['docs/cortex-vnext-phase1-plan.md'],
    createdBy: 'codex',
  }).checkpoint;

  const created = engine.createMemory({
    projectId: 'PRJ-cortex',
    layer: 'knowledge',
    type: 'pattern',
    title: 'Harness 先补对象层再补前台',
    summary: 'Phase 1 先补 memory / inbox / suggestion schema，再接 projector 和 Notion adapter。',
    confidence: 'high',
    sources: [
      {
        sourceType: 'checkpoint',
        sourceRef: checkpoint.checkpointId,
        summary: '已验证的 checkpoint 结论',
        evidence: { checkpoint_id: checkpoint.checkpointId },
      },
      {
        sourceType: 'task_brief',
        sourceRef: brief.briefId,
        summary: '来源任务简报',
        evidence: { brief_id: brief.briefId },
      },
    ],
  });

  assert.equal(created.isDuplicate, false);
  assert.equal(created.memory.layer, 'knowledge');
  assert.equal(created.sources.length, 2);
  assert.equal(created.memory.sourceCount, 2);
  assert.equal(created.memory.metadata.reviewer_recommendation.recommendation, 'recommend_accept');
  assert.equal(created.reviewerAssessment.recommendation, 'recommend_accept');

  const duplicate = engine.createMemory({
    projectId: 'PRJ-cortex',
    layer: 'knowledge',
    type: 'pattern',
    title: 'Harness 先补对象层再补前台',
    summary: 'Phase 1 先补 memory / inbox / suggestion schema，再接 projector 和 Notion adapter。',
  });

  assert.equal(duplicate.isDuplicate, true);
  assert.equal(duplicate.memory.memoryId, created.memory.memoryId);

  const checkpointAfter = store.listCheckpoints({ projectId: 'PRJ-cortex' })[0];
  assert.equal(checkpointAfter.memoryCandidateCount, 1);

  const briefAfter = store.listTaskBriefs({ projectId: 'PRJ-cortex' })[0];
  assert.deepEqual(briefAfter.memoryContextRefs, [created.memory.memoryId]);

  const reviewed = engine.reviewMemory({
    memoryId: created.memory.memoryId,
    reviewState: 'accepted',
    reviewActor: 'reviewer-human',
    reviewNote: '确认进入 durable memory。',
  });
  assert.equal(reviewed.memory.reviewState, 'accepted');
  assert.equal(reviewed.memory.status, 'durable');
  assert.equal(reviewed.memory.metadata.human_review.actor, 'reviewer-human');
  assert.equal(reviewed.memory.metadata.review_stage, 'human_confirmed_durable');
});

test('task brief source_ref can backfill stable thread identity from upstream command', () => {
  const { store, engine } = createHarnessContext();

  const command = engine.ingestImMessage({
    projectId: 'PRJ-cortex',
    text: '继续推进 Cortex 线程身份治理',
    sessionId: 'thread-source@corp',
    messageId: 'msg-thread-source-001',
  }).command;

  const brief = store.createOrGetTaskBrief({
    projectId: 'PRJ-cortex',
    title: '继承 command 线程的 brief',
    why: '避免未来新增 brief 再退回 brief:* 泛化线程。',
    context: '这里模拟旧数据：brief 创建时还没把 thread_key 写进去，但已经有 source_ref。',
    what: '验证 backfill 能从 source_ref 找回上游 thread identity。',
    status: 'draft',
    source: 'agent_brief',
    sourceRef: `command:${command.commandId}`,
    idempotencyKey: 'brief-source-ref-backfill',
  }).brief;

  assert.equal(brief.threadKey, null);

  const stats = store.backfillThreadIdentityColumns();
  const briefAfter = store.getTaskBrief(brief.briefId);

  assert.equal(stats.taskBriefs, 1);
  assert.equal(briefAfter.sourceRef, `command:${command.commandId}`);
  assert.equal(briefAfter.threadKey, 'session:thread-source@corp');
});

test('phase 1 inbox model updates source command / decision projections', () => {
  const { store, engine } = createHarnessContext();

  const command = engine.ingestImMessage({
    projectId: 'PRJ-cortex',
    text: '继续推进 Cortex vNext',
    sessionId: 'your-user@corp',
    messageId: 'msg-vnext-001',
  }).command;

  const decision = engine.createDecision({
    projectId: 'PRJ-cortex',
    signalLevel: 'yellow',
    question: '是否先只做 backend？',
    recommendation: '先做 backend，把对象模型跑起来。',
    impactScope: 'module',
  }).decision;

  const reviewItem = engine.createInboxItem({
    projectId: 'PRJ-cortex',
    queue: 'review',
    objectType: 'result',
    actionType: 'review',
    riskLevel: 'green',
    title: '验收当前命令结果',
    sourceRef: `command:${command.commandId}`,
    payload: { command_id: command.commandId },
  }).item;

  const decideItem = engine.createInboxItem({
    projectId: 'PRJ-cortex',
    queue: 'decide',
    objectType: 'decision',
    actionType: 'decide',
    riskLevel: 'yellow',
    title: '拍板 backend 范围',
    sourceRef: `decision:${decision.decisionId}`,
    payload: { decision_id: decision.decisionId },
  }).item;

  assert.equal(engine.listInbox({ projectId: 'PRJ-cortex' }).items.length, 2);
  assert.equal(command.threadKey, 'session:your-user@corp');
  assert.equal(reviewItem.threadKey, 'session:your-user@corp');
  assert.equal(reviewItem.threadLabel, command.threadLabel);

  const commandAfter = store.getCommand(command.commandId);
  assert.equal(commandAfter.inboxItemCount, 1);

  const decisionAfter = store.listDecisionRequests({ projectId: 'PRJ-cortex' })[0];
  assert.equal(decisionAfter.inboxItemId, decideItem.itemId);

  const resolved = engine.actInboxItem({
    itemId: reviewItem.itemId,
    status: 'resolved',
    payloadPatch: { resolution: 'accepted' },
  }).item;

  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.payload.resolution, 'accepted');
  assert.ok(resolved.resolvedAt);
});

test('phase 1 suggestion model supports accept / reject lifecycle and server compiles', () => {
  const { engine } = createHarnessContext();

  const suggestion = engine.createSuggestion({
    projectId: 'PRJ-cortex',
    sourceType: 'comment',
    sourceRef: 'comment-001',
    documentRef: 'notion://page/review',
    anchorBlockId: 'block-001',
    selectedText: '长文档汇报',
    proposedText: '改成 Inbox 队列',
    reason: '队列式处理更适合 human-in-the-loop review。',
    impactScope: 'module',
  }).suggestion;

  assert.equal(suggestion.status, 'proposed');

  const accepted = engine.acceptSuggestion({ suggestionId: suggestion.suggestionId }).suggestion;
  assert.equal(accepted.status, 'accepted');
  assert.ok(accepted.appliedAt);

  const rejected = engine.createSuggestion({
    projectId: 'PRJ-cortex',
    sourceType: 'comment',
    sourceRef: 'comment-002',
    proposedText: '继续保留长文档总览',
  }).suggestion;

  const rejectedAfter = engine.rejectSuggestion({
    suggestionId: rejected.suggestionId,
    rejectedReason: '与新的队列式 review 方向冲突',
  }).suggestion;

  assert.equal(rejectedAfter.status, 'rejected');
  assert.equal(rejectedAfter.rejectedReason, '与新的队列式 review 方向冲突');

  const server = createCortexServer({
    dbPath: join(mkdtempSync(join(tmpdir(), 'cortex-vnext-server-')), 'cortex.db'),
    clock: () => new Date('2026-04-13T10:00:00.000Z'),
  });
  server.close();
});

test('projector routes notion comment, decision, and receipt into action inboxes', () => {
  const { engine } = createHarnessContext();
  const projector = new CortexProjector({ engine });

  const notionCommand = engine.ingestNotionComment({
    projectId: 'PRJ-cortex',
    targetType: 'milestone',
    targetId: 'M-001',
    pageId: 'page-001',
    discussionId: 'discussion-001',
    commentId: 'comment-001',
    body: '这里需要你继续补齐 projector',
    contextQuote: 'projector 规则文档还没接上自动投影',
  }).command;

  projector.projectNotionComment(notionCommand);
  projector.projectNotionComment(notionCommand);

  const decision = engine.createDecision({
    projectId: 'PRJ-cortex',
    signalLevel: 'red',
    question: '是否现在接 projector？',
    recommendation: '接，属于 Phase 1 的自然延伸。',
    impactScope: 'module',
    sessionId: 'your-user@corp',
  }).decision;

  projector.projectDecisionRequest(decision);

  const receiptCommand = engine.ingestImMessage({
    projectId: 'PRJ-cortex',
    text: '继续推进 projector',
    sessionId: 'your-user@corp',
    messageId: 'msg-projector-001',
  }).command;

  const receipt = engine.recordReceipt({
    commandId: receiptCommand.commandId,
    projectId: 'PRJ-cortex',
    status: 'completed',
    receiptType: 'result',
    payload: {
      summary: 'projector 已接到核心事件流',
    },
    signal: 'green',
    channel: 'hiredcity',
    target: 'your-user@corp',
  }).receipt;

  projector.projectReceipt(receiptCommand, receipt);

  const items = engine.listInbox({ projectId: 'PRJ-cortex' }).items;
  assert.equal(items.length, 3);
  assert.equal(items.filter((item) => item.queue === 'triage').length, 1);
  assert.equal(items.filter((item) => item.queue === 'decide').length, 1);
  assert.equal(items.filter((item) => item.queue === 'review').length, 1);
});

test('projector turns checkpoint, approved decision, and suggestion outcome into candidate memory', () => {
  const { engine } = createHarnessContext();
  const projector = new CortexProjector({ engine });

  const checkpoint = engine.recordCheckpoint({
    projectId: 'PRJ-cortex',
    stage: 'execute',
    status: 'passed',
    title: '评论 triage 路由跑通',
    summary: 'notion comment -> triage inbox 已跑通，可复用。',
    evidence: ['test proof'],
    createdBy: 'codex',
  }).checkpoint;
  projector.projectCheckpoint(checkpoint);

  const decision = engine.createDecision({
    projectId: 'PRJ-cortex',
    signalLevel: 'yellow',
    question: '展示标签和检索标签是否分离？',
    recommendation: '分离，避免污染多个下游模块。',
    impactScope: 'cross_module',
  }).decision;
  const approved = engine.updateDecisionStatus({
    decisionId: decision.decisionId,
    status: 'approved',
  });
  projector.projectDecisionOutcome(approved);

  const suggestion = engine.createSuggestion({
    projectId: 'PRJ-cortex',
    sourceType: 'comment',
    sourceRef: 'comment-003',
    proposedText: '把 review 从长文档汇报改成 Inbox 队列处理',
  }).suggestion;
  const accepted = engine.acceptSuggestion({ suggestionId: suggestion.suggestionId }).suggestion;
  projector.projectSuggestionOutcome(accepted);

  const memories = engine.listMemory({ projectId: 'PRJ-cortex' }).memories;
  assert.equal(memories.length, 3);
  assert.equal(memories.filter((memory) => memory.status === 'candidate').length, 3);

  const reviewItems = engine
    .listInbox({ projectId: 'PRJ-cortex', queue: 'review' })
    .items.filter((item) => item.objectType === 'memory');
  assert.equal(reviewItems.length, 3);
  assert.equal(memories.every((memory) => memory.metadata.reviewer_recommendation), true);
  assert.equal(reviewItems.every((item) => item.payload.reviewer_recommendation), true);
});

test('server extracts candidate memory from raw dialogue, runs reviewer-agent, and accepts human confirmation', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-memory-review-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-16T12:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const extracted = await fetch(`${baseUrl}/memory/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 'PRJ-cortex',
      source_type: 'comment',
      text: '低风险且明显有益的下一步，默认直接执行，不等许可。',
      evidence: {
        thread: 'local-dialogue',
      },
    }),
  }).then((response) => response.json());

  assert.equal(extracted.ok, true);
  assert.equal(extracted.projections.length, 1);
  assert.equal(extracted.projections[0].reviewer_assessment.recommendation, 'recommend_accept');
  assert.equal(extracted.projections[0].inbox_item.queue, 'review');

  const memoryId = extracted.projections[0].memory.memory_id;

  const rerun = await fetch(`${baseUrl}/memory/${encodeURIComponent(memoryId)}/reviewer-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      force: true,
    }),
  }).then((response) => response.json());

  assert.equal(rerun.ok, true);
  assert.equal(rerun.reviewer_assessment.recommendation, 'recommend_accept');

  const accepted = await fetch(`${baseUrl}/memory/${encodeURIComponent(memoryId)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      review_state: 'accepted',
      review_actor: 'reviewer-human',
      review_note: '确认进入 durable memory。',
    }),
  }).then((response) => response.json());

  assert.equal(accepted.ok, true);
  assert.equal(accepted.memory.status, 'durable');
  assert.equal(accepted.memory.review_state, 'accepted');
  assert.equal(accepted.memory.human_review.actor, 'reviewer-human');
});

test('server suggestion accept endpoint projects accepted suggestion into candidate memory', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-suggestion-memory-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-10T01:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const suggestionCreate = await fetch(`${baseUrl}/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 'PRJ-cortex',
      thread_key: 'notion:page-memory:discussion-memory',
      thread_label: 'memory reviewer suggestion',
      source_type: 'notion_comment',
      source_ref: 'comment-memory-001',
      document_ref: 'notion://page/page-memory/discussion/discussion-memory/comment/comment-memory-001',
      proposed_text: '把 reviewer 现场里的 suggestion 直接转成 candidate memory',
      reason: '用户已经明确这类 suggestion 值得继续沉淀。',
      owner_agent: 'agent-router',
    }),
  }).then((response) => response.json());

  assert.equal(suggestionCreate.ok, true);

  const accepted = await fetch(
    `${baseUrl}/suggestions/${encodeURIComponent(suggestionCreate.suggestion.suggestion_id)}/accept`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        review_note: '这条 suggestion 已经说明了 reviewer 现场该怎么继续沉淀。',
        review_actor: 'workspace_memory_reviewer',
      }),
    },
  ).then((response) => response.json());

  assert.equal(accepted.ok, true);
  assert.equal(accepted.suggestion.status, 'accepted');
  assert.equal(accepted.projections.length, 1);

  const memories = await fetch(`${baseUrl}/memory?project_id=PRJ-cortex`).then((response) => response.json());
  assert.equal(memories.ok, true);
  assert.equal(memories.memories.length, 1);
  assert.equal(memories.memories[0].status, 'candidate');
  assert.equal(memories.memories[0].review_state, 'pending_accept');
  assert.match(memories.memories[0].title, /reviewer 现场里的 suggestion|candidate memory/i);

  const memoryDetail = await fetch(`${baseUrl}/memory/${encodeURIComponent(memories.memories[0].memory_id)}`).then((response) =>
    response.json(),
  );
  assert.equal(memoryDetail.ok, true);
  assert.equal(memoryDetail.sources.length, 1);
  assert.match(memoryDetail.sources[0].summary, /Reviewer note：这条 suggestion 已经说明了 reviewer 现场该怎么继续沉淀/);
  assert.equal(memoryDetail.sources[0].evidence.reviewer_note, '这条 suggestion 已经说明了 reviewer 现场该怎么继续沉淀。');
  assert.equal(memoryDetail.sources[0].evidence.reviewer_actor, 'workspace_memory_reviewer');
});

test('server suggestion reject endpoint can skip memory projection for reviewer-only dismissal', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-suggestion-reject-skip-memory-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-10T01:10:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const suggestionCreate = await fetch(`${baseUrl}/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 'PRJ-cortex',
      thread_key: 'notion:page-memory:discussion-memory',
      thread_label: 'memory reviewer suggestion reject',
      source_type: 'notion_comment',
      source_ref: 'comment-memory-002',
      document_ref: 'notion://page/page-memory/discussion/discussion-memory/comment/comment-memory-002',
      proposed_text: '这条 suggestion 现在先不要沉淀成 memory',
      reason: '只是临时描述，不够稳定。',
      owner_agent: 'agent-router',
    }),
  }).then((response) => response.json());

  assert.equal(suggestionCreate.ok, true);

  const rejected = await fetch(
    `${baseUrl}/suggestions/${encodeURIComponent(suggestionCreate.suggestion.suggestion_id)}/reject`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rejected_reason: '当前先保留在 suggestion 层，不进入 memory',
        skip_memory_projection: true,
      }),
    },
  ).then((response) => response.json());

  assert.equal(rejected.ok, true);
  assert.equal(rejected.suggestion.status, 'rejected');
  assert.deepEqual(rejected.projections, []);

  const memories = await fetch(`${baseUrl}/memory?project_id=PRJ-cortex`).then((response) => response.json());
  assert.equal(memories.ok, true);
  assert.equal(memories.memories.length, 0);
});
