import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { defaultLaunchAgentPath, defaultLaunchdLabel, launchctlDomain } from '../src/launchd.js';

const cwd = process.cwd();
const label = process.env.LAUNCHD_LABEL || defaultLaunchdLabel(cwd);
const plistPath = defaultLaunchAgentPath({ cwd, label });
const domain = launchctlDomain();

function runLaunchctl(args, { allowFailure = false } = {}) {
  const result = spawnSync('launchctl', args, {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      [
        `launchctl ${args.join(' ')} failed`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

runLaunchctl(['bootout', domain, plistPath], { allowFailure: true });

if (existsSync(plistPath)) {
  rmSync(plistPath, { force: true });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      label,
      plistPath,
      removed: !existsSync(plistPath),
    },
    null,
    2,
  ),
);
