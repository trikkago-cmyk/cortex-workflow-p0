import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd());

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
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

function inferReceiptType(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (raw === 'failed') {
    return 'alert';
  }
  if (raw === 'acknowledged' || raw === 'read' || raw === 'delivered') {
    return 'status_update';
  }
  return 'result';
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const payloadJson = args.payload_json || args.payload;
let parsedPayload = undefined;
if (payloadJson) {
  parsedPayload = JSON.parse(payloadJson);
}

const payload = {
  command_id: args.command,
  agent_name: args.agent,
  status: args.status || 'completed',
  receipt_type: args.type || inferReceiptType(args.status || 'completed'),
  signal_level: args.signal || undefined,
  result_summary: args.summary || undefined,
  reply_text: args.reply || undefined,
  next_step: args.next || undefined,
  quality_grade: args.quality || undefined,
  anomaly_level: args.anomaly || undefined,
  project_id: args.project || undefined,
  session_id: args.session || undefined,
  channel: args.channel || undefined,
  target: args.target || undefined,
  idempotency_key: args.idempotency || undefined,
  parent_receipt_id: args.parent_receipt || undefined,
  payload: parsedPayload,
};

if (!payload.command_id || !payload.agent_name) {
  console.error(
    'Usage: npm run agent:receipt -- --command CMD-xxx --agent agent-panghu [--status completed] [--type result] [--reply ...] [--payload-json \'{"summary":"..."}\']',
  );
  process.exit(1);
}

const response = await fetch(`${baseUrl}/webhook/agent-receipt`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const body = await response.json();
if (!response.ok || body.ok === false) {
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(body, null, 2));
