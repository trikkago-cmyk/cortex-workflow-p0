import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test('dashboard data aggregates current work, waiting items, completions, and memory candidates', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-task-dashboard-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-24T09:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    root_page_url: 'https://www.notion.so/project/cortex-dashboard',
    review_window_note: '每天 11:30 / 18:30',
  });

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '补一个可见的任务看板',
    why: '需要让我直接看到当前推进状态，而不是只看文档或终端。',
    context: '后端已经有 command、decision、checkpoint、memory 数据，但缺少前端聚合视图。',
    what: '交付一个本地 dashboard，显示正在进行、待拍板、最近完成和记忆候选。',
    status: 'in_progress',
  });

  const activeCommand = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-001',
    page_id: 'page-001',
    discussion_id: 'discussion-001',
    comment_id: 'comment-001',
    body: '把当前 Dashboard 做出来',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-001/discussion/discussion-001/comment/comment-001',
  });

  const run = await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    command_id: activeCommand.body.commandId,
    agent_name: 'agent-router',
    role: 'router',
    phase: 'execute',
    status: 'running',
    title: '正在汇总 dashboard 数据源',
    summary: '把 review、command、decision、memory 聚合成一个前端视图。',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否允许直接改动正在使用的主文档结构？',
    recommendation: '不建议直接覆盖，先用新增 dashboard 路径落地。',
    why_now: '当前要补前端可视化，但不应该打断现有文档路径。',
    impact_scope: 'cross_module',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '[TEST] 是否触发本地红灯 push 验证？',
    recommendation: '这是一条 synthetic decision，不应该默认出现在净化看板里。',
    why_now: '只用于 smoke。',
    impact_scope: 'module',
  });

  await postJson(baseUrl, '/inbox', {
    project_id: 'PRJ-cortex',
    queue: 'review',
    object_type: 'memory',
    action_type: 'human_review',
    risk_level: 'yellow',
    title: '确认这条 dashboard 设计是否进入 durable memory',
    summary: '等待你最终确认是否把“前端任务看板”纳入长期默认协作机制。',
  });

  await postJson(baseUrl, '/memory', {
    project_id: 'PRJ-cortex',
    layer: 'base_memory',
    type: 'preference',
    title: '用户希望能直接看到任务推进清单',
    summary: '当任务复杂时，需要有一个前端任务清单，让用户直接看到当前在做什么。',
    status: 'candidate',
    review_state: 'pending_accept',
    confidence: 'high',
  });

  await postJson(baseUrl, '/commands/complete', {
    command_id: activeCommand.body.commandId,
    agent_name: 'agent-router',
    result_summary: 'Dashboard 数据接口已经打通。',
  });

  await postJson(baseUrl, '/runs/update-status', {
    run_id: run.body.run.run_id,
    status: 'completed',
    summary: 'dashboard 数据聚合完成。',
    quality_grade: 'pass',
    anomaly_level: 'low',
  });

  await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    run_id: run.body.run.run_id,
    command_id: activeCommand.body.commandId,
    signal_level: 'green',
    stage: 'execute',
    status: 'passed',
    title: '任务看板数据层已就绪',
    summary: '前端已经可以拿到当前任务、待拍板事项和最近完成记录。',
    next_step: '继续补 HTML 页面，让用户直接打开查看。',
    quality_grade: 'pass',
    anomaly_level: 'low',
    created_by: 'agent-router',
  });

  const dashboard = await getJson(baseUrl, '/dashboard/data?project_id=PRJ-cortex');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.ok, true);
  assert.equal(dashboard.body.project.project_id, 'PRJ-cortex');
  assert.equal(dashboard.body.hero.current_task, '任务看板数据层已就绪');
  assert.match(dashboard.body.hero.next_step, /红灯事项需要立即拍板/);
  assert.equal(dashboard.body.counts.red_decisions, 1);
  assert.equal(dashboard.body.counts.candidate_memories, 1);
  assert.equal(dashboard.body.data_hygiene.hidden_synthetic_total, 2);
  assert.equal(dashboard.body.data_hygiene.hidden_synthetic.red_decisions, 1);
  assert.equal(dashboard.body.data_hygiene.hidden_synthetic.open_inbox, 1);
  assert.ok(dashboard.body.sections.waiting.some((item) => item.title.includes('是否允许直接改动')));
  assert.ok(dashboard.body.sections.memory_candidates.some((item) => item.title.includes('用户希望能直接看到任务推进清单')));
  assert.ok(dashboard.body.sections.completed.some((item) => item.title.includes('任务看板数据层已就绪')));
  assert.ok(!dashboard.body.sections.waiting.some((item) => item.title.includes('[TEST]')));

  const rawDashboard = await getJson(baseUrl, '/dashboard/data?project_id=PRJ-cortex&include_synthetic=1');
  assert.equal(rawDashboard.status, 200);
  assert.equal(rawDashboard.body.counts.red_decisions, 2);
  assert.equal(rawDashboard.body.data_hygiene.hidden_synthetic_total, 0);
  assert.ok(rawDashboard.body.sections.waiting.some((item) => item.title.includes('[TEST]')));
});

test('dashboard html renders a visible task board page', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-task-dashboard-html-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-04-24T10:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '任务看板 HTML 页',
    why: '需要一个前端页面直接展示任务清单。',
    context: 'JSON 聚合已经准备好了。',
    what: '补一个 `/dashboard` 页面。',
    status: 'in_progress',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '[TEST] HTML 页也不应该默认展示 smoke 决策',
    recommendation: '这条 synthetic 数据只用于验证净化视图切换。',
    why_now: '确保 HTML 页会展示原始视图切换入口。',
    impact_scope: 'module',
  });

  const response = await fetch(`${baseUrl}/dashboard?project_id=PRJ-cortex`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(html, /任务清单可视化/);
  assert.match(html, /现在在做/);
  assert.match(html, /等你拍板/);
  assert.match(html, /最近完成/);
  assert.match(html, /最近评论回流/);
  assert.match(html, /15s 后自动刷新/);
  assert.match(html, /\/dashboard\/data\?project_id=PRJ-cortex/);
  assert.match(html, /查看完整原始视图/);
});
