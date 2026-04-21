import { isLocalNotificationChannel } from '../src/local-notification.js';

const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const channel =
  process.env.CHANNEL || process.env.NOTIFICATION_CHANNEL || process.env.CORTEX_DEFAULT_CHANNEL || 'local_notification';
const question = process.argv[2] || `本地红灯通知 smoke ${Date.now()}`;
const recommendation = process.argv[3] || '建议先停住，等待你拍板';
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response) {
  const body = await response.text();
  return body ? JSON.parse(body) : {};
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const payload = await readJson(response);

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status} ${pathname}`);
  }

  return payload;
}

function matchQuestion(message) {
  if (!message) {
    return false;
  }

  if (String(message.text || '').includes(question)) {
    return true;
  }

  return String(message.payload?.question || '').includes(question);
}

async function findOutboxMessage(status) {
  const payload = await requestJson(`/outbox?status=${encodeURIComponent(status)}&limit=20`);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  return messages.find(matchQuestion) || null;
}

const payload = {
  project_id: projectId,
  signal_level: 'red',
  question,
  recommendation,
  why_now: '本地通知链路 smoke 验证',
  impact_scope: 'module',
  channel,
};

if (!isLocalNotificationChannel(channel)) {
  payload.session_id = process.env.SESSION_ID || 'local-user@corp';
}

if (process.env.CODEX_THREAD_ID) {
  payload.thread_id = process.env.CODEX_THREAD_ID;
}

const created = await requestJson('/decisions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const deadline = Date.now() + timeoutMs;
let pending = null;
let sent = null;
let failed = null;

while (Date.now() < deadline) {
  sent = await findOutboxMessage('sent');
  if (sent) {
    break;
  }

  failed = await findOutboxMessage('failed');
  if (failed) {
    break;
  }

  pending = await findOutboxMessage('pending');
  await sleep(500);
}

if (failed) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        created,
        failed,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (!sent) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'Timed out waiting for sent outbox message',
        created,
        pending,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      created,
      sent,
    },
    null,
    2,
  ),
);
