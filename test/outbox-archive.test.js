import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

test('supports archiving obsolete outbox messages without leaving them pending', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-outbox-archive-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-29T12:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/webhook/codex-message', {
    channel: 'hiredcity',
    target: 'your-target@example.com',
    text: '历史 smoke 消息',
    priority: 'normal',
  });

  await postJson(baseUrl, '/webhook/codex-message', {
    channel: 'hiredcity',
    target: 'your-target@example.com',
    text: '保留中的正常消息',
    priority: 'normal',
  });

  const before = await getJson(baseUrl, '/outbox');
  assert.equal(before.status, 200);
  assert.equal(before.body.pending.length, 2);

  const archivedMessage = before.body.pending.find((item) => item.text === '历史 smoke 消息');
  assert.ok(archivedMessage);

  const archiveResult = await postJson(baseUrl, '/outbox/archive', {
    id: archivedMessage.id,
    note: '历史 smoke 残留已归档',
  });

  assert.equal(archiveResult.status, 200);
  assert.equal(archiveResult.body.ok, true);
  assert.equal(archiveResult.body.status, 'archived');

  const after = await getJson(baseUrl, '/outbox');
  assert.equal(after.status, 200);
  assert.equal(after.body.pending.length, 1);
  assert.equal(after.body.pending[0].text, '保留中的正常消息');

  const archived = await getJson(baseUrl, '/outbox?status=archived&limit=5');
  assert.equal(archived.status, 200);
  assert.equal(archived.body.messages.length, 1);
  assert.equal(archived.body.messages[0].id, archivedMessage.id);
  assert.equal(archived.body.messages[0].status, 'archived');
  assert.match(archived.body.messages[0].error, /历史 smoke 残留已归档/);
});
