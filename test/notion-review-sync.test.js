import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  appendMarkdownEntryToNotion,
  buildAppendEntryMarkdown,
  createPage,
  extractNotionPageId,
  markdownToNotionBlocks,
  prependMarkdownEntryToNotion,
  resolveProjectSyncPreserveBlockTypes,
  stripTopLevelTitle,
  syncReviewMarkdownToNotion,
} from '../src/notion-review-sync.js';

test('converts review markdown to notion blocks', () => {
  const blocks = markdownToNotionBlocks(`# Title
## Section
- First item
1. First number
> Quoted
---
Paragraph`);

  assert.equal(blocks.length, 7);
  assert.equal(blocks[0].type, 'heading_1');
  assert.equal(blocks[1].type, 'heading_2');
  assert.equal(blocks[2].type, 'bulleted_list_item');
  assert.equal(blocks[3].type, 'numbered_list_item');
  assert.equal(blocks[4].type, 'quote');
  assert.equal(blocks[5].type, 'divider');
  assert.equal(blocks[6].type, 'paragraph');
});

test('stripTopLevelTitle removes only the first h1 title', () => {
  const stripped = stripTopLevelTitle(`# Title

## Section
- Item`);

  assert.equal(stripped, `## Section
- Item`);
});

test('extractNotionPageId normalizes raw ids and notion urls', () => {
  assert.equal(
    extractNotionPageId('34a359ec-3ad4-805f-ba9e-d8e669018c0d'),
    '34a359ec3ad4805fba9ed8e669018c0d',
  );
  assert.equal(
    extractNotionPageId('https://www.notion.so/Cortex-34a359ec3ad4805fba9ed8e669018c0d?source=copy_link'),
    '34a359ec3ad4805fba9ed8e669018c0d',
  );
});

test('resolveProjectSyncPreserveBlockTypes preserves nested structure only for root-like pages', () => {
  const rootResult = resolveProjectSyncPreserveBlockTypes({
    pageId: '34a359ec-3ad4-805f-ba9e-d8e669018c0d',
    project: {
      root_page_url: 'https://www.notion.so/Cortex-34a359ec3ad4805fba9ed8e669018c0d?source=copy_link',
      notion_parent_page_id: '34a359ec-3ad4-805f-ba9e-d8e669018c0d',
    },
  }).sort();
  const leafResult = resolveProjectSyncPreserveBlockTypes({
    pageId: '34b359ec-3ad4-81f9-a200-fc2456eff1d4',
    project: {
      root_page_url: 'https://www.notion.so/Cortex-34a359ec3ad4805fba9ed8e669018c0d?source=copy_link',
      notion_parent_page_id: '34a359ec-3ad4-805f-ba9e-d8e669018c0d',
    },
  });

  assert.deepEqual(rootResult, ['child_database', 'child_page']);
  assert.deepEqual(leafResult, []);
});

test('buildAppendEntryMarkdown wraps history heading and metadata', () => {
  const markdown = buildAppendEntryMarkdown({
    entryTitle: '工作台快照 · 2026-03-25T08:00:00.000Z',
    metadata: ['项目：PRJ-cortex', '下一步：继续推进'],
    markdown: `# PRJ-cortex 工作台入口

## 当前任务
- 任务：继续推进`,
  });

  assert.match(markdown, /^## 工作台快照/);
  assert.match(markdown, /- 项目：PRJ-cortex/);
  assert.doesNotMatch(markdown, /^# PRJ-cortex 工作台入口/m);
  assert.match(markdown, /## 当前任务/);
});

test('createPage retries once when notion connection resets', async (t) => {
  let attempts = 0;
  const server = http.createServer(async (req, res) => {
    attempts += 1;

    if (attempts === 1) {
      req.socket.destroy();
      return;
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    if (req.method === 'POST' && req.url === '/v1/pages') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'page-retried-1' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await createPage({
    apiKey: 'notion-secret',
    parentPageId: 'parent-123',
    title: 'Retry page',
    markdown: '# Retry',
    baseUrl,
  });

  assert.equal(result.id, 'page-retried-1');
  assert.equal(attempts, 2);
});

test('appendMarkdownEntryToNotion retries when notion returns 429', async (t) => {
  const requests = [];
  let patchAttempts = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    const parsedBody = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      body: parsedBody,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-rate-limit/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [] }));
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-rate-limit/children') {
      patchAttempts += 1;
      if (patchAttempts === 1) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': '0',
        });
        res.end(JSON.stringify({ object: 'error', status: 429, message: 'rate_limited' }));
        return;
      }

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

  const result = await appendMarkdownEntryToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-rate-limit',
    markdown: '## 新记录\n- 当前任务：继续推进',
    baseUrl,
  });

  assert.deepEqual(result, { appended: 2 });
  assert.equal(patchAttempts, 2);
  assert.equal(requests.filter((request) => request.method === 'PATCH').length, 2);
});

test('syncs review markdown to notion by deleting old blocks and appending new ones', async (t) => {
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
      headers: req.headers,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-123/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [{ id: 'block-old-1' }, { id: 'block-old-2' }] }));
      return;
    }

    if (req.method === 'DELETE' && (req.url === '/v1/blocks/block-old-1' || req.url === '/v1/blocks/block-old-2')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-123/children') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: req.body?.children || [] }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await syncReviewMarkdownToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-123',
    markdown: '# Cortex Review Panel\n- First item\nParagraph',
    baseUrl,
  });

  assert.deepEqual(result, { deleted: 2, appended: 3 });
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[1].method, 'DELETE');
  assert.equal(requests[2].method, 'DELETE');
  assert.equal(requests[3].method, 'PATCH');
  assert.equal(requests[3].headers.authorization, 'Bearer notion-secret');
  assert.equal(requests[3].headers['notion-version'], '2026-03-11');
  assert.equal(requests[3].body.children.length, 3);
});

test('lists more than 100 blocks before deleting and appending fresh content', async (t) => {
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
      headers: req.headers,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-many/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [{ id: 'block-001' }, { id: 'block-002' }],
          has_more: true,
          next_cursor: 'cursor-2',
        }),
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/v1/blocks/page-many/children?page_size=100&start_cursor=cursor-2') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [{ id: 'block-003' }],
          has_more: false,
          next_cursor: null,
        }),
      );
      return;
    }

    if (
      req.method === 'DELETE' &&
      ['/v1/blocks/block-001', '/v1/blocks/block-002', '/v1/blocks/block-003'].includes(req.url)
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-many/children') {
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

  const result = await syncReviewMarkdownToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-many',
    markdown: '# Fresh',
    baseUrl,
  });

  assert.deepEqual(result, { deleted: 3, appended: 1 });
  assert.equal(requests.filter((request) => request.method === 'GET').length, 2);
  assert.equal(requests.filter((request) => request.method === 'DELETE').length, 3);
});

test('skips archived notion blocks during sync before appending fresh content', async (t) => {
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
      headers: req.headers,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-archived/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            { id: 'block-live-1', archived: false, in_trash: false },
            { id: 'block-archived-1', archived: true, in_trash: false },
            { id: 'block-trash-1', archived: false, in_trash: true },
          ],
        }),
      );
      return;
    }

    if (req.method === 'DELETE' && req.url === '/v1/blocks/block-live-1') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-archived/children') {
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

  const result = await syncReviewMarkdownToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-archived',
    markdown: '# Refreshed',
    baseUrl,
  });

  assert.deepEqual(result, { deleted: 1, appended: 1 });
  assert.equal(requests.filter((request) => request.method === 'DELETE').length, 1);
  assert.equal(requests.find((request) => request.method === 'DELETE')?.url, '/v1/blocks/block-live-1');
  assert.equal(requests.find((request) => request.method === 'PATCH')?.url, '/v1/blocks/page-archived/children');
});

test('treats archived block delete races as handled and still appends fresh content', async (t) => {
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
      headers: req.headers,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-race/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [{ id: 'block-race-1', in_trash: false }] }));
      return;
    }

    if (req.method === 'DELETE' && req.url === '/v1/blocks/block-race-1') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          object: 'error',
          status: 400,
          code: 'validation_error',
          message: "Can't edit block that is archived. You must unarchive the block before editing.",
        }),
      );
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-race/children') {
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

  const result = await syncReviewMarkdownToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-race',
    markdown: '# Refreshed',
    baseUrl,
  });

  assert.deepEqual(result, { deleted: 1, appended: 1 });
  assert.equal(requests.filter((request) => request.method === 'DELETE').length, 1);
  assert.equal(requests.filter((request) => request.method === 'PATCH').length, 1);
});

test('preserves child pages and child databases while replacing top-level markdown blocks', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    const parsedBody = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      body: parsedBody,
      headers: req.headers,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-keep-children/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            { id: 'block-text-1', type: 'heading_2', archived: false, in_trash: false },
            { id: 'block-page-1', type: 'child_page', archived: false, in_trash: false },
            { id: 'block-db-1', type: 'child_database', archived: false, in_trash: false },
          ],
        }),
      );
      return;
    }

    if (req.method === 'DELETE' && req.url === '/v1/blocks/block-text-1') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-keep-children/children') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: (parsedBody?.children || []).map((child, index) => ({
            id: `inserted-${index + 1}`,
            type: child.type,
          })),
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

  const result = await syncReviewMarkdownToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-keep-children',
    markdown: '# 新总览\n- 当前任务：继续推进',
    preserveBlockTypes: ['child_page', 'child_database'],
    baseUrl,
  });

  assert.deepEqual(result, { deleted: 1, appended: 2 });
  assert.equal(requests.filter((request) => request.method === 'DELETE').length, 1);
  const patchRequest = requests.find((request) => request.method === 'PATCH');
  assert.equal(patchRequest?.body?.position?.type, 'start');
  assert.equal(patchRequest?.body?.children?.length, 2);
});

test('appendMarkdownEntryToNotion preserves old blocks and appends a divider plus new blocks', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    const parsedBody = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      body: parsedBody,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-append/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [{ id: 'existing-block-1', archived: false, in_trash: false }] }));
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-append/children') {
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

  const result = await appendMarkdownEntryToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-append',
    markdown: '## 新记录\n- 当前任务：继续推进',
    baseUrl,
  });

  assert.deepEqual(result, { appended: 2 });
  const patchCalls = requests.filter((request) => request.method === 'PATCH');
  assert.equal(patchCalls.length, 2);
  assert.equal(patchCalls[0].body.children[0].type, 'divider');
  assert.equal(patchCalls[1].body.children.length, 2);
});

test('prependMarkdownEntryToNotion keeps navigation at top and inserts latest entry below it', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    const parsedBody = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      body: parsedBody,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-prepend/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [{ id: 'existing-block-1', archived: false, in_trash: false }] }));
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-prepend/children') {
      const children = parsedBody?.children || [];
      if (parsedBody?.position?.type === 'start') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            results: [
              { id: 'nav-heading', type: children[0]?.type },
              { id: 'nav-task', type: children[1]?.type },
              { id: 'nav-progress', type: children[2]?.type },
              { id: 'nav-time', type: children[3]?.type },
              { id: 'nav-divider', type: children[4]?.type },
            ],
          }),
        );
        return;
      }

      if (parsedBody?.position?.type === 'after_block' && parsedBody?.position?.after_block?.id === 'nav-divider') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            results: children.map((child, index) => ({
              id: `entry-${index + 1}`,
              type: child.type,
            })),
          }),
        );
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await prependMarkdownEntryToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-prepend',
    markdown: '## 新记录\n- 当前任务：继续推进',
    navigation: true,
    navigationSummary: {
      currentTask: '继续推进',
      coreProgress: '已完成 smoke',
      syncedAt: '2026-03-26 20:10:00',
    },
    baseUrl,
  });

  assert.deepEqual(result, { appended: 2, navigationCreated: true });
  const patchCalls = requests.filter((request) => request.method === 'PATCH');
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0].body.position.type, 'start');
  assert.equal(patchCalls[0].body.children[0].type, 'heading_2');
  assert.equal(patchCalls[0].body.children[1].type, 'paragraph');
  assert.equal(patchCalls[0].body.children[2].type, 'paragraph');
  assert.equal(patchCalls[0].body.children[3].type, 'paragraph');
  assert.equal(patchCalls[0].body.children[4].type, 'divider');
  assert.equal(patchCalls[0].body.children[5].type, 'heading_2');
  assert.equal(patchCalls[0].body.children[6].type, 'bulleted_list_item');
  assert.equal(patchCalls[0].body.children[7].type, 'divider');
});

test('prependMarkdownEntryToNotion reuses existing navigation scaffold', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    const parsedBody = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      body: parsedBody,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-nav/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            {
              id: 'nav-heading',
              type: 'heading_2',
              archived: false,
              in_trash: false,
              heading_2: { rich_text: [{ plain_text: '当前总览' }] },
            },
            {
              id: 'nav-task',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '当前任务：旧任务' }] },
            },
            {
              id: 'nav-progress',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '核心进展：旧进展' }] },
            },
            {
              id: 'nav-time',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '最近同步：旧时间' }] },
            },
            {
              id: 'nav-divider',
              type: 'divider',
              archived: false,
              in_trash: false,
              divider: {},
            },
            {
              id: 'old-entry',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '旧记录' }] },
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-nav/children') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: (parsedBody?.children || []).map((child, index) => ({
            id: `entry-nav-${index + 1}`,
            type: child.type,
          })),
        }),
      );
      return;
    }

    if (
      req.method === 'DELETE' &&
      ['/v1/blocks/nav-heading', '/v1/blocks/nav-task', '/v1/blocks/nav-progress', '/v1/blocks/nav-time', '/v1/blocks/nav-divider'].includes(req.url)
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await prependMarkdownEntryToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-nav',
    markdown: '## 新记录\n- 当前任务：继续推进',
    navigation: true,
    navigationSummary: {
      currentTask: '继续推进',
      coreProgress: '已补同步',
      syncedAt: '2026-03-26 20:11:00',
    },
    baseUrl,
  });

  assert.deepEqual(result, { appended: 2, navigationCreated: false });
  const deleteCalls = requests.filter((request) => request.method === 'DELETE');
  const patchCalls = requests.filter((request) => request.method === 'PATCH');
  assert.equal(deleteCalls.length, 5);
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0].body.position.type, 'start');
  assert.equal(patchCalls[0].body.children[0].type, 'heading_2');
  assert.equal(patchCalls[0].body.children[4].type, 'divider');
  assert.equal(patchCalls[0].body.children[5].type, 'heading_2');
  assert.equal(patchCalls[0].body.children[7].type, 'divider');
});

test('prependMarkdownEntryToNotion only inspects the first page of existing blocks', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    const parsedBody = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      body: parsedBody,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-large-review/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            {
              id: 'nav-heading',
              type: 'heading_2',
              archived: false,
              in_trash: false,
              heading_2: { rich_text: [{ plain_text: '当前总览' }] },
            },
            {
              id: 'nav-task',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '当前任务：旧任务' }] },
            },
            {
              id: 'nav-progress',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '核心进展：旧进展' }] },
            },
            {
              id: 'nav-time',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '最近同步：旧时间' }] },
            },
            {
              id: 'nav-divider',
              type: 'divider',
              archived: false,
              in_trash: false,
              divider: {},
            },
            {
              id: 'old-entry',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '旧记录' }] },
            },
          ],
          has_more: true,
          next_cursor: 'cursor-page-2',
        }),
      );
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-large-review/children') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: (parsedBody?.children || []).map((child, index) => ({
            id: `inserted-${index + 1}`,
            type: child.type,
          })),
        }),
      );
      return;
    }

    if (
      req.method === 'DELETE' &&
      ['/v1/blocks/nav-heading', '/v1/blocks/nav-task', '/v1/blocks/nav-progress', '/v1/blocks/nav-time', '/v1/blocks/nav-divider'].includes(req.url)
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await prependMarkdownEntryToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-large-review',
    markdown: '## 工作台快照 · 2026-03-31 16:55:00\n- 当前任务：验证大页同步',
    navigation: true,
    navigationSummary: {
      currentTask: '验证大页同步',
      coreProgress: '前插同步不再全页遍历',
      syncedAt: '2026-03-31 16:55:00',
    },
    baseUrl,
  });

  assert.deepEqual(result, { appended: 2, navigationCreated: false });
  assert.equal(
    requests.some((request) => request.method === 'GET' && request.url.includes('start_cursor=cursor-page-2')),
    false,
  );
  assert.equal(requests.filter((request) => request.method === 'PATCH').length, 1);
});

test('prependMarkdownEntryToNotion can clear existing navigation without recreating it', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    const parsedBody = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      body: parsedBody,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-clear-nav/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            {
              id: 'nav-heading',
              type: 'heading_2',
              archived: false,
              in_trash: false,
              heading_2: { rich_text: [{ plain_text: '当前总览' }] },
            },
            {
              id: 'nav-task',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '当前任务：旧任务' }] },
            },
            {
              id: 'nav-progress',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '核心进展：旧进展' }] },
            },
            {
              id: 'nav-time',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '最近同步：旧时间' }] },
            },
            {
              id: 'nav-divider',
              type: 'divider',
              archived: false,
              in_trash: false,
              divider: {},
            },
            {
              id: 'old-entry',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '旧记录' }] },
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-clear-nav/children') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: (parsedBody?.children || []).map((child, index) => ({
            id: `entry-clear-nav-${index + 1}`,
            type: child.type,
          })),
        }),
      );
      return;
    }

    if (
      req.method === 'DELETE' &&
      ['/v1/blocks/nav-heading', '/v1/blocks/nav-task', '/v1/blocks/nav-progress', '/v1/blocks/nav-time', '/v1/blocks/nav-divider'].includes(req.url)
    ) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const result = await prependMarkdownEntryToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-clear-nav',
    markdown: '## 执行同步记录 · 2026-03-26 20:20:00\n- 当前任务：直接看最新记录',
    navigation: false,
    clearExistingNavigation: true,
    baseUrl,
  });

  assert.deepEqual(result, { appended: 2, navigationCreated: false });
  const deleteCalls = requests.filter((request) => request.method === 'DELETE');
  const patchCalls = requests.filter((request) => request.method === 'PATCH');
  assert.equal(deleteCalls.length, 5);
  assert.equal(patchCalls.length, 1);
  assert.equal(patchCalls[0].body.children[0].type, 'heading_2');
  assert.equal(patchCalls[0].body.children[1].type, 'bulleted_list_item');
  assert.equal(patchCalls[0].body.children[2].type, 'divider');
});

test('prependMarkdownEntryToNotion tolerates archived scaffold delete races and still inserts latest entry', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString('utf8');
    const parsedBody = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      body: parsedBody,
    });

    if (req.method === 'GET' && req.url === '/v1/blocks/page-nav-race/children?page_size=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            {
              id: 'nav-heading',
              type: 'heading_2',
              archived: false,
              in_trash: false,
              heading_2: { rich_text: [{ plain_text: '当前总览' }] },
            },
            {
              id: 'nav-task',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '当前任务：旧任务' }] },
            },
            {
              id: 'nav-progress',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '核心进展：旧进展' }] },
            },
            {
              id: 'nav-time',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '最近同步：旧时间' }] },
            },
            {
              id: 'nav-divider',
              type: 'divider',
              archived: false,
              in_trash: false,
              divider: {},
            },
            {
              id: 'older-entry',
              type: 'paragraph',
              archived: false,
              in_trash: false,
              paragraph: { rich_text: [{ plain_text: '旧记录' }] },
            },
          ],
        }),
      );
      return;
    }

    if (
      req.method === 'DELETE' &&
      ['nav-heading', 'nav-task', 'nav-progress', 'nav-time', 'nav-divider'].some((id) => req.url === `/v1/blocks/${id}`)
    ) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          object: 'error',
          status: 400,
          code: 'validation_error',
          message: "Can't edit block that is archived. You must unarchive the block before editing.",
        }),
      );
      return;
    }

    if (req.method === 'PATCH' && req.url === '/v1/blocks/page-nav-race/children') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          results: (parsedBody?.children || []).map((child, index) => ({
            id: `inserted-${index + 1}`,
            type: child.type,
          })),
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

  const result = await prependMarkdownEntryToNotion({
    apiKey: 'notion-secret',
    pageId: 'page-nav-race',
    markdown: '## 新记录\n- 当前任务：继续推进',
    navigation: true,
    navigationSummary: {
      currentTask: '继续推进',
      coreProgress: '已修掉 archived race',
      syncedAt: '2026-03-27 16:10:00',
    },
    baseUrl,
  });

  assert.deepEqual(result, { appended: 2, navigationCreated: false });
  assert.equal(requests.filter((request) => request.method === 'DELETE').length, 5);
  assert.equal(requests.filter((request) => request.method === 'PATCH').length, 1);
});

test('creates a dedicated review page under a parent page with initial markdown blocks', async (t) => {
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
      headers: req.headers,
    });

    if (req.method === 'POST' && req.url === '/v1/pages') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'page-new-123',
          url: 'https://www.notion.so/page-new-123',
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

  const page = await createPage({
    apiKey: 'notion-secret',
    parentPageId: 'parent-123',
    title: 'PRJ-cortex Review Panel',
    markdown: '# Cortex Review Panel\n- First item',
    baseUrl,
  });

  assert.equal(page.id, 'page-new-123');
  assert.equal(page.url, 'https://www.notion.so/page-new-123');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/v1/pages');
  assert.equal(requests[0].headers.authorization, 'Bearer notion-secret');
  assert.equal(requests[0].body.parent.page_id, 'parent-123');
  assert.equal(requests[0].body.properties.title.title[0].text.content, 'PRJ-cortex Review Panel');
  assert.equal(requests[0].body.children.length, 2);
});
