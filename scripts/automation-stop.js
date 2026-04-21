import { existsSync, readFileSync, rmSync } from 'node:fs';
import { defaultRuntimeDir, listManagedProcessNames, pidFilePath } from '../src/automation-processes.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

const runtimeDir = defaultRuntimeDir(process.cwd());

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPid(name) {
  const file = pidFilePath(runtimeDir, name);
  if (!existsSync(file)) {
    return null;
  }

  const value = Number(readFileSync(file, 'utf8').trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

function stopPid(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
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

async function waitForExit(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) {
      return true;
    }
    await sleep(100);
  }
  return !isRunning(pid);
}

const names = listManagedProcessNames({
  cwd: process.cwd(),
  runtimeDir,
});

const pendingResults = names.map((name) => {
  const pid = readPid(name);
  return {
    name,
    pid,
    stopped: stopPid(pid),
  };
});

const results = [];
for (const entry of pendingResults) {
  results.push({
    ...entry,
    exited: entry.stopped && entry.pid ? await waitForExit(entry.pid) : !entry.pid,
  });
}

for (const name of names) {
  const file = pidFilePath(runtimeDir, name);
  if (existsSync(file)) {
    rmSync(file, { force: true });
  }
}

console.log(JSON.stringify({ ok: true, runtimeDir, results }, null, 2));
