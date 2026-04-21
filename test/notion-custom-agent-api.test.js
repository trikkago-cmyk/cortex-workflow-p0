import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test('notion custom agent context exposes the event-driven async contract', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-21T08:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const context = await getJson(baseUrl, '/notion/custom-agent/context?project_id=PRJ-cortex');
  assert.equal(context.status, 200);
  assert.equal(context.body.ok, true);
  assert.equal(context.body.collaboration_mode, 'custom_agent');
  assert.equal(context.body.async_contract.ingress, 'event_driven');
  assert.equal(context.body.async_contract.ingress_webhook, '/webhook/notion-custom-agent');
});

test('notion custom agent webhook ingests agent-triggered comments without polling', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-notion-custom-agent-webhook-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-21T08:10:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const response = await postJson(baseUrl, '/webhook/notion-custom-agent', {
    project_id: 'PRJ-cortex',
    page_id: 'page-001',
    discussion_id: 'discussion-001',
    comment_id: 'comment-001',
    body: '@cortex 请把这条 review 推进到下一步',
    owner_agent: 'agent-router',
    invoked_agent: 'Cortex Router',
    source_url: 'notion://page/page-001/discussion/discussion-001/comment/comment-001',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.collaboration_mode, 'custom_agent');
  assert.equal(response.body.owner_agent, 'agent-router');
  assert.match(response.body.commandId, /^CMD-/);
});
