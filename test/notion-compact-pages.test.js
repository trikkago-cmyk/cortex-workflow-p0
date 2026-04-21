import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompactExecutionMarkdown, buildCompactReviewMarkdown, buildProjectMemoryLandingMarkdown } from '../src/notion-compact-pages.js';

test('buildCompactReviewMarkdown renders lightweight review summary with compact checkpoints', () => {
  const markdown = buildCompactReviewMarkdown({
    project: {
      name: 'Cortex',
      notion_review_page_id: '3430483f-51e8-8114-8f44-ffa1dba418c2',
      notion_scan_page_id: '3430483f-51e8-81b0-bc1c-e97e1d399a91',
      notion_memory_page_id: '3430483f-51e8-812b-b907-ff67194fac84',
    },
    reviewPayload: {
      summary: {
        latest_brief: { title: '继续清理 Notion 页面' },
        next_steps: ['压缩历史块'],
        red_decisions: [{ question: '红灯 1' }],
        yellow_decisions: [{ question: '黄灯 1' }],
        green_notes: [{ question: '已切到多项目同步' }],
        notion_commands: [{ instruction: '请清理这些文档' }],
      },
    },
    executionMarkdown: '# 执行文档\n\n- 当前任务：清理 Notion 页面\n- 核心进展：已改成轻量同步',
    checkpoints: [
      {
        title: '已切换为多项目独立文档同步',
        summary: '后续不再把不同工程写进同一执行文档。',
        next_step: '继续清理旧历史',
        created_at: '2026-04-16T08:00:00.000Z',
      },
    ],
  });

  assert.match(markdown, /# Cortex 工作台/);
  assert.match(markdown, /当前任务：清理 Notion 页面/);
  assert.match(markdown, /决策状态：🔴 1 \/ 🟡 1/);
  assert.match(markdown, /关键 Checkpoints/);
  assert.match(markdown, /最近评论：请清理这些文档/);
});

test('buildCompactExecutionMarkdown keeps only compact sections and checkpoint summary', () => {
  const markdown = buildCompactExecutionMarkdown({
    project: { name: 'Cortex' },
    reviewPayload: {
      summary: {},
    },
    executionMarkdown: [
      '# PRJ-cortex 执行文档',
      '',
      '## 2026-04-16 当前任务',
      '',
      '- 当前任务：清理页面',
      '- 当前进展：准备压缩旧历史',
      '- 决策状态：绿灯',
      '',
      '## 2026-04-15 历史节点',
      '',
      '- 一',
      '- 二',
      '- 三',
      '- 四',
      '- 五',
      '- 六',
      '- 七',
      '- 八',
      '- 九',
    ].join('\n'),
    checkpoints: [
      {
        title: '执行文档已压缩',
        summary: '仅保留关键节点。',
        created_at: '2026-04-16T08:00:00.000Z',
      },
    ],
  });

  assert.match(markdown, /# Cortex 执行文档/);
  assert.match(markdown, /关键 Checkpoints/);
  assert.match(markdown, /执行文档已压缩/);
  assert.match(markdown, /其余 1 行已折叠/);
});

test('buildProjectMemoryLandingMarkdown points project memory pages back to global hub', () => {
  const markdown = buildProjectMemoryLandingMarkdown({
    project: { name: 'Dark Luxury Itinerary' },
    globalMemoryUrl: 'https://www.notion.so/3430483f51e8812bb907ff67194fac84',
  });

  assert.match(markdown, /Dark Luxury Itinerary Memory Scope/);
  assert.match(markdown, /全局 Memory Hub/);
});
