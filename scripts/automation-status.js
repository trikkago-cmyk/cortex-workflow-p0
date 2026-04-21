import { existsSync, readFileSync } from 'node:fs';
import { defaultRuntimeDir, listManagedProcessNames, logFilePath, pidFilePath } from '../src/automation-processes.js';
import { loadProjectEnv } from '../src/project-env.js';
import { resolvePanghuRuntimeConfig } from '../src/panghu-runtime.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

const runtimeDir = defaultRuntimeDir(process.cwd());

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

const names = listManagedProcessNames({
  cwd: process.cwd(),
  runtimeDir,
});

const processes = names.map((name) => {
  const pid = readPid(name);
  const meta =
    name === 'panghu-poller'
      ? {
          sender: resolvePanghuRuntimeConfig({
            requireRealSender: '1',
          }),
        }
      : undefined;
  return {
    name,
    pid,
    running: isRunning(pid),
    logPath: logFilePath(runtimeDir, name),
    ...(meta ? { meta } : {}),
  };
});

console.log(JSON.stringify({ ok: true, runtimeDir, processes }, null, 2));
