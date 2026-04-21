const action = process.argv[2];
const instruction = process.argv.slice(3).join(' ').trim();
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';

if (!action) {
  console.error('Usage: node scripts/im-action.js <action> [instruction]');
  process.exit(1);
}

const payload = {
  project_id: process.env.PROJECT_ID || 'PRJ-cortex',
  target_type: process.env.TARGET_TYPE || 'decision',
  target_id: process.env.TARGET_ID || null,
  action,
  instruction: instruction || process.env.INSTRUCTION || action,
  session_id: process.env.SESSION_ID || 'local-user@corp',
  message_id: process.env.MESSAGE_ID || `msg-action-${Date.now()}`,
  user_id: process.env.USER_ID || process.env.SESSION_ID || 'local-user@corp',
};

const response = await fetch(`${baseUrl}/webhook/im-action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || body.ok === false) {
  process.exitCode = 1;
}
