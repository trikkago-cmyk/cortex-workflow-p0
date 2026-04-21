const [decisionId, status] = process.argv.slice(2);
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';

if (!decisionId || !status) {
  console.error('Usage: node scripts/decision-status.js <decision_id> <status>');
  process.exit(1);
}

const response = await fetch(`${baseUrl}/decisions/update-status`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    decision_id: decisionId,
    status,
  }),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || body.ok === false) {
  process.exitCode = 1;
}
