import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';
import { createExecutorMultiAgentServer } from '../src/executor-multi-agent-handler.js';
import { loadExecutorPoolConfig } from '../src/executor-pool.js';
import { createExecutorWorker } from '../src/executor-worker.js';

function listen(server, host = '127.0.0.1', port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

async function closeQuietly(app) {
  if (!app) {
    return;
  }

  if (typeof app.close === 'function') {
    try {
      await Promise.resolve(app.close());
    } catch {}
    return;
  }

  if (app.server && typeof app.server.close === 'function') {
    await new Promise((resolve) => app.server.close(() => resolve()));
  }
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

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(`GET ${pathname} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const sandboxDir = mkdtempSync(join(tmpdir(), 'cortex-executor-pool-live-'));
  const dbPath = join(sandboxDir, 'cortex.db');
  const routingFile = join(sandboxDir, 'executor-routing.json');
  const poolFile = join(sandboxDir, 'executor-workers.json');

  writeFileSync(
    poolFile,
    JSON.stringify(
      {
        defaults: {
          project_id: 'PRJ-cortex',
          source: 'notion_comment',
          mode: 'webhook',
          routing_file: routingFile,
          poll_interval_ms: 100,
        },
        workers: [
          {
            agent_name: 'agent-router',
            owner_agent: null,
            only_unassigned: true,
          },
          {
            agent_name: 'agent-pm',
            owner_agent: 'agent-pm',
          },
          {
            agent_name: 'agent-architect',
            owner_agent: 'agent-architect',
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );

  const serverApp = createCortexServer({
    dbPath,
    clock: () => new Date('2026-03-26T10:00:00.000Z'),
  });
  const serverAddress = await listen(serverApp.server);
  const baseUrl = `http://127.0.0.1:${serverAddress.port}`;
  const runScript = (scriptName) => ({ scriptName, skipped: true });
  const handlerApp = createExecutorMultiAgentServer({
    cortexBaseUrl: baseUrl,
    notificationChannel: 'hiredcity',
    notificationTarget: 'your-target@example.com',
    runScript,
    logger: { info() {}, error() {} },
  });
  const handlerAddress = await listen(handlerApp.server);
  const handlerBaseUrl = `http://127.0.0.1:${handlerAddress.port}`;

  writeFileSync(
    routingFile,
    JSON.stringify(
      {
        default: { url: `${handlerBaseUrl}/handle/default` },
        agents: {
          'agent-router': { url: `${handlerBaseUrl}/handle/agent-router` },
          'agent-pm': { url: `${handlerBaseUrl}/handle/agent-pm` },
          'agent-architect': { url: `${handlerBaseUrl}/handle/agent-architect` },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  try {
    const unrouted = await postJson(baseUrl, '/webhook/notion-comment', {
      project_id: 'PRJ-cortex',
      target_type: 'page',
      target_id: 'page-router',
      page_id: 'page-router',
      discussion_id: 'discussion-router-live',
      comment_id: 'comment-router-live',
      body: '[continue] 请补一版 PRD 验收标准',
      context_quote: '这里是待补充的 PRD 片段',
      source_url: 'notion://page/page-router/discussion/discussion-router-live/comment/comment-router-live',
    });

    const architectComment = await postJson(baseUrl, '/webhook/notion-comment', {
      project_id: 'PRJ-cortex',
      target_type: 'page',
      target_id: 'page-arch',
      page_id: 'page-arch',
      discussion_id: 'discussion-arch-live',
      comment_id: 'comment-arch-live',
      body: '[agent: agent-architect] [improve: 请评估 schema 变更和索引切换的影响]',
      context_quote: 'RAG 链路改造',
      source_url: 'notion://page/page-arch/discussion/discussion-arch-live/comment/comment-arch-live',
    });

    const pool = loadExecutorPoolConfig(poolFile);
    const logger = { info() {}, error() {} };

    const routerConfig = pool.workers.find((worker) => worker.agentName === 'agent-router');
    const pmConfig = pool.workers.find((worker) => worker.agentName === 'agent-pm');
    const architectConfig = pool.workers.find((worker) => worker.agentName === 'agent-architect');

    const routerWorker = createExecutorWorker({
      baseUrl,
      agentName: routerConfig.agentName,
      source: routerConfig.source,
      ownerAgent: routerConfig.ownerAgent,
      includeUnassigned: routerConfig.includeUnassigned,
      onlyUnassigned: routerConfig.onlyUnassigned,
      mode: routerConfig.mode,
      routingFile,
      logger,
    });

    const pmWorker = createExecutorWorker({
      baseUrl,
      agentName: pmConfig.agentName,
      source: pmConfig.source,
      ownerAgent: pmConfig.ownerAgent,
      includeUnassigned: pmConfig.includeUnassigned,
      onlyUnassigned: pmConfig.onlyUnassigned,
      mode: pmConfig.mode,
      routingFile,
      logger,
    });

    const architectWorker = createExecutorWorker({
      baseUrl,
      agentName: architectConfig.agentName,
      source: architectConfig.source,
      ownerAgent: architectConfig.ownerAgent,
      includeUnassigned: architectConfig.includeUnassigned,
      onlyUnassigned: architectConfig.onlyUnassigned,
      mode: architectConfig.mode,
      routingFile,
      logger,
    });

    const routerResult = await routerWorker.pollOnce();
    const pmResult = await pmWorker.pollOnce();
    const architectResult = await architectWorker.pollOnce();

    assert.equal(routerResult.claimed, true);
    assert.equal(pmResult.claimed, true);
    assert.equal(architectResult.claimed, true);
    assert.equal(routerResult.handled.status, 'done');
    assert.equal(pmResult.handled.status, 'done');
    assert.equal(architectResult.handled.status, 'done');
    assert.match(routerResult.handled.resultSummary, /agent-router/);
    assert.match(pmResult.handled.resultSummary, /agent-pm.*task brief|task brief/i);
    assert.match(architectResult.handled.resultSummary, /agent-architect.*decision|decision/i);

    const commands = await getJson(baseUrl, '/commands?project_id=PRJ-cortex');
    const routerCommand = commands.commands.find((command) => command.command_id === unrouted.commandId);
    const architectCommand = commands.commands.find((command) => command.command_id === architectComment.commandId);
    const routedChild = commands.commands.find((command) => command.parent_command_id === unrouted.commandId);
    const pmCommand = commands.commands.find((command) => command.command_id === routedChild?.command_id);

    assert.equal(routerCommand?.status, 'done');
    assert.equal(routerCommand?.claimed_by, 'agent-router');
    assert.equal(routedChild?.owner_agent, 'agent-pm');
    assert.equal(pmCommand?.status, 'done');
    assert.equal(pmCommand?.claimed_by, 'agent-pm');
    assert.equal(architectCommand?.status, 'done');
    assert.equal(architectCommand?.claimed_by, 'agent-architect');

    const briefs = await getJson(baseUrl, '/task-briefs?project_id=PRJ-cortex');
    const decisions = await getJson(baseUrl, '/decisions?project_id=PRJ-cortex');
    assert.equal(briefs.briefs.length, 1);
    assert.equal(decisions.decisions.length, 1);
    assert.equal(decisions.decisions[0].signal_level, 'red');

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          handlerBaseUrl,
          commands: {
            router: {
              commandId: unrouted.commandId,
              claimedBy: routerCommand.claimed_by,
              status: routerCommand.status,
              resultSummary: routerCommand.result_summary,
            },
            pm: {
              commandId: routedChild.command_id,
              claimedBy: pmCommand.claimed_by,
              status: pmCommand.status,
              resultSummary: pmCommand.result_summary,
            },
            architect: {
              commandId: architectComment.commandId,
              claimedBy: architectCommand.claimed_by,
              status: architectCommand.status,
              resultSummary: architectCommand.result_summary,
            },
          },
          artifacts: {
            briefId: briefs.briefs[0].brief_id,
            decisionId: decisions.decisions[0].decision_id,
            decisionSignal: decisions.decisions[0].signal_level,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await closeQuietly(serverApp);
    await closeQuietly(handlerApp);
    rmSync(sandboxDir, { recursive: true, force: true });
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
