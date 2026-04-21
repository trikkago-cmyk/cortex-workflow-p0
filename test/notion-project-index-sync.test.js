import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  buildProjectCheckpointKey,
  buildProjectIndexHistoryMarkdown,
  buildProjectIndexSummary,
  dedupeProjectIndexRows,
  extractProjectBoardData,
  mergeBoardDataWithExecutionDoc,
  notionPageUrlFromId,
  syncProjectIndexRow,
} from '../src/notion-project-index-sync.js';

test('buildProjectIndexSummary composes key project signals', () => {
  const summary = buildProjectIndexSummary({
    project: {
      status: 'active',
    },
    summary: {
      latest_brief: {
        title: 'Cortex P0 执行内核收口',
      },
      red_decisions: [{ id: 'DR-1' }],
      yellow_decisions: [{ id: 'DR-2' }, { id: 'DR-3' }],
      recent_done_commands: [
        {
          result_summary: 'Notion 评论链路已验证。',
        },
      ],
      next_steps: ['继续推进项目索引同步。'],
    },
  });

  assert.equal(
    summary,
    '状态：active；当前任务：Cortex P0 执行内核收口；红灯：1；黄灯：2；最近完成：Notion 评论链路已验证。；下一步：继续推进项目索引同步。',
  );
});

test('notionPageUrlFromId normalizes dashed notion ids', () => {
  assert.equal(
    notionPageUrlFromId('32d0483f-51e8-8159-9471-f6939fdb68f9'),
    'https://www.notion.so/32d0483f51e881599471f6939fdb68f9',
  );
});

test('extractProjectBoardData returns concise board fields', () => {
  const board = extractProjectBoardData({
    summary: {
      latest_brief: {
        title: '收口工作台结构',
      },
      recent_done_commands: [
        {
          result_summary: '已把项目入口同步到项目索引表。',
        },
      ],
      red_decisions: [],
      yellow_decisions: [
        {
          question: '是否拆独立里程碑文档？',
        },
      ],
      next_steps: ['继续压缩执行文档。'],
    },
  });

  assert.deepEqual(board, {
    currentTask: '收口工作台结构',
    currentProgress: '已把项目入口同步到项目索引表。',
    riskStatus: '黄灯',
    riskPoint: '是否拆独立里程碑文档？',
    greenAction: '已把项目入口同步到项目索引表。',
    nextStep: '继续压缩执行文档。',
    redCount: 0,
    yellowCount: 1,
  });
});

test('mergeBoardDataWithExecutionDoc prefers concise execution doc sections', () => {
  const merged = mergeBoardDataWithExecutionDoc(
    {
      currentTask: '旧任务',
      currentProgress: '旧进展',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '旧已推进',
      nextStep: '旧下一步',
    },
    `# PRJ-cortex 执行文档

## 当前任务

- 任务：新任务
- 当前状态：当前推进方向正常

## 🟢 核心进展

- 已完成 A
- 已完成 B

## 风险举手

### 🔴 红灯

- 暂无。

### 🟡 黄灯

- 接口尚未整理。

### 🟢 已推进

- 完成清理

## 重点 To Do

- 继续压缩结构
- 同步到 Notion
`,
  );

  assert.deepEqual(merged, {
    currentTask: '新任务',
    currentProgress: '已完成 A；已完成 B',
    riskStatus: '黄灯',
    riskPoint: '接口尚未整理。',
    greenAction: '完成清理',
    nextStep: '继续压缩结构',
  });
});

test('mergeBoardDataWithExecutionDoc supports compact bullet summary format', () => {
  const merged = mergeBoardDataWithExecutionDoc(
    {
      currentTask: '旧任务',
      currentProgress: '旧进展',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '旧已推进',
      nextStep: '旧下一步',
    },
    `# PRJ-cortex 执行文档

- 当前任务：新任务
- 核心进展：已补 worker pool；已补 notion sync all
- 🔴 红灯：无
- 🟡 黄灯：等真实 handler
- 🟢 已推进：已补 smoke 脚本
- 下一步：接真实 handler
`,
  );

  assert.deepEqual(merged, {
    currentTask: '新任务',
    currentProgress: '已补 worker pool；已补 notion sync all',
    riskStatus: '黄灯',
    riskPoint: '等真实 handler',
    greenAction: '已补 smoke 脚本',
    nextStep: '接真实 handler',
  });
});

test('buildProjectIndexHistoryMarkdown builds append-only history entry', () => {
  const markdown = buildProjectIndexHistoryMarkdown({
    projectId: 'PRJ-cortex',
    syncedAt: '2026-03-25 16:30:00',
    projectUpdatedAt: '2026-03-25 16:00:00',
    latestSummary: '状态：active；当前任务：收口工作台',
    boardData: {
      currentTask: '收口工作台',
      currentProgress: '已补 executor worker',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '完成自动执行 smoke',
      nextStep: '继续接真实 handler',
    },
  });

  assert.match(markdown, /# 状态快照 · 2026-03-25 16:30:00/);
  assert.match(markdown, /- 项目更新时间：2026-03-25 16:00:00/);
  assert.match(markdown, /- 当前任务：收口工作台/);
  assert.match(markdown, /- 下一步：继续接真实 handler/);
  assert.match(markdown, /- 核心进展：已补 executor worker/);
  assert.match(markdown, /- 🔴 红灯：无/);
  assert.match(markdown, /- 🟡 黄灯：无/);
  assert.match(markdown, /- 🟢 已推进：完成自动执行 smoke/);
});

test('buildProjectCheckpointKey uses board state instead of sync timestamp', () => {
  const left = buildProjectCheckpointKey({
    projectId: 'PRJ-cortex',
    status: 'active',
    boardData: {
      currentTask: '收口工作台',
      currentProgress: '已补 executor worker',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '完成自动执行 smoke',
      nextStep: '继续接真实 handler',
    },
  });
  const right = buildProjectCheckpointKey({
    projectId: 'PRJ-cortex',
    status: 'active',
    boardData: {
      currentTask: '收口工作台',
      currentProgress: '已补 executor worker',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '完成自动执行 smoke',
      nextStep: '继续接真实 handler',
    },
  });

  assert.equal(left, right);
});

test('syncProjectIndexRow creates a new checkpoint row and writes snapshot body', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    requests.push({
      method: req.method,
      url: req.url,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (req.method === 'GET' && req.url === '/v1/databases/db-001') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'db-001',
          properties: {
            Name: { id: 'title', type: 'title', title: {} },
            状态: { id: 'status', type: 'select' },
          },
        }),
      );
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/databases/db-001') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'db-001' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/databases/db-001/query') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [], has_more: false, next_cursor: null }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/pages') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'page-new-001', url: 'https://www.notion.so/page-new-001' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/blocks/page-new-001/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [] }));
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-new-001/children') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [] }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await syncProjectIndexRow({
    apiKey: 'notion-secret',
    databaseId: 'db-001',
    projectId: 'PRJ-cortex',
    status: 'active',
    rootPageUrl: 'https://www.notion.so/root',
    reviewPageUrl: 'https://www.notion.so/review',
    executionDocUrl: 'https://www.notion.so/execution',
    memoryPageUrl: 'https://www.notion.so/memory',
    latestSummary: '状态：active；当前任务：收口工作台',
    updatedAt: '2026-03-25T08:00:00.000Z',
    boardData: {
      currentTask: '收口工作台',
      currentProgress: '已补 executor worker',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '完成自动执行 smoke',
      nextStep: '继续接真实 handler',
    },
    clock: () => new Date('2026-03-25T08:30:00.000Z'),
    baseUrl,
  });

  assert.equal(result.created, true);
  assert.equal(result.skipped, false);
  assert.equal(result.pageId, 'page-new-001');
  const patchCalls = requests.filter((request) => request.method === 'PATCH');
  const postCalls = requests.filter((request) => request.method === 'POST' && request.url !== '/v1/databases/db-001/query');
  assert.equal(patchCalls.length, 2);
  assert.equal(postCalls.length, 1);
  assert.equal(postCalls[0].url, '/v1/pages');
  assert.match(postCalls[0].body.properties.Name.title[0].text.content, /^2026-03-25 16:30:00 · PRJ-cortex · 收口工作台/);
  assert.equal(postCalls[0].body.properties['更新时间'].rich_text[0].text.content, '2026-03-25 16:30:00（本地同步）');
  assert.equal(postCalls[0].body.properties['项目更新时间'].rich_text[0].text.content, '2026-03-25 16:00:00');
  assert.match(postCalls[0].body.properties['同步键'].rich_text[0].text.content, /^checkpoint:/);
  assert.equal(patchCalls[1].url, '/v1/blocks/page-new-001/children');
  assert.equal(patchCalls[1].body.children[0].type, 'heading_1');
});

test('syncProjectIndexRow skips duplicate sync when latest checkpoint is unchanged', async (t) => {
  const requests = [];
  const checkpointKey = buildProjectCheckpointKey({
    projectId: 'PRJ-cortex',
    status: 'active',
    boardData: {
      currentTask: '收口工作台',
      currentProgress: '已补 executor worker',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '完成自动执行 smoke',
      nextStep: '继续接真实 handler',
    },
  });

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    requests.push({
      method: req.method,
      url: req.url,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (req.method === 'GET' && req.url === '/v1/databases/db-001') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'db-001',
          properties: {
            Name: { id: 'title', type: 'title', title: {} },
            状态: { id: 'status', type: 'select' },
            '根页面': { id: 'root-page', type: 'url' },
            '总览页': { id: 'review-page', type: 'url' },
            '执行文档': { id: 'execution-page', type: 'url' },
            '协作记忆': { id: 'memory-page', type: 'url' },
            '项目 ID': { id: 'project-id', type: 'rich_text' },
            同步键: { id: 'sync-key', type: 'rich_text' },
            '最新摘要': { id: 'latest-summary', type: 'rich_text' },
            '更新时间': { id: 'updated-at', type: 'rich_text' },
            '项目更新时间': { id: 'project-updated-at', type: 'rich_text' },
            同步时间: { id: 'sync-time', type: 'date' },
            当前任务: { id: 'current-task', type: 'rich_text' },
            当前进展: { id: 'current-progress', type: 'rich_text' },
            风险状态: { id: 'risk-status', type: 'select' },
            风险点: { id: 'risk-point', type: 'rich_text' },
            已推进: { id: 'green-action', type: 'rich_text' },
            下一步: { id: 'next-step', type: 'rich_text' },
          },
        }),
      );
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/databases/db-001') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'db-001' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/databases/db-001/query') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            {
              id: 'page-existing-001',
              url: 'https://www.notion.so/page-existing-001',
              properties: {
                Name: {
                  type: 'title',
                  title: [{ plain_text: '2026-03-25 16:30:00 · PRJ-cortex · 收口工作台' }],
                },
                状态: {
                  type: 'select',
                  select: { name: 'active' },
                },
                '根页面': {
                  type: 'url',
                  url: 'https://www.notion.so/root',
                },
                '总览页': {
                  type: 'url',
                  url: 'https://www.notion.so/review',
                },
                '执行文档': {
                  type: 'url',
                  url: 'https://www.notion.so/execution',
                },
                '协作记忆': {
                  type: 'url',
                  url: 'https://www.notion.so/memory',
                },
                '项目 ID': {
                  type: 'rich_text',
                  rich_text: [{ plain_text: 'PRJ-cortex' }],
                },
                同步键: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: `checkpoint:${checkpointKey}` }],
                },
                '最新摘要': {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '状态：active；当前任务：收口工作台' }],
                },
                '项目更新时间': {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '2026-03-25 16:00:00' }],
                },
                同步时间: {
                  type: 'date',
                  date: { start: '2026-03-25T08:30:00.000Z' },
                },
                当前任务: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '收口工作台' }],
                },
                当前进展: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '已补 executor worker' }],
                },
                风险状态: {
                  type: 'select',
                  select: { name: '正常' },
                },
                风险点: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '无' }],
                },
                已推进: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '完成自动执行 smoke' }],
                },
                下一步: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '继续接真实 handler' }],
                },
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await syncProjectIndexRow({
    apiKey: 'notion-secret',
    databaseId: 'db-001',
    projectId: 'PRJ-cortex',
    status: 'active',
    rootPageUrl: 'https://www.notion.so/root',
    reviewPageUrl: 'https://www.notion.so/review',
    executionDocUrl: 'https://www.notion.so/execution',
    memoryPageUrl: 'https://www.notion.so/memory',
    latestSummary: '状态：active；当前任务：收口工作台',
    updatedAt: '2026-03-25T08:00:00.000Z',
    boardData: {
      currentTask: '收口工作台',
      currentProgress: '已补 executor worker',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '完成自动执行 smoke',
      nextStep: '继续接真实 handler',
    },
    clock: () => new Date('2026-03-25T08:35:00.000Z'),
    baseUrl,
  });

  assert.equal(result.created, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'same_checkpoint');
  assert.equal(result.pageId, 'page-existing-001');
  assert.equal(requests.filter((request) => request.url === '/v1/pages').length, 0);
});

test('syncProjectIndexRow refreshes in-place when checkpoint is unchanged but summary metadata drifts', async (t) => {
  const requests = [];
  const checkpointKey = buildProjectCheckpointKey({
    projectId: 'PRJ-cortex',
    status: 'active',
    boardData: {
      currentTask: '收口工作台',
      currentProgress: '已补 executor worker',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '完成自动执行 smoke',
      nextStep: '继续接真实 handler',
    },
  });

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    requests.push({
      method: req.method,
      url: req.url,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (req.method === 'GET' && req.url === '/v1/databases/db-001') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'db-001',
          properties: {
            Name: { id: 'title', type: 'title', title: {} },
            状态: { id: 'status', type: 'select' },
            '根页面': { id: 'root-page', type: 'url' },
            '总览页': { id: 'review-page', type: 'url' },
            '执行文档': { id: 'execution-page', type: 'url' },
            '协作记忆': { id: 'memory-page', type: 'url' },
            '项目 ID': { id: 'project-id', type: 'rich_text' },
            同步键: { id: 'sync-key', type: 'rich_text' },
            '最新摘要': { id: 'latest-summary', type: 'rich_text' },
            '更新时间': { id: 'updated-at', type: 'rich_text' },
            '项目更新时间': { id: 'project-updated-at', type: 'rich_text' },
            同步时间: { id: 'sync-time', type: 'date' },
            当前任务: { id: 'current-task', type: 'rich_text' },
            当前进展: { id: 'current-progress', type: 'rich_text' },
            风险状态: { id: 'risk-status', type: 'select' },
            风险点: { id: 'risk-point', type: 'rich_text' },
            已推进: { id: 'green-action', type: 'rich_text' },
            下一步: { id: 'next-step', type: 'rich_text' },
          },
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/databases/db-001/query') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            {
              id: 'page-existing-002',
              url: 'https://www.notion.so/page-existing-002',
              properties: {
                Name: {
                  type: 'title',
                  title: [{ plain_text: '2026-03-25 16:30:00 · PRJ-cortex · 收口工作台' }],
                },
                状态: {
                  type: 'select',
                  select: { name: 'active' },
                },
                '根页面': {
                  type: 'url',
                  url: 'https://www.notion.so/root',
                },
                '总览页': {
                  type: 'url',
                  url: 'https://www.notion.so/review',
                },
                '执行文档': {
                  type: 'url',
                  url: 'https://www.notion.so/execution',
                },
                '协作记忆': {
                  type: 'url',
                  url: 'https://www.notion.so/memory',
                },
                '项目 ID': {
                  type: 'rich_text',
                  rich_text: [{ plain_text: 'PRJ-cortex' }],
                },
                同步键: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: `checkpoint:${checkpointKey}` }],
                },
                '最新摘要': {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '状态：active；当前任务：旧摘要' }],
                },
                '项目更新时间': {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '2026-03-25 16:00:00' }],
                },
                同步时间: {
                  type: 'date',
                  date: { start: '2026-03-25T08:30:00.000Z' },
                },
                当前任务: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '收口工作台' }],
                },
                当前进展: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '已补 executor worker' }],
                },
                风险状态: {
                  type: 'select',
                  select: { name: '正常' },
                },
                风险点: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '无' }],
                },
                已推进: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '完成自动执行 smoke' }],
                },
                下一步: {
                  type: 'rich_text',
                  rich_text: [{ plain_text: '继续接真实 handler' }],
                },
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/pages/page-existing-002') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'page-existing-002' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/blocks/page-existing-002/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [] }));
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-existing-002/children') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [] }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await syncProjectIndexRow({
    apiKey: 'notion-secret',
    databaseId: 'db-001',
    projectId: 'PRJ-cortex',
    status: 'active',
    rootPageUrl: 'https://www.notion.so/root',
    reviewPageUrl: 'https://www.notion.so/review',
    executionDocUrl: 'https://www.notion.so/execution',
    memoryPageUrl: 'https://www.notion.so/memory',
    latestSummary: '状态：active；当前任务：收口工作台；下一步：继续推进项目索引同步。',
    updatedAt: '2026-03-25T08:10:00.000Z',
    boardData: {
      currentTask: '收口工作台',
      currentProgress: '已补 executor worker',
      riskStatus: '正常',
      riskPoint: '无',
      greenAction: '完成自动执行 smoke',
      nextStep: '继续接真实 handler',
    },
    clock: () => new Date('2026-03-25T08:40:00.000Z'),
    baseUrl,
  });

  assert.equal(result.created, false);
  assert.equal(result.skipped, false);
  assert.equal(result.updated, true);
  assert.equal(result.reason, 'same_checkpoint_refreshed');
  assert.equal(result.pageId, 'page-existing-002');
  assert.equal(requests.filter((request) => request.url === '/v1/pages').length, 0);
  assert.equal(requests.filter((request) => request.method === 'PATCH' && request.url === '/v1/pages/page-existing-002').length, 1);
  assert.equal(
    requests.find((request) => request.method === 'PATCH' && request.url === '/v1/pages/page-existing-002').body.properties['最新摘要'].rich_text[0].text.content,
    '状态：active；当前任务：收口工作台；下一步：继续推进项目索引同步。',
  );
});

test('dedupeProjectIndexRows archives consecutive duplicate checkpoints and keeps checkpoint transitions', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    requests.push({
      method: req.method,
      url: req.url,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (req.method === 'POST' && req.url === '/v1/databases/db-001/query') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            {
              id: 'page-latest-001',
              created_time: '2026-03-27T04:18:42.000Z',
              properties: {
                '项目 ID': { type: 'rich_text', rich_text: [{ plain_text: 'PRJ-cortex' }] },
                状态: { type: 'select', select: { name: 'active' } },
                当前任务: { type: 'rich_text', rich_text: [{ plain_text: '真实 multi-agent handler 接入' }] },
                当前进展: { type: 'rich_text', rich_text: [{ plain_text: '已接入真实 handler' }] },
                风险状态: { type: 'select', select: { name: '正常' } },
                风险点: { type: 'rich_text', rich_text: [{ plain_text: '无' }] },
                已推进: { type: 'rich_text', rich_text: [{ plain_text: '完成 live smoke' }] },
                下一步: { type: 'rich_text', rich_text: [{ plain_text: '继续收口结果' }] },
              },
            },
            {
              id: 'page-latest-002',
              created_time: '2026-03-27T04:11:46.000Z',
              properties: {
                '项目 ID': { type: 'rich_text', rich_text: [{ plain_text: 'PRJ-cortex' }] },
                状态: { type: 'select', select: { name: 'active' } },
                当前任务: { type: 'rich_text', rich_text: [{ plain_text: '真实 multi-agent handler 接入' }] },
                当前进展: { type: 'rich_text', rich_text: [{ plain_text: '已接入真实 handler' }] },
                风险状态: { type: 'select', select: { name: '正常' } },
                风险点: { type: 'rich_text', rich_text: [{ plain_text: '无' }] },
                已推进: { type: 'rich_text', rich_text: [{ plain_text: '完成 live smoke' }] },
                下一步: { type: 'rich_text', rich_text: [{ plain_text: '继续收口结果' }] },
              },
            },
            {
              id: 'page-old-unique',
              created_time: '2026-03-26T11:34:59.000Z',
              properties: {
                '项目 ID': { type: 'rich_text', rich_text: [{ plain_text: 'PRJ-cortex' }] },
                状态: { type: 'select', select: { name: 'active' } },
                当前任务: { type: 'rich_text', rich_text: [{ plain_text: '评论路由打通' }] },
                当前进展: { type: 'rich_text', rich_text: [{ plain_text: '已接 owner_agent 路由' }] },
                风险状态: { type: 'select', select: { name: '正常' } },
                风险点: { type: 'rich_text', rich_text: [{ plain_text: '无' }] },
                已推进: { type: 'rich_text', rich_text: [{ plain_text: '补了评论路由' }] },
                下一步: { type: 'rich_text', rich_text: [{ plain_text: '接入真实 handler' }] },
              },
            },
            {
              id: 'page-other-project',
              created_time: '2026-03-27T04:18:42.000Z',
              properties: {
                '项目 ID': { type: 'rich_text', rich_text: [{ plain_text: 'PRJ-other' }] },
                状态: { type: 'select', select: { name: 'active' } },
                当前任务: { type: 'rich_text', rich_text: [{ plain_text: '其他项目' }] },
                当前进展: { type: 'rich_text', rich_text: [{ plain_text: '其他进展' }] },
                风险状态: { type: 'select', select: { name: '正常' } },
                风险点: { type: 'rich_text', rich_text: [{ plain_text: '无' }] },
                已推进: { type: 'rich_text', rich_text: [{ plain_text: '无' }] },
                下一步: { type: 'rich_text', rich_text: [{ plain_text: '无' }] },
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/pages/page-latest-002') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'page-latest-002', archived: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await dedupeProjectIndexRows({
    apiKey: 'notion-secret',
    databaseId: 'db-001',
    projectId: 'PRJ-cortex',
    baseUrl,
  });

  assert.equal(result.scanned, 3);
  assert.equal(result.archivedCount, 1);
  assert.deepEqual(result.archivedPageIds, ['page-latest-002']);
});
