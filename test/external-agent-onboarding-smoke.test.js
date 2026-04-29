import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createCortexServer } from '../src/server.js';

const scriptPath = fileURLToPath(new URL('../scripts/external-agent-onboarding-smoke.js', import.meta.url));

async function listen(serverOrApp, host = '127.0.0.1') {
  await new Promise((resolvePromise) => serverOrApp.listen(0, host, resolvePromise));
  return `http://${host}:${serverOrApp.address().port}`;
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

function createTempCortexServer(prefix) {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-cwd-`));
  const dbDir = mkdtempSync(join(tmpdir(), `${prefix}-db-`));
  return createCortexServer({
    cwd,
    dbPath: join(dbDir, 'cortex.db'),
    agentRegistryFile: join(cwd, 'docs', 'agent-registry.json'),
    notionRoutingFile: join(cwd, 'docs', 'notion-routing.json'),
    executorRoutingFile: join(cwd, 'docs', 'executor-routing.json'),
    clock: () => new Date('2026-04-29T09:00:00.000Z'),
  });
}

test('external agent onboarding smoke validates sync webhook mode end-to-end', async (t) => {
  const cortex = createTempCortexServer('cortex-agent-smoke-sync');
  const baseUrl = await listen(cortex.server);
  t.after(() => cortex.close());

  const result = await runCli([
    '--mode',
    'sync',
    '--base-url',
    baseUrl,
    '--project',
    'PRJ-cortex-agent-smoke-sync',
    '--agent',
    'agent-smoke-sync',
    '--alias',
    'smoke-sync',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.mode, 'sync');
  assert.equal(result.body.verify.status, 'ready');
  assert.equal(result.body.worker.claimed, true);
  assert.equal(result.body.command.status, 'done');
  assert.equal(result.body.deliveries.length, 1);
  assert.equal(result.body.forwarded.length, 0);
});

test('external agent onboarding smoke validates handoff + receipt mode end-to-end', async (t) => {
  const cortex = createTempCortexServer('cortex-agent-smoke-handoff');
  const baseUrl = await listen(cortex.server);
  t.after(() => cortex.close());

  const result = await runCli([
    '--mode',
    'handoff',
    '--base-url',
    baseUrl,
    '--project',
    'PRJ-cortex-agent-smoke-handoff',
    '--agent',
    'agent-smoke-handoff',
    '--alias',
    'smoke-handoff',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.mode, 'handoff');
  assert.equal(result.body.verify.status, 'ready');
  assert.equal(result.body.worker.claimed, true);
  assert.equal(result.body.command.status, 'done');
  assert.equal(result.body.deliveries.length, 1);
  assert.equal(result.body.forwarded.length, 1);
  assert.equal(result.body.handoff_outbox.payload.handoff_agent, 'agent-smoke-handoff');
  assert.match(result.body.handoff_outbox.payload.callback_url, /\/webhook\/agent-receipt$/);
  assert.equal(result.body.receipt.ok, true);
  assert.equal(result.body.receipts.receipts.length, 1);
  assert.equal(result.body.receipts.receipts[0].payload.summary, 'agent-smoke-handoff handoff smoke completed');
});
