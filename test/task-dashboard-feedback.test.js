import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceHomeCommentFeedback,
  buildWorkspaceHomeDecisionFeedback,
  buildWorkspaceHomeMemoryReviewFeedback,
  buildWorkspaceHomeSuggestionFeedback,
} from '../src/task-dashboard.js';

test('workspace homepage decision feedback keeps a stable success message', () => {
  assert.equal(buildWorkspaceHomeDecisionFeedback(), '首页动作已写回 · 决策拍板');
  assert.equal(
    buildWorkspaceHomeDecisionFeedback(' 先按当前方案继续推进 '),
    '首页动作已写回 · 决策拍板：先按当前方案继续推进',
  );
});

test('workspace homepage comment feedback stays consistent across reply, escalation, and dispatch paths', () => {
  assert.equal(
    buildWorkspaceHomeCommentFeedback({
      target: 'reply',
      action: 'continue',
      note: '今晚补线程结果',
    }),
    '首页动作已写回 · 线程回复：今晚补线程结果',
  );
  assert.equal(
    buildWorkspaceHomeCommentFeedback({
      target: 'comment',
      action: 'red',
      note: '这个风险会污染多个模块',
    }),
    '首页动作已写回 · 红灯登记：这个风险会污染多个模块',
  );
  assert.equal(
    buildWorkspaceHomeCommentFeedback({
      target: 'derive',
      action: 'retry',
      note: '重跑并补 checkpoint',
    }),
    '首页动作已写回 · 评论动作派发：重跑并补 checkpoint',
  );
  assert.equal(
    buildWorkspaceHomeCommentFeedback({
      target: 'comment',
      action: 'yellow',
    }),
    '首页动作已写回 · 黄灯登记',
  );
});

test('workspace homepage memory reviewer feedback keeps accepted, rejected, and followup labels aligned', () => {
  assert.equal(buildWorkspaceHomeMemoryReviewFeedback('accepted'), '首页动作已写回 · 记忆治理 · 接受为 durable memory');
  assert.equal(buildWorkspaceHomeMemoryReviewFeedback('rejected'), '首页动作已写回 · 记忆治理 · 拒绝沉淀');
  assert.equal(
    buildWorkspaceHomeMemoryReviewFeedback('needs_followup', '请先补两条真实 source'),
    '首页动作已写回 · 记忆治理 · 标记继续补证据：请先补两条真实 source',
  );
  assert.equal(buildWorkspaceHomeMemoryReviewFeedback('unknown'), '首页动作已写回 · 记忆治理');
});

test('workspace homepage suggestion feedback keeps accept and reject copy stable', () => {
  assert.equal(buildWorkspaceHomeSuggestionFeedback('accept'), '首页动作已写回 · Suggestion 治理 · 转成 candidate memory');
  assert.equal(
    buildWorkspaceHomeSuggestionFeedback('reject', '当前先不沉淀'),
    '首页动作已写回 · Suggestion 治理 · 标记暂不沉淀：当前先不沉淀',
  );
  assert.equal(buildWorkspaceHomeSuggestionFeedback('unknown'), '首页动作已写回 · Suggestion 治理');
});
