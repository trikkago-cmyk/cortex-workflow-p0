const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const agentName = process.env.AGENT_NAME;

if (!agentName) {
  console.error('AGENT_NAME is required');
  process.exit(1);
}

const payload = {
  agent_name: agentName,
  project_id: process.env.PROJECT_ID || 'PRJ-cortex',
};

if (process.env.SOURCE) {
  payload.source = process.env.SOURCE;
}

if (process.env.TARGET_TYPE) {
  payload.target_type = process.env.TARGET_TYPE;
}

if (process.env.CHANNEL) {
  payload.channel = process.env.CHANNEL;
}

if (process.env.OWNER_AGENT) {
  payload.owner_agent = process.env.OWNER_AGENT;
}

if (process.env.INCLUDE_UNASSIGNED === '1') {
  payload.include_unassigned = true;
}

if (process.env.ONLY_UNASSIGNED === '1') {
  payload.only_unassigned = true;
}

const response = await fetch(`${baseUrl}/commands/claim-next`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || body.ok === false) {
  process.exitCode = 1;
}
