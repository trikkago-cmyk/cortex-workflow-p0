import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutionCheckpointKey,
  buildReviewCheckpointKey,
  normalizeMarkdownForSync,
} from '../src/notion-sync-dedupe.js';

test('normalizeMarkdownForSync strips volatile 最近同步 lines', () => {
  const markdown = [
    '# PRJ-cortex 工作台入口',
    '',
    '- 最近同步：2026-04-16 15:00（上海时间）',
    '- 当前任务：接入评论扫描',
    '',
    '最近同步：2026-04-16 15:00（上海时间）',
    '',
    '- 下一步：继续验证',
  ].join('\n');

  assert.equal(
    normalizeMarkdownForSync(markdown),
    ['# PRJ-cortex 工作台入口', '', '- 当前任务：接入评论扫描', '', '- 下一步：继续验证'].join('\n'),
  );
});

test('buildReviewCheckpointKey ignores display time changes but keeps semantic board data', () => {
  const reviewPayloadA = {
    markdown: [
      '# PRJ-cortex 工作台入口',
      '',
      '- 最近同步：2026-04-16 15:00（上海时间）',
      '- 当前任务：评论接入',
      '- 🟢 核心进展：已跑通评论扫描',
      '- 下一步：验证 action 触发',
    ].join('\n'),
    summary: {
      latest_checkpoint: {
        title: '评论接入',
        summary: '已跑通评论扫描',
        next_step: '验证 action 触发',
        signal_level: 'green',
      },
      next_steps: ['验证 action 触发'],
    },
  };
  const reviewPayloadB = {
    ...reviewPayloadA,
    markdown: reviewPayloadA.markdown.replace('15:00', '15:03'),
  };

  const executionMarkdownA = [
    '# 执行文档',
    '',
    '- 当前任务：评论接入',
    '- 核心进展：已跑通评论扫描',
    '- 最近同步：2026-04-16 15:00（上海时间）',
    '- 下一步：验证 action 触发',
  ].join('\n');
  const executionMarkdownB = executionMarkdownA.replace('15:00', '15:03');

  assert.equal(
    buildReviewCheckpointKey({
      reviewPayload: reviewPayloadA,
      executionMarkdown: executionMarkdownA,
    }),
    buildReviewCheckpointKey({
      reviewPayload: reviewPayloadB,
      executionMarkdown: executionMarkdownB,
    }),
  );
});

test('buildExecutionCheckpointKey changes only when execution content changes', () => {
  const markdownA = [
    '# 执行文档',
    '',
    '- 当前任务：评论接入',
    '- 核心进展：已跑通评论扫描',
    '- 最近同步：2026-04-16 15:00（上海时间）',
    '- 下一步：验证 action 触发',
  ].join('\n');
  const markdownB = markdownA.replace('15:00', '15:05');
  const markdownC = markdownA.replace('已跑通评论扫描', '已跑通评论扫描并验证 action 触发');

  assert.equal(buildExecutionCheckpointKey({ markdown: markdownA }), buildExecutionCheckpointKey({ markdown: markdownB }));
  assert.notEqual(buildExecutionCheckpointKey({ markdown: markdownA }), buildExecutionCheckpointKey({ markdown: markdownC }));
});
