import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildRuntimeSoakReport } from '../src/runtime-soak.js';
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

function compact(value) {
  return String(value ?? '').trim();
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

function safeParseJson(text) {
  if (!compact(text)) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runNodeScript(scriptPath, argv = []) {
  const result = spawnSync(process.execPath, [resolve(process.cwd(), scriptPath), ...argv], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });

  return {
    exit_status: result.status ?? 1,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    body: safeParseJson(result.stdout),
  };
}

function buildSyntheticFailureRun(projectId, baseUrl, scriptResult, reason) {
  const detail = compact(reason) || 'runtime_readiness_failed';

  return {
    ok: false,
    status: 'blocking',
    generated_at: new Date().toISOString(),
    project_id: projectId,
    base_url: baseUrl,
    report: {
      ok: false,
      status: 'blocking',
      blocking: [detail],
      warnings: [],
      checks: [],
      summary: {
        total_runs: 1,
      },
    },
    script_exit_status: scriptResult.exit_status,
    script_stdout: scriptResult.stdout || null,
    script_stderr: scriptResult.stderr || null,
  };
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = compact(args.base_url || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100');
const projectId = compact(args.project || process.env.PROJECT_ID || 'PRJ-cortex');
const iterations = Math.max(1, Number(args.iterations || process.env.RUNTIME_SOAK_ITERATIONS || 6));
const intervalMs = Math.max(0, Number(args.interval_ms || process.env.RUNTIME_SOAK_INTERVAL_MS || 60000));
const readinessSamples = Math.max(1, Number(args.samples || process.env.RUNTIME_READINESS_SAMPLES || 1));
const readinessIntervalMs = Math.max(
  0,
  Number(args.readiness_interval_ms || process.env.RUNTIME_READINESS_INTERVAL_MS || 5000),
);
const readinessScript = compact(args.readiness_script || 'scripts/runtime-readiness.js');
const stopOnBlocking = normalizeBoolean(args.stop_on_blocking || process.env.RUNTIME_SOAK_STOP_ON_BLOCKING, false);

const readinessArgs = [
  '--project',
  projectId,
  '--samples',
  String(readinessSamples),
  '--interval-ms',
  String(readinessIntervalMs),
];

if (normalizeBoolean(args.red_smoke || process.env.RUNTIME_READINESS_RED_SMOKE, false)) {
  readinessArgs.push('--red-smoke');
}

if (normalizeBoolean(args.expect_launchd || process.env.RUNTIME_SOAK_EXPECT_LAUNCHD, false)) {
  readinessArgs.push('--expect-launchd');
}

const startedAt = new Date().toISOString();
const runs = [];

for (let index = 0; index < iterations; index += 1) {
  const scriptResult = runNodeScript(readinessScript, readinessArgs);
  const runBody =
    scriptResult.exit_status === 0 && scriptResult.body
      ? {
          ...scriptResult.body,
          exit_status: scriptResult.exit_status,
        }
      : buildSyntheticFailureRun(
          projectId,
          baseUrl,
          scriptResult,
          scriptResult.body ? 'runtime_readiness_nonzero_exit' : 'runtime_readiness_invalid_json',
        );

  runs.push(runBody);

  if ((runBody.status === 'blocking' || runBody.report?.status === 'blocking') && stopOnBlocking) {
    break;
  }

  if (index < iterations - 1 && intervalMs > 0) {
    await sleep(intervalMs);
  }
}

const finishedAt = new Date().toISOString();
const report = buildRuntimeSoakReport(runs, {
  startedAt,
  finishedAt,
  intervalMs,
});

console.log(
  JSON.stringify(
    {
      ok: report.ok,
      status: report.status,
      project_id: projectId,
      base_url: baseUrl,
      readiness_script: readinessScript,
      readiness_args: readinessArgs,
      started_at: startedAt,
      finished_at: finishedAt,
      requested_iterations: iterations,
      completed_iterations: runs.length,
      stop_on_blocking: stopOnBlocking,
      report,
      runs,
    },
    null,
    2,
  ),
);
