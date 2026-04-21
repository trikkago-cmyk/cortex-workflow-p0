import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd());

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2).replaceAll('-', '_');
    const next = argv[index + 1];
    if (!next || String(next).startsWith('--')) {
      parsed[key] = '1';
      continue;
    }

    parsed[key] = String(next);
    index += 1;
  }

  return parsed;
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const body = await response.json();

  if (!response.ok || body.ok === false) {
    throw new Error(`GET ${pathname} failed: ${JSON.stringify(body)}`);
  }

  return body;
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = process.env.CORTEX_SERVER_URL || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = args.project || process.env.PROJECT_ID || '';
const commandId = args.command || process.env.COMMAND_ID || '';
const pendingLimit = Number(args.pending_limit || process.env.PENDING_LIMIT || 20);
const sentLimit = Number(args.sent_limit || process.env.SENT_LIMIT || 10);

const [health, pending, sent, command, receipts] = await Promise.all([
  getJson(baseUrl, '/health'),
  getJson(baseUrl, `/outbox?status=pending&limit=${pendingLimit}`),
  getJson(baseUrl, `/outbox?status=sent&limit=${sentLimit}`),
  commandId ? getJson(baseUrl, `/commands?command_id=${encodeURIComponent(commandId)}`) : Promise.resolve(null),
  commandId ? getJson(baseUrl, `/receipts?command_id=${encodeURIComponent(commandId)}`) : Promise.resolve(null),
]);

function filterByProject(messages) {
  if (!projectId) {
    return messages;
  }

  return (messages || []).filter((message) => {
    const payloadProjectId = message?.payload?.project_id || message?.payload?.projectId || '';
    return payloadProjectId === projectId;
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      base_url: baseUrl,
      health,
      project_id: projectId || null,
      command_id: commandId || null,
      pending: filterByProject(pending.messages || pending.pending),
      sent: filterByProject(sent.messages || []),
      command: command?.commands?.[0] || null,
      receipts: receipts?.receipts || [],
    },
    null,
    2,
  ),
);
