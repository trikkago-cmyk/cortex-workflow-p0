import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createCortexServer } from '../src/server.js';

const scriptPath = fileURLToPath(new URL('../scripts/notion-custom-agent-live-uat.js', import.meta.url));

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
    clock: () => new Date('2026-04-29T10:30:00.000Z'),
  });
}

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

test('notion custom agent live UAT CLI verifies the six core scenarios and cleans red outbox', async (t) => {
  const cortex = createTempCortexServer('cortex-live-uat');
  const baseUrl = await listen(cortex.server);
  t.after(() => cortex.close());

  const templateUpsert = await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    name: 'Cortex',
    status: 'active',
    root_page_url: 'https://www.notion.so/Cortex-11111111111111111111111111111111',
    notion_parent_page_id: '22222222-2222-2222-2222-222222222222',
    notion_review_page_id: '33333333-3333-3333-3333-333333333333',
    notion_memory_page_id: '44444444-4444-4444-4444-444444444444',
    notion_scan_page_id: '55555555-5555-5555-5555-555555555555',
    notification_channel: 'smoke',
    notification_target: 'custom-agent-live-uat@local',
  });
  assert.equal(templateUpsert.status, 200);

  const result = await runCli([
    '--base-url',
    baseUrl,
    '--template-project',
    'PRJ-cortex',
    '--project',
    'PRJ-cortex-live-uat-test',
    '--agent',
    'agent-live-uat-test',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.report.status, 'ready');
  assert.equal(result.body.report.summary.total, 6);
  assert.equal(result.body.report.summary.passed, 6);
  assert.equal(result.body.cleanup.archived_outbox_count, 1);
  assert.equal(result.body.cleanup.remaining_pending_count, 0);

  const scenarioMap = Object.fromEntries(result.body.scenarios.map((scenario) => [scenario.name, scenario]));
  assert.equal(scenarioMap.green_command.passed, true);
  assert.equal(scenarioMap.yellow_decision.passed, true);
  assert.equal(scenarioMap.red_decision.passed, true);
  assert.equal(scenarioMap.self_loop_guard.passed, true);
  assert.equal(scenarioMap.scope_guard.passed, true);
  assert.equal(scenarioMap.receipt_writeback.passed, true);
});
