import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';

function sanitizeLabelSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function dictEntries(entries = {}) {
  return Object.entries(entries)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(
      ([key, value]) =>
        `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(String(value))}</string>`,
    )
    .join('\n');
}

function arrayEntries(values = []) {
  return values
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => `    <string>${escapeXml(String(value))}</string>`)
    .join('\n');
}

export function defaultLaunchdLabel(cwd = process.cwd()) {
  const projectName = sanitizeLabelSegment(basename(resolve(cwd))) || 'cortex-workflow';
  return `com.cortex.${projectName}`;
}

export function defaultLaunchAgentPath({ cwd = process.cwd(), home = homedir(), label } = {}) {
  const resolvedLabel = label || defaultLaunchdLabel(cwd);
  return resolve(home, 'Library', 'LaunchAgents', `${resolvedLabel}.plist`);
}

export function launchctlDomain(uid = process.getuid?.()) {
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new Error('launchctl domain requires a valid user id');
  }
  return `gui/${uid}`;
}

export function buildLaunchdPlist(options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const label = options.label || defaultLaunchdLabel(cwd);
  const intervalSeconds = Math.max(10, Number(options.intervalSeconds || 15));
  const stdoutPath =
    options.stdoutPath || resolve(cwd, 'tmp', 'automation-runtime', 'launchd-supervisor.log');
  const stderrPath =
    options.stderrPath || resolve(cwd, 'tmp', 'automation-runtime', 'launchd-supervisor.error.log');
  const scriptPath =
    options.scriptPath || resolve(cwd, 'scripts', 'automation-ensure.js');
  const nodePath = options.nodePath || process.execPath;
  const environment = {
    PATH:
      options.environment?.PATH ||
      process.env.PATH ||
      '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    HOME: options.environment?.HOME || process.env.HOME || homedir(),
    ...options.environment,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>WorkingDirectory</key>
  <string>${escapeXml(cwd)}</string>
  <key>ProgramArguments</key>
  <array>
${arrayEntries([nodePath, scriptPath])}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${intervalSeconds}</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${dictEntries(environment)}
  </dict>
</dict>
</plist>
`;
}
