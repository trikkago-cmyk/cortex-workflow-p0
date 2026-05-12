import { execFileSync as defaultExecFileSync } from 'node:child_process';
import { resolve } from 'node:path';

function compact(value) {
  return String(value ?? '').trim();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function resolveListeningPid({ port, execFileSync = defaultExecFileSync } = {}) {
  const normalizedPort = compact(port);
  if (!normalizedPort) {
    return null;
  }

  try {
    const output = execFileSync('lsof', ['-nP', `-iTCP:${normalizedPort}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
    });
    const firstLine = compact(output).split('\n').find(Boolean) || '';
    const pid = Number(firstLine);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function readProcessCommand(pid, { execFileSync = defaultExecFileSync } = {}) {
  const numericPid = Number(pid);
  if (!Number.isFinite(numericPid) || numericPid <= 0) {
    return null;
  }

  try {
    const output = execFileSync('ps', ['-p', String(numericPid), '-o', 'command='], {
      encoding: 'utf8',
    });
    return compact(output) || null;
  } catch {
    return null;
  }
}

export function readProcessWorkingDirectory(pid, { execFileSync = defaultExecFileSync } = {}) {
  const numericPid = Number(pid);
  if (!Number.isFinite(numericPid) || numericPid <= 0) {
    return null;
  }

  try {
    const output = execFileSync('lsof', ['-a', '-p', String(numericPid), '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
    });
    const cwdLine = compact(output)
      .split('\n')
      .find((line) => line.startsWith('n'));
    return cwdLine ? compact(cwdLine.slice(1)) || null : null;
  } catch {
    return null;
  }
}

export function matchesRepoNodeScriptCommand(
  command,
  {
    cwd = process.cwd(),
    processCwd = null,
    scriptRelativePath = 'src/server.js',
  } = {},
) {
  const normalizedCommand = compact(command);
  if (!normalizedCommand) {
    return false;
  }

  const normalizedRelativeScript = compact(scriptRelativePath).replace(/^\.?\//, '');
  const expectedScript = resolve(cwd, normalizedRelativeScript);
  if (normalizedCommand.includes(expectedScript)) {
    return true;
  }

  const relativeScriptPattern = new RegExp(`(^|\\s)(\\.\\/)?${escapeRegex(normalizedRelativeScript)}(?=\\s|$)`);
  if (!relativeScriptPattern.test(normalizedCommand) || !processCwd) {
    return false;
  }

  return resolve(processCwd) === resolve(cwd);
}

export function matchesRepoCortexServerCommand(command, { cwd = process.cwd(), processCwd = null } = {}) {
  return matchesRepoNodeScriptCommand(command, {
    cwd,
    processCwd,
    scriptRelativePath: 'src/server.js',
  });
}

export function findRepoNodeScriptListenerPid({
  cwd = process.cwd(),
  port = '19100',
  scriptRelativePath = 'src/server.js',
  execFileSync = defaultExecFileSync,
} = {}) {
  const listeningPid = resolveListeningPid({ port, execFileSync });
  if (!listeningPid) {
    return null;
  }

  const command = readProcessCommand(listeningPid, { execFileSync });
  const processCwd = readProcessWorkingDirectory(listeningPid, { execFileSync });
  if (!matchesRepoNodeScriptCommand(command, { cwd, processCwd, scriptRelativePath })) {
    return null;
  }

  return listeningPid;
}

export function findRepoCortexServerListenerPid(options = {}) {
  return findRepoNodeScriptListenerPid({
    ...options,
    scriptRelativePath: 'src/server.js',
  });
}
