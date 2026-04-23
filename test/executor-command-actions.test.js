import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createExecutorActionHandler } from '../src/executor-command-actions.js';
import { inferRouterTarget } from '../src/executor-multi-agent-handler.js';
import { createCortexServer } from '../src/server.js';
import { createMultiAgentExecutor } from '../src/executor-multi-agent-handler.js';
import { createExecutorWorker } from '../src/executor-worker.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

test('structured suggestion accept comment executes Cortex accept action directly', async () => {
  const calls = [];
  const handler = createExecutorActionHandler({
    cortexBaseUrl: 'http://cortex.test',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === 'http://cortex.test/suggestions/sug-001/accept') {
        return jsonResponse({
          ok: true,
          suggestion: {
            suggestion_id: 'sug-001',
            status: 'accepted',
          },
        });
      }

      throw new Error(`unexpected url ${url}`);
    },
    logger: { warn() {} },
  });

  const result = await handler({
    agentName: 'agent-notion-worker',
    projectId: 'PRJ-cortex',
    command: {
      instruction: '[suggestion-accept: sug-001]',
    },
  });

  assert.equal(result.action_type, 'suggestion_accept');
  assert.match(result.reply_text, /已接受 suggestion sug-001/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
});

test('structured memory accept comment updates memory and resolves related review inbox item', async () => {
  const calls = [];
  const handler = createExecutorActionHandler({
    cortexBaseUrl: 'http://cortex.test',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === 'http://cortex.test/memory/mem-001') {
        return jsonResponse({
          ok: true,
          memory: { memory_id: 'mem-001' },
          sources: [
            {
              source_type: 'checkpoint',
              source_ref: 'cp-001',
            },
          ],
        });
      }
      if (url === 'http://cortex.test/memory/mem-001/review') {
        return jsonResponse({
          ok: true,
          memory: {
            memory_id: 'mem-001',
            review_state: 'accepted',
            status: 'durable',
          },
        });
      }
      if (url === 'http://cortex.test/inbox?project_id=PRJ-cortex&status=open&source_ref=checkpoint%3Acp-001&object_type=memory') {
        return jsonResponse({
          ok: true,
          items: [
            {
              item_id: 'inbox-001',
            },
          ],
        });
      }
      if (url === 'http://cortex.test/inbox/inbox-001/act') {
        return jsonResponse({
          ok: true,
          item: {
            item_id: 'inbox-001',
            status: 'resolved',
          },
        });
      }

      throw new Error(`unexpected url ${url}`);
    },
    logger: { warn() {} },
  });

  const result = await handler({
    agentName: 'agent-notion-worker',
    projectId: 'PRJ-cortex',
    command: {
      instruction: '[memory-accept: mem-001]',
    },
  });

  assert.equal(result.action_type, 'memory_accept');
  assert.deepEqual(result.resolved_inbox_items, ['inbox-001']);
  assert.match(result.reply_text, /durable memory/);
  assert.equal(calls.length, 4);
});

test('router sends structured review directives to agent-notion-worker', () => {
  assert.equal(
    inferRouterTarget({
      instruction: '[decision-approve: dec-001]',
    }),
    'agent-notion-worker',
  );
});

test('notion comment directive can flow through router-owned command and update Cortex state directly', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-directive-e2e-'));
  const agentRegistryFile = join(cwd, 'agent-registry.json');
  writeFileSync(
    agentRegistryFile,
    JSON.stringify(
      {
        defaults: {
          project_id: 'PRJ-cortex',
          source: 'notion_comment',
        },
        agents: [
          {
            agent_name: 'agent-router',
            handler_kind: 'router',
            owner_agent: 'agent-router',
          },
          {
            agent_name: 'agent-notion-worker',
            handler_kind: 'shared_actions',
            owner_agent: 'agent-notion-worker',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const app = createCortexServer({
    cwd,
    dbPath: join(cwd, 'cortex.db'),
    clock: () => new Date('2026-04-14T10:00:00.000Z'),
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  const multiExecutor = createMultiAgentExecutor({
    cortexBaseUrl: baseUrl,
    agentRegistryFile,
    fetchImpl: fetch,
    logger: { warn() {}, error() {} },
  });

  const replies = [];
  const workerOptions = {
    baseUrl,
    source: 'notion_comment',
    fetchImpl: fetch,
    executor: multiExecutor,
    notionApiKey: 'test-notion-key',
    notionReply: async ({ discussionId, text }) => {
      replies.push({ discussionId, text });
      return { id: `reply-${replies.length}` };
    },
    logger: { info() {}, error() {} },
  };

  const routerWorker = createExecutorWorker({
    ...workerOptions,
    agentName: 'agent-router',
    ownerAgent: 'agent-router',
  });
  const notionWorker = createExecutorWorker({
    ...workerOptions,
    agentName: 'agent-notion-worker',
    ownerAgent: 'agent-notion-worker',
  });

  const suggestionCreateResponse = await fetch(`${baseUrl}/suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 'PRJ-cortex',
      source_type: 'notion_comment',
      source_ref: 'comment-001',
      proposed_text: '把这里改成更清晰的标题',
    }),
  });
  const suggestionCreatePayload = await suggestionCreateResponse.json();
  assert.equal(suggestionCreateResponse.status, 200);
  const suggestionId = suggestionCreatePayload.suggestion.suggestion_id;

  const commentResponse = await fetch(`${baseUrl}/webhook/notion-comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: 'PRJ-cortex',
      target_type: 'page',
      target_id: 'page-001',
      page_id: 'page-001',
      discussion_id: 'discussion-001',
      comment_id: 'comment-001',
      body: `[suggestion-accept: ${suggestionId}]`,
      owner_agent: 'agent-router',
      source_url: 'notion://page/page-001/discussion/discussion-001/comment/comment-001',
    }),
  });
  assert.equal(commentResponse.status, 200);

  const routed = await routerWorker.pollOnce();
  assert.equal(routed.claimed, true);
  assert.equal(routed.handled.status, 'done');

  const acted = await notionWorker.pollOnce();
  assert.equal(acted.claimed, false);
  assert.equal(acted.handled, null);

  const suggestionDetailResponse = await fetch(`${baseUrl}/suggestions/${encodeURIComponent(suggestionId)}`);
  const suggestionDetailPayload = await suggestionDetailResponse.json();
  assert.equal(suggestionDetailResponse.status, 200);
  assert.equal(suggestionDetailPayload.suggestion.status, 'accepted');
  assert.equal(replies.length, 0);
});
