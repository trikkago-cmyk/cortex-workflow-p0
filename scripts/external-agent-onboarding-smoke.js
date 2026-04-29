import http from 'node:http';
import { createExecutorWorker } from '../src/executor-worker.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

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

function compact(value) {
  return String(value ?? '').trim();
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

async function readJson(response) {
  const body = await response.text();
  return body ? JSON.parse(body) : {};
}

async function requestJson(baseUrl, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await readJson(response);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status} ${pathname}`);
  }

  return payload;
}

async function listen(server) {
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  return `http://127.0.0.1:${server.address().port}`;
}

function buildCommentIds(prefix) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    pageId: `${prefix}-page-${stamp}`,
    discussionId: `${prefix}-discussion-${stamp}`,
    commentId: `${prefix}-comment-${stamp}`,
  };
}

async function startMockAgentServer({ mode, baseUrl, agentName }) {
  const deliveries = [];
  const forwarded = [];

  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'external-agent-smoke-stub', mode }));
      return;
    }

    if (req.method === 'POST' && req.url === '/handle') {
      const body = await readJsonBody(req);
      deliveries.push(body);

      if (mode === 'sync') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            status: 'done',
            reply_text: `${agentName} 已同步处理 smoke 命令。`,
            result_summary: `${agentName} sync smoke handled ${body?.command?.command_id || 'unknown-command'}`,
          }),
        );
        return;
      }

      const bridgeResponse = await fetch(`${baseUrl}/webhook/codex-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...body,
          channel: 'smoke',
          target: 'external-agent-smoke@local',
          callback_base_url: baseUrl,
        }),
      });
      const bridgePayload = await readJson(bridgeResponse);

      if (!bridgeResponse.ok || bridgePayload.ok === false) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: bridgePayload.error || `bridge failed: HTTP ${bridgeResponse.status}`,
          }),
        );
        return;
      }

      forwarded.push(bridgePayload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(bridgePayload));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });

  const serverBaseUrl = await listen(server);

  return {
    webhookUrl: `${serverBaseUrl}/handle`,
    healthUrl: `${serverBaseUrl}/health`,
    deliveries,
    forwarded,
    async close() {
      await new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      });
    },
  };
}

async function findOutboxMessage(baseUrl, { commandId, agentName }) {
  for (const status of ['pending', 'sent']) {
    const payload = await requestJson(baseUrl, `/outbox?status=${status}&limit=50`);
    const messages = Array.isArray(payload.messages)
      ? payload.messages
      : Array.isArray(payload.pending)
        ? payload.pending
        : [];
    const matched = messages.find((message) => {
      const handoffAgent = compact(message?.payload?.handoff_agent || message?.payload?.handoffAgent);
      const payloadCommandId = compact(message?.payload?.command_id || message?.payload?.commandId);
      return handoffAgent === agentName && payloadCommandId === commandId;
    });
    if (matched) {
      return matched;
    }
  }

  return null;
}

const args = parseArgs(process.argv.slice(2));
const mode = compact(args.mode || process.env.EXTERNAL_AGENT_SMOKE_MODE || 'sync').toLowerCase();
const baseUrl = compact(args.base_url || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100');
const projectId = compact(args.project || process.env.PROJECT_ID || `PRJ-cortex-agent-smoke-${mode}`);
const agentName = compact(args.agent || process.env.AGENT_NAME || `agent-smoke-${mode}`);
const alias = compact(args.alias || `${mode}-smoke`);
const logger = {
  info() {},
  warn() {},
  error() {},
};

if (!['sync', 'handoff'].includes(mode)) {
  throw new Error(`Unsupported --mode ${mode}. Use sync or handoff.`);
}

const ids = buildCommentIds(mode);
const mockAgent = await startMockAgentServer({
  mode,
  baseUrl,
  agentName,
});

try {
  await requestJson(baseUrl, '/projects/upsert', {
    method: 'POST',
    body: {
      project_id: projectId,
      name: `External Agent Smoke ${mode}`,
      status: 'active',
    },
  });

  const connect = await requestJson(baseUrl, '/connect/agents', {
    method: 'POST',
    body: {
      agent_name: agentName,
      aliases: [alias],
      webhook_url: mockAgent.webhookUrl,
      project_id: projectId,
      source: 'notion_comment',
      mode: 'webhook',
      handler_kind: 'external_webhook',
    },
  });

  const verify = await requestJson(
    baseUrl,
    `/connect/agents/${encodeURIComponent(agentName)}/verify`,
    {
      method: 'POST',
      body: {
        network: true,
        health_url: mockAgent.healthUrl,
      },
    },
  );

  const ingest = await requestJson(baseUrl, '/webhook/notion-custom-agent', {
    method: 'POST',
    body: {
      project_id: projectId,
      page_id: ids.pageId,
      discussion_id: ids.discussionId,
      comment_id: ids.commentId,
      body: `@${alias} 请执行 external agent onboarding smoke`,
      owner_agent: agentName,
      invoked_agent: agentName,
      source_url: `notion://page/${ids.pageId}/discussion/${ids.discussionId}/comment/${ids.commentId}`,
    },
  });

  const commandId = compact(ingest.command_id || ingest.commandId);
  invariant(commandId, 'Missing command_id from notion custom agent ingest');

  const worker = createExecutorWorker({
    baseUrl,
    agentName,
    projectId,
    source: 'notion_comment',
    ownerAgent: agentName,
    mode: 'webhook',
    webhookUrl: mockAgent.webhookUrl,
    logger,
    pollIntervalMs: 10,
  });

  const workerResult = await worker.pollOnce();
  const commandListing = await requestJson(
    baseUrl,
    `/commands?command_id=${encodeURIComponent(commandId)}&project_id=${encodeURIComponent(projectId)}`,
  );
  const command = Array.isArray(commandListing.commands) ? commandListing.commands[0] || null : null;

  invariant(workerResult.claimed === true, 'Executor worker did not claim the smoke command');
  invariant(mockAgent.deliveries.length > 0, 'External agent stub did not receive the command');
  invariant(command?.status === 'done', 'Smoke command did not finish as done');

  let handoffOutbox = null;
  let receipt = null;
  let receipts = null;

  if (mode === 'handoff') {
    invariant(mockAgent.forwarded.length > 0, 'Handoff bridge did not forward command into codex-message');

    handoffOutbox = await findOutboxMessage(baseUrl, {
      commandId,
      agentName,
    });
    invariant(handoffOutbox, 'Failed to locate handoff outbox message for smoke command');

    receipt = await requestJson(baseUrl, '/webhook/agent-receipt', {
      method: 'POST',
      body: {
        commandId,
        projectId,
        agentName,
        status: 'success',
        receiptType: 'result',
        summary: `${agentName} handoff smoke completed`,
        details: 'External agent handoff -> receipt path verified',
        signalLevel: 'green',
        channel: 'smoke',
        target: 'external-agent-smoke@local',
        idempotencyKey: `${agentName}-${commandId}-result-001`,
        replyText: `${agentName} 已完成 handoff 回执 smoke。`,
      },
    });

    receipts = await requestJson(baseUrl, `/receipts?command_id=${encodeURIComponent(commandId)}`);
    invariant(Array.isArray(receipts.receipts) && receipts.receipts.length > 0, 'Receipt was not persisted');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        agent_name: agentName,
        project_id: projectId,
        connect,
        verify,
        ingest,
        worker: workerResult,
        command,
        deliveries: mockAgent.deliveries,
        forwarded: mockAgent.forwarded,
        handoff_outbox: handoffOutbox,
        receipt,
        receipts,
      },
      null,
      2,
    ),
  );
} finally {
  await mockAgent.close();
}
