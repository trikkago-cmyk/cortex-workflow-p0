import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createCortexServer } from '../src/server.js';

const scriptPath = fileURLToPath(new URL('../scripts/external-agent-complete.js', import.meta.url));

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

async function runCli(args, env = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        status: code,
        stdout,
        stderr,
        body: stdout ? JSON.parse(stdout) : null,
      });
    });
  });
}

test('external agent complete CLI can consume handoff payload and post to callback_url', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-external-agent-complete-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-02T12:15:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const ingested = await postJson(baseUrl, '/webhook/im-message', {
    project_id: 'PRJ-cortex-cli-complete',
    text: '继续推进外部 agent 完成回执',
    session_id: 'cli-complete@local',
    message_id: 'cli-complete-msg-001',
  });

  const handoff = {
    callback_url: `${baseUrl}/webhook/agent-receipt`,
    command_id: ingested.body.commandId,
    project_id: 'PRJ-cortex-cli-complete',
    target: 'cli-complete@local',
  };

  const result = await runCli(
    [
      '--handoff-json',
      JSON.stringify(handoff),
      '--agent',
      'agent-panghu',
      '--signal',
      'green',
      '--summary',
      'external agent cli completed',
      '--details',
      '通过 handoff payload 自动回写',
      '--metrics-json',
      '{"processed_count":1}',
      '--reply',
      '已通过 external agent CLI 回写。',
    ],
    {
      CHANNEL: 'hiredcity',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.command.status, 'done');
  assert.equal(result.body.receipt.payload.summary, 'external agent cli completed');

  const receipts = await getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(ingested.body.commandId)}`);
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.receipts.length, 1);
  assert.equal(receipts.body.receipts[0].payload.details, '通过 handoff payload 自动回写');
});
