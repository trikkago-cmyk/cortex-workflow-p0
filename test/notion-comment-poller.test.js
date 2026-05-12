import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadNotionCommentPollerState,
  pollNotionCommentsOnce,
  resolveNotionCommentPollTargets,
} from '../src/notion-comment-poller.js';
import { createStore } from '../src/store.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

test('notion comment poller posts recent unseen comments to the existing webhook and persists state', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-notion-comment-poller-'));
  const statePath = join(cwd, 'state.json');
  const posts = [];
  const now = Date.parse('2026-05-12T08:00:00.000Z');

  const first = await pollNotionCommentsOnce({
    cwd,
    statePath,
    now,
    firstRunLookbackMs: 60 * 60 * 1000,
    env: {
      NOTION_API_KEY: 'secret_test',
      CORTEX_BASE_URL: 'http://cortex.test',
    },
    targets: [{ projectId: 'PRJ-cortex', pageId: 'page-001' }],
    getCurrentBotUserId: async ({ apiKey }) => {
      assert.equal(apiKey, 'secret_test');
      return 'bot-user';
    },
    scanCommentsUnderPage: async ({ pageId, selfUserId }) => {
      assert.equal(pageId, 'page-001');
      assert.equal(selfUserId, 'bot-user');
      return [
        {
          pageId,
          discussionId: 'discussion-old',
          commentId: 'comment-old',
          body: '旧评论不应该在首次轮询时被补摄入',
          anchorBlockId: null,
          contextQuote: '',
          createdTime: '2026-05-11T08:00:00.000Z',
          sourceUrl: 'notion://page/page-001/discussion/discussion-old/comment/comment-old',
        },
        {
          pageId,
          discussionId: 'discussion-new',
          commentId: 'comment-new',
          body: '更新目前项目执行的最新动态到文档中',
          anchorBlockId: 'block-001',
          contextQuote: '当前状态',
          createdTime: '2026-05-12T07:30:00.000Z',
          sourceUrl: 'notion://page/page-001/discussion/discussion-new/comment/comment-new',
        },
      ];
    },
    fetchImpl: async (url, options = {}) => {
      posts.push({
        url,
        body: JSON.parse(options.body),
      });
      return jsonResponse({ ok: true, commandId: 'CMD-001' });
    },
  });

  assert.equal(first.ok, true);
  assert.equal(first.ingested.length, 1);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'http://cortex.test/webhook/notion-comment');
  assert.deepEqual(posts[0].body, {
    project_id: 'PRJ-cortex',
    target_type: 'block',
    target_id: 'block-001',
    page_id: 'page-001',
    discussion_id: 'discussion-new',
    comment_id: 'comment-new',
    body: '更新目前项目执行的最新动态到文档中',
    context_quote: '当前状态',
    anchor_block_id: 'block-001',
    source_url: 'notion://page/page-001/discussion/discussion-new/comment/comment-new',
  });
  assert.equal(existsSync(statePath), true);
  assert.equal(loadNotionCommentPollerState(statePath).seen['comment-new'].projectId, 'PRJ-cortex');

  const second = await pollNotionCommentsOnce({
    cwd,
    statePath,
    now: now + 1000,
    firstRunLookbackMs: 60 * 60 * 1000,
    env: {
      NOTION_API_KEY: 'secret_test',
      CORTEX_BASE_URL: 'http://cortex.test',
    },
    targets: [{ projectId: 'PRJ-cortex', pageId: 'page-001' }],
    getCurrentBotUserId: async () => 'bot-user',
    scanCommentsUnderPage: async () => [
      {
        pageId: 'page-001',
        discussionId: 'discussion-new',
        commentId: 'comment-new',
        body: '更新目前项目执行的最新动态到文档中',
        anchorBlockId: 'block-001',
        contextQuote: '当前状态',
        createdTime: '2026-05-12T07:30:00.000Z',
        sourceUrl: 'notion://page/page-001/discussion/discussion-new/comment/comment-new',
      },
    ],
    fetchImpl: async () => {
      throw new Error('deduped comments should not be posted again');
    },
  });

  assert.equal(second.ok, true);
  assert.equal(second.ingested.length, 0);
  assert.match(readFileSync(statePath, 'utf8'), /comment-new/);
});

test('resolveNotionCommentPollTargets reads project scan pages from the Cortex store', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-notion-comment-targets-'));
  const dbPath = join(cwd, 'cortex.db');
  const store = createStore({ dbPath });
  store.ensureProject({
    projectId: 'PRJ-cortex',
    name: 'Cortex',
    notionScanPageId: 'page-scan-001',
    notionReviewPageId: 'page-scan-001',
  });
  store.close();

  assert.deepEqual(
    resolveNotionCommentPollTargets({
      cwd,
      dbPath,
      env: {},
    }),
    [{ projectId: 'PRJ-cortex', pageId: 'page-scan-001' }],
  );
});
