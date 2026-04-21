import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { defaultLaunchAgentPath, defaultLaunchdLabel, launchctlDomain } from '../src/launchd.js';

const cwd = process.cwd();
const label = process.env.LAUNCHD_LABEL || defaultLaunchdLabel(cwd);
const plistPath = defaultLaunchAgentPath({ cwd, label });
const domain = launchctlDomain();
const runtimeDir = resolve(cwd, 'tmp', 'automation-runtime');
const stdoutPath = resolve(runtimeDir, 'launchd-supervisor.log');
const stderrPath = resolve(runtimeDir, 'launchd-supervisor.error.log');

function tailFile(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  const lines = readFileSync(filePath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  return lines.slice(-10);
}

const domainResult = spawnSync('launchctl', ['print', domain], {
  cwd,
  encoding: 'utf8',
});
const domainStdout = domainResult.stdout || '';
const loaded = domainResult.status === 0 && domainStdout.includes(label);
const labelLine =
  domainStdout
    .split(/\r?\n/)
    .find((line) => line.includes(label))
    ?.trim() || null;

console.log(
  JSON.stringify(
    {
      ok: true,
      label,
      plistPath,
      installed: existsSync(plistPath),
      loaded,
      domain,
      stdoutPath,
      stderrPath,
      launchctl: {
        status: domainResult.status ?? 1,
        labelLine,
        stderr: domainResult.stderr.trim() || null,
      },
      logs: {
        stdoutTail: tailFile(stdoutPath),
        stderrTail: tailFile(stderrPath),
      },
    },
    null,
    2,
  ),
);
