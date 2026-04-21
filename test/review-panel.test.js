import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

test('builds a project review panel with notion comment activity and markdown output', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-review-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-24T12:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const projectUpdate = await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    root_page_url: 'https://www.notion.so/project/cortex-review-page',
    review_window_note: '每天 11:30 / 18:30 review',
  });

  assert.equal(projectUpdate.status, 200);
  assert.equal(projectUpdate.body.project.root_page_url, 'https://www.notion.so/project/cortex-review-page');

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: 'Notion Review 面板接入',
    why: '需要把任务、决策、执行状态统一收口到可 review 的文档面板。',
    context: '当前 Cortex 已有 task brief、commands、decisions 和 outbox，但还没有统一 review 页面。',
    what: '交付一个项目 review snapshot，支持 Notion 评论回流和 markdown 渲染。',
    status: 'aligned',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否切换到新的 Review Panel 模板？',
    recommendation: '建议切换，减少后续文档漂移。',
    why_now: '当前正在搭 Notion review 面板，模板会影响后续文档结构。',
    impact_scope: 'cross_module',
    downstream_contamination: true,
    session_id: 'your-user@corp',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'yellow',
    question: '是否把历史里程碑折叠到压缩章节？',
    recommendation: '建议先记录，等 review 时确认。',
    why_now: '当前不阻塞实现，但会影响文档可读性。',
    impact_scope: 'module',
  });

  await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'milestone',
    target_id: 'M-20260324-review',
    page_id: 'page-001',
    discussion_id: 'discussion-001',
    comment_id: 'comment-001',
    body: '[improve: 把 review 面板里的队列摘要再压短一点]',
    context_quote: '旧的 Queue 摘要太长了',
    anchor_block_id: 'block-001',
  });

  const review = await getJson(baseUrl, '/project-review?project_id=PRJ-cortex');
  assert.equal(review.status, 200);
  assert.equal(review.body.ok, true);
  assert.equal(review.body.project.project_id, 'PRJ-cortex');
  assert.equal(review.body.project.root_page_url, 'https://www.notion.so/project/cortex-review-page');
  assert.equal(review.body.summary.red_decisions.length, 1);
  assert.equal(review.body.summary.yellow_decisions.length, 1);
  assert.equal(review.body.summary.notion_commands.length, 1);
  assert.match(review.body.markdown, /工作台入口/);
  assert.match(review.body.markdown, /当前任务/);
  assert.match(review.body.markdown, /🟢 核心进展/);
  assert.match(review.body.markdown, /决策状态：🔴/);
  assert.match(review.body.markdown, /下一步：/);
  assert.match(review.body.markdown, /最近同步：/);
  assert.match(review.body.markdown, /review 面板里的队列摘要再压短一点/);
  assert.doesNotMatch(review.body.markdown, /\[improve:/);
  assert.match(review.body.markdown, /https:\/\/www\.notion\.so\/project\/cortex-review-page/);
});

test('project review prefers latest brief as next step when no blocker is present', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-review-next-step-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-31T06:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '真实 Notion 新评论 direct action 验证与 checkpoint 收口',
    why: '本地 multi-agent live smoke 已通过，需要把当前阶段显式收口。',
    context: '默认评论路由、executor pool 和 multi-agent handler 已经接实。',
    what: '交付一个新的可见 checkpoint，并为下一条真实 Notion 新评论触发动作做好收口。',
    status: 'in_progress',
  });

  const review = await getJson(baseUrl, '/project-review?project_id=PRJ-cortex');
  assert.equal(review.status, 200);
  assert.equal(review.body.ok, true);
  assert.match(review.body.summary.next_steps[0], /继续推进：交付一个新的可见 checkpoint/);
  assert.match(review.body.markdown, /下一步：继续推进：交付一个新的可见 checkpoint/);
});

test('project review prefers latest checkpoint over brief when checkpoint exists', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-review-checkpoint-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-03-31T07:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const brief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '旧 brief 标题',
    why: '需要一个旧的方向对齐记录。',
    context: '当前已经进入更后面的执行阶段。',
    what: '继续推进旧方向。',
    status: 'aligned',
  });

  const run = await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    brief_id: brief.body.brief.brief_id,
    command_id: 'CMD-20260331-900',
    agent_name: 'agent-evaluator',
    role: 'evaluator',
    phase: 'evaluate',
    status: 'running',
    title: '执行质量检查',
    summary: '检查当前链路是否已经形成稳定 checkpoint。',
  });

  await postJson(baseUrl, '/runs/update-status', {
    run_id: run.body.run.run_id,
    status: 'completed',
    summary: '执行质量检查已完成。',
    quality_grade: 'pass',
    anomaly_level: 'low',
  });

  await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    run_id: run.body.run.run_id,
    brief_id: brief.body.brief.brief_id,
    command_id: 'CMD-20260331-900',
    signal_level: 'green',
    stage: 'evaluate',
    status: 'passed',
    title: '质量检查通过',
    summary: '当前链路稳定，已经具备继续扩展下一阶段的条件。',
    next_step: '继续接入多 agent executor 常驻协议。',
    quality_grade: 'pass',
    anomaly_level: 'low',
    created_by: 'agent-evaluator',
  });

  const review = await getJson(baseUrl, '/project-review?project_id=PRJ-cortex');
  assert.equal(review.status, 200);
  assert.equal(review.body.summary.latest_checkpoint.title, '质量检查通过');
  assert.match(review.body.summary.next_steps[0], /继续接入多 agent executor 常驻协议/);
  assert.match(review.body.markdown, /当前任务：质量检查通过/);
  assert.match(review.body.markdown, /当前阶段：evaluate \/ passed \/ pass \/ low/);
});
