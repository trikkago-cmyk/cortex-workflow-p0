const [commandId, status, ...summaryParts] = process.argv.slice(2);
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const resultSummary = summaryParts.join(' ').trim();

if (!commandId || !status) {
  console.error('Usage: node scripts/command-status.js <command_id> <status> [result_summary]');
  process.exit(1);
}

const payload = {
  command_id: commandId,
  status,
};

if (resultSummary) {
  payload.result_summary = resultSummary;
}

if (process.env.CLAIMED_BY) {
  payload.claimed_by = process.env.CLAIMED_BY;
}

if (process.env.ACK) {
  payload.ack = process.env.ACK;
}

const response = await fetch(`${baseUrl}/commands/update-status`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || body.ok === false) {
  process.exitCode = 1;
}
