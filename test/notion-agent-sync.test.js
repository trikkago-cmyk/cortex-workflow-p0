import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotionSourceUrl, plainTextFromRichText, scanCommentsUnderPage } from '../src/notion-agent-sync.js';

test('parses notion source urls and rich text', () => {
  assert.equal(
    plainTextFromRichText([
      { plain_text: 'Hello' },
      { text: { content: ' world' } },
    ]),
    'Hello world',
  );

  assert.deepEqual(
    parseNotionSourceUrl('notion://page/page-001/discussion/discussion-001/comment/comment-001'),
    {
      pageId: 'page-001',
      discussionId: 'discussion-001',
      commentId: 'comment-001',
    },
  );

  assert.equal(parseNotionSourceUrl('https://www.notion.so/page'), null);
});

test('scans notion comments under a page, skips self comments, and captures block context', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    calls.push(String(url));

    if (String(url).includes('/v1/blocks/page-001/children')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [{ id: 'block-001', has_children: false }],
            has_more: false,
            next_cursor: null,
          }),
      };
    }

    if (String(url).includes('/v1/comments?block_id=page-001')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [
              {
                id: 'comment-self',
                discussion_id: 'discussion-self',
                created_time: '2026-03-24T10:00:00.000Z',
                created_by: { id: 'bot-user' },
                rich_text: [{ plain_text: 'self reply' }],
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
      };
    }

    if (String(url).includes('/v1/comments?block_id=block-001')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [
              {
                id: 'comment-001',
                discussion_id: 'discussion-001',
                created_time: '2026-03-24T10:01:00.000Z',
                created_by: { id: 'human-user' },
                rich_text: [{ plain_text: '请把这里压短一点' }],
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
      };
    }

    if (String(url).includes('/v1/blocks/block-001')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 'block-001',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ plain_text: '这是被评论的原文段落' }],
            },
          }),
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const comments = await scanCommentsUnderPage({
      apiKey: 'secret_test',
      pageId: 'page-001',
      selfUserId: 'bot-user',
    });

    assert.equal(comments.length, 1);
    assert.deepEqual(comments[0], {
      pageId: 'page-001',
      discussionId: 'discussion-001',
      commentId: 'comment-001',
      body: '请把这里压短一点',
      anchorBlockId: 'block-001',
      contextQuote: '这是被评论的原文段落',
      createdTime: '2026-03-24T10:01:00.000Z',
      sourceUrl: 'notion://page/page-001/discussion/discussion-001/comment/comment-001',
    });

    assert.ok(calls.some((url) => url.includes('/v1/comments?block_id=page-001')));
    assert.ok(calls.some((url) => url.includes('/v1/comments?block_id=block-001')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('scanCommentsUnderPage respects maxBlocks and prioritizes top blocks', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    calls.push(String(url));

    if (String(url).includes('/v1/blocks/page-quick/children')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [
              { id: 'block-top', has_children: false },
              { id: 'block-later', has_children: false },
            ],
            has_more: false,
            next_cursor: null,
          }),
      };
    }

    if (String(url).includes('/v1/comments?block_id=page-quick')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [],
            has_more: false,
            next_cursor: null,
          }),
      };
    }

    if (String(url).includes('/v1/comments?block_id=block-top')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [
              {
                id: 'comment-top',
                discussion_id: 'discussion-top',
                created_time: '2026-03-30T03:20:00.000Z',
                created_by: { id: 'human-user' },
                rich_text: [{ plain_text: '最新评论' }],
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
      };
    }

    if (String(url).includes('/v1/blocks/block-top')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 'block-top',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ plain_text: '顶部段落' }],
            },
          }),
      };
    }

    if (String(url).includes('/v1/comments?block_id=block-later')) {
      throw new Error('block-later should not be scanned in quick mode');
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const comments = await scanCommentsUnderPage({
      apiKey: 'secret_test',
      pageId: 'page-quick',
      selfUserId: null,
      maxBlocks: 1,
    });

    assert.equal(comments.length, 1);
    assert.equal(comments[0].commentId, 'comment-top');
    assert.ok(calls.some((url) => url.includes('/v1/comments?block_id=block-top')));
    assert.ok(!calls.some((url) => url.includes('/v1/comments?block_id=block-later')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('scanCommentsUnderPage retries transient Notion comment fetch failures', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  let pageCommentAttempts = 0;

  global.fetch = async (url) => {
    const value = String(url);
    calls.push(value);

    if (value.includes('/v1/blocks/page-retry/children')) {
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [],
            has_more: false,
            next_cursor: null,
          }),
      };
    }

    if (value.includes('/v1/comments?block_id=page-retry')) {
      pageCommentAttempts += 1;
      if (pageCommentAttempts === 1) {
        const error = new Error('Request timed out after 15000ms: comments page-retry');
        error.code = 'ETIMEDOUT';
        throw error;
      }

      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            results: [
              {
                id: 'comment-retry-001',
                discussion_id: 'discussion-retry-001',
                created_time: '2026-04-02T12:40:00.000Z',
                created_by: { id: 'human-user' },
                rich_text: [{ plain_text: '这条评论在重试后成功拿到了' }],
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const comments = await scanCommentsUnderPage({
      apiKey: 'secret_test',
      pageId: 'page-retry',
      selfUserId: null,
    });

    assert.equal(pageCommentAttempts, 2);
    assert.equal(comments.length, 1);
    assert.equal(comments[0].commentId, 'comment-retry-001');
    assert.ok(calls.filter((url) => url.includes('/v1/comments?block_id=page-retry')).length >= 2);
  } finally {
    global.fetch = originalFetch;
  }
});
