import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildRuntimeSoakReport } from '../src/runtime-soak.js';

const scriptPath = fileURLToPath(new URL('../scripts/runtime-soak.js', import.meta.url));

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

test('buildRuntimeSoakReport summarizes worst status, transitions, and recurring causes', () => {
  const report = buildRuntimeSoakReport(
    [
      {
        status: 'ready',
        generated_at: '2026-04-29T10:00:00.000Z',
        report: {
          status: 'ready',
          blocking: [],
          warnings: [],
        },
      },
      {
        status: 'warning',
        generated_at: '2026-04-29T10:01:00.000Z',
        report: {
          status: 'warning',
          blocking: [],
          warnings: ['recent_receipts_missing'],
        },
      },
      {
        status: 'blocking',
        generated_at: '2026-04-29T10:02:00.000Z',
        report: {
          status: 'blocking',
          blocking: ['managed_process_stopped', 'managed_process_stopped'],
          warnings: ['recent_receipts_missing'],
        },
      },
    ],
    {
      intervalMs: 1000,
    },
  );

  assert.equal(report.ok, false);
  assert.equal(report.status, 'blocking');
  assert.equal(report.summary.total_runs, 3);
  assert.equal(report.summary.transition_count, 2);
  assert.equal(report.blocking_frequency[0].code, 'managed_process_stopped');
  assert.equal(report.blocking_frequency[0].count, 2);
  assert.equal(report.warning_frequency[0].code, 'recent_receipts_missing');
  assert.equal(report.warning_frequency[0].count, 2);
});

test('runtime soak CLI can summarize repeated readiness snapshots from a stub script', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'cortex-runtime-soak-'));
  const statePath = join(tempDir, 'state.txt');
  const stubScriptPath = join(tempDir, 'readiness-stub.js');

  writeFileSync(
    stubScriptPath,
    [
      "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
      "const statePath = process.env.SOAK_TEST_STATE;",
      "const sequence = JSON.parse(process.env.SOAK_TEST_SEQUENCE || '[]');",
      "const index = existsSync(statePath) ? Number(readFileSync(statePath, 'utf8')) : 0;",
      'const next = sequence[Math.min(index, sequence.length - 1)];',
      "writeFileSync(statePath, String(index + 1));",
      'console.log(JSON.stringify(next, null, 2));',
    ].join('\n'),
  );
  writeFileSync(statePath, '0');

  const sequence = [
    {
      ok: true,
      status: 'ready',
      generated_at: '2026-04-29T10:00:00.000Z',
      report: {
        ok: true,
        status: 'ready',
        blocking: [],
        warnings: [],
      },
    },
    {
      ok: true,
      status: 'warning',
      generated_at: '2026-04-29T10:01:00.000Z',
      report: {
        ok: true,
        status: 'warning',
        blocking: [],
        warnings: ['pending_outbox_present'],
      },
    },
    {
      ok: false,
      status: 'blocking',
      generated_at: '2026-04-29T10:02:00.000Z',
      report: {
        ok: false,
        status: 'blocking',
        blocking: ['managed_process_stopped'],
        warnings: [],
      },
    },
  ];

  const result = await runCli(
    [
      '--project',
      'PRJ-cortex',
      '--iterations',
      '3',
      '--interval-ms',
      '0',
      '--readiness-script',
      stubScriptPath,
    ],
    {
      SOAK_TEST_SEQUENCE: JSON.stringify(sequence),
      SOAK_TEST_STATE: statePath,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.report.status, 'blocking');
  assert.equal(result.body.report.summary.total_runs, 3);
  assert.equal(result.body.report.summary.transition_count, 2);
  assert.equal(result.body.report.blocking_frequency[0].code, 'managed_process_stopped');
  assert.equal(Number(readFileSync(statePath, 'utf8')), 3);
});
