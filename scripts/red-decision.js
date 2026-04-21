import { isLocalNotificationChannel } from '../src/local-notification.js';

const [question, recommendation] = process.argv.slice(2);

if (!question || !recommendation) {
  console.error('Usage: node scripts/red-decision.js "<question>" "<recommendation>"');
  process.exit(1);
}

const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const channel =
  process.env.CHANNEL || process.env.NOTIFICATION_CHANNEL || process.env.CORTEX_DEFAULT_CHANNEL || 'local_notification';

const payload = {
  project_id: process.env.PROJECT_ID || 'PRJ-cortex',
  signal_level: 'red',
  question,
  recommendation,
  why_now: process.env.WHY_NOW || '当前已没有其他安全可推进工作。',
  impact_scope: process.env.IMPACT_SCOPE || 'cross_module',
  irreversible: process.env.IRREVERSIBLE === 'true',
  downstream_contamination: process.env.DOWNSTREAM_CONTAMINATION !== 'false',
  ...(channel ? { channel } : {}),
};

const sessionId = process.env.SESSION_ID || (isLocalNotificationChannel(channel) ? '' : 'local-user@corp');
if (sessionId) {
  payload.session_id = sessionId;
}

if (process.env.CODEX_THREAD_ID) {
  payload.thread_id = process.env.CODEX_THREAD_ID;
}

const response = await fetch(`${baseUrl}/decisions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || body.ok === false) {
  process.exitCode = 1;
}
