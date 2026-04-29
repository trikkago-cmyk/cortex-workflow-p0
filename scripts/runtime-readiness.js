import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildRuntimeReadinessReport } from '../src/runtime-readiness.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2).replaceAll('-', '_');
    const next = argv[index + 1];
    if (!next || String(next).startsWith('--')) {
      parsed[key] = '1';
      continue;
    }

    parsed[key] = String(next);
    index += 1;
  }

  return parsed;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function readJson(response) {
  const body = await response.text();
  return body ? JSON.parse(body) : {};
}

async function requestJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const payload = await readJson(response);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status} ${pathname}`);
  }
  return payload;
}

function runNodeScript(scriptRelativePath, argv = [], { allowFailure = false } = {}) {
  const result = spawnSync(process.execPath, [resolve(process.cwd(), scriptRelativePath), ...argv], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });

  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      [stderr, stdout, `${scriptRelativePath} exited with code ${result.status ?? 1}`]
        .filter(Boolean)
        .join('\n')
        .trim(),
    );
  }

  const body = stdout ? JSON.parse(stdout) : null;
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout,
    stderr: stderr || null,
    body,
  };
}

async function collectSample(baseUrl) {
  const [automation, health] = await Promise.all([
    requestJson(baseUrl, '/health').catch((error) => ({
      ok: false,
      error: String(error?.message || error),
    })),
    runNodeScript('scripts/automation-status.js', [], { allowFailure: true }),
  ]);

  return {
    collected_at: new Date().toISOString(),
    healthOk: automation.ok === true && health.ok === true,
    health: automation,
    automation: health.body || { ok: false, processes: [], error: health.stderr || health.stdout || 'status unavailable' },
  };
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = args.project || process.env.PROJECT_ID || 'PRJ-cortex';
const sampleCount = Math.max(1, Number(args.samples || process.env.RUNTIME_READINESS_SAMPLES || 1));
const intervalMs = Math.max(0, Number(args.interval_ms || process.env.RUNTIME_READINESS_INTERVAL_MS || 5000));
const failedLimit = Math.max(1, Number(args.failed_limit || process.env.RUNTIME_READINESS_FAILED_LIMIT || 10));
const receiptLimit = Math.max(1, Number(args.receipt_limit || process.env.RUNTIME_READINESS_RECEIPT_LIMIT || 10));
const pendingLimit = Math.max(1, Number(args.pending_limit || process.env.RUNTIME_READINESS_PENDING_LIMIT || 10));
const runRedSmoke = normalizeBoolean(args.red_smoke || process.env.RUNTIME_READINESS_RED_SMOKE, false);
const expectLaunchd = normalizeBoolean(args.expect_launchd, false);

const samples = [];
for (let index = 0; index < sampleCount; index += 1) {
  samples.push(await collectSample(baseUrl));
  if (index < sampleCount - 1 && intervalMs > 0) {
    await sleep(intervalMs);
  }
}

const [projectReview, failedCommands, failedOutbox, pendingOutbox, recentReceipts, openRedDecisions] = await Promise.all([
  requestJson(baseUrl, `/project-review?project_id=${encodeURIComponent(projectId)}`),
  requestJson(
    baseUrl,
    `/commands?project_id=${encodeURIComponent(projectId)}&status=failed&limit=${failedLimit}`,
  ),
  requestJson(baseUrl, `/outbox?status=failed&limit=${pendingLimit}`),
  requestJson(baseUrl, `/outbox?status=pending&limit=${pendingLimit}`),
  requestJson(
    baseUrl,
    `/receipts?project_id=${encodeURIComponent(projectId)}&limit=${receiptLimit}`,
  ).catch((error) => ({
    ok: false,
    error: String(error?.message || error),
    receipts: [],
  })),
  requestJson(
    baseUrl,
    `/decisions?project_id=${encodeURIComponent(projectId)}&signal_level=red&status=needs_review`,
  ),
]);

const launchd = runNodeScript('scripts/launchd-status.js', [], { allowFailure: true });
const redSmoke = runRedSmoke
  ? runNodeScript(
      'scripts/local-red-alert-smoke.js',
      [
        `Runtime readiness smoke ${Date.now()}`,
        '请确认本地红灯通知链路仍然正常',
      ],
      { allowFailure: true },
    )
  : null;

const snapshot = {
  generatedAt: new Date().toISOString(),
  projectId,
  baseUrl,
  expectLaunchd: expectLaunchd || launchd.body?.installed === true,
  automation: samples[samples.length - 1]?.automation || { ok: false, processes: [] },
  health: samples[samples.length - 1]?.health || { ok: false },
  samples,
  launchd: launchd.body || { ok: false, installed: false, loaded: false },
  projectReview,
  failedCommands,
  failedOutbox,
  pendingOutbox,
  recentReceipts,
  openRedDecisions,
  redSmokeRequested: runRedSmoke,
  redSmoke: redSmoke?.body || (runRedSmoke ? { ok: false, error: redSmoke?.stderr || redSmoke?.stdout || 'smoke failed' } : null),
};

const report = buildRuntimeReadinessReport(snapshot);

console.log(
  JSON.stringify(
    {
      ok: report.ok,
      status: report.status,
      project_id: projectId,
      base_url: baseUrl,
      generated_at: snapshot.generatedAt,
      report,
      launchd: snapshot.launchd,
      automation: snapshot.automation,
      samples,
      project_review: projectReview,
      failed_commands: failedCommands,
      failed_outbox: failedOutbox,
      pending_outbox: pendingOutbox,
      recent_receipts: recentReceipts,
      open_red_decisions: openRedDecisions,
      red_smoke: snapshot.redSmoke,
    },
    null,
    2,
  ),
);
