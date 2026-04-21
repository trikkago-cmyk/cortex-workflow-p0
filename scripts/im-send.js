const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const text = process.argv.slice(2).join(' ').trim();

if (!text) {
  console.error('Usage: node scripts/im-send.js <message text>');
  process.exit(1);
}

const payload = {
  project_id: process.env.PROJECT_ID || 'PRJ-cortex',
  target_type: process.env.TARGET_TYPE || 'milestone',
  target_id: process.env.TARGET_ID || null,
  text,
  session_id: process.env.SESSION_ID || 'local-user@corp',
  message_id: process.env.MESSAGE_ID || `msg-${Date.now()}`,
  user_id: process.env.USER_ID || process.env.SESSION_ID || 'local-user@corp',
};

const response = await fetch(`${baseUrl}/webhook/im-message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || body.ok === false) {
  process.exitCode = 1;
}
