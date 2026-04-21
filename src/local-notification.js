import { spawn } from 'node:child_process';
import { resolveCodexActionUrl } from './codex-link.js';

export function isLocalNotificationChannel(channel) {
  const raw = String(channel || '').trim().toLowerCase();
  return ['local_notification', 'system_notification', 'macos_notification'].includes(raw);
}

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeForAppleScript(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

export function buildNotificationPayload(message = {}) {
  const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
  const projectId = compact(payload.projectId || payload.project_id || 'PRJ-cortex');
  const decisionId = compact(payload.decisionId || payload.decision_id || '');
  const question = compact(payload.question || '');
  const recommendation = compact(payload.recommendation || '');
  const impact = compact(payload.impact || '');
  const actionUrl = resolveCodexActionUrl(payload);
  const isRedAlert = compact(payload.type).toLowerCase() === 'red_alert';

  const title = question ? `🔴 Cortex 红灯 · ${projectId}` : `Cortex 通知 · ${projectId}`;
  const subtitle = decisionId ? `决策 ${decisionId}` : impact ? `影响 ${impact}` : '需要你看一下';
  const body =
    compact([
      question ? `问题：${question}` : compact(message.text),
      recommendation ? `推荐：${recommendation}` : null,
    ]
      .filter(Boolean)
      .join('\n')) || compact(message.text) || '你有一条新的 Cortex 通知';

  return {
    title,
    subtitle,
    body,
    actionUrl,
    actionLabel: actionUrl ? compact(payload.actionLabel || payload.action_label || '立即查看') : '',
    requiresAction: Boolean(isRedAlert && actionUrl),
  };
}

function runAppleScript(script, { spawnImpl = spawn, detached = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl('/usr/bin/osascript', ['-e', script], {
      stdio: detached ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      detached,
    });

    if (detached) {
      child.unref?.();
      resolve({
        ok: true,
        detached: true,
        pid: child.pid || null,
      });
      return;
    }

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          ok: true,
          code,
        });
        return;
      }

      reject(new Error(compact(stderr) || `osascript exited with code ${code}`));
    });
  });
}

function buildActionDialogScript(notification) {
  const title = escapeForAppleScript(notification.title);
  const body = escapeForAppleScript(
    compact([notification.body, `点击“${notification.actionLabel || '立即查看'}”将打开对应工作对话。`].join('\n\n')),
  );
  const actionLabel = escapeForAppleScript(notification.actionLabel || '立即查看');
  const actionUrl = escapeForAppleScript(notification.actionUrl);

  return [
    'activate',
    `set dialogResult to display dialog "${body}" with title "${title}" buttons {"稍后", "${actionLabel}"} default button "${actionLabel}" with icon caution giving up after 20`,
    'if (gave up of dialogResult) is false then',
    `  if button returned of dialogResult is "${actionLabel}" then`,
    `    open location "${actionUrl}"`,
    '  end if',
    'end if',
  ].join('\n');
}

export function sendMacOSNotification(notification, { spawnImpl = spawn } = {}) {
  const title = escapeForAppleScript(notification.title);
  const subtitle = escapeForAppleScript(notification.subtitle);
  const body = escapeForAppleScript(notification.body);
  const script = `display notification "${body}" with title "${title}" subtitle "${subtitle}" sound name "Glass"`;

  return runAppleScript(script, { spawnImpl }).then(async (result) => {
    if (notification.requiresAction && notification.actionUrl) {
      await runAppleScript(buildActionDialogScript(notification), {
        spawnImpl,
        detached: true,
      });
    }

    return {
      ...result,
      actionOffered: Boolean(notification.requiresAction && notification.actionUrl),
    };
  });
}
