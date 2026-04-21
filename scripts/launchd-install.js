import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { defaultLaunchAgentPath, defaultLaunchdLabel, buildLaunchdPlist, launchctlDomain } from '../src/launchd.js';
import { loadProjectEnv } from '../src/project-env.js';

const cwd = process.cwd();
loadProjectEnv(cwd, {
  overrideKeys: ['CORTEX_BASE_URL'],
});

const label = process.env.LAUNCHD_LABEL || defaultLaunchdLabel(cwd);
const plistPath = defaultLaunchAgentPath({ cwd, label });
const intervalSeconds = Number(process.env.AUTOMATION_ENSURE_INTERVAL_SECONDS || 15);
const runtimeDir = resolve(cwd, 'tmp', 'automation-runtime');
const domain = launchctlDomain();

mkdirSync(runtimeDir, { recursive: true });
mkdirSync(dirname(plistPath), { recursive: true });

const plist = buildLaunchdPlist({
  cwd,
  label,
  intervalSeconds,
  environment: {
    PATH:
      process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: process.env.HOME,
  },
});

writeFileSync(plistPath, plist, 'utf8');

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
runLaunchctl(['bootstrap', domain, plistPath]);
runLaunchctl(['enable', `${domain}/${label}`], { allowFailure: true });
runLaunchctl(['kickstart', '-k', `${domain}/${label}`], { allowFailure: true });

console.log(
  JSON.stringify(
    {
      ok: true,
      label,
      plistPath,
      intervalSeconds,
      domain,
    },
    null,
    2,
  ),
);
