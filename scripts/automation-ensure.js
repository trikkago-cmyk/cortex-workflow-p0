import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  defaultRuntimeDir,
  listManagedProcessNames,
  listManagedStackWatchFiles,
  pidFilePath,
} from '../src/automation-processes.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

const cwd = process.cwd();
const runtimeDir = defaultRuntimeDir(cwd);
const cortexBaseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';

function readPid(name) {
  const file = pidFilePath(runtimeDir, name);
  if (!existsSync(file)) {
    return null;
  }

  const value = Number(readFileSync(file, 'utf8').trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isRunning(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function safeMtimeMs(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function inspectProcesses() {
  return listManagedProcessNames({ cwd, runtimeDir }).map((name) => {
    const file = pidFilePath(runtimeDir, name);
    const pid = readPid(name);
    return {
      name,
      pid,
      pidFile: file,
      pidFileMtimeMs: safeMtimeMs(file),
      running: isRunning(pid),
    };
  });
}

async function isCortexHealthy() {
  try {
    const response = await fetch(`${cortexBaseUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function runNpmScript(scriptName) {
  const result = spawnSync('npm', ['run', scriptName], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error([`npm run ${scriptName} failed`, result.stdout, result.stderr].filter(Boolean).join('\n').trim());
  }

  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

const before = inspectProcesses();
const hasStopped = before.some((processState) => !processState.running);
const healthOk = await isCortexHealthy();
const watchFiles = listManagedStackWatchFiles({ cwd }).map((file) => ({
  file,
  mtimeMs: safeMtimeMs(file),
}));
const newestWatchedFile =
  watchFiles.reduce((latest, entry) => (entry.mtimeMs > latest.mtimeMs ? entry : latest), {
    file: null,
    mtimeMs: 0,
  }) || { file: null, mtimeMs: 0 };
const staleProcesses = before.filter(
  (processState) =>
    processState.running &&
    processState.pidFileMtimeMs > 0 &&
    newestWatchedFile.mtimeMs > processState.pidFileMtimeMs,
);
let action = 'noop';
let details = null;

if (staleProcesses.length > 0) {
  action = 'restart_stale_stack';
  details = {
    watch: {
      newestFile: newestWatchedFile.file,
      newestMtimeMs: newestWatchedFile.mtimeMs,
      staleProcesses: staleProcesses.map((processState) => ({
        name: processState.name,
        pid: processState.pid,
        pidFileMtimeMs: processState.pidFileMtimeMs,
      })),
    },
    stop: runNpmScript('automation:stop'),
    start: runNpmScript('automation:start'),
  };
} else if (!healthOk && before.some((processState) => processState.running)) {
  action = 'restart_unhealthy_stack';
  details = {
    stop: runNpmScript('automation:stop'),
    start: runNpmScript('automation:start'),
  };
} else if (!healthOk || hasStopped) {
  action = 'start_missing_processes';
  details = {
    start: runNpmScript('automation:start'),
  };
}

const after = inspectProcesses();
const healthAfter = await isCortexHealthy();

console.log(
  JSON.stringify(
    {
      ok: true,
      action,
      cortexBaseUrl,
      health: {
        before: healthOk,
        after: healthAfter,
      },
      before,
      after,
      details,
    },
    null,
    2,
  ),
);
