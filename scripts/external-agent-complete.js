import { readFileSync } from 'node:fs';
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

function parseJsonInput(label, raw, fallback) {
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`${label} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

function inferStatus(signal, explicitStatus) {
  if (explicitStatus) {
    return explicitStatus;
  }

  return signal === 'red' ? 'failed' : 'completed';
}

function inferReceiptType(status, signal, explicitType) {
  if (explicitType) {
    return explicitType;
  }

  if (signal === 'red' || status === 'failed') {
    return 'alert';
  }
  if (status === 'acknowledged' || status === 'read' || status === 'delivered') {
    return 'status_update';
  }
  return 'result';
}

function buildIdempotencyKey({ explicitKey, agentName, commandId, receiptType }) {
  if (explicitKey) {
    return explicitKey;
  }

  const dateBucket = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = String(commandId || '').slice(-8) || 'command';
  const normalizedAgent = String(agentName || 'agent').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `${normalizedAgent}-${dateBucket}-${suffix}-${receiptType}`;
}

const args = parseArgs(process.argv.slice(2));

const handoffPayload = args.handoff_json
  ? parseJsonInput('handoff_json', args.handoff_json, null)
  : args.handoff_file
    ? parseJsonInput('handoff_file', readFileSync(args.handoff_file, 'utf8'), null)
    : null;

const callbackUrl =
  args.callback_url ||
  handoffPayload?.callback_url ||
  process.env.CALLBACK_URL ||
  `${process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100'}/webhook/agent-receipt`;

const commandId = args.command || handoffPayload?.command_id;
const projectId = args.project || handoffPayload?.project_id || process.env.PROJECT_ID;
const target = args.target || handoffPayload?.target || process.env.TARGET || process.env.SESSION_ID;
const sessionId = args.session || handoffPayload?.target || process.env.SESSION_ID || target;
const channel = args.channel || handoffPayload?.channel || process.env.CHANNEL || 'hiredcity';
const agentName = args.agent || process.env.AGENT_NAME;
const signal = args.signal || 'green';
const status = inferStatus(signal, args.status);
const receiptType = inferReceiptType(status, signal, args.type);
const metrics = parseJsonInput('metrics_json', args.metrics_json || '', {});
const artifacts = parseJsonInput('artifacts_json', args.artifacts_json || '', []);
const decisionContext = parseJsonInput('decision_context_json', args.decision_context_json || '', null);
const payloadExtra = parseJsonInput('payload_json', args.payload_json || '', {});
const summary = args.summary || payloadExtra?.summary;
const details = args.details || payloadExtra?.details || '';

if (!commandId || !agentName || !summary) {
  console.error(
    'Usage: npm run agent:complete -- --handoff-json \'{"command_id":"CMD-xxx","callback_url":"http://..."}\' --agent agent-panghu --signal green --summary "任务完成"',
  );
  process.exit(1);
}

const payload = {
  command_id: commandId,
  project_id: projectId || undefined,
  session_id: sessionId || undefined,
  agent_name: agentName,
  status,
  receipt_type: receiptType,
  payload: {
    ...payloadExtra,
    summary,
    details,
    metrics,
    artifacts: Array.isArray(artifacts) ? artifacts : [artifacts],
  },
  signal,
  channel,
  target: target || undefined,
  timestamp: new Date().toISOString(),
  idempotency_key: buildIdempotencyKey({
    explicitKey: args.idempotency,
    agentName,
    commandId,
    receiptType,
  }),
  reply_text: args.reply || undefined,
  next_step: args.next || undefined,
};

if (decisionContext) {
  payload.payload.decision_context = decisionContext;
}

const response = await fetch(callbackUrl, {
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
