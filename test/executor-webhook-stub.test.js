import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutorWebhookStub, buildExecutorStubResult } from '../src/executor-webhook-stub.js';

test('buildExecutorStubResult returns notion reply text for notion comments', () => {
  const result = buildExecutorStubResult({
    agentName: 'agent-notion-worker',
    command: {
      source: 'notion_comment',
      parsed_action: 'improve',
      instruction: '把摘要压短一点',
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'done');
  assert.match(result.reply_text, /已按评论调整/);
  assert.match(result.result_summary, /agent-notion-worker handled notion_comment/);
});

test('executor webhook stub serves /handle payloads', async (t) => {
  const app = createExecutorWebhookStub({
    logger: {
      info() {},
      error() {},
    },
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await app.close();
  });

  const address = app.server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/handle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_name: 'agent-pm',
      command: {
        command_id: 'CMD-001',
        source: 'notion_comment',
        parsed_action: 'continue',
        instruction: '继续推进',
      },
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.status, 'done');
  assert.match(payload.reply_text, /已继续推进/);
  assert.match(payload.result_summary, /CMD-001|agent-pm handled notion_comment/);
});
