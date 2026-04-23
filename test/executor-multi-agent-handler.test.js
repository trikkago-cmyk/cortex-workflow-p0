import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';
import {
  createArchitectHandler,
  createCodexResumeHandler,
  createExecutorMultiAgentServer,
  createPmHandler,
  createRouterHandler,
} from '../src/executor-multi-agent-handler.js';

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

test('router handler derives a downstream command for unassigned comment', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-router-handler-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-27T02:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  const ingested = await postJson(`${baseUrl}/webhook/notion-comment`, {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-router',
    page_id: 'page-router',
    discussion_id: 'discussion-router-001',
    comment_id: 'comment-router-001',
    body: '[continue] 请补一版 PRD 验收标准',
    context_quote: 'PRD 草稿',
    source_url: 'notion://page/page-router/discussion/discussion-router-001/comment/comment-router-001',
  });

  const claimed = await postJson(`${baseUrl}/commands/claim-next`, {
    project_id: 'PRJ-cortex',
    source: 'notion_comment',
    only_unassigned: true,
    agent_name: 'agent-router',
  });

  const start = await postJson(`${baseUrl}/commands/start`, {
    command_id: claimed.body.command.command_id,
    agent_name: 'agent-router',
  });

  assert.equal(ingested.status, 200);
  assert.equal(start.status, 200);

  const handler = createRouterHandler({
    cortexBaseUrl: baseUrl,
  });

  const result = await handler({
    agentName: 'agent-router',
    command: start.body.command,
  });

  assert.equal(result.status, 'done');
  assert.match(result.result_summary, /delegated to agent-pm/);

  const commands = await fetch(`${baseUrl}/commands?project_id=PRJ-cortex`).then((res) => res.json());
  const child = commands.commands.find((command) => command.parent_command_id === claimed.body.command.command_id);
  assert.ok(child);
  assert.equal(child.owner_agent, 'agent-pm');
  assert.equal(child.status, 'new');
});

test('pm handler creates task brief and architect handler creates decision', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-multi-agent-actions-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-27T03:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  const runs = [];
  const runScript = (scriptName) => {
    runs.push(scriptName);
    return { scriptName };
  };

  const pmHandler = createPmHandler({
    cortexBaseUrl: baseUrl,
    runScript,
  });

  const pmResult = await pmHandler({
    agentName: 'agent-pm',
    projectId: 'PRJ-cortex',
    command: {
      command_id: 'CMD-pm-001',
      instruction: '把这段需求整理成 why/context/what',
      context_quote: '这里是需求背景',
      source: 'notion_comment',
      source_url: 'notion://page/page-001/discussion/discussion-001/comment/comment-001',
      target_type: 'page',
      target_id: 'page-001',
    },
  });

  assert.equal(pmResult.status, 'done');
  assert.match(pmResult.reply_text, /已转成 PM 任务简报/);

  const briefs = await fetch(`${baseUrl}/task-briefs?project_id=PRJ-cortex`).then((res) => res.json());
  assert.equal(briefs.briefs.length, 1);
  assert.match(briefs.briefs[0].title, /PM 跟进/);

  const architectHandler = createArchitectHandler({
    cortexBaseUrl: baseUrl,
    runScript,
    notificationChannel: 'hiredcity',
    notificationTarget: 'your-target@example.com',
  });

  const architectResult = await architectHandler({
    agentName: 'agent-architect',
    projectId: 'PRJ-cortex',
    command: {
      command_id: 'CMD-arch-001',
      instruction: '请评估 schema 变更和索引切换的影响',
      context_quote: 'RAG 链路改造',
      source_url: 'notion://page/page-002/discussion/discussion-002/comment/comment-002',
    },
  });

  assert.equal(architectResult.status, 'done');
  assert.match(architectResult.reply_text, /红灯架构决策/);

  const decisions = await fetch(`${baseUrl}/decisions?project_id=PRJ-cortex`).then((res) => res.json());
  assert.equal(decisions.decisions.length, 1);
  assert.equal(decisions.decisions[0].signal_level, 'red');
  assert.deepEqual(runs, []);
});

test('pm handler still completes when notion sync scripts fail', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-pm-best-effort-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-31T10:55:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  const runs = [];
  const pmHandler = createPmHandler({
    cortexBaseUrl: baseUrl,
    logger: { info() {}, warn() {}, error() {} },
    runScript(scriptName) {
      runs.push(scriptName);
      if (scriptName === 'project-index:notion-sync') {
        throw new Error('project index timeout');
      }
      return { scriptName };
    },
  });

  const result = await pmHandler({
    agentName: 'agent-pm',
    projectId: 'PRJ-cortex',
    command: {
      command_id: 'CMD-pm-best-effort-001',
      instruction: '@pm 把这段需求整理成 why/context/what',
      source: 'notion_comment',
      source_url: 'notion://page/page-best-effort/discussion/discussion-best-effort/comment/comment-best-effort',
      target_type: 'page',
      target_id: 'page-best-effort',
    },
  });

  assert.equal(result.status, 'done');
  assert.match(result.reply_text, /已转成 PM 任务简报/);
  assert.equal(result.warnings?.length || 0, 0);
  assert.deepEqual(runs, []);
});

test('pm handler can still run legacy notion sync when explicitly enabled', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-pm-legacy-sync-opt-in-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-31T11:05:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  const runs = [];
  const pmHandler = createPmHandler({
    cortexBaseUrl: baseUrl,
    allowLegacyNotionWrites: true,
    logger: { info() {}, warn() {}, error() {} },
    runScript(scriptName) {
      runs.push(scriptName);
      return { scriptName };
    },
  });

  const result = await pmHandler({
    agentName: 'agent-pm',
    projectId: 'PRJ-cortex',
    command: {
      command_id: 'CMD-pm-legacy-sync-001',
      instruction: '@pm 把这段需求整理成 why/context/what',
      source: 'notion_comment',
      source_url: 'notion://page/page-legacy-sync/discussion/discussion-legacy-sync/comment/comment-legacy-sync',
      target_type: 'page',
      target_id: 'page-legacy-sync',
    },
  });

  assert.equal(result.status, 'done');
  assert.deepEqual(runs, ['review:notion-sync', 'project-index:notion-sync']);
});

test('multi-agent handler server dispatches by path agent', async (t) => {
  const server = createExecutorMultiAgentServer({
    execute: async ({ agentName, command }) => ({
      ok: true,
      status: 'done',
      result_summary: `${agentName}:${command.command_id}`,
    }),
    logger: { info() {}, error() {} },
  });

  await new Promise((resolve) => server.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await server.close();
  });

  const address = server.server.address();
  const response = await postJson(`http://127.0.0.1:${address.port}/handle/agent-pm`, {
    project_id: 'PRJ-cortex',
    command: {
      command_id: 'CMD-xyz',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'done');
  assert.equal(response.body.result_summary, 'agent-pm:CMD-xyz');
});

test('multi-agent handler never returns null for generic notion-worker comments', async () => {
  const server = createExecutorMultiAgentServer({
    runScript(scriptName) {
      return { scriptName };
    },
    logger: { info() {}, error() {} },
  });

  await new Promise((resolve) => server.server.listen(0, '127.0.0.1', resolve));

  try {
    const address = server.server.address();
    const response = await postJson(`http://127.0.0.1:${address.port}/handle/agent-notion-worker`, {
      project_id: 'PRJ-cortex',
      command: {
        command_id: 'CMD-continue-001',
        source: 'notion_comment',
        instruction: '继续',
        parsed_action: 'continue',
        context_quote: '下一步：继续把多 agent 执行结果 append 回 review / execution / project index，并补强 Notion 评论 direct action 到 task brief / decision / sync action 的持续收口。',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'done');
    assert.match(
      response.body.reply_text,
      /已经成功回流到 Cortex 执行链路|当前默认主路径是 Custom Agent \+ MCP|已继续推进当前 Notion 侧收口/,
    );
    assert.match(
      response.body.result_summary,
      /acknowledged notion comment|continue notion cycle/,
    );
  } finally {
    await server.close();
  }
});

test('codex resume handler forwards command into bound Codex session', async () => {
  const runCalls = [];
  const handler = createCodexResumeHandler({
    agentConfigMap: new Map([
      [
        'agent-dark-luxury-itinerary',
        {
          agentName: 'agent-dark-luxury-itinerary',
          projectId: 'PRJ-dark-luxury-itinerary',
          extraEnv: {
            CODEX_SESSION_ID: '019d4ce1-a379-7c72-8edd-9c62e566014a',
            CODEX_THREAD_NAME: 'Dark Luxury Travel Itinerary',
          },
        },
      ],
    ]),
    runCodexResume({ sessionId, prompt }) {
      runCalls.push({ sessionId, prompt });
      return '已在 dark luxury itinerary 会话里继续执行，并更新页面草稿。';
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const result = await handler({
    agentName: 'agent-dark-luxury-itinerary',
    projectId: 'PRJ-cortex',
    command: {
      command_id: 'CMD-dark-001',
      source: 'notion_comment',
      instruction: '继续完善襄阳路书首页的 route-loop 模块',
      context_quote: '重点提升环线阅读性',
      source_url: 'notion://page/page-dark/discussion/discussion-dark/comment/comment-dark',
    },
  });

  assert.equal(runCalls.length, 1);
  assert.equal(runCalls[0].sessionId, '019d4ce1-a379-7c72-8edd-9c62e566014a');
  assert.match(runCalls[0].prompt, /项目：PRJ-dark-luxury-itinerary/);
  assert.match(runCalls[0].prompt, /命令归属：PRJ-cortex（已按 agent 绑定项目 PRJ-dark-luxury-itinerary 处理）/);
  assert.match(runCalls[0].prompt, /route-loop 模块/);
  assert.equal(result.status, 'done');
  assert.equal(result.reply_text, '已在 dark luxury itinerary 会话里继续执行，并更新页面草稿。');
  assert.equal(result.codex_thread_name, 'Dark Luxury Travel Itinerary');
});

test('codex resume handler short-circuits trivial live probe without resuming session', async () => {
  const runCalls = [];
  const handler = createCodexResumeHandler({
    agentConfigMap: new Map([
      [
        'agent-dark-luxury-itinerary',
        {
          agentName: 'agent-dark-luxury-itinerary',
          projectId: 'PRJ-dark-luxury-itinerary',
          extraEnv: {
            CODEX_SESSION_ID: '019d4ce1-a379-7c72-8edd-9c62e566014a',
            CODEX_THREAD_NAME: 'Dark Luxury Travel Itinerary',
          },
        },
      ],
    ]),
    runCodexResume({ sessionId, prompt }) {
      runCalls.push({ sessionId, prompt });
      return 'should not be called';
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const result = await handler({
    agentName: 'agent-dark-luxury-itinerary',
    projectId: 'PRJ-cortex',
    command: {
      command_id: 'CMD-dark-live-001',
      source: 'manual',
      instruction: '只回复： dark luxury itinerary agent online。不要运行命令，不要改文件。',
    },
  });

  assert.equal(runCalls.length, 0);
  assert.equal(result.status, 'done');
  assert.equal(result.skipped_resume, true);
  assert.equal(result.effective_project_id, 'PRJ-dark-luxury-itinerary');
  assert.match(result.result_summary, /connect probe ok/);
  assert.match(result.result_summary, /绑定项目：PRJ-dark-luxury-itinerary/);
  assert.match(result.result_summary, /已忽略错误项目归属：PRJ-cortex/);
});

test('codex resume handler blocks non-notion sources from resuming bound session', async () => {
  const runCalls = [];
  const handler = createCodexResumeHandler({
    agentConfigMap: new Map([
      [
        'agent-dark-luxury-itinerary',
        {
          agentName: 'agent-dark-luxury-itinerary',
          projectId: 'PRJ-dark-luxury-itinerary',
          extraEnv: {
            CODEX_SESSION_ID: '019d4ce1-a379-7c72-8edd-9c62e566014a',
            CODEX_THREAD_NAME: 'Dark Luxury Travel Itinerary',
          },
        },
      ],
    ]),
    runCodexResume({ sessionId, prompt }) {
      runCalls.push({ sessionId, prompt });
      return 'should not be called';
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const result = await handler({
    agentName: 'agent-dark-luxury-itinerary',
    projectId: 'PRJ-cortex',
    command: {
      command_id: 'CMD-dark-manual-001',
      source: 'manual',
      instruction: '继续把餐厅与住宿数据源分层补到 skill 里',
    },
  });

  assert.equal(runCalls.length, 0);
  assert.equal(result.status, 'done');
  assert.equal(result.skipped_resume, true);
  assert.equal(result.resume_blocked_reason, 'source_not_allowed');
  assert.match(result.result_summary, /来源 manual 未在允许名单/);
  assert.match(result.result_summary, /绑定项目：PRJ-dark-luxury-itinerary/);
});
