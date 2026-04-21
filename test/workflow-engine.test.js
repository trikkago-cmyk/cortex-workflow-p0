import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../src/workflow-engine.js';

function createEngine() {
  return new WorkflowEngine({
    clock: () => new Date('2026-03-23T10:00:00.000Z'),
  });
}

test('runs the P0 smoke loop from enterprise IM command to claim and ack', () => {
  const engine = createEngine();
  engine.createProject({
    projectId: 'PRJ-cortex',
    name: 'Cortex',
    reviewWindowNote: 'async review window',
  });

  const milestone = engine.createMilestone({
    milestoneId: 'M-20260323-p0',
    name: 'P0 command router smoke test',
    projectId: 'PRJ-cortex',
    phase: 'align',
    status: 'in_progress',
    summary: 'Wire command ingestion, claim, ack, and execution gate checks.',
    writtenBy: 'agent-router',
  });

  assert.deepEqual(engine.evaluateExecutionGate(milestone.milestoneId), {
    allowed: false,
    missing: ['contract_status=approved', 'contract_url', 'approved_by', 'approved_at'],
  });

  engine.approveMilestoneContract({
    milestoneId: milestone.milestoneId,
    contractUrl: 'https://www.notion.so/contracts/p0-router',
    approvedBy: 'luosi',
    approvedAt: '2026-03-23T10:05:00.000Z',
  });

  assert.deepEqual(engine.evaluateExecutionGate(milestone.milestoneId), {
    allowed: true,
    missing: [],
  });

  const firstIngest = engine.ingestEnterpriseImMessage({
    projectId: 'PRJ-cortex',
    targetType: 'milestone',
    targetId: milestone.milestoneId,
    instruction: '继续推进 cortex 的 P0 数据流梳理',
    channelSessionId: 'im-session-1',
    channelMessageId: 'msg-001',
    operatorId: 'luosi',
  });

  assert.equal(firstIngest.deduped, false);
  assert.equal(firstIngest.command.source, 'openclaw_im_message');
  assert.equal(firstIngest.command.parsedAction, 'continue');
  assert.equal(firstIngest.command.idempotencyKey, 'im_message:im-session-1:msg-001');

  const duplicateIngest = engine.ingestEnterpriseImMessage({
    projectId: 'PRJ-cortex',
    targetType: 'milestone',
    targetId: milestone.milestoneId,
    instruction: '继续推进 cortex 的 P0 数据流梳理',
    channelSessionId: 'im-session-1',
    channelMessageId: 'msg-001',
    operatorId: 'luosi',
  });

  assert.equal(duplicateIngest.deduped, true);
  assert.equal(duplicateIngest.command.commandId, firstIngest.command.commandId);

  const claimed = engine.claimCommand({
    commandId: firstIngest.command.commandId,
    agentName: 'agent-router',
  });
  assert.equal(claimed.status, 'claimed');
  assert.equal(claimed.claimedBy, 'agent-router');

  const executing = engine.startCommand({
    commandId: firstIngest.command.commandId,
    agentName: 'agent-router',
  });
  assert.equal(executing.status, 'executing');

  const completed = engine.completeCommand({
    commandId: firstIngest.command.commandId,
    agentName: 'agent-router',
    resultSummary: 'Commands 已落库，claim 和 ack 闭环已验证。',
  });

  assert.equal(completed.status, 'done');
  assert.equal(completed.ack, `ack:${firstIngest.command.commandId}`);
  assert.match(completed.resultSummary, /ack/);

  const snapshot = engine.buildProjectSnapshot('PRJ-cortex');
  assert.equal(snapshot.queues.newCommands, 0);
  assert.equal(snapshot.queues.executingCommands, 0);
  assert.equal(snapshot.now.currentMilestone?.milestoneId, 'M-20260323-p0');
});

test('treats notion comment replies as event-level commands, not thread singletons', () => {
  const engine = createEngine();
  engine.createProject({
    projectId: 'PRJ-cortex',
    name: 'Cortex',
  });

  const firstReply = engine.ingestNotionComment({
    projectId: 'PRJ-cortex',
    targetType: 'milestone',
    targetId: 'M-20260323-ctx-sync',
    pageId: 'page-001',
    discussionId: 'discussion-001',
    commentId: 'comment-001',
    body: '[improve: 把验收标准改成可观测指标]',
    anchorBlockId: 'block-001',
    contextQuote: '原评论锚点附近引用文本',
  });

  assert.equal(firstReply.deduped, false);
  assert.equal(firstReply.command.parsedAction, 'improve');
  assert.equal(firstReply.command.instruction, '把验收标准改成可观测指标');
  assert.equal(firstReply.command.idempotencyKey, 'comment:discussion-001:comment-001');

  const duplicateReply = engine.ingestNotionComment({
    projectId: 'PRJ-cortex',
    targetType: 'milestone',
    targetId: 'M-20260323-ctx-sync',
    pageId: 'page-001',
    discussionId: 'discussion-001',
    commentId: 'comment-001',
    body: '[improve: 把验收标准改成可观测指标]',
  });

  assert.equal(duplicateReply.deduped, true);
  assert.equal(duplicateReply.command.commandId, firstReply.command.commandId);

  const secondReply = engine.ingestNotionComment({
    projectId: 'PRJ-cortex',
    targetType: 'milestone',
    targetId: 'M-20260323-ctx-sync',
    pageId: 'page-001',
    discussionId: 'discussion-001',
    commentId: 'comment-002',
    body: '[continue] 按新的验收口径继续',
  });

  assert.equal(secondReply.deduped, false);
  assert.notEqual(secondReply.command.commandId, firstReply.command.commandId);
  assert.equal(secondReply.command.parsedAction, 'continue');
  assert.equal(secondReply.command.idempotencyKey, 'comment:discussion-001:comment-002');
});

test('builds a red decision alert with rationale and legacy compatibility fields', () => {
  const engine = createEngine();
  engine.createProject({
    projectId: 'PRJ-cortex',
    name: 'Cortex',
  });

  const decision = engine.createDecisionRequest({
    projectId: 'PRJ-cortex',
    signalLevel: 'red',
    question: '标签展示体系是否现在就做展示 / 检索分离？',
    options: ['A. 先混用标签', 'B. 立即分离展示标签和检索标签'],
    recommendation: '推荐 B，避免下游模块被错误标签语义污染。',
    whyNow: '当前就要决定标签结构，否则会污染下游实现。',
    impactScope: 'cross_module',
    irreversible: true,
    downstreamContamination: true,
    ownerAgent: 'agent-architect',
    sourceUrl: 'https://www.notion.so/dr-001',
  });

  assert.equal(decision.signalLevel, 'red');
  assert.equal(decision.blockingLevel, 'Sync');

  const alert = engine.buildDecisionAlert(decision.decisionId);
  assert.equal(alert.type, 'red_alert');
  assert.equal(alert.signalLevel, 'red');
  assert.equal(alert.projectId, 'PRJ-cortex');
  assert.match(alert.reason, /不可逆操作/);
  assert.match(alert.reason, /影响跨模块/);
  assert.match(alert.reason, /会污染下游实现/);
  assert.deepEqual(alert.actions, ['approve_1', 'approve_2', 'improve', 'stop']);
});

test('accepts legacy blockingLevel input and normalizes it to signalLevel', () => {
  const engine = createEngine();
  engine.createProject({
    projectId: 'PRJ-cortex',
    name: 'Cortex',
  });

  const decision = engine.createDecisionRequest({
    projectId: 'PRJ-cortex',
    blockingLevel: 'Async',
    question: '是否暂缓外部依赖接入？',
    recommendation: '建议暂缓，先完成可并行部分。',
    impactScope: 'module',
  });

  assert.equal(decision.signalLevel, 'yellow');
  assert.equal(decision.blockingLevel, 'Async');
  assert.equal(decision.status, 'proposed');
});
