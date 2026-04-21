const text = process.argv.slice(2).join(' ').trim();
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';

if (!text) {
  console.error('Usage: node scripts/codex-message.js <message text>');
  process.exit(1);
}

const payload = {
  project_id: process.env.PROJECT_ID || 'PRJ-cortex',
  text,
  priority: process.env.PRIORITY || 'normal',
};

if (process.env.CHANNEL) {
  payload.channel = process.env.CHANNEL;
}

if (process.env.TARGET) {
  payload.target = process.env.TARGET;
}

const response = await fetch(`${baseUrl}/webhook/codex-message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || body.ok === false) {
  process.exitCode = 1;
}
