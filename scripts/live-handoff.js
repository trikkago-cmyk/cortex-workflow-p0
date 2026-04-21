import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd());

function parseArgs(argv) {
  const parsed = {
    _: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) {
      parsed._.push(token);
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

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();

  if (!response.ok || body.ok === false) {
    throw new Error(`POST ${pathname} failed: ${JSON.stringify(body)}`);
  }

  return body;
}

const args = parseArgs(process.argv.slice(2));
const text = args._.join(' ').trim();
const baseUrl = process.env.CORTEX_SERVER_URL || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = args.project || process.env.PROJECT_ID || 'PRJ-cortex-e2e-live';
const agentName = args.agent || process.env.AGENT_NAME || 'agent-panghu';
const sessionId = args.session || process.env.SESSION_ID || process.env.TARGET || 'your-target@example.com';
const channel = args.channel || process.env.CHANNEL || process.env.NOTIFICATION_CHANNEL || 'hiredcity';
const callbackBaseUrl = args.callback_base_url || process.env.CALLBACK_BASE_URL || process.env.CORTEX_BASE_URL || baseUrl;
const messageId =
  args.message_id ||
  process.env.MESSAGE_ID ||
  `msg_live_handoff_${new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)}`;
const sourceUrl =
  args.source_url || `im://session/${sessionId}/message/${messageId}`;

if (!text) {
  console.error(
    'Usage: npm run handoff:live -- --agent agent-panghu --project PRJ-cortex-e2e-live --session your-target@example.com "请接手这条 live 验证任务"',
  );
  process.exit(1);
}

const ingested = await postJson(baseUrl, '/webhook/im-message', {
  project_id: projectId,
  text,
  session_id: sessionId,
  message_id: messageId,
  user_id: sessionId,
});

const handoff = await postJson(baseUrl, '/webhook/codex-message', {
  agent_name: agentName,
  project_id: projectId,
  channel,
  target: sessionId,
  callback_base_url: callbackBaseUrl,
  command: {
    command_id: ingested.commandId,
    instruction: `@${agentName} ${text}`,
    source: 'openclaw_im_message',
    owner_agent: agentName,
    source_url: sourceUrl,
  },
});

console.log(
  JSON.stringify(
    {
      ok: true,
      project_id: projectId,
      command_id: ingested.commandId,
      outbox_id: handoff.outbox_id,
      channel,
      target: sessionId,
      callback_url: handoff.callback_url,
      source_url: sourceUrl,
    },
    null,
    2,
  ),
);
