import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';
import { buildWorkspaceHeroActionQueue, renderWorkspacePage } from '../src/task-dashboard.js';

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

test('workspace data projects waiting, running, and completed tasks into one board model', async (t) => {
  const originalPublicUrl = process.env.CORTEX_MCP_PUBLIC_URL;
  const originalBearer = process.env.CORTEX_MCP_BEARER_TOKEN;
  process.env.CORTEX_MCP_PUBLIC_URL = 'https://cortex.example.com/mcp';
  process.env.CORTEX_MCP_BEARER_TOKEN = 'test-bearer-token';
  t.after(() => {
    process.env.CORTEX_MCP_PUBLIC_URL = originalPublicUrl;
    process.env.CORTEX_MCP_BEARER_TOKEN = originalBearer;
  });

  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-data-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T12:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    root_page_url: 'https://www.notion.so/1234567890abcdef1234567890abcdef',
    review_window_note: '每天 11:30 / 18:30',
  });

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '需要你拍板的命名策略',
    why: '多线程任务已经开始堆积，需要有一条真正的红灯任务验证工作台能不能把人拉回来。',
    context: '这个任务对应一个还没收口的命名策略，需要工作台把它稳定放到待拍板区。',
    what: '让工作台能清楚展示红灯任务。',
    status: 'in_progress',
    source_url: 'notion://page/page-001/discussion/discussion-001',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '命名策略是否允许直接推翻？',
    recommendation: '先保持当前命名，等你拍板后再继续。',
    why_now: '这会影响后续所有工作台字段命名。',
    impact_scope: 'cross_module',
    source_url: 'notion://page/page-001/discussion/discussion-001',
    requested_human_action: '请确认是否要改动任务和线程的命名口径。',
  });

  const runningCommand = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-002',
    page_id: 'page-002',
    discussion_id: 'discussion-002',
    comment_id: 'comment-002',
    body: '继续推进 Agent 路由联调',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-002/discussion/discussion-002/comment/comment-002',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    command_id: runningCommand.body.commandId,
    agent_name: 'agent-router',
    role: 'router',
    phase: 'execute',
    status: 'running',
    title: '正在跑任务路由联调',
    summary: '系统正在把评论动作投影成下一步命令。',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'yellow',
    question: '评论路由规则是否要先绕行既有线程模型？',
    recommendation: '先继续保留现有 thread_key 策略，等首页聚焦层完成后再统一收口。',
    why_now: '这条链路还在执行中，但已经需要把绕行原因显式挂到首页。',
    impact_scope: 'module',
    source_url: 'notion://page/page-002/discussion/discussion-002',
    requested_human_action: '先不用打断，完成首页聚焦层后再决定是否统一重构 thread 路由。',
  });

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '完成执行同步文档',
    why: '需要验证工作台能正确显示已完成任务。',
    context: '这个任务应该挂到单独线程，并且最终进入已完成列。',
    what: '让执行同步文档在完成后进入已完成区。',
    status: 'in_progress',
    target_type: 'page',
    target_id: 'page-003',
  });

  const completedCommand = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-003',
    page_id: 'page-003',
    discussion_id: 'discussion-003',
    comment_id: 'comment-003',
    body: '同步执行文档并写回 checkpoint',
    owner_agent: 'agent-sync',
    source_url: 'notion://page/page-003/discussion/discussion-003/comment/comment-003',
  });

  await postJson(baseUrl, '/commands/complete', {
    command_id: completedCommand.body.commandId,
    agent_name: 'agent-sync',
    result_summary: '执行同步文档已经更新完毕。',
  });

  await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    command_id: completedCommand.body.commandId,
    signal_level: 'green',
    stage: 'sync',
    status: 'passed',
    title: '执行同步文档已完成',
    summary: '这条链路已经进入稳定完成态。',
    next_step: '继续回看剩余黄灯任务。',
    quality_grade: 'pass',
    anomaly_level: 'low',
    created_by: 'agent-sync',
  });

  await postJson(baseUrl, '/webhook/agent-receipt', {
    project_id: 'PRJ-cortex',
    command_id: completedCommand.body.commandId,
    agent_name: 'agent-sync',
    status: 'completed',
    summary: '执行同步文档已经更新完毕。',
    details: '首页任务卡应该能直接看到最近回执和执行链证据。',
  });

  const memoryCreate = await postJson(baseUrl, '/memory', {
    project_id: 'PRJ-cortex',
    layer: 'knowledge',
    type: 'pattern',
    title: '评论转任务时先展示决策中枢',
    summary: '如果首页已有红黄灯事项，优先把卡点原因和建议动作提到顶层，而不是埋在单张任务卡里。',
    status: 'candidate',
    review_state: 'pending_accept',
    confidence: 'high',
  });
  app.store.createOrGetMemorySource({
    memoryId: memoryCreate.body.memory.memory_id,
    projectId: 'PRJ-cortex',
    sourceType: 'checkpoint',
    sourceRef: 'CP-home-memory-governance',
    sourceUrl: 'notion://page/page-memory-governance/discussion/discussion-memory-governance/comment/comment-memory-governance',
    summary: '后续补了一条 checkpoint 证据，应该让首页记忆治理卡直接显示 reviewer 之后的新证据变化。',
    evidence: {
      checkpoint_id: 'CP-home-memory-governance',
      stage: 'home_memory_governance_followup',
    },
  });

  await postJson(baseUrl, '/inbox', {
    project_id: 'PRJ-cortex',
    queue: 'review',
    object_type: 'memory',
    action_type: 'review',
    risk_level: 'yellow',
    title: '确认评论回流模式是否进入 durable memory',
    summary: '还需要补一条更明确的 source / evidence，再决定是否正式固化。',
    payload: {
      memory_id: memoryCreate.body.memory.memory_id,
    },
  });

  await postJson(baseUrl, '/suggestions', {
    project_id: 'PRJ-cortex',
    source_type: 'notion_comment',
    source_ref: 'comment-002',
    proposed_text: '把评论回流与决策中枢的关系写得更清楚',
    reason: '当前首页已经有多个中枢，需要把它们之间的关系解释得更明确。',
    owner_agent: 'agent-router',
  });

  const workspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(workspace.status, 200);
  assert.equal(workspace.body.ok, true);
  assert.equal(workspace.body.view, 'attention');
  assert.equal(workspace.body.thread_filter, 'all');
  assert.equal(workspace.body.project.project_id, 'PRJ-cortex');
  assert.equal(workspace.body.counts.total_tasks, 3);
  assert.equal(workspace.body.counts.active_threads, 3);
  assert.equal(workspace.body.counts.waiting_human_tasks, 1);
  assert.equal(workspace.body.counts.in_progress_tasks, 1);
  assert.equal(workspace.body.counts.completed_tasks, 1);
  assert.equal(workspace.body.thread_groups.length, 3);
  assert.equal(workspace.body.execution_checklist.items.length, 5);
  assert.equal(workspace.body.execution_checklist.completedCount, 4);
  assert.equal(workspace.body.execution_checklist.inProgressCount, 1);
  assert.equal(workspace.body.execution_checklist.pendingCount, 0);
  assert.equal(workspace.body.execution_checklist.progressPercent, 80);
  assert.equal(workspace.body.execution_checklist.remainingCount, 1);
  assert.equal(workspace.body.execution_checklist.focusStepNumber, 3);
  assert.equal(workspace.body.execution_checklist.focusStatusLabel, '进行中');
  assert.match(workspace.body.execution_checklist.remainingHeadline, /还剩 1 个闭环/);
  assert.equal(workspace.body.execution_checklist.items[2].isFocus, true);
  assert.equal(workspace.body.execution_checklist.items[2].statusLabel, '进行中');
  assert.equal(workspace.body.execution_checklist.focusTitle, 'thread_key / thread_label 收口');
  assert.match(workspace.body.execution_checklist.focusEvidenceLabel, /当前主视图与历史层都已收口到稳定线程来源|当前残留焦点/);
  assert.match(
    workspace.body.execution_checklist.focusEvidenceContextLabel,
    /线程治理|历史层残留/,
  );
  if (/当前残留焦点|当前历史层焦点/.test(workspace.body.execution_checklist.focusEvidenceLabel)) {
    assert.match(
      workspace.body.execution_checklist.focusEvidenceSourceHref,
      /(notion:|\/workspace\/threads\/)/,
    );
    assert.match(
      workspace.body.execution_checklist.focusEvidenceSourceLabel,
      /打开最近源位置|打开待治理线程/,
    );
  }
  assert.equal(
    workspace.body.attention_view.waiting_human.find((task) => task.thread_key === 'notion:page-002:discussion-002')?.checklist_focus_label || '',
    '',
  );
  assert.equal(workspace.body.notion_collaboration.title, 'Notion 协作接入');
  assert.equal(workspace.body.notion_collaboration.agent_name, 'Cortex');
  assert.equal(workspace.body.notion_collaboration.target_page_url, 'https://www.notion.so/1234567890abcdef1234567890abcdef');
  assert.match(workspace.body.notion_collaboration.token_mirror_check_command, /notion:diagnose/);
  assert.match(workspace.body.notion_collaboration.summary, /这只代表 Cortex 侧 ready/);
  assert.equal(workspace.body.notion_collaboration.live_verification_notes.length, 3);
  assert.match(workspace.body.notion_collaboration.live_verification_notes[0], /不等于当前 Notion workspace 已经能直接 @Cortex/);
  assert.equal(workspace.body.notion_collaboration.sync_probe.state, 'success');
  assert.equal(
    workspace.body.notion_collaboration.sync_probe.pageTitle,
    'Cortex P0 工作台同步 - 2026-05-09',
  );
  assert.match(workspace.body.notion_collaboration.sync_probe.pageUrl, /35beb0c2e3f781469134f60de78b9a33/);
  assert.match(workspace.body.notion_collaboration.sync_probe.verifiedAt, /2026-05-09/);
  assert.match(workspace.body.notion_collaboration.next_actions[0], /目标 Business workspace/);
  assert.match(workspace.body.notion_collaboration.next_actions[1], /codex mcp login notion/);
  assert.ok(workspace.body.notion_collaboration.focusGuidance);
  assert.match(workspace.body.notion_collaboration.focusGuidance.nodeLabel, /同步落点|Custom Agent|协作接入/);
  assert.match(workspace.body.notion_collaboration.focusGuidance.nodeSummary, /Custom Agent|同步|ready|落点/);
  assert.match(workspace.body.notion_collaboration.focusGuidance.nodeAction, /workspace|Notion|green comment|login|联调/);
  assert.match(workspace.body.execution_checklist.items[2].progressNote, /主视图 0 条，历史层 0 条，稳定线程 3 条/);
  assert.match(workspace.body.execution_checklist.items[0].evidenceLabel, /活跃线程|执行现场/);
  assert.match(workspace.body.execution_checklist.items[0].evidenceContextLabel, /线程执行现场|线程目录/);
  assert.match(workspace.body.execution_checklist.items[2].evidenceContextLabel, /线程治理|历史层残留/);
  assert.match(workspace.body.execution_checklist.items[3].evidenceLabel, /待拍板|黄灯\/处理中|解释链路已就绪/);
  assert.match(workspace.body.execution_checklist.items[3].evidenceContextLabel, /决策线程现场|决策区/);
  assert.equal(workspace.body.decision_focus.counts.red, 1);
  assert.equal(workspace.body.decision_focus.counts.yellow, 1);
  assert.ok(workspace.body.decision_focus.counts.memory >= 1);
  assert.match(workspace.body.decision_focus.summary, /红灯 1 条|当前有 1 条红灯待拍板/);
  assert.match(workspace.body.decision_focus.focusHeadline, /需要你拍板的命名策略/);
  assert.match(workspace.body.decision_focus.focusReason, /命名策略是否允许直接推翻|请确认是否要改动任务和线程的命名口径/);
  assert.equal(workspace.body.decision_focus.redItems.length, 1);
  assert.equal(workspace.body.decision_focus.yellowItems.length, 1);
  assert.ok(workspace.body.decision_focus.memoryCandidates.length >= 1);
  assert.equal(workspace.body.memory_governance.counts.candidates, 2);
  assert.equal(workspace.body.memory_governance.counts.reviews, 2);
  assert.equal(workspace.body.memory_governance.counts.suggestions, 1);
  assert.equal(workspace.body.memory_governance.memoryDocHref, '/workspace/docs/memory?project_id=PRJ-cortex');
  assert.match(workspace.body.memory_governance.summary, /2 条记忆候选待确认|当前有 2 条记忆候选待确认/);
  assert.equal(workspace.body.memory_governance.reviewCards.length, 2);
  assert.equal(workspace.body.memory_governance.suggestionCards.length, 1);
  assert.equal(workspace.body.memory_governance.candidateCards[0].memoryId, memoryCreate.body.memory.memory_id);
  assert.equal(
    workspace.body.memory_governance.candidate_cards[0].memory_id,
    workspace.body.memory_governance.candidateCards[0].memoryId,
  );
  assert.equal(workspace.body.memory_governance.candidateCards[0].showGovernanceActions, true);
  assert.equal(
    workspace.body.memory_governance.candidate_cards[0].show_governance_actions,
    workspace.body.memory_governance.candidateCards[0].showGovernanceActions,
  );
  assert.match(workspace.body.memory_governance.candidateCards[0].reviewerRecommendationSummary, /Reviewer-Agent 建议/);
  assert.match(
    workspace.body.memory_governance.candidate_cards[0].reviewer_recommendation_summary,
    /Reviewer-Agent 建议/,
  );
  assert.match(workspace.body.memory_governance.candidateCards[0].evidenceSummary, /Checkpoint：后续补了一条 checkpoint 证据/);
  assert.match(
    workspace.body.memory_governance.candidate_cards[0].evidence_summary,
    /Checkpoint：后续补了一条 checkpoint 证据/,
  );
  assert.match(workspace.body.memory_governance.candidateCards[0].evidenceUpdatedAt, /2026-05-08T12:00:00.000Z/);
  assert.match(workspace.body.memory_governance.candidateCards[0].sourceAnchorLabel, /Checkpoint · ref=CP-home-memory-governance/);
  assert.match(
    workspace.body.memory_governance.candidate_cards[0].source_anchor_label,
    /Checkpoint · ref=CP-home-memory-governance/,
  );
  assert.match(workspace.body.memory_governance.candidateCards[0].sourceAnchorHref, /notion:\/\/page\/page-memory-governance/);
  assert.match(
    workspace.body.memory_governance.candidate_cards[0].source_anchor_href,
    /notion:\/\/page\/page-memory-governance/,
  );
  assert.equal(workspace.body.memory_governance.candidateCards[0].freshnessLabel, '较新');
  assert.equal(workspace.body.memory_governance.candidate_cards[0].freshness_label, '较新');
  assert.match(workspace.body.memory_governance.candidateCards[0].evidenceDeltaLabel, /较上次 reviewer 新增 1 条 source/);
  assert.match(
    workspace.body.memory_governance.candidate_cards[0].evidence_delta_label,
    /较上次 reviewer 新增 1 条 source/,
  );
  assert.equal(workspace.body.memory_governance.candidateCards[0].revalidationLabel, '建议重新校验');
  assert.equal(workspace.body.memory_governance.candidate_cards[0].revalidation_label, '建议重新校验');
  assert.equal(
    workspace.body.memory_governance.focus_guidance.nodeLabel,
    workspace.body.memory_governance.focusGuidance.nodeLabel,
  );
  assert.equal(
    workspace.body.memory_governance.reviewCards.some((item) => item.memoryId === memoryCreate.body.memory.memory_id && item.showGovernanceActions === true),
    true,
  );
  assert.equal(
    workspace.body.memory_governance.reviewCards.some((item) => item.memoryId === memoryCreate.body.memory.memory_id && item.revalidationLabel === '建议重新校验'),
    true,
  );
  assert.equal(workspace.body.memory_governance.suggestionCards[0].showGovernanceActions, true);
  assert.ok(workspace.body.data_hygiene.visible_recoverable_total >= 1);
  assert.match(workspace.body.data_hygiene.visible_recoverable_preview, /需要你拍板的命名策略/);
  assert.equal(workspace.body.data_hygiene.concrete_thread_total, 3);
  assert.equal(workspace.body.data_hygiene.visible_low_specificity_thread_total, 0);
  assert.equal(workspace.body.data_hygiene.raw_low_specificity_thread_total, 0);
  assert.ok(workspace.body.data_hygiene.focusGuidance);
  assert.match(workspace.body.data_hygiene.focusGuidance.nodeLabel, /线程身份已收口|具体线程待恢复|历史残留已折叠|主视图线程身份待收口/);
  assert.match(workspace.body.data_hygiene.focusGuidance.nodeSummary, /线程|历史层|泛化线程|稳定线程|恢复/);
  assert.match(workspace.body.data_hygiene.focusGuidance.nodeAction, /线程治理|挂回真实|恢复|历史层|聚焦视图/);
  assert.match(workspace.body.data_hygiene.focusGuidance.progressLabel, /关联闭环：第 3 步/);
  assert.match(workspace.body.data_hygiene.focusGuidance.progressLabel, /执行清单：4 \/ 5 已收口/);
  assert.ok(workspace.body.data_hygiene.focusGuidance.proofLabel);
  assert.ok(Array.isArray(workspace.body.data_hygiene.focusGuidance.actionLinks));
  assert.ok(workspace.body.data_hygiene.focusGuidance.actionLinks.length > 0);
  assert.match(
    workspace.body.data_hygiene.focusGuidance.checklistAcceptance,
    /真实协作线程优先落到稳定 thread identity/,
  );
  assert.match(
    workspace.body.data_hygiene.focusGuidance.checklistCheckpointRule,
    /每完成一段都要经过：实现 -&gt; 测试 -&gt; live probe -&gt; 更新 checkpoint 文档。|每完成一段都要经过：实现 -> 测试 -> live probe -> 更新 checkpoint 文档。/,
  );
  assert.equal(workspace.body.thread_identity_governance.attentionThreadTotal, 0);
  assert.equal(workspace.body.thread_identity_governance.historyThreadTotal, 0);
  assert.ok(workspace.body.thread_identity_governance.focusGuidance);
  assert.match(workspace.body.thread_identity_governance.focusGuidance.nodeLabel, /线程治理|线程身份已收口|残留|Run-only|Decision|Comment/);
  assert.match(workspace.body.thread_identity_governance.focusGuidance.nodeSummary, /收口|稳定线程|治理|历史层|泛化线程/);
  assert.match(
    workspace.body.thread_identity_governance.focusGuidance.nodeAction,
    /打开线程现场|刷新当前治理视图|挂回真实|归档|当前主视图已经收口/,
  );
  assert.match(workspace.body.thread_identity_governance.focusGuidance.progressLabel, /关联闭环：第 3 步/);
  assert.match(workspace.body.thread_identity_governance.focusGuidance.progressLabel, /执行清单：4 \/ 5 已收口/);
  assert.match(
    workspace.body.thread_identity_governance.focusGuidance.proofLabel,
    /当前主视图与历史层都已收口到稳定线程来源|当前残留焦点|当前历史层焦点/,
  );
  assert.match(workspace.body.thread_identity_governance.focusGuidance.proofContextLabel, /线程治理|历史层残留/);
  assert.match(
    workspace.body.thread_identity_governance.focusGuidance.checklistAcceptance,
    /真实协作线程优先落到稳定 thread identity/,
  );
  assert.match(
    workspace.body.thread_identity_governance.focusGuidance.checklistCheckpointRule,
    /优先把泛化 thread key 回收到真实 comment \/ discussion \/ source|主视图已收口时，优先在历史层治理里清掉泛化线程/,
  );
  assert.ok(workspace.body.attentionView.focusGuidance);
  assert.match(workspace.body.attentionView.focusGuidance.nodeLabel, /待拍板任务|执行中任务|已完成任务|当前主闭环|优先回看/);
  assert.match(workspace.body.attentionView.focusGuidance.nodeSummary, /拍板|执行|任务|线程|策略|继续/);
  assert.match(workspace.body.attentionView.focusGuidance.nodeAction, /进入|拍板|推进|回看|确认|改动/);
  assert.ok(workspace.body.attentionView.focusGuidance.proofLabel);
  assert.ok(workspace.body.attentionView.focusGuidance.proofHref);
  assert.ok(Array.isArray(workspace.body.attentionView.focusGuidance.actionLinks));
  assert.ok(workspace.body.attentionView.focusGuidance.actionLinks.length > 0);
  assert.ok(workspace.body.threadViewGuidanceByFilter);
  assert.match(workspace.body.threadViewGuidanceByFilter.all.nodeLabel, /待拍板线程|评论分流线程|已接回执行线程|执行回流线程|线程执行现场|优先回看|当前主闭环|历史层治理/);
  assert.match(workspace.body.threadViewGuidanceByFilter.all.nodeSummary, /红灯|评论|线程|执行/);
  assert.match(workspace.body.threadViewGuidanceByFilter.all.nodeAction, /先打开|补拍板|继续推进/);
  assert.match(workspace.body.threadViewGuidanceByFilter.all.progressLabel, /第 3 步|执行清单：4 \/ 5 已收口/);
  assert.ok(workspace.body.threadViewGuidanceByFilter.all.proofLabel);
  assert.ok(workspace.body.threadViewGuidanceByFilter.all.proofHref);
  assert.ok(Array.isArray(workspace.body.threadViewGuidanceByFilter.all.actionLinks));
  assert.ok(workspace.body.threadViewGuidanceByFilter.all.actionLinks.length > 0);
  assert.match(workspace.body.threadViewGuidanceByFilter.triage.nodeLabel, /待分流评论线程|当前没有待分流线程/);
  assert.match(workspace.body.threadViewGuidanceByFilter.ready.nodeLabel, /已接回执行线程|当前没有已接回执行线程/);
  assert.match(workspace.body.threadViewGuidanceByFilter.red.nodeLabel, /待拍板线程|当前没有红灯线程/);
  assert.match(workspace.body.threadViewGuidanceByFilter.active.nodeLabel, /执行中线程|当前没有处理中线程/);
  assert.match(workspace.body.threadViewGuidanceByFilter.completed.nodeLabel, /已完成线程|当前没有已完成线程/);
  assert.match(workspace.body.hero.current_focus, /命名策略|Agent 路由联调|执行同步文档/);
  assert.ok(
    workspace.body.attention_view.waiting_human.some((task) => task.title.includes('需要你拍板的命名策略')),
  );
  assert.ok(
    workspace.body.attention_view.in_progress.some((task) => task.title.includes('继续推进 Agent 路由联调')),
  );
  assert.ok(
    workspace.body.attention_view.completed.some((task) => task.title.includes('完成执行同步文档')),
  );

  const waitingTask = workspace.body.attention_view.waiting_human.find((task) => task.title.includes('需要你拍板的命名策略'));
  const runningTask = workspace.body.attention_view.in_progress.find((task) => task.title.includes('继续推进 Agent 路由联调'));
  const completedTask = workspace.body.attention_view.completed.find((task) => task.title.includes('完成执行同步文档'));

  assert.match(waitingTask.current_node, /决策/);
  assert.equal(waitingTask.checklist_progress_label, '4 / 5 已收口');
  assert.match(waitingTask.blocker_reason, /命名策略是否允许直接推翻/);
  assert.match(waitingTask.recommended_action, /请确认是否要改动任务和线程的命名口径/);
  assert.equal(waitingTask.thread_source_label, 'Notion 讨论');
  assert.equal(runningTask.checklist_progress_label, '4 / 5 已收口');
  assert.match(runningTask.current_node, /Run/);
  assert.match(runningTask.execution_proof, /1 条命令 \/ 1 个 Run/);
  assert.equal(runningTask.thread_source_label, 'Notion 讨论');
  assert.match(completedTask.execution_proof, /1 条命令 \/ 1 个回执 \/ 2 个 Checkpoint/);
  assert.match(completedTask.latest_receipt_label, /已回执/);
  assert.match(completedTask.latest_receipt_summary, /执行同步文档已经更新完毕/);
  assert.equal(completedTask.thread_source_label, 'Notion 讨论');
  assert.match(workspace.body.decision_focus.redItems[0].blockerReason, /命名策略是否允许直接推翻/);
  assert.match(workspace.body.decision_focus.redItems[0].actionValue, /请确认是否要改动任务和线程的命名口径/);
  assert.equal(workspace.body.decision_focus.redItems[0].progressLabel, '4 / 5 已收口');
  assert.match(workspace.body.decision_focus.redItems[0].checklistProgressSummary, /80%/);
  assert.equal(workspace.body.decision_focus.redItems[0].actionable, true);
  assert.match(workspace.body.decision_focus.redItems[0].decisionId, /^DR-/);
  assert.equal(workspace.body.decision_focus.redItems[0].threadKey, 'notion:page-001:discussion-001');
  assert.ok(workspace.body.decision_focus.focusGuidance);
  assert.match(workspace.body.decision_focus.focusGuidance.nodeLabel, /决策|拍板|Run|记忆候选/);
  assert.match(workspace.body.decision_focus.focusGuidance.nodeSummary, /命名策略|拍板|阻塞|review|候选|评论|路由|绕行/);
  assert.match(workspace.body.decision_focus.focusGuidance.nodeAction, /改动任务|执行|review|accept|reject|拍板|打断|重构|聚焦层/);
  assert.match(workspace.body.decision_focus.yellowItems[0].meta.join(' '), /当前节点：Run|执行链：1 条命令 \/ 1 个 Run/);
  assert.equal(workspace.body.decision_focus.yellowItems[0].actionable, true);
  assert.match(workspace.body.decision_focus.yellowItems[0].decisionId, /^DR-/);
  assert.equal(workspace.body.comment_workflow.readyItems[0].actionable, true);
  assert.equal(workspace.body.comment_workflow.readyItems[0].actionMode, 'ready');
  assert.equal(workspace.body.comment_workflow.readyItems[0].action_mode, 'ready');
  assert.match(workspace.body.comment_workflow.readyItems[0].commandId, /^CMD-/);
  assert.match(workspace.body.comment_workflow.readyItems[0].command_id, /^CMD-/);
  assert.equal(workspace.body.comment_workflow.readyItems[0].ownerAgent, 'agent-router');
  assert.equal(workspace.body.comment_workflow.readyItems[0].owner_agent, 'agent-router');
  assert.equal(workspace.body.comment_workflow.readyItems[0].reply_capable, true);
  assert.ok(Array.isArray(workspace.body.comment_workflow.readyItems[0].collaboration_audit_items));
  assert.deepEqual(
    workspace.body.comment_workflow.readyItems[0].collaboration_audit_items,
    workspace.body.comment_workflow.readyItems[0].collaborationAuditItems,
  );
  assert.equal(
    workspace.body.comment_workflow.readyItems[0].proof_value,
    workspace.body.comment_workflow.readyItems[0].proofValue,
  );
  assert.ok(workspace.body.comment_workflow.focusGuidance);
  assert.deepEqual(workspace.body.comment_workflow.focus_guidance, workspace.body.comment_workflow.focusGuidance);
  assert.deepEqual(workspace.body.comment_workflow.triage_items, workspace.body.comment_workflow.triageItems);
  assert.deepEqual(workspace.body.comment_workflow.ready_items, workspace.body.comment_workflow.readyItems);
  assert.deepEqual(
    workspace.body.comment_workflow.recent_comment_cards,
    workspace.body.comment_workflow.recentCommentCards,
  );
  assert.equal(
    workspace.body.comment_workflow.counts.triage_threads,
    workspace.body.comment_workflow.counts.triageThreads,
  );
  assert.equal(
    workspace.body.comment_workflow.counts.ready_comments,
    workspace.body.comment_workflow.counts.readyComments,
  );
  assert.match(workspace.body.comment_workflow.focusGuidance.nodeLabel, /评论分流|执行回流|最近评论|Run|回复/);
  assert.match(workspace.body.comment_workflow.focusGuidance.nodeSummary, /triage|接回执行|评论|线程/);
  assert.match(workspace.body.comment_workflow.focusGuidance.nodeAction, /执行|黄灯|红灯|线程|打断/);
  assert.ok(workspace.body.memory_governance.focusGuidance);
  assert.match(workspace.body.memory_governance.focusGuidance.nodeLabel, /候选|Review|Suggestion|candidate/);
  assert.match(workspace.body.memory_governance.focusGuidance.nodeSummary, /memory|review|沉淀|候选|证据|Reviewer|reject|durable/);
  assert.match(workspace.body.memory_governance.focusGuidance.nodeAction, /accept|补证据|拒绝|沉淀|判断|reject|human confirm/);
  assert.ok(
    workspace.body.decision_focus.memoryCandidates.some((item) => /评论转任务时先展示决策中枢/.test(item.title)),
  );
  assert.ok(
    workspace.body.memory_governance.reviewCards.some((item) =>
      /记忆待审阅|确认/.test(item.title || ''),
    ),
  );
  assert.ok(
    workspace.body.memory_governance.suggestionCards.some((item) =>
      /把评论回流与决策中枢的关系写得更清楚/.test(item.title),
    ),
  );

  const workspaceWithPinnedView = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&view=thread&thread_filter=red');
  assert.equal(workspaceWithPinnedView.status, 200);
  assert.equal(workspaceWithPinnedView.body.view, 'thread');
  assert.equal(workspaceWithPinnedView.body.thread_filter, 'red');
});

test('workspace html renders dual views and key attention lanes', async (t) => {
  const originalPublicUrl = process.env.CORTEX_MCP_PUBLIC_URL;
  const originalBearer = process.env.CORTEX_MCP_BEARER_TOKEN;
  process.env.CORTEX_MCP_PUBLIC_URL = 'https://cortex.example.com/mcp';
  process.env.CORTEX_MCP_BEARER_TOKEN = 'test-bearer-token';
  t.after(() => {
    process.env.CORTEX_MCP_PUBLIC_URL = originalPublicUrl;
    process.env.CORTEX_MCP_BEARER_TOKEN = originalBearer;
  });

  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-html-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    root_page_url: 'https://www.notion.so/1234567890abcdef1234567890abcdef',
  });

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '工作台首页 HTML 验收',
    why: '需要验证新的 /workspace 页面不是空壳。',
    context: '至少要能看见按注意力和按线程两个视图。',
    what: '渲染一个稳定的工作台页面。',
    status: 'in_progress',
  });

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '确认首页红灯和评论分流都能被引导队列直达',
    why: '要验证 hero 顶部的当前执行引导不会漏掉最急的红灯和 triage 评论。',
    context: '这条 brief 会和同一条 discussion 下的决策、评论共享焦点线程。',
    what: '让首页第一屏同时出现红灯拍板和评论分流入口。',
    status: 'in_progress',
    source_url: 'notion://page/page-home-html-focus/discussion/discussion-home-html-focus',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '这个首页引导是否要优先落到 hero 顶部？',
    recommendation: '是，先把最急的红灯和 triage 评论提到顶部。',
    why_now: '否则工作台虽然有数据，但首页第一屏仍然不够像执行指挥台。',
    impact_scope: 'cross_module',
    source_url: 'notion://page/page-home-html-focus/discussion/discussion-home-html-focus',
    requested_human_action: '确认 hero 顶部要保留红灯拍板入口。',
  });

  await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-home-html-focus',
    page_id: 'page-home-html-focus',
    discussion_id: 'discussion-home-html-focus',
    comment_id: 'comment-home-html-focus',
    body: '为什么这条首页引导还没有继续推进？',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-home-html-focus/discussion/discussion-home-html-focus/comment/comment-home-html-focus',
  });

  const memoryCreate = await postJson(baseUrl, '/memory', {
    project_id: 'PRJ-cortex',
    layer: 'base_memory',
    type: 'preference',
    title: '首页要先显示决策中枢',
    summary: '当存在红黄灯和待 review 事项时，首页应该优先给出决策聚焦，而不是只展示列表。',
    status: 'candidate',
    review_state: 'pending_accept',
    confidence: 'high',
  });
  app.store.createOrGetMemorySource({
    memoryId: memoryCreate.body.memory.memory_id,
    projectId: 'PRJ-cortex',
    sourceType: 'checkpoint',
    sourceRef: 'CP-home-memory-html',
    sourceUrl: 'notion://page/page-home-memory-html/discussion/discussion-home-memory-html/comment/comment-home-memory-html',
    summary: 'HTML 验收场景下再补一条 checkpoint 证据，确认首页卡片会直接露出 freshness 和重校验引导。',
    evidence: {
      checkpoint_id: 'CP-home-memory-html',
      stage: 'home_memory_html_followup',
    },
  });

  await postJson(baseUrl, '/inbox', {
    project_id: 'PRJ-cortex',
    queue: 'review',
    object_type: 'memory',
    action_type: 'review',
    risk_level: 'yellow',
    title: '确认首页记忆治理面板是否保留',
    summary: '需要确保记忆治理不会再退回旧版 dashboard。',
    payload: {
      memory_id: memoryCreate.body.memory.memory_id,
    },
  });

  await postJson(baseUrl, '/suggestions', {
    project_id: 'PRJ-cortex',
    source_type: 'notion_comment',
    source_ref: 'comment-html-001',
    proposed_text: '把首页记忆治理的说明写得再明确一点',
    reason: 'HTML 验收场景下也应该能看到 suggestion 治理入口。',
    owner_agent: 'agent-router',
  });

  const response = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.match(html, /Cortex 协作工作台/);
  assert.match(html, /主闭环速览/);
  assert.match(html, /当前执行引导/);
  assert.match(html, /按注意力/);
  assert.match(html, /按线程/);
  assert.match(
    html,
    /data-thread-filter="triage"[\s\S]*?data-thread-filter-label[^>]*>待分流评论<\/span>[\s\S]*?data-thread-filter-count[^>]*>1<\/span>/,
  );
  assert.match(
    html,
    /data-thread-filter="ready"[\s\S]*?data-thread-filter-label[^>]*>已接回执行<\/span>[\s\S]*?data-thread-filter-count[^>]*>0<\/span>/,
  );
  assert.match(
    html,
    /data-thread-filter="red"[\s\S]*?data-thread-filter-label[^>]*>红灯<\/span>[\s\S]*?data-thread-filter-count[^>]*>1<\/span>/,
  );
  assert.match(html, /等我拍板/);
  assert.match(html, /系统处理中/);
  assert.match(html, /已完成/);
  assert.match(html, /推荐动作|下一步/);
  assert.match(html, /当前节点/);
  assert.match(html, /任务简报 · 执行中/);
  assert.match(html, /执行链/);
  assert.match(html, /执行 Checklist/);
  assert.match(html, /最近证据/);
  assert.match(html, /打开证据现场/);
  assert.match(html, /Notion 协作接入/);
  assert.match(html, /Runtime 健康/);
  assert.match(html, /workspace\/runtime-status\?project_id=PRJ-cortex/);
  assert.match(html, /当前前台吃到的是谁/);
  assert.match(html, /data-runtime-health-guidance[\s\S]*?当前 runtime 节点/);
  assert.match(html, /data-runtime-health-guidance[\s\S]*?当前判断/);
  assert.match(html, /data-runtime-health-guidance[\s\S]*?这一步恢复/);
  assert.match(html, /data-runtime-health-guidance[\s\S]*?状态接口：\/workspace\/runtime-status\?project_id=PRJ-cortex/);
  assert.match(html, /Custom Agent 主路径/);
  assert.match(html, /token-based mirror/);
  assert.match(html, /本地准备态/);
  assert.match(html, /最近同步落点/);
  assert.match(html, /Cortex P0 工作台同步 - 2026-05-09/);
  assert.match(html, /打开最近同步页/);
  assert.match(html, /这只代表 Cortex 侧 ready/);
  assert.match(html, /codex mcp login notion/);
  assert.match(html, /data-notion-collaboration-guidance[\s\S]*?当前协作节点/);
  assert.match(html, /data-notion-collaboration-guidance[\s\S]*?当前判断/);
  assert.match(html, /data-notion-collaboration-guidance[\s\S]*?下一步/);
  assert.match(html, /data-notion-collaboration-guidance[\s\S]*?Checkpoint 规则/);
  assert.match(html, /闭环进度/);
  assert.match(html, /80% · 4 \/ 5 已收口/);
  assert.match(html, /按线程查看/);
  assert.match(html, /打开待拍板/);
  assert.match(html, /优先回看|查看 Checklist/);
  assert.match(html, /href="\/workspace\?project_id=PRJ-cortex#attention-view"/);
  assert.match(html, /href="\/workspace\?project_id=PRJ-cortex&amp;view=thread#thread-view"/);
  assert.match(html, /href="\/workspace\?project_id=PRJ-cortex#lane-waiting-human"/);
  assert.match(html, /当前主闭环/);
  assert.match(html, /决策中枢/);
  assert.match(html, /红灯待拍板/);
  assert.match(html, /红灯拍板/);
  assert.match(html, /黄灯绕行中/);
  assert.match(html, /记忆候选/);
  assert.match(html, /评论回流中枢/);
  assert.match(html, /待分流评论/);
  assert.match(html, /评论分流/);
  assert.match(html, /已接回执行/);
  assert.match(html, /记忆治理中枢/);
  assert.match(html, /记忆治理/);
  assert.match(html, /Review 队列/);
  assert.match(html, /相关 Suggestions/);
  assert.match(html, /打开协作记忆/);
  assert.match(html, /href="\/workspace\/docs\/memory\?project_id=PRJ-cortex"/);
  assert.match(html, /首页直达治理/);
  assert.match(html, /Suggestion 沉淀动作/);
  assert.match(html, /接受为 durable/);
  assert.match(html, /继续补证据/);
  assert.match(html, /拒绝沉淀/);
  assert.match(html, /重跑 reviewer/);
  assert.match(html, /转成 candidate memory/);
  assert.match(html, /暂不沉淀/);
  assert.match(html, /当前治理节点/);
  assert.match(html, /当前判断/);
  assert.match(html, /这一步判断/);
  assert.match(html, /最近治理证据：/);
  assert.match(html, /Suggestion 沉淀/);
  assert.match(html, /先决定转成 candidate memory，还是明确记成“暂不沉淀”/);
  assert.match(html, /Reviewer-Agent 已完成一审|先根据 reviewer 建议和最新 source \/ evidence 做 accept、继续补证据，或拒绝沉淀。/);
  assert.match(html, /这条 memory 已进入 review 队列；首页提交后会直接写回 reviewer 判断，不需要先跳回 memory 文档。/);
  assert.match(html, /Reviewer 建议/);
  assert.match(html, /记忆治理中枢[\s\S]*?最近证据/);
  assert.match(html, /记忆治理中枢[\s\S]*?更新于 2026-05-08 13:00:00Z/);
  assert.match(html, /记忆治理中枢[\s\S]*?证据现场：(记忆候选区|Review 队列|Suggestion 沉淀区)/);
  assert.match(html, /Freshness 体检/);
  assert.match(html, /证据变化/);
  assert.match(html, /重新校验建议/);
  assert.match(html, /Checkpoint · ref=CP-home-memory-html/);
  assert.match(html, /打开最近 source/);
  assert.match(html, /较上次 reviewer 新增 1 条 source/);
  assert.match(html, /建议重新校验/);
  assert.match(html, /data-home-memory-review-action="accepted"/);
  assert.match(html, /data-home-memory-review-action="needs_followup"/);
  assert.match(html, /data-home-memory-review-action="rejected"/);
  assert.match(html, /data-home-memory-reviewer-refresh/);
  assert.match(html, /data-home-suggestion-review-action="accept"/);
  assert.match(html, /data-home-suggestion-review-action="reject"/);
  assert.match(html, /把首页记忆治理的说明写得再明确一点|当前没有需要继续跟进的 suggestions/);
  assert.match(html, /1 条评论仍停在 triage|当前有 1 条评论仍停在 triage/);
  assert.match(html, /当前没有已接回执行的评论线程/);
  assert.match(html, /当前有 1 条红灯待拍板/);
  assert.match(html, /当前没有黄灯绕行事项/);
  assert.match(html, /首页要先显示决策中枢/);
  assert.match(html, /确认首页红灯和评论分流都能被引导队列直达/);
  assert.match(html, /为什么这条首页引导还没有继续推进？/);
  assert.match(html, /线程治理/);
  assert.match(html, /data-thread-governance-guidance[\s\S]*?当前治理节点/);
  assert.match(html, /data-thread-governance-guidance[\s\S]*?当前判断/);
  assert.match(html, /data-thread-governance-guidance[\s\S]*?这一步处理/);
  assert.match(html, /data-thread-governance-guidance[\s\S]*?验收条件/);
  assert.match(html, /data-thread-governance-guidance[\s\S]*?治理规则/);
  assert.match(html, /data-attention-view-guidance[\s\S]*?当前注意力焦点/);
  assert.match(html, /data-attention-view-guidance[\s\S]*?当前判断/);
  assert.match(html, /data-attention-view-guidance[\s\S]*?下一步/);
  assert.match(html, /data-attention-view-guidance[\s\S]*?验收条件/);
  assert.match(html, /data-attention-view-guidance[\s\S]*?Checkpoint 规则/);
  assert.match(html, /attention-view[\s\S]*?最近证据：/);
  assert.match(html, /attention-view[\s\S]*?(进入拍板现场|进入执行现场|回看已完成现场)/);
  assert.match(html, /data-thread-view-guidance[\s\S]*?当前线程焦点/);
  assert.match(html, /data-thread-view-guidance[\s\S]*?当前判断/);
  assert.match(html, /data-thread-view-guidance[\s\S]*?下一步/);
  assert.match(html, /data-thread-view-guidance[\s\S]*?验收条件/);
  assert.match(html, /data-thread-view-guidance[\s\S]*?Checkpoint 规则/);
  assert.match(html, /data-thread-panel-head/);
  assert.match(html, /data-thread-panel-title[^>]*>按线程<\/h2>/);
  assert.match(html, /data-thread-panel-note[^>]*>同一条协作线程下拆了哪些任务、哪些在跑、哪些已经红灯卡住。<\/p>/);
  assert.match(html, /data-thread-filter-summary-label[^>]*>当前筛选：全部<\/strong>/);
  assert.match(html, /data-thread-filter-summary-count[^>]*>\d+ 条线程<\/span>/);
  assert.match(html, /data-thread-filter-bar/);
  assert.match(html, /<button[^>]*data-thread-filter="all"[^>]*data-thread-filter-state="active"[^>]*>/);
  assert.match(
    html,
    /data-thread-filter="all"[\s\S]*?data-thread-filter-label[^>]*>全部<\/span>[\s\S]*?data-thread-filter-count[^>]*>\d+<\/span>/,
  );
  assert.match(html, /<button[^>]*data-thread-filter="triage"[^>]*data-thread-filter-state="inactive"[^>]*>/);
  assert.match(
    html,
    /data-thread-filter="triage"[\s\S]*?data-thread-filter-label[^>]*>待分流评论<\/span>[\s\S]*?data-thread-filter-count[^>]*>\d+<\/span>/,
  );
  assert.match(html, /<button[^>]*data-thread-filter="completed"[^>]*data-thread-filter-state="inactive"[^>]*>/);
  assert.match(
    html,
    /data-thread-filter="completed"[\s\S]*?data-thread-filter-label[^>]*>已完成<\/span>[\s\S]*?data-thread-filter-count[^>]*>\d+<\/span>/,
  );
  assert.match(html, /data-thread-filter-empty[^>]*hidden/);
  assert.match(html, /data-thread-filter-empty-label[^>]*>当前筛选：全部<\/strong>/);
  assert.match(html, /data-thread-filter-empty-count[^>]*>\d+ 条线程<\/span>/);
  assert.match(html, /data-thread-filter-empty-copy[^>]*>当前还没有可展示的线程分组。<\/p>/);
  assert.match(html, /data-thread-group-filter-note[^>]*>当前归类：/);
  assert.match(html, /data-thread-group-filter-membership="当前归类：[^"]+"/);
  assert.match(
    html,
    /data-thread-group[^>]*data-thread-group-active-filter="all"[^>]*data-thread-group-visibility="visible"[^>]*data-thread-group-visibility-reason="当前筛选是“全部”，这条线程默认展示。"/,
  );
  assert.match(html, /data-thread-view-guidance-proof-row[\s\S]*?最近证据：/);
  assert.match(html, /data-thread-view-guidance-proof-link[\s\S]*?打开焦点线程/);
  assert.match(html, /data-thread-view-guidance-actions-links[\s\S]*?(打开焦点线程|进入评论分流现场|进入执行回流现场|打开待拍板线程|打开执行中线程|打开已完成线程)/);
  assert.match(html, /thread-governance[\s\S]*?最近证据：/);
  assert.match(html, /thread-governance[\s\S]*?证据现场：/);
  assert.match(html, /thread-governance[\s\S]*?打开证据现场/);
  assert.match(html, /hero-data-hygiene-guidance/);
  assert.match(html, /data-hero-data-hygiene-guidance/);
  assert.match(html, /当前治理焦点/);
  assert.match(html, /主视图里还有 1 条泛化线程仍停在 command \/ brief \/ decision 层级/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?关联闭环：第 3 步/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?执行清单：4 \/ 5 已收口/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?验收条件[\s\S]*?真实协作线程优先落到稳定 thread identity/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?Checkpoint 规则[\s\S]*?每完成一段都要经过：实现 -&gt; 测试 -&gt; live probe -&gt; 更新 checkpoint 文档。/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?最近证据：/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?证据现场：/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?打开证据现场/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?(打开最近源位置|打开待治理线程)/);
  assert.match(html, /主视图待治理：/);
  assert.match(html, /把 thread_key 收回真实来源|挂回真实 comment \/ discussion \/ source/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?打开线程治理/);
  assert.match(html, /线程来源：/);
  assert.match(html, /主视图泛化线程/);
  assert.match(html, /打开线程治理/);
  assert.match(html, /推进规则/);
  assert.match(html, /验收条件/);
  assert.match(html, /Autopilot heartbeat 已恢复/);
  assert.match(html, /15s 后自动刷新/);
  assert.match(html, /\/workspace\/data\?project_id=PRJ-cortex/);

  const pinnedResponse = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex&view=thread&thread_filter=completed`);
  const pinnedHtml = await pinnedResponse.text();
  assert.equal(pinnedResponse.status, 200);
  assert.match(pinnedHtml, /switch-button is-active" type="button" data-view-target="thread"/);
  assert.match(
    pinnedHtml,
    /data-thread-filter="completed"[^>]*data-thread-filter-option[^>]*data-thread-filter-state="active"/,
  );
  assert.match(
    pinnedHtml,
    /data-thread-filter="all"[^>]*data-thread-filter-option[^>]*data-thread-filter-state="inactive"/,
  );
  assert.match(
    pinnedHtml,
    /href="\/workspace\/threads\/[^"]+\?project_id=PRJ-cortex&amp;view=thread&amp;thread_filter=completed&amp;document_id=execution"/,
  );
  assert.match(pinnedHtml, /href="\/workspace\?project_id=PRJ-cortex&amp;view=thread#thread-view"/);

  const readyResponse = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex&view=thread&thread_filter=ready`);
  const readyHtml = await readyResponse.text();
  assert.equal(readyResponse.status, 200);
  assert.match(
    readyHtml,
    /data-thread-filter="ready"[^>]*data-thread-filter-option[^>]*data-thread-filter-state="active"/,
  );
  assert.match(readyHtml, /data-thread-filter-summary-label[^>]*>当前筛选：已接回执行<\/strong>/);
  assert.match(readyHtml, /data-thread-filter-summary-count[^>]*>0 条线程<\/span>/);
  assert.match(readyHtml, /data-thread-filter-empty(?![^>]*hidden)/);
  assert.match(readyHtml, /data-thread-filter-empty-label[^>]*>当前筛选：已接回执行<\/strong>/);
  assert.match(readyHtml, /data-thread-filter-empty-count[^>]*>0 条线程<\/span>/);
  assert.match(readyHtml, /data-thread-filter-empty-copy[^>]*>当前筛选下没有已接回执行线程，试试切回“全部”或其他状态。<\/p>/);
  assert.match(
    readyHtml,
    /data-thread-group[^>]*data-thread-group-active-filter="ready"[^>]*data-thread-group-visibility="hidden"[^>]*data-thread-group-visibility-reason="当前筛选是“已接回执行”[^"]*暂时隐藏。"/,
  );
});

test('workspace homepage keeps action feedback and reviewer note visible after memory action', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-home-memory-feedback-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:10:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const memoryCreate = await postJson(baseUrl, '/memory', {
    project_id: 'PRJ-cortex',
    layer: 'knowledge',
    type: 'pattern',
    title: '首页动作后要看见 reviewer note',
    summary: '首页执行 memory reviewer 动作后，刷新回来仍要看见成功反馈和最近人工判断。',
    status: 'candidate',
    review_state: 'pending_accept',
    confidence: 'high',
    sources: [
      {
        source_type: 'checkpoint',
        source_ref: 'CP-home-memory-feedback',
        source_url: 'notion://page/page-home-memory-feedback/discussion/discussion-home-memory-feedback/comment/comment-home-memory-feedback',
        summary: '先挂一条 checkpoint 证据，确保首页 memory 卡会继续显示 reviewer signals。',
        evidence: {
          checkpoint_id: 'CP-home-memory-feedback',
          stage: 'home_memory_feedback',
        },
      },
    ],
  });

  await postJson(baseUrl, `/memory/${encodeURIComponent(memoryCreate.body.memory.memory_id)}/review`, {
    review_state: 'needs_followup',
    status: 'candidate',
    review_actor: 'workspace_memory_reviewer',
    review_note: '请先补两条真实 source 再 accept。',
    next_step: '请先补两条真实 source 再 accept。',
  });

  const response = await fetch(
    `${baseUrl}/workspace?project_id=PRJ-cortex&action_feedback=${encodeURIComponent('首页动作已写回 · 记忆治理 · 标记继续补证据：请先补两条真实 source 再 accept。')}&action_feedback_tone=success`,
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /workspace-action-feedback/);
  assert.match(html, /data-tone="success"/);
  assert.match(html, /首页动作已写回 · 记忆治理 · 标记继续补证据：请先补两条真实 source 再 accept。/);
  assert.match(html, /最近人工判断/);
  assert.match(html, /workspace_memory_reviewer/);
  assert.match(html, /待补证据/);
  assert.match(html, /请先补两条真实 source 再 accept。/);
});

test('workspace homepage keeps action feedback visible after decision action', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-home-decision-feedback-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:20:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const decisionResult = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '首页拍板后刷新回来还能不能看见成功反馈？',
    recommendation: '先直接在首页完成一次拍板，再验证 feedback banner 仍然保留。',
    why_now: '需要补齐 decision homepage action 的刷新后反馈回归。',
    impact_scope: 'module',
    requested_human_action: '确认首页 decision feedback 是否稳定。',
    source_url: 'notion://page/page-home-decision-feedback/discussion/discussion-home-decision-feedback',
  });

  const threadKey = encodeURIComponent('notion:page-home-decision-feedback:discussion-home-decision-feedback');
  const decisionNote = '先按当前方案继续推进。';
  const actionResult = await postJson(baseUrl, `/workspace/threads/${threadKey}/decision`, {
    project_id: 'PRJ-cortex',
    document_id: 'execution',
    decision_id: decisionResult.body.decision.decisionId,
    status: 'approved',
    decision_note: decisionNote,
  });

  assert.equal(actionResult.status, 200);
  assert.equal(actionResult.body.ok, true);
  assert.equal(actionResult.body.decision.status, 'approved');

  const response = await fetch(
    `${baseUrl}/workspace?project_id=PRJ-cortex&action_feedback=${encodeURIComponent(`首页动作已写回 · 决策拍板：${decisionNote}`)}&action_feedback_tone=success`,
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /workspace-action-feedback/);
  assert.match(html, /data-tone="success"/);
  assert.match(html, /首页动作已写回 · 决策拍板：先按当前方案继续推进。/);
  assert.match(html, /当前没有红灯待拍板事项/);
});

test('workspace homepage keeps action feedback and reply trace visible after comment reply action', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-home-comment-feedback-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const commentResult = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-home-comment-feedback',
    page_id: 'page-home-comment-feedback',
    discussion_id: 'discussion-home-comment-feedback',
    comment_id: 'comment-home-comment-feedback',
    body: '首页回复动作写完以后，刷新回来还得知道刚刚回复了什么。',
    owner_agent: 'agent-router',
    source_url:
      'notion://page/page-home-comment-feedback/discussion/discussion-home-comment-feedback/comment/comment-home-comment-feedback',
  });

  const threadKey = encodeURIComponent('notion:page-home-comment-feedback:discussion-home-comment-feedback');
  const replyBody = '我先确认看到了这条评论，晚点补执行结果。';
  const replyResult = await postJson(baseUrl, `/workspace/threads/${threadKey}/comment`, {
    project_id: 'PRJ-cortex',
    document_id: 'execution',
    mode: 'comment',
    reply_only: true,
    body: replyBody,
    owner_agent: 'agent-router',
    reply_to_command_id: commentResult.body.command.commandId,
    reply_to_comment_title: '首页回复动作写完以后，刷新回来还得知道刚刚回复了什么。',
    reply_to_comment_summary: '来自 homepage reply feedback 的集成回归。',
  });

  assert.equal(replyResult.status, 200);
  assert.equal(replyResult.body.ok, true);
  assert.equal(replyResult.body.workflow_path, 'comment_history');

  const response = await fetch(
    `${baseUrl}/workspace?project_id=PRJ-cortex&action_feedback=${encodeURIComponent(`首页动作已写回 · 线程回复：${replyBody}`)}&action_feedback_tone=success`,
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /workspace-action-feedback/);
  assert.match(html, /data-tone="success"/);
  assert.match(html, /首页动作已写回 · 线程回复：我先确认看到了这条评论，晚点补执行结果。/);
  assert.match(html, /评论回流中枢/);
  assert.match(html, /最近事件：线程回复 · 已归档/);
  assert.match(html, /我先确认看到了这条评论，晚点补执行结果。/);
  assert.match(html, /data-home-comment-audit-item="thread_reply"/);
});

test('workspace thread groups surface comment triage and returned execution states', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-groups-comments-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:05:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-thread-triage',
    page_id: 'page-thread-triage',
    discussion_id: 'discussion-thread-triage',
    comment_id: 'comment-thread-triage',
    body: '为什么这个线程没有继续跑？',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-thread-triage/discussion/discussion-thread-triage/comment/comment-thread-triage',
  });

  const readyComment = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-thread-ready',
    page_id: 'page-thread-ready',
    discussion_id: 'discussion-thread-ready',
    comment_id: 'comment-thread-ready',
    body: '继续推进线程级评论状态可视化',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-thread-ready/discussion/discussion-thread-ready/comment/comment-thread-ready',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    command_id: readyComment.body.commandId,
    agent_name: 'agent-router',
    role: 'router',
    phase: 'execute',
    status: 'running',
    title: '正在处理 ready 评论线程',
    summary: '确认这条评论已经从 comment 回到 command/run 执行链。',
  });

  await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    command_id: readyComment.body.commandId,
    signal_level: 'green',
    stage: 'execute',
    status: 'running',
    title: 'ready 评论线程仍在执行',
    summary: '首页评论回流中枢应该能直接看到这条评论已经继续往前跑。',
    next_step: '继续观察这条评论是否产出后续回执。',
    quality_grade: 'pass',
    anomaly_level: 'low',
    created_by: 'agent-router',
  });

  const readyThreadKey = encodeURIComponent('notion:page-thread-ready:discussion-thread-ready');
  const replyResult = await postJson(baseUrl, `/workspace/threads/${readyThreadKey}/comment`, {
    project_id: 'PRJ-cortex',
    document_id: 'execution',
    mode: 'comment',
    reply_only: true,
    body: '我先确认看到了这条评论，继续执行结果稍后同步。',
    owner_agent: 'agent-router',
    reply_to_command_id: readyComment.body.commandId,
    reply_to_comment_title: '继续推进线程级评论状态可视化',
    reply_to_comment_summary: '来自 ready 评论线程的最新输入。',
  });

  assert.equal(replyResult.status, 200);
  assert.equal(replyResult.body.ok, true);
  assert.equal(replyResult.body.workflow_path, 'comment_history');
  assert.equal(replyResult.body.comment_intent, 'thread_reply');

  const workspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(workspace.status, 200);
  assert.equal(workspace.body.thread_groups.length, 2);
  assert.equal(workspace.body.comment_workflow.counts.triageThreads, 1);
  assert.equal(workspace.body.comment_workflow.counts.triageComments, 1);
  assert.equal(workspace.body.comment_workflow.counts.readyThreads, 1);
  assert.equal(workspace.body.comment_workflow.counts.readyComments, 1);
  assert.equal(workspace.body.comment_workflow.counts.recentComments, 3);
  assert.equal(workspace.body.comment_workflow.counts.recentThreads, 2);
  assert.equal(workspace.body.comment_workflow.recentCommentCards.length, 2);
  assert.ok(
    workspace.body.comment_workflow.recentCommentCards.some((item) =>
      /notion:page-thread-ready:discussion-thread-ready|page-thread-ready/.test(item.id || item.title || ''),
    ),
  );
  assert.ok(
    workspace.body.comment_workflow.recentCommentCards.some((item) =>
      /最近事件：线程回复 · 已归档/.test((item.meta || []).join(' ')),
    ),
  );
  assert.ok(
    workspace.body.comment_workflow.recentCommentCards.some((item) =>
      /最近事件：问题 · (新建|已归档)/.test((item.meta || []).join(' ')),
    ),
  );
  assert.equal(workspace.body.comment_workflow.triageItems.length, 1);
  assert.equal(workspace.body.comment_workflow.readyItems.length, 1);
  assert.match(workspace.body.comment_workflow.summary, /1 条评论仍停在 triage|当前有 1 条评论仍停在 triage/);

  const readyRecentCard = workspace.body.comment_workflow.recentCommentCards.find((item) =>
    /page-thread-ready/.test(item.id || item.title || ''),
  );
  const triageRecentCard = workspace.body.comment_workflow.recentCommentCards.find((item) =>
    /page-thread-triage/.test(item.id || item.title || ''),
  );

  assert.ok(readyRecentCard);
  assert.equal(readyRecentCard.auditLabel, '最近流转');
  assert.equal(readyRecentCard.recentEventCount, 2);
  assert.equal(readyRecentCard.actionMode, 'ready');
  assert.equal(readyRecentCard.actionable, true);
  assert.equal(readyRecentCard.collaborationAuditItems.length, 2);
  assert.deepEqual(
    readyRecentCard.collaborationAuditItems.map((item) => item.kind),
    ['thread_reply', 'execution'],
  );
  assert.match(readyRecentCard.meta.join(' '), /最近事件数：2 条/);
  assert.ok(triageRecentCard);
  assert.equal(triageRecentCard.auditLabel, '最近流转');
  assert.equal(triageRecentCard.recentEventCount, 1);
  assert.equal(triageRecentCard.actionMode, 'triage');
  assert.equal(triageRecentCard.actionable, true);

  const triageGroup = workspace.body.thread_groups.find(
    (group) => group.thread_key === 'notion:page-thread-triage:discussion-thread-triage',
  );
  const readyGroup = workspace.body.thread_groups.find(
    (group) => group.thread_key === 'notion:page-thread-ready:discussion-thread-ready',
  );

  assert.ok(triageGroup);
  assert.equal(triageGroup.comment_count, 1);
  assert.equal(triageGroup.comment_triage_count, 1);
  assert.equal(triageGroup.comment_ready_count, 0);
  assert.match(triageGroup.comment_status_summary, /1 条待分流评论/);
  assert.match(triageGroup.overview_summary, /1 条待分流评论/);

  assert.ok(readyGroup);
  assert.equal(readyGroup.comment_count, 2);
  assert.equal(readyGroup.comment_ready_count, 1);
  assert.equal(readyGroup.comment_triage_count, 0);
  assert.equal(readyGroup.comment_resolved_count, 1);
  assert.match(readyGroup.comment_status_summary, /1 条评论已接回执行/);
  assert.match(readyGroup.overview_summary, /1 条已接回执行评论/);
  assert.equal(readyGroup.latest_comment_intent, 'thread_reply');
  assert.equal(readyGroup.latest_comment_policy, 'log_only');
  assert.equal(readyGroup.latest_comment_task_state, 'logged_reply');
  assert.equal(readyGroup.latest_comment_status, 'archived');
  assert.match(readyGroup.latest_comment_title, /线程回复 · 已归档/);
  assert.match(readyGroup.latest_comment_summary, /我先确认看到了这条评论，继续执行结果稍后同步。/);
  assert.match(readyGroup.latest_comment_detail, /流向：历史层/);
  assert.match(readyGroup.latest_comment_detail, /策略：仅记录到线程历史/);
  assert.match(readyGroup.latest_comment_detail, /状态：已记录回复/);
  assert.equal(readyGroup.tasks[0].task_id, `command:${readyComment.body.commandId}`);
  assert.match(readyGroup.tasks[0].title, /继续推进线程级评论状态可视化/);
  assert.ok(readyGroup.tasks[0].command_ids.includes(readyComment.body.commandId));
  assert.ok(readyGroup.tasks[0].command_ids.includes(replyResult.body.command_id));
  assert.match(workspace.body.comment_workflow.triageItems[0].title, /page-thread-triage|为什么这个线程没有继续跑/);
  assert.match(workspace.body.comment_workflow.readyItems[0].title, /page-thread-ready|继续推进线程级评论状态可视化/);
  assert.match(
    workspace.body.comment_workflow.triageItems[0].href,
    /comment_filter=triage.*#comment-threads|#comment-threads.*comment_filter=triage/,
  );
  assert.match(
    workspace.body.comment_workflow.readyItems[0].href,
    /comment_filter=ready.*#comment-threads|#comment-threads.*comment_filter=ready/,
  );
  assert.equal(workspace.body.comment_workflow.triageItems[0].actionable, true);
  assert.equal(workspace.body.comment_workflow.triageItems[0].actionMode, 'triage');
  assert.match(workspace.body.comment_workflow.triageItems[0].commandId, /^CMD-/);
  assert.equal(workspace.body.comment_workflow.triageItems[0].ownerAgent, 'agent-router');
  assert.equal(workspace.body.comment_workflow.triageItems[0].replyCapable, true);
  assert.equal(workspace.body.comment_workflow.triageItems[0].collaborationAuditItems.length, 1);
  assert.equal(workspace.body.comment_workflow.triageItems[0].collaborationAuditItems[0].kind, 'triage');
  assert.match(workspace.body.comment_workflow.triageItems[0].collaborationAuditItems[0].title, /问题 · (新建|已归档)/);
  assert.equal(workspace.body.comment_workflow.readyItems[0].actionable, true);
  assert.equal(workspace.body.comment_workflow.readyItems[0].actionMode, 'ready');
  assert.match(workspace.body.comment_workflow.readyItems[0].commandId, /^CMD-/);
  assert.equal(workspace.body.comment_workflow.readyItems[0].ownerAgent, 'agent-router');
  assert.equal(workspace.body.comment_workflow.readyItems[0].replyCapable, true);
  assert.match(workspace.body.comment_workflow.readyItems[0].proofValue, /1 条命令 \/ 1 条协同记录 \/ 1 个 Run \/ 1 个 Checkpoint/);
  assert.match(workspace.body.comment_workflow.readyItems[0].proofValue, /最近 Checkpoint：/);
  assert.match(workspace.body.comment_workflow.readyItems[0].meta.join(' '), /协同记录：1 条线程回复/);
  assert.match(workspace.body.comment_workflow.readyItems[0].latestCollaborationTitle, /线程回复 · 已归档/);
  assert.match(
    workspace.body.comment_workflow.readyItems[0].latestCollaborationSummary,
    /我先确认看到了这条评论，继续执行结果稍后同步。/,
  );
  assert.match(workspace.body.comment_workflow.readyItems[0].latestCollaborationDetail, /流向：历史层/);
  assert.equal(workspace.body.comment_workflow.readyItems[0].collaborationAuditItems.length, 1);
  assert.equal(workspace.body.comment_workflow.readyItems[0].collaborationAuditItems[0].kind, 'thread_reply');
  assert.match(
    workspace.body.comment_workflow.readyItems[0].collaborationAuditItems[0].summary,
    /我先确认看到了这条评论，继续执行结果稍后同步。/,
  );

  const response = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /评论回流中枢/);
  assert.match(html, /1 条待分流评论/);
  assert.match(html, /1 条已接回执行/);
  assert.match(
    html,
    /\/workspace\/threads\/notion%3Apage-thread-triage%3Adiscussion-thread-triage\?project_id=PRJ-cortex&amp;comment_filter=triage&amp;document_id=execution#comment-threads/,
  );
  assert.match(
    html,
    /\/workspace\/threads\/notion%3Apage-thread-ready%3Adiscussion-thread-ready\?project_id=PRJ-cortex&amp;comment_filter=ready&amp;document_id=execution#comment-threads/,
  );
  assert.match(html, /执行证据/);
  assert.match(html, /1 条命令 \/ 1 条协同记录 \/ 1 个 Run \/ 1 个 Checkpoint/);
  assert.match(html, /协同记录：1 条线程回复/);
  assert.match(html, /最近协同 · 线程回复 · 已归档/);
  assert.match(html, /我先确认看到了这条评论，继续执行结果稍后同步。/);
  assert.match(html, /流向：历史层/);
  assert.match(html, /协同审计/);
  assert.match(html, /data-home-comment-audit-item="triage"/);
  assert.match(html, /data-home-comment-audit-item="thread_reply"/);
  assert.match(html, /最近评论事件[\s\S]*最近流转/);
  assert.match(html, /最近评论事件[\s\S]*最近事件：线程回复 · 已归档/);
  assert.match(html, /最近评论事件[\s\S]*继续执行 · 新建/);
  assert.match(html, /最近评论事件[\s\S]*最近事件数：2 条/);
  assert.match(html, /首页直达动作/);
  assert.match(html, /发送回复/);
  assert.match(html, /继续执行/);
  assert.match(html, /要求修改/);
  assert.match(html, /重新执行/);
  assert.match(html, /停止任务/);
  assert.match(html, /升黄灯/);
  assert.match(html, /升红灯/);
  assert.match(html, /data-home-comment-target="reply"/);
  assert.match(html, /data-home-comment-target="derive"/);
  assert.match(html, /data-home-comment-target="comment"/);
});

test('workspace decision and comment centers surface checklist relation context on cards', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-center-focus-'));
  let nowIso = '2026-05-01T09:00:00.000Z';
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date(nowIso),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    thread_key: 'decision:legacy-orphan-001',
    thread_label: '旧孤立红灯',
    signal_level: 'red',
    question: '这条旧红灯是否已经只剩历史意义？',
    recommendation: '如果没有更多来源证据，建议归档到历史层。',
    why_now: '这条孤立决策线程没有 discussion/source 线索，应该被首页明确标成当前主闭环的一部分。',
    requested_human_action: '请确认是否继续保留这条红灯。',
  });

  const runningCommand = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-stale-run',
    page_id: 'page-stale-run',
    discussion_id: 'discussion-stale-run',
    comment_id: 'comment-stale-run',
    body: '继续推进老线程，但这次不要再把它误报成还在实时运行。',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-stale-run/discussion/discussion-stale-run/comment/comment-stale-run',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    command_id: runningCommand.body.commandId,
    agent_name: 'agent-router',
    role: 'router',
    phase: 'execute',
    status: 'running',
    title: '旧 run 仍被标成 running',
    summary: '这条 run 没有新的 receipt/checkpoint，应该在工作台里转成待回看。',
  });

  await postJson(baseUrl, '/memory', {
    project_id: 'PRJ-cortex',
    layer: 'knowledge',
    type: 'pattern',
    title: '把老线程回看规则固化成 memory',
    summary: '这条 candidate 来自已经降成待回看的旧线程，记忆治理面板应该直接告诉人它属于优先回看。',
    status: 'candidate',
    review_state: 'pending_accept',
    confidence: 'high',
    sources: [
      {
        source_type: 'notion_comment',
        source_url: 'notion://page/page-stale-run/discussion/discussion-stale-run/comment/comment-stale-run',
        summary: '来源于已经降成待回看的旧线程评论。',
      },
    ],
  });

  await postJson(baseUrl, '/inbox', {
    project_id: 'PRJ-cortex',
    thread_key: 'decision:legacy-orphan-001',
    thread_label: '旧孤立红灯',
    queue: 'review',
    object_type: 'memory',
    action_type: 'review',
    risk_level: 'yellow',
    title: '确认旧孤立红灯是否转成 durable memory',
    summary: '如果这条历史决策已经只剩治理意义，就该把它沉淀成 thread identity 收口经验。',
  });

  await postJson(baseUrl, '/suggestions', {
    project_id: 'PRJ-cortex',
    thread_key: 'notion:page-stale-run:discussion-stale-run',
    thread_label: '老线程回看说明',
    source_type: 'notion_comment',
    source_ref: 'comment-stale-run',
    proposed_text: '把老线程回看解释补进 memory 面板',
    reason: '这条线程已经从自动推进降成待回看，记忆治理面板也应该把这个原因说清楚。',
    owner_agent: 'agent-router',
  });

  nowIso = '2026-05-03T12:00:00.000Z';

  const workspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(workspace.status, 200);
  assert.equal(workspace.body.decision_focus.redItems.length, 1);
  assert.equal(workspace.body.comment_workflow.readyItems.length, 1);
  assert.equal(workspace.body.decision_focus.redItems[0].focusLabel, '当前主闭环');
  assert.equal(workspace.body.decision_focus.redItems[0].focusStepLabel, '闭环 3 / 5');
  assert.equal(workspace.body.decision_focus.redItems[0].progressLabel, '4 / 5 已收口');
  assert.equal(workspace.body.decision_focus.checklistFocusLabel, '当前主闭环');
  assert.equal(workspace.body.decision_focus.checklistFocusStepLabel, '闭环 3 / 5');
  assert.equal(workspace.body.decision_focus.checklistHeadline, '当前关联闭环 · 当前主闭环 · 闭环 3 / 5');
  assert.match(workspace.body.decision_focus.checklistNote, /thread identity 收口闭环|优先减少泛化线程和来源缺口/);
  assert.match(workspace.body.decision_focus.checklistProgressSummary, /执行清单：4 \/ 5 已收口/);
  assert.match(
    workspace.body.decision_focus.focusGuidance.actionDetail,
    /thread identity 收口闭环|优先减少泛化线程和来源缺口/,
  );
  assert.match(workspace.body.decision_focus.focusGuidance.progressLabel, /关联闭环：闭环 3 \/ 5/);
  assert.match(workspace.body.decision_focus.focusGuidance.progressLabel, /执行清单：4 \/ 5 已收口/);
  assert.equal(workspace.body.decision_focus.redItems[0].actionable, true);
  assert.match(workspace.body.decision_focus.redItems[0].decisionId, /^DR-/);
  assert.match(
    workspace.body.decision_focus.redItems[0].checklistAcceptance,
    /真实协作线程优先落到稳定 thread identity，减少 command:\* \/ decision:\* 这类泛化键。/,
  );
  assert.match(
    workspace.body.decision_focus.redItems[0].checklistCheckpointRule,
    /每完成一段都要经过：实现 -> 测试 -> live probe -> 更新 checkpoint 文档。/,
  );
  assert.match(
    workspace.body.decision_focus.redItems[0].focusNote,
    /thread identity 收口闭环|优先减少泛化线程和来源缺口/,
  );
  assert.equal(workspace.body.comment_workflow.readyItems[0].focusLabel, '优先回看');
  assert.equal(workspace.body.comment_workflow.readyItems[0].focusStepLabel, '闭环 3 / 5');
  assert.equal(workspace.body.comment_workflow.readyItems[0].progressLabel, '4 / 5 已收口');
  assert.equal(workspace.body.comment_workflow.checklistFocusLabel, '优先回看');
  assert.equal(workspace.body.comment_workflow.checklistFocusStepLabel, '闭环 3 / 5');
  assert.equal(workspace.body.comment_workflow.checklistHeadline, '当前关联闭环 · 优先回看 · 闭环 3 / 5');
  assert.match(workspace.body.comment_workflow.checklistNote, /当前需要优先回看的线程|先确认它为什么从自动推进降成待回看/);
  assert.match(workspace.body.comment_workflow.checklistProgressSummary, /执行清单：4 \/ 5 已收口/);
  assert.match(
    workspace.body.comment_workflow.focusGuidance.actionDetail,
    /当前需要优先回看的线程|先确认它为什么从自动推进降成待回看/,
  );
  assert.match(workspace.body.comment_workflow.focusGuidance.progressLabel, /关联闭环：闭环 3 \/ 5/);
  assert.match(workspace.body.comment_workflow.focusGuidance.progressLabel, /执行清单：4 \/ 5 已收口/);
  assert.match(
    workspace.body.comment_workflow.readyItems[0].checklistAcceptance,
    /真实协作线程优先落到稳定 thread identity，减少 command:\* \/ decision:\* 这类泛化键。/,
  );
  assert.match(
    workspace.body.comment_workflow.readyItems[0].checklistCheckpointRule,
    /每完成一段都要经过：实现 -> 测试 -> live probe -> 更新 checkpoint 文档。/,
  );
  assert.match(
    workspace.body.comment_workflow.readyItems[0].focusNote,
    /当前需要优先回看的线程|先确认它为什么从自动推进降成待回看/,
  );
  assert.equal(workspace.body.memory_governance.candidateCards.length, 1);
  assert.equal(workspace.body.memory_governance.reviewCards.length, 1);
  assert.equal(workspace.body.memory_governance.suggestionCards.length, 1);
  assert.equal(workspace.body.memory_governance.checklistFocusLabel, '优先回看');
  assert.equal(workspace.body.memory_governance.checklistFocusStepLabel, '闭环 3 / 5');
  assert.equal(workspace.body.memory_governance.checklistHeadline, '当前关联闭环 · 优先回看 · 闭环 3 / 5');
  assert.match(workspace.body.memory_governance.checklistNote, /当前需要优先回看的线程|先确认它为什么从自动推进降成待回看/);
  assert.match(workspace.body.memory_governance.checklistProgressSummary, /执行清单：4 \/ 5 已收口/);
  assert.match(
    workspace.body.memory_governance.focusGuidance.actionDetail,
    /当前需要优先回看的线程|先确认它为什么从自动推进降成待回看/,
  );
  assert.match(workspace.body.memory_governance.focusGuidance.progressLabel, /关联闭环：闭环 3 \/ 5/);
  assert.match(workspace.body.memory_governance.focusGuidance.progressLabel, /执行清单：4 \/ 5 已收口/);
  assert.equal(workspace.body.memory_governance.candidateCards[0].focusLabel, '优先回看');
  assert.equal(workspace.body.memory_governance.candidateCards[0].checklistStepLabel, '闭环 3 / 5');
  assert.match(
    workspace.body.memory_governance.candidateCards[0].focusNote,
    /当前需要优先回看的线程|先确认它为什么从自动推进降成待回看/,
  );
  assert.equal(workspace.body.memory_governance.reviewCards[0].focusLabel, '当前主闭环');
  assert.equal(workspace.body.memory_governance.reviewCards[0].checklistStepLabel, '闭环 3 / 5');
  assert.match(
    workspace.body.memory_governance.reviewCards[0].focusNote,
    /thread identity 收口闭环|优先减少泛化线程和来源缺口/,
  );
  assert.equal(workspace.body.memory_governance.suggestionCards[0].focusLabel, '优先回看');
  assert.equal(workspace.body.memory_governance.suggestionCards[0].checklistStepLabel, '闭环 3 / 5');
  assert.match(
    workspace.body.memory_governance.suggestionCards[0].focusNote,
    /当前需要优先回看的线程|先确认它为什么从自动推进降成待回看/,
  );

  const response = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /与当前闭环关系 · 当前主闭环 · 闭环 3 \/ 5/);
  assert.match(html, /与当前闭环关系 · 优先回看 · 闭环 3 \/ 5/);
  assert.match(html, /决策中枢[\s\S]*?当前关联闭环 · 当前主闭环 · 闭环 3 \/ 5/);
  assert.match(html, /评论回流中枢[\s\S]*?当前关联闭环 · 优先回看 · 闭环 3 \/ 5/);
  assert.match(html, /记忆治理中枢[\s\S]*?当前关联闭环 · 优先回看 · 闭环 3 \/ 5/);
  assert.match(html, /data-home-decision-center-guidance[\s\S]*?当前决策节点/);
  assert.match(html, /data-home-decision-center-guidance[\s\S]*?当前判断/);
  assert.match(html, /data-home-decision-center-guidance[\s\S]*?这一步拍板/);
  assert.match(html, /data-home-decision-center-guidance[\s\S]*?Checkpoint 规则/);
  assert.match(html, /data-home-comment-center-guidance[\s\S]*?当前评论节点/);
  assert.match(html, /data-home-comment-center-guidance[\s\S]*?当前判断/);
  assert.match(html, /data-home-comment-center-guidance[\s\S]*?下一步/);
  assert.match(html, /data-home-comment-center-guidance[\s\S]*?Checkpoint 规则/);
  assert.match(html, /data-home-memory-center-guidance[\s\S]*?当前治理节点/);
  assert.match(html, /data-home-memory-center-guidance[\s\S]*?当前判断/);
  assert.match(html, /data-home-memory-center-guidance[\s\S]*?这一步判断/);
  assert.match(
    html,
    /data-home-memory-center-guidance[\s\S]*?(当前需要优先回看的线程|先确认它为什么从自动推进降成待回看)/,
  );
  assert.match(html, /data-home-memory-center-guidance[\s\S]*?Checkpoint 规则/);
  assert.match(html, /data-runtime-health-guidance[\s\S]*?当前 runtime 节点/);
  assert.match(html, /data-runtime-health-guidance[\s\S]*?当前判断/);
  assert.match(html, /data-runtime-health-guidance[\s\S]*?这一步恢复/);
  assert.match(html, /data-runtime-health-guidance[\s\S]*?状态接口：\/workspace\/runtime-status\?project_id=PRJ-cortex/);
  assert.match(html, /允许继续/);
  assert.match(html, /要求重跑/);
  assert.match(html, /data-home-decision-action="approved"/);
  assert.match(html, /data-home-decision-action="changes_requested"/);
  assert.match(html, /data-home-decision-action="retry_requested"/);
  assert.match(html, /data-home-decision-action="stopped"/);
  assert.match(html, /执行清单：4 \/ 5 已收口/);
  assert.match(html, /优先减少泛化线程和来源缺口/);
  assert.match(html, /先确认它为什么从自动推进降成待回看/);
  assert.match(html, /决策中枢[\s\S]*?验收条件[\s\S]*?真实协作线程优先落到稳定 thread identity/);
  assert.match(html, /决策中枢[\s\S]*?Checkpoint 规则[\s\S]*?每完成一段都要经过：实现 -&gt; 测试 -&gt; live probe -&gt; 更新 checkpoint 文档。/);
  assert.match(html, /评论回流中枢[\s\S]*?验收条件[\s\S]*?真实协作线程优先落到稳定 thread identity/);
  assert.match(html, /评论回流中枢[\s\S]*?Checkpoint 规则[\s\S]*?每完成一段都要经过：实现 -&gt; 测试 -&gt; live probe -&gt; 更新 checkpoint 文档。/);
  assert.match(html, /把老线程回看规则固化成 memory[\s\S]*?与当前闭环关系 · 优先回看/);
  assert.match(html, /确认旧孤立红灯是否转成 durable memory[\s\S]*?与当前闭环关系 · 当前主闭环/);
  assert.match(html, /把老线程回看解释补进 memory 面板[\s\S]*?与当前闭环关系 · 优先回看/);
  assert.match(
    html,
    /hero-action-card[\s\S]*?记忆治理[\s\S]*?(当前需要优先回看的线程|先确认它为什么从自动推进降成待回看)[\s\S]*?打开协作记忆/,
  );

  const conflictingFocusPayload = structuredClone(workspace.body);
  conflictingFocusPayload.decision_focus = {
    ...conflictingFocusPayload.decision_focus,
    redItems: [
      {
        ...conflictingFocusPayload.decision_focus.redItems[0],
        title: '仅 red 旧焦点',
        focusLabel: '当前主闭环',
        focusNote: '仅 red 焦点说明',
        checklistProgressSummary: '执行清单：4 / 5 已收口',
        href: '/workspace/threads/red-focus',
        hrefLabel: '进入拍板现场',
      },
    ],
    yellowItems: [
      {
        ...conflictingFocusPayload.decision_focus.redItems[0],
        id: 'yellow-focus-only',
        tone: 'yellow',
        badge: '黄灯绕行中',
        title: '仅 yellow 焦点决策',
        summary: '仅 yellow 焦点摘要',
        focusLabel: '优先回看',
        focusNote: '仅 yellow 焦点说明',
        checklistProgressSummary: '执行清单：4 / 5 已收口',
        actionValue: '仅 yellow 下一步',
        href: '/workspace/threads/yellow-focus',
        hrefLabel: '进入执行现场',
      },
    ],
  };
  delete conflictingFocusPayload.decision_focus.focusGuidance;
  delete conflictingFocusPayload.decision_focus.focus_guidance;
  conflictingFocusPayload.comment_workflow = {
    ...conflictingFocusPayload.comment_workflow,
    triageItems: [
      {
        ...conflictingFocusPayload.comment_workflow.readyItems[0],
        id: 'triage-focus-only',
        tone: 'yellow',
        badge: '待分流评论',
        title: '仅 triage 旧焦点',
        summary: '仅 triage 焦点摘要',
        actionMode: 'triage',
        action_mode: 'triage',
        focusLabel: '当前主闭环',
        focus_label: '当前主闭环',
        focusNote: '仅 triage 焦点说明',
        focus_note: '仅 triage 焦点说明',
        checklistProgressSummary: '执行清单：4 / 5 已收口',
        checklist_progress_summary: '执行清单：4 / 5 已收口',
        href: '/workspace/threads/triage-focus',
        hrefLabel: '进入评论分流现场',
      },
    ],
    readyItems: [
      {
        ...conflictingFocusPayload.comment_workflow.readyItems[0],
        id: 'ready-focus-only',
        tone: 'blue',
        badge: '已接回执行',
        title: '仅 ready 焦点评论',
        summary: '仅 ready 焦点摘要',
        actionMode: 'ready',
        action_mode: 'ready',
        focusLabel: '优先回看',
        focus_label: '优先回看',
        focusNote: '仅 ready 焦点说明',
        focus_note: '仅 ready 焦点说明',
        checklistProgressSummary: '执行清单：4 / 5 已收口',
        checklist_progress_summary: '执行清单：4 / 5 已收口',
        href: '/workspace/threads/ready-focus',
        hrefLabel: '进入执行回流现场',
      },
    ],
    recentCommentCards: [],
    recent_comment_cards: [],
  };
  delete conflictingFocusPayload.comment_workflow.focusGuidance;
  delete conflictingFocusPayload.comment_workflow.focus_guidance;
  const conflictingHeroActionQueue = buildWorkspaceHeroActionQueue(
    conflictingFocusPayload.execution_checklist,
    conflictingFocusPayload.decision_focus,
    conflictingFocusPayload.comment_workflow,
    conflictingFocusPayload.memory_governance,
  );
  assert.ok(
    conflictingHeroActionQueue.some(
      (item) =>
        item.title === '仅 yellow 焦点决策' &&
        item.detail === '仅 yellow 焦点说明' &&
        item.href === '/workspace/threads/yellow-focus',
    ),
  );
  assert.ok(
    conflictingHeroActionQueue.some(
      (item) =>
        item.title === '仅 ready 焦点评论' &&
        item.detail === '仅 ready 焦点说明' &&
        item.href === '/workspace/threads/ready-focus',
    ),
  );
  const conflictingFocusHtml = renderWorkspacePage(conflictingFocusPayload);
  assert.match(
    conflictingFocusHtml,
    /data-home-decision-center-guidance[\s\S]*?仅 yellow 焦点说明/,
  );
  assert.match(
    conflictingFocusHtml,
    /data-home-comment-center-guidance[\s\S]*?仅 ready 焦点说明/,
  );
  assert.match(
    conflictingFocusHtml,
    /hero-action-card[\s\S]*?仅 yellow 焦点决策[\s\S]*?仅 yellow 焦点说明/,
  );
  assert.match(
    conflictingFocusHtml,
    /hero-action-card[\s\S]*?仅 ready 焦点评论[\s\S]*?仅 ready 焦点说明/,
  );

  const redThreadViewGroup = workspace.body.thread_groups.find(
    (group) => Number(group.red_count || group.redCount || 0) > 0,
  );
  const readyThreadViewGroup = workspace.body.thread_groups.find(
    (group) => Number(group.comment_ready_count || group.commentReadyCount || 0) > 0,
  );
  assert.ok(redThreadViewGroup);
  assert.ok(readyThreadViewGroup);

  const conflictingThreadViewPayload = structuredClone(workspace.body);
  conflictingThreadViewPayload.thread_groups = [
    {
      ...redThreadViewGroup,
      thread_label: '仅 red 线程现场',
      threadLabel: '仅 red 线程现场',
      thread_key: 'decision:red-thread-view',
      threadKey: 'decision:red-thread-view',
      checklist_focus_label: '当前主闭环',
      checklistFocusLabel: '当前主闭环',
      checklist_focus_note: '仅 red 线程焦点说明',
      checklistFocusNote: '仅 red 线程焦点说明',
      tasks: (redThreadViewGroup.tasks || []).map((task, index) =>
        index === 0
          ? {
              ...task,
              thread_href: '/workspace/threads/red-thread-view',
              threadHref: '/workspace/threads/red-thread-view',
            }
          : task,
      ),
    },
    {
      ...readyThreadViewGroup,
      thread_label: '仅 ready 线程现场',
      threadLabel: '仅 ready 线程现场',
      thread_key: 'notion:ready-thread-view',
      threadKey: 'notion:ready-thread-view',
      checklist_focus_label: '优先回看',
      checklistFocusLabel: '优先回看',
      checklist_focus_note: '仅 ready 线程焦点说明',
      checklistFocusNote: '仅 ready 线程焦点说明',
      red_count: 0,
      redCount: 0,
      tasks: (readyThreadViewGroup.tasks || []).map((task, index) =>
        index === 0
          ? {
              ...task,
              thread_href: '/workspace/threads/ready-thread-view?comment_filter=ready#comment-threads',
              threadHref: '/workspace/threads/ready-thread-view?comment_filter=ready#comment-threads',
            }
          : task,
      ),
    },
  ];

  const conflictingThreadViewHtml = renderWorkspacePage(conflictingThreadViewPayload);
  assert.match(
    conflictingThreadViewHtml,
    /data-thread-view-guidance[\s\S]*?已接回执行线程/,
  );
  assert.match(
    conflictingThreadViewHtml,
    /data-thread-view-guidance[\s\S]*?仅 ready 线程焦点说明/,
  );
  assert.match(
    conflictingThreadViewHtml,
    /data-thread-view-guidance-actions-links[\s\S]*?进入执行回流现场/,
  );

  const fallbackPayload = structuredClone(workspace.body);
  fallbackPayload.attention_view.waiting_human = fallbackPayload.attention_view.waiting_human.map((task, index) =>
    index === 0
      ? {
          ...task,
          checklist_focus_note: '',
          checklistFocusNote: '',
        }
      : task,
  );
  fallbackPayload.decision_focus.redItems = fallbackPayload.decision_focus.redItems.map((item, index) =>
    index === 0
      ? {
          ...item,
          focusNote: '',
          checklist_focus_note: '',
          checklistFocusNote: '',
          checklist_progress_summary: '',
          checklistProgressSummary: '',
        }
      : item,
  );
  fallbackPayload.comment_workflow.readyItems = fallbackPayload.comment_workflow.readyItems.map((item, index) =>
    index === 0
      ? {
          ...item,
          focusNote: '',
          checklist_focus_note: '',
          checklistFocusNote: '',
        }
      : item,
  );
  fallbackPayload.memory_governance.candidateCards = fallbackPayload.memory_governance.candidateCards.map((item, index) =>
    index === 0
      ? {
          ...item,
          focusNote: '',
          checklist_focus_note: '',
          checklistFocusNote: '',
          checklist_progress_summary: '',
          checklistProgressSummary: '',
        }
      : item,
  );
  fallbackPayload.thread_groups = fallbackPayload.thread_groups.map((group, index) =>
    index === 0
      ? {
          ...group,
          checklist_focus_note: '',
          checklistFocusNote: '',
          checklist_progress_summary: '',
          checklistProgressSummary: '',
        }
      : group,
  );

  const fallbackHtml = renderWorkspacePage(fallbackPayload);
  assert.match(
    fallbackHtml,
    /data-workspace-task-card[\s\S]*?旧孤立红灯[\s\S]*?与当前闭环关系 · 当前主闭环 · 闭环 3 \/ 5[\s\S]*?执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    fallbackHtml,
    /data-workspace-task-card[\s\S]*?data-workspace-card-body-context="workspace-task-card"/,
  );
  assert.match(
    fallbackHtml,
    /data-workspace-task-card[\s\S]*?data-workspace-card-body-middle-context="workspace-task-card"/,
  );
  assert.match(
    fallbackHtml,
    /data-workspace-task-card[\s\S]*?data-workspace-card-body-middle="workspace-task-details"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?旧孤立红灯[\s\S]*?与当前闭环关系 · 当前主闭环 · 闭环 3 \/ 5[\s\S]*?执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?data-home-card-body-context="decision-focus-card"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?data-home-card-body-middle-context="decision-focus-card"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?data-home-card-body-middle="decision-focus-details"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?data-home-inline-action-box="decision"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?data-home-inline-action-note="decision"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?data-home-inline-action-list="decision"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?data-home-inline-action-button="approved"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?旧孤立红灯[\s\S]*?checklist-context-progress[^>]*>执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    fallbackHtml,
    /data-home-comment-workflow-card[\s\S]*?与当前闭环关系 · 优先回看 · 闭环 3 \/ 5[\s\S]*?执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    fallbackHtml,
    /data-home-comment-workflow-card[\s\S]*?data-home-card-body-context="comment-workflow-card"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-comment-workflow-card[\s\S]*?data-home-card-body-middle-context="comment-workflow-card"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-comment-workflow-card[\s\S]*?data-home-card-body-middle="comment-workflow-details"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-comment-workflow-card[\s\S]*?data-home-inline-action-box="comment"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-comment-workflow-card[\s\S]*?data-home-inline-action-note="comment"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-comment-workflow-card[\s\S]*?data-home-inline-action-list="comment"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-comment-workflow-card[\s\S]*?data-home-inline-action-button="comment"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-decision-focus-card[\s\S]*?把老线程回看规则固化成 memory[\s\S]*?与当前闭环关系 · 优先回看 · 闭环 3 \/ 5[\s\S]*?执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?与当前闭环关系 · 优先回看 · 闭环 3 \/ 5[\s\S]*?执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-workspace-card-body-context="thread-group"/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?checklist-context-progress[^>]*>执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-workspace-card-body-middle-context="thread-group"[\s\S]*?data-workspace-card-body-middle="thread-group-details"/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-thread-group-task-list[\s\S]*?data-workspace-task-card/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-thread-group-stats[\s\S]*?data-thread-group-stat="tasks"/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-thread-group-stats[\s\S]*?data-thread-group-stat="red"/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-thread-group-title/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-thread-group-key/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-thread-group-updated/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-thread-group-overview/,
  );
  assert.match(
    fallbackHtml,
    /data-thread-group[\s\S]*?data-thread-group-filter-note[^>]*>当前归类：/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?把老线程回看规则固化成 memory[\s\S]*?与当前闭环关系 · 优先回看 · 闭环 3 \/ 5[\s\S]*?执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-home-card-body-context="home-grid-card"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-home-card-body-middle-context="home-grid-card"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-home-card-body-middle="home-grid-details"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-meta-grid-context="home-memory-governance-card"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-meta-grid-row="governance-node"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-meta-grid-row="source-anchor"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-workflow-next-block="next-step"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-home-memory-governance-meta-list/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-home-governance-action-box="memory"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?data-home-governance-action-note="memory"/,
  );
  assert.match(
    fallbackHtml,
    /data-home-grid-card[\s\S]*?把老线程回看规则固化成 memory[\s\S]*?checklist-context-progress[^>]*>执行清单：4 \/ 5 已收口/,
  );

  const centerSummaryFallbackPayload = structuredClone(workspace.body);
  centerSummaryFallbackPayload.decision_focus = {
    ...centerSummaryFallbackPayload.decision_focus,
    checklist_progress_summary: '',
    checklistProgressSummary: '',
    redItems: centerSummaryFallbackPayload.decision_focus.redItems.map((item) => ({
      ...item,
      progressLabel: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
    })),
    yellowItems: centerSummaryFallbackPayload.decision_focus.yellowItems.map((item) => ({
      ...item,
      progressLabel: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
    })),
    memoryCandidates: centerSummaryFallbackPayload.decision_focus.memoryCandidates.map((item) => ({
      ...item,
      progressLabel: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
    })),
  };
  centerSummaryFallbackPayload.comment_workflow = {
    ...centerSummaryFallbackPayload.comment_workflow,
    checklist_progress_summary: '',
    checklistProgressSummary: '',
    triageItems: centerSummaryFallbackPayload.comment_workflow.triageItems.map((item) => ({
      ...item,
      progressLabel: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
    })),
    readyItems: centerSummaryFallbackPayload.comment_workflow.readyItems.map((item) => ({
      ...item,
      progressLabel: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
    })),
    recentCommentCards: centerSummaryFallbackPayload.comment_workflow.recentCommentCards.map((item) => ({
      ...item,
      progressLabel: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
    })),
  };
  centerSummaryFallbackPayload.memory_governance = {
    ...centerSummaryFallbackPayload.memory_governance,
    checklist_progress_summary: '',
    checklistProgressSummary: '',
    candidateCards: centerSummaryFallbackPayload.memory_governance.candidateCards.map((item) => ({
      ...item,
      progressLabel: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
    })),
    reviewCards: centerSummaryFallbackPayload.memory_governance.reviewCards.map((item) => ({
      ...item,
      progressLabel: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
    })),
    suggestionCards: centerSummaryFallbackPayload.memory_governance.suggestionCards.map((item) => ({
      ...item,
      progressLabel: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
    })),
  };

  const centerSummaryFallbackHtml = renderWorkspacePage(centerSummaryFallbackPayload);
  assert.match(
    centerSummaryFallbackHtml,
    /id="decision-center"[\s\S]*?decision-focus-summary[\s\S]*?当前关联闭环 · 当前主闭环 · 闭环 3 \/ 5[\s\S]*?checklist-context-progress[^>]*>执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    centerSummaryFallbackHtml,
    /id="comment-workflow-center"[\s\S]*?decision-focus-summary[\s\S]*?当前关联闭环 · 优先回看 · 闭环 3 \/ 5[\s\S]*?checklist-context-progress[^>]*>执行清单：4 \/ 5 已收口/,
  );
  assert.match(
    centerSummaryFallbackHtml,
    /id="memory-governance-center"[\s\S]*?decision-focus-summary[\s\S]*?当前关联闭环 · 优先回看 · 闭环 3 \/ 5[\s\S]*?checklist-context-progress[^>]*>执行清单：4 \/ 5 已收口/,
  );

  const snakeCaseCommentWorkflowPayload = structuredClone(workspace.body);
  snakeCaseCommentWorkflowPayload.comment_workflow = {
    ...snakeCaseCommentWorkflowPayload.comment_workflow,
    summary: '仅 snake_case 评论中枢说明',
    focus_guidance: {
      ...snakeCaseCommentWorkflowPayload.comment_workflow.focusGuidance,
      nodeLabel: '仅 snake_case 评论引导',
      nodeSummary: '仅 snake_case 评论摘要',
      nodeAction: '仅 snake_case 下一步',
    },
    counts: {
      triage_threads: 5,
      triage_comments: 7,
      ready_threads: 2,
      ready_comments: 3,
      recent_comments: 9,
      recent_threads: 4,
    },
    triage_items: snakeCaseCommentWorkflowPayload.comment_workflow.triageItems,
    ready_items: snakeCaseCommentWorkflowPayload.comment_workflow.readyItems.map((item, index) =>
      index === 0
        ? {
            id: item.id,
            type: item.type,
            tone: item.tone,
            badge: item.badge,
            title: '仅 snake_case ready 卡片',
            summary: '仅 snake_case ready 摘要',
            blocker_reason: '仅 snake_case ready 判断',
            action_label: '仅 snake_case ready 动作',
            action_value: '仅 snake_case ready 下一步',
            proof_label: '仅 snake_case ready 证据',
            proof_value: '仅 snake_case ready 证据内容',
            current_node: '仅 snake_case ready 节点',
            thread_key: item.threadKey,
            command_id: item.commandId,
            owner_agent: item.ownerAgent,
            reply_capable: true,
            action_mode: 'ready',
            actionable: true,
            href: item.href,
            href_label: item.hrefLabel,
            source_href: item.sourceHref,
            audit_label: '仅 snake_case 协同审计',
            collaboration_audit_items: [
              {
                kind: 'thread_reply',
                kind_label: '仅 snake_case 审计',
                title: '仅 snake_case 审计标题',
                summary: '仅 snake_case 审计摘要',
                detail: '仅 snake_case 审计细节',
                time_label: '2026-05-01 09:00',
                tone: 'green',
              },
            ],
          }
        : item,
    ),
    recent_comment_cards: snakeCaseCommentWorkflowPayload.comment_workflow.recentCommentCards,
  };
  delete snakeCaseCommentWorkflowPayload.comment_workflow.focusGuidance;
  delete snakeCaseCommentWorkflowPayload.comment_workflow.triageItems;
  delete snakeCaseCommentWorkflowPayload.comment_workflow.readyItems;
  delete snakeCaseCommentWorkflowPayload.comment_workflow.recentCommentCards;
  snakeCaseCommentWorkflowPayload.commentWorkflow = snakeCaseCommentWorkflowPayload.comment_workflow;
  const snakeCaseCommentWorkflowHtml = renderWorkspacePage(snakeCaseCommentWorkflowPayload);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case 评论中枢说明/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case 评论引导/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case 评论摘要/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case 下一步/);
  assert.match(
    snakeCaseCommentWorkflowHtml,
    /id="comment-workflow-center"[\s\S]*?<strong>7<\/strong>[\s\S]*?5 条线程待分流/,
  );
  assert.match(
    snakeCaseCommentWorkflowHtml,
    /id="comment-workflow-center"[\s\S]*?<strong>3<\/strong>[\s\S]*?2 条线程已接回执行/,
  );
  assert.match(snakeCaseCommentWorkflowHtml, /id="comment-workflow-center"[\s\S]*?<strong>9<\/strong>[\s\S]*?最近评论事件/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case ready 卡片/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case ready 摘要/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case ready 判断/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case ready 动作/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case ready 下一步/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case ready 证据内容/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case 审计/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case 审计标题/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case 审计摘要/);
  assert.match(snakeCaseCommentWorkflowHtml, /仅 snake_case 审计细节/);

  const snakeCaseMemoryGovernancePayload = structuredClone(workspace.body);
  snakeCaseMemoryGovernancePayload.memory_governance = {
    ...snakeCaseMemoryGovernancePayload.memory_governance,
    summary: '仅 snake_case 记忆中枢说明',
    memory_doc_href: '/workspace/docs/memory?project_id=PRJ-cortex&view=memory-only',
    focus_guidance: {
      node_label: '仅 snake_case 记忆引导',
      node_summary: '仅 snake_case 记忆摘要',
      node_action: '仅 snake_case 记忆下一步',
      node_evidence: '仅 snake_case 记忆证据',
      action_detail: '仅 snake_case 记忆动作细节',
    },
    counts: {
      candidate_count: 8,
      review_count: 5,
      suggestion_count: 3,
    },
    candidate_cards: snakeCaseMemoryGovernancePayload.memory_governance.candidateCards.map((item, index) =>
      index === 0
        ? {
            id: item.id,
            type: item.type,
            tone: item.tone,
            badge: item.badge,
            title: '仅 snake_case 记忆卡片',
            summary: '仅 snake_case 记忆卡摘要',
            memory_id: item.memoryId,
            show_governance_actions: true,
            home_governance_hint: '仅 snake_case 记忆动作',
            reviewer_recommendation_summary: '仅 snake_case reviewer 建议',
            reviewer_rationale: '仅 snake_case reviewer 依据',
            evidence_summary: '仅 snake_case 记忆证据',
            evidence_updated_at: '2026-05-08T12:00:00.000Z',
            source_anchor_label: '仅 snake_case source 锚点',
            source_anchor_detail: '仅 snake_case source 说明',
            source_anchor_href: 'https://example.com/home-memory-source',
            source_anchor_href_label: '仅 snake_case 打开 source',
            freshness_label: '仅 snake_case freshness',
            freshness_detail: '仅 snake_case freshness 细节',
            evidence_delta_label: '仅 snake_case 证据变化',
            evidence_delta_detail: '仅 snake_case 证据变化细节',
            revalidation_label: '仅 snake_case 重新校验',
            revalidation_detail: '仅 snake_case 重新校验细节',
            human_review_summary: '仅 snake_case 人工判断',
            next_step: '仅 snake_case 记忆下一步',
            focus_label: '优先回看',
            checklist_focus_note: '仅 snake_case 记忆闭环说明',
            checklist_progress_summary: '执行清单：4 / 5 已收口',
            link: item.link,
          }
        : item,
    ),
    review_cards: snakeCaseMemoryGovernancePayload.memory_governance.reviewCards,
    suggestion_cards: snakeCaseMemoryGovernancePayload.memory_governance.suggestionCards,
  };
  delete snakeCaseMemoryGovernancePayload.memory_governance.focusGuidance;
  delete snakeCaseMemoryGovernancePayload.memory_governance.memoryDocHref;
  delete snakeCaseMemoryGovernancePayload.memory_governance.candidateCards;
  delete snakeCaseMemoryGovernancePayload.memory_governance.reviewCards;
  delete snakeCaseMemoryGovernancePayload.memory_governance.suggestionCards;
  snakeCaseMemoryGovernancePayload.memoryGovernance = snakeCaseMemoryGovernancePayload.memory_governance;
  const snakeCaseMemoryGovernanceHtml = renderWorkspacePage(snakeCaseMemoryGovernancePayload);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 记忆中枢说明/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 记忆引导/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 记忆摘要/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 记忆下一步/);
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /id="memory-governance-center"[\s\S]*?<strong>8<\/strong>[\s\S]*?记忆候选/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /id="memory-governance-center"[\s\S]*?<strong>5<\/strong>[\s\S]*?review 队列/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /id="memory-governance-center"[\s\S]*?<strong>3<\/strong>[\s\S]*?相关 suggestions/,
  );
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 记忆卡片/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 记忆卡摘要/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case reviewer 建议/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case reviewer 依据/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 记忆证据/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case freshness/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 证据变化/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 重新校验/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 人工判断/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case source 锚点/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case source 说明/);
  assert.match(snakeCaseMemoryGovernanceHtml, /仅 snake_case 打开 source/);
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /data-home-grid-card[\s\S]*?data-meta-grid-context="home-memory-governance-card"/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /data-home-grid-card[\s\S]*?data-meta-grid-row="reviewer-summary"/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /data-home-grid-card[\s\S]*?data-meta-grid-row="source-anchor"/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /data-home-grid-card[\s\S]*?data-workflow-next-block="next-step"[\s\S]*?仅 snake_case 记忆下一步/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /data-home-grid-card[\s\S]*?data-home-memory-governance-meta-list/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /data-home-grid-card[\s\S]*?data-home-memory-governance-meta-item/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /data-home-grid-card[\s\S]*?data-home-governance-action-box="memory"/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /data-home-grid-card[\s\S]*?data-home-governance-action-list="memory"/,
  );
  assert.match(
    snakeCaseMemoryGovernanceHtml,
    /data-home-grid-card[\s\S]*?data-home-governance-action-button="accepted"/,
  );
});

test('workspace runtime status endpoint exposes live listener drift and recovery guidance', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-runtime-status-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:10:00.000Z'),
    automationStatusBuilder: async () => ({
      ok: true,
      healthProbe: {
        ok: true,
        status: 200,
        payload: { ok: true, service: 'cortex-p0' },
      },
      processes: [
        { name: 'cortex-server', pid: 41084, running: true, covered_by: 'health_probe' },
        { name: 'executor-multi-agent-handler', pid: 41130, running: true },
        { name: 'local-notifier', pid: 41149, running: false },
      ],
      liveListener: {
        port: '19100',
        pid: 23699,
        command: 'node /tmp/cortex/src/server.js',
        workingDirectory: '/tmp/cortex',
        matchesRepoServer: true,
        matchesManagedPid: false,
        driftDetected: true,
      },
    }),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/workspace/runtime-status?project_id=PRJ-cortex`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.severity, 'degraded');
  assert.match(payload.headline, /live 端口与 managed pid 不一致/);
  assert.match(payload.recommendation, /automation:restart/);
  assert.equal(payload.process_counts.total, 3);
  assert.equal(payload.process_counts.running, 2);
  assert.equal(payload.process_counts.stopped, 1);
  assert.equal(payload.live_listener.pid, 23699);
  assert.equal(payload.live_listener.working_directory, '/tmp/cortex');
  assert.equal(payload.live_listener.drift_detected, true);
  assert.deepEqual(payload.covered_processes, ['cortex-server']);
});

test('workspace runtime status keeps listener-probe recovery distinct from health-probe coverage', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-runtime-listener-probe-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:15:00.000Z'),
    automationStatusBuilder: async () => ({
      ok: true,
      healthProbe: null,
      processes: [
        { name: 'cortex-server', pid: 41084, running: true, covered_by: 'listener_probe' },
        { name: 'executor-multi-agent-handler', pid: 41130, running: true },
      ],
      liveListener: {
        port: '19100',
        pid: 41084,
        command: 'node /repo/src/server.js',
        workingDirectory: '/repo',
        matchesRepoServer: true,
        matchesManagedPid: true,
        driftDetected: false,
      },
    }),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/workspace/runtime-status?project_id=PRJ-cortex`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.severity, 'healthy');
  assert.equal(payload.headline, 'runtime 正常，当前 live 端口已经由受管 Cortex server 接管。');
  assert.deepEqual(payload.covered_processes, []);
});

test('workspace hides stale low-specificity history threads by default but can reveal them explicitly', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-residual-'));
  let now = new Date('2026-05-08T13:00:00.000Z');
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => now,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    thread_key: 'command:legacy-run-only',
    thread_label: '旧 run 残留',
    role: 'worker',
    phase: 'execute',
    status: 'completed',
    title: '旧 run 残留',
    summary: '这是一个低特异度、已完成且陈旧的历史线程。',
    agent_name: 'agent-legacy',
    idempotency_key: 'legacy-run-only',
  });

  now = new Date('2026-05-20T13:00:00.000Z');

  const hiddenWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(hiddenWorkspace.status, 200);
  assert.equal(hiddenWorkspace.body.counts.total_tasks, 0);
  assert.equal(hiddenWorkspace.body.counts.active_threads, 0);
  assert.equal(hiddenWorkspace.body.counts.raw_total_tasks, 1);
  assert.equal(hiddenWorkspace.body.counts.raw_active_threads, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_total, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_completed_total, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_stalled_total, 0);
  assert.equal(hiddenWorkspace.body.data_hygiene.visible_low_specificity_thread_total, 0);
  assert.equal(hiddenWorkspace.body.data_hygiene.raw_low_specificity_thread_total, 1);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.attentionThreadTotal, 0);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.historyThreadTotal, 1);

  const visibleWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&include_residual=1');
  assert.equal(visibleWorkspace.status, 200);
  assert.equal(visibleWorkspace.body.counts.total_tasks, 1);
  assert.equal(visibleWorkspace.body.counts.active_threads, 1);
  assert.equal(visibleWorkspace.body.data_hygiene.hidden_low_specificity_total, 0);
  assert.equal(visibleWorkspace.body.data_hygiene.visible_low_specificity_thread_total, 1);
  assert.equal(visibleWorkspace.body.data_hygiene.raw_low_specificity_thread_total, 1);
  assert.equal(visibleWorkspace.body.thread_identity_governance.attentionThreadTotal, 1);
  assert.equal(visibleWorkspace.body.thread_identity_governance.historyThreadTotal, 0);
  assert.ok(
    visibleWorkspace.body.attention_view.completed.some((task) => task.thread_key === 'command:legacy-run-only'),
  );

  const response = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /已默认隐藏 1 条低特异度历史线程（含陈旧已完成 \/ 待回看）/);
  assert.match(html, /hero-data-hygiene-guidance/);
  assert.match(html, /data-hero-data-hygiene-guidance/);
  assert.match(html, /当前治理焦点/);
  assert.match(html, /当前默认折叠 1 条低特异度历史线程|主视图已经收口到 0 条稳定线程，当前默认折叠 1 条低特异度历史线程/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?关联闭环：第 3 步/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?验收条件/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?最近证据：/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?证据现场：/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?(打开最近源位置|打开待治理线程)/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?查看全部历史线程/);
  assert.match(html, /hero-data-hygiene-guidance[\s\S]*?打开线程治理/);
  assert.match(html, /历史层已折叠 0 条待回看 \/ 1 条已完成/);
  assert.match(html, /查看全部历史线程/);
});

test('workspace also folds recently-completed run-only low-specificity residual threads out of the default view', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-residual-run-only-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    thread_key: 'command:recent-run-only',
    thread_label: '最近 run 残留',
    role: 'worker',
    phase: 'execute',
    status: 'completed',
    title: '最近 run 残留',
    summary: '这是一个刚完成、但只有 run 没有上游 command/receipt/checkpoint 的低特异度残留线程。',
    agent_name: 'agent-legacy',
    idempotency_key: 'recent-run-only',
  });

  const hiddenWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(hiddenWorkspace.status, 200);
  assert.equal(hiddenWorkspace.body.counts.total_tasks, 0);
  assert.equal(hiddenWorkspace.body.counts.active_threads, 0);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_total, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_completed_total, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.visible_low_specificity_thread_total, 0);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.attentionThreadTotal, 0);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.historyThreadTotal, 1);

  const visibleWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&include_residual=1');
  assert.equal(visibleWorkspace.status, 200);
  assert.equal(visibleWorkspace.body.counts.total_tasks, 1);
  assert.equal(visibleWorkspace.body.counts.active_threads, 1);
  assert.equal(visibleWorkspace.body.data_hygiene.hidden_low_specificity_total, 0);
  assert.equal(visibleWorkspace.body.data_hygiene.visible_low_specificity_thread_total, 1);
  assert.ok(
    visibleWorkspace.body.attention_view.completed.some((task) => task.thread_key === 'command:recent-run-only'),
  );
  const governanceItem = visibleWorkspace.body.thread_identity_governance.items.find(
    (item) => item.threadKey === 'command:recent-run-only',
  );
  assert.equal(governanceItem.residualPattern, 'run_only_completed');
  assert.match(governanceItem.cleanupHint, /smoke|历史层|归档/);
});

test('workspace also hides long-stale low-specificity stalled threads by default', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-residual-stalled-'));
  let now = new Date('2026-05-08T13:00:00.000Z');
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => now,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    thread_key: 'brief:legacy-stalled-001',
    thread_label: '旧 brief 残留',
    title: '旧 brief 残留',
    why: '验证低特异度、长时间未动作的待回看任务会被默认隐藏。',
    context: '这类线程不该继续占着默认首页的注意力位。',
    what: '默认聚焦视图隐藏它，但保留 raw count 和显式切回历史视图的能力。',
    status: 'draft',
    idempotency_key: 'legacy-stalled-001',
  });

  now = new Date('2026-06-10T13:00:00.000Z');

  const hiddenWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(hiddenWorkspace.status, 200);
  assert.equal(hiddenWorkspace.body.counts.total_tasks, 0);
  assert.equal(hiddenWorkspace.body.counts.active_threads, 0);
  assert.equal(hiddenWorkspace.body.counts.raw_total_tasks, 1);
  assert.equal(hiddenWorkspace.body.counts.raw_active_threads, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_total, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_completed_total, 0);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_stalled_total, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.visible_low_specificity_thread_total, 0);
  assert.equal(hiddenWorkspace.body.data_hygiene.raw_low_specificity_thread_total, 1);
  assert.equal(hiddenWorkspace.body.counts.stalled_tasks, 0);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.attentionThreadTotal, 0);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.historyThreadTotal, 1);

  const visibleWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&include_residual=1');
  assert.equal(visibleWorkspace.status, 200);
  assert.equal(visibleWorkspace.body.counts.total_tasks, 1);
  assert.equal(visibleWorkspace.body.counts.active_threads, 1);
  assert.equal(visibleWorkspace.body.counts.stalled_tasks, 1);
  assert.equal(visibleWorkspace.body.data_hygiene.hidden_low_specificity_total, 0);
  assert.equal(visibleWorkspace.body.data_hygiene.visible_low_specificity_thread_total, 1);
  assert.equal(visibleWorkspace.body.data_hygiene.raw_low_specificity_thread_total, 1);
  assert.equal(visibleWorkspace.body.thread_identity_governance.attentionThreadTotal, 1);
  assert.equal(visibleWorkspace.body.thread_identity_governance.historyThreadTotal, 0);
  assert.ok(
    visibleWorkspace.body.attention_view.in_progress.some((task) => task.thread_key === 'brief:legacy-stalled-001'),
  );
  const stalledTask = visibleWorkspace.body.attention_view.in_progress.find((task) => task.thread_key === 'brief:legacy-stalled-001');
  assert.equal(stalledTask.execution_status, 'stalled');
  const governanceItem = visibleWorkspace.body.thread_identity_governance.items.find(
    (item) => item.threadKey === 'brief:legacy-stalled-001',
  );
  assert.equal(governanceItem.residualPattern, 'brief_only_dormant');
  assert.match(governanceItem.cleanupHint, /下游 command|归档/);
});

test('workspace governance can archive brief residuals and fold them out of the default board immediately', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-archive-brief-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:30:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const brief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    thread_key: 'brief:legacy-archive-001',
    thread_label: '旧 brief 草稿',
    title: '旧 brief 草稿',
    why: '验证线程治理卡可以直接触发归档动作。',
    context: '这条 brief 还没有进入真实执行链，但也不应该长期占住首页。',
    what: '把它归档为历史草稿，并让默认看板立刻折叠。',
    status: 'draft',
    idempotency_key: 'legacy-archive-001',
  });

  assert.equal(brief.status, 200);

  const beforeWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(beforeWorkspace.status, 200);
  const governanceItem = beforeWorkspace.body.thread_identity_governance.items.find(
    (item) => item.threadKey === 'brief:legacy-archive-001',
  );
  assert.ok(governanceItem);
  assert.equal(governanceItem.residualPattern, 'brief_only');
  assert.equal(governanceItem.action.kind, 'archive_brief');
  assert.equal(governanceItem.action.label, '归档为历史草稿');
  assert.equal(governanceItem.action.briefId, brief.body.brief.brief_id);

  const beforeResponse = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex`);
  const beforeHtml = await beforeResponse.text();
  assert.equal(beforeResponse.status, 200);
  assert.match(beforeHtml, /归档为历史草稿/);
  assert.match(beforeHtml, /data-governance-action="archive_brief"/);

  const archived = await postJson(baseUrl, '/task-briefs/update-status', {
    brief_id: brief.body.brief.brief_id,
    status: 'archived',
  });

  assert.equal(archived.status, 200);
  assert.equal(archived.body.brief.status, 'archived');

  const hiddenWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(hiddenWorkspace.status, 200);
  assert.equal(hiddenWorkspace.body.counts.total_tasks, 0);
  assert.equal(hiddenWorkspace.body.counts.raw_total_tasks, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_total, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_completed_total, 1);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.attentionThreadTotal, 0);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.historyThreadTotal, 1);
  assert.equal(hiddenWorkspace.body.execution_checklist.focusStatusLabel, '主视图已收口');
  assert.equal(hiddenWorkspace.body.execution_checklist.items[2].statusLabel, '主视图已收口');
  assert.match(hiddenWorkspace.body.execution_checklist.focusSummary, /默认工作台已收口到稳定线程/);
  assert.match(hiddenWorkspace.body.execution_checklist.focusEvidenceLabel, /当前历史层焦点/);
  assert.equal(hiddenWorkspace.body.execution_checklist.focusContextTitle, '历史层治理');

  const visibleWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&include_residual=1');
  assert.equal(visibleWorkspace.status, 200);
  const archivedTask = visibleWorkspace.body.attention_view.completed.find(
    (task) => task.thread_key === 'brief:legacy-archive-001',
  );
  assert.ok(archivedTask);
  assert.equal(archivedTask.execution_status, 'completed');
  const archivedGovernanceItem = visibleWorkspace.body.thread_identity_governance.items.find(
    (item) => item.threadKey === 'brief:legacy-archive-001',
  );
  assert.ok(archivedGovernanceItem);
  assert.equal(archivedGovernanceItem.action, null);
});

test('workspace offers orphan decision archive action and folds it into history after update', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-orphan-decision-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:55:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const decision = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    thread_key: 'decision:legacy-orphan-001',
    thread_label: '旧孤立红灯',
    signal_level: 'red',
    question: '这条旧红灯是否已经只剩历史意义？',
    recommendation: '如果没有更多来源证据，建议归档到历史层。',
    why_now: '验证 orphan decision 可以在治理面板直接归档。',
  });

  assert.equal(decision.status, 200);

  const beforeWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(beforeWorkspace.status, 200);
  const governanceItem = beforeWorkspace.body.thread_identity_governance.items.find(
    (item) => item.threadKey === 'decision:legacy-orphan-001',
  );
  assert.ok(governanceItem);
  assert.equal(governanceItem.residualPattern, 'orphan_decision');
  assert.equal(governanceItem.action.kind, 'archive_decision');
  assert.equal(governanceItem.action.label, '归档历史决策');
  assert.equal(governanceItem.action.resourceIdKey, 'decision_id');
  assert.equal(governanceItem.action.resourceIdValue, decision.body.decision.decision_id);
  assert.equal(governanceItem.action.endpoint, '/decisions/update-status');

  const beforeResponse = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex`);
  const beforeHtml = await beforeResponse.text();
  assert.equal(beforeResponse.status, 200);
  assert.match(beforeHtml, /归档历史决策/);
  assert.match(beforeHtml, /data-resource-id-key="decision_id"/);

  const archived = await postJson(baseUrl, '/decisions/update-status', {
    decision_id: decision.body.decision.decision_id,
    status: 'archived',
  });

  assert.equal(archived.status, 200);
  assert.equal(archived.body.decision.status, 'archived');

  const hiddenWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(hiddenWorkspace.status, 200);
  assert.equal(hiddenWorkspace.body.counts.total_tasks, 0);
  assert.equal(hiddenWorkspace.body.counts.raw_total_tasks, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_total, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_completed_total, 1);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.attentionThreadTotal, 0);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.historyThreadTotal, 1);
  assert.equal(hiddenWorkspace.body.execution_checklist.focusStatusLabel, '主视图已收口');

  const visibleWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&include_residual=1');
  assert.equal(visibleWorkspace.status, 200);
  const archivedGovernanceItem = visibleWorkspace.body.thread_identity_governance.items.find(
    (item) => item.threadKey === 'decision:legacy-orphan-001',
  );
  assert.ok(archivedGovernanceItem);
  assert.equal(archivedGovernanceItem.residualPattern, 'archived_decision');
  assert.equal(archivedGovernanceItem.action, null);
});

test('workspace folds archived low-specificity decisions into history by default', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-archive-decision-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T13:45:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const decision = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    thread_key: 'decision:legacy-archived-001',
    thread_label: '旧红灯拍板记录',
    signal_level: 'red',
    question: '这条旧红灯是否还需要继续占住主视图？',
    recommendation: '不需要，已经收口后只保留审计意义。',
    why_now: '验证低特异度 archived decision 会默认折到历史层。',
  });

  assert.equal(decision.status, 200);

  const archived = await postJson(baseUrl, '/decisions/update-status', {
    decision_id: decision.body.decision.decision_id,
    status: 'archived',
  });

  assert.equal(archived.status, 200);
  assert.equal(archived.body.decision.status, 'archived');

  const hiddenWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(hiddenWorkspace.status, 200);
  assert.equal(hiddenWorkspace.body.counts.total_tasks, 0);
  assert.equal(hiddenWorkspace.body.counts.raw_total_tasks, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_total, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_low_specificity_completed_total, 1);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.attentionThreadTotal, 0);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.historyThreadTotal, 1);
  assert.equal(hiddenWorkspace.body.execution_checklist.focusStatusLabel, '主视图已收口');
  assert.match(hiddenWorkspace.body.execution_checklist.focusEvidenceLabel, /当前历史层焦点/);

  const visibleWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&include_residual=1');
  assert.equal(visibleWorkspace.status, 200);
  const archivedTask = visibleWorkspace.body.attention_view.completed.find(
    (task) => task.thread_key === 'decision:legacy-archived-001',
  );
  assert.ok(archivedTask);
  assert.equal(archivedTask.execution_status, 'completed');
  const archivedGovernanceItem = visibleWorkspace.body.thread_identity_governance.items.find(
    (item) => item.threadKey === 'decision:legacy-archived-001',
  );
  assert.ok(archivedGovernanceItem);
  assert.equal(archivedGovernanceItem.residualPattern, 'archived_decision');
  assert.equal(archivedGovernanceItem.visibility, 'attention');
});

test('workspace keeps obvious smoke verify residuals inside synthetic history by default', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-synthetic-residuals-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T14:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    thread_key: 'command:CMD-dark-live-verify-001',
    thread_label: '只回复： dark luxury itinerary agent online。不要运行命令，返回在线状态。',
    agent_name: 'agent-dark-luxury-itinerary',
    role: 'worker',
    phase: 'execute',
    status: 'completed',
    title: '只回复： dark luxury itinerary agent online。不要运行命令，返回在线状态。',
    summary: '这条 run 只用于在线探针验收，不应该默认占住工作台治理位。',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    thread_key: 'decision:DR-smoke-red-001',
    thread_label: '本地红灯通知验收 1776168220',
    signal_level: 'red',
    status: 'archived',
    question: '本地红灯通知验收 1776168220',
    recommendation: '只用于验收，不应默认进入治理视图。',
    why_now: '这条决策只用于 smoke / 验收。',
  });

  const hiddenWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(hiddenWorkspace.status, 200);
  assert.equal(hiddenWorkspace.body.counts.total_tasks, 0);
  assert.equal(hiddenWorkspace.body.counts.raw_total_tasks, 0);
  assert.equal(hiddenWorkspace.body.thread_identity_governance.totalThreadTotal, 0);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_synthetic_total, 3);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_synthetic.recent_runs, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_synthetic.red_decisions, 1);
  assert.equal(hiddenWorkspace.body.data_hygiene.hidden_synthetic.open_inbox, 1);

  const rawWorkspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&include_synthetic=1&include_residual=1');
  assert.equal(rawWorkspace.status, 200);
  assert.equal(rawWorkspace.body.counts.total_tasks, 2);
  assert.equal(rawWorkspace.body.thread_identity_governance.totalThreadTotal, 2);
  assert.ok(
    rawWorkspace.body.thread_groups.some((group) =>
      String(group.thread_label || '').includes('dark luxury itinerary agent online'),
    ),
  );
  assert.ok(
    rawWorkspace.body.thread_groups.some((group) =>
      String(group.thread_label || '').includes('本地红灯通知验收 1776168220'),
    ),
  );
});

test('workspace governance aggregates residual patterns for quick cleanup scanning', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-residual-patterns-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T15:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    thread_key: 'command:residual-run-001',
    thread_label: '残留 run 001',
    role: 'worker',
    phase: 'execute',
    status: 'completed',
    title: '残留 run 001',
    summary: '第一条 run-only 残留。',
    agent_name: 'agent-legacy',
    idempotency_key: 'residual-run-001',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    thread_key: 'command:residual-run-002',
    thread_label: '残留 run 002',
    role: 'worker',
    phase: 'execute',
    status: 'completed',
    title: '残留 run 002',
    summary: '第二条 run-only 残留。',
    agent_name: 'agent-legacy',
    idempotency_key: 'residual-run-002',
  });

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    thread_key: 'brief:residual-brief-001',
    thread_label: '残留 brief 001',
    title: '残留 brief 001',
    why: '验证治理面板能按模式聚合统计。',
    context: '这条 brief 还没有下游 command / run。',
    what: '保留在主视图中，作为 brief-only 模式。',
    status: 'draft',
    idempotency_key: 'residual-brief-001',
  });

  const workspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&include_residual=1');
  assert.equal(workspace.status, 200);

  const patternGroups = workspace.body.thread_identity_governance.patternGroups;
  const runOnlyPattern = patternGroups.find((item) => item.residualPattern === 'run_only_completed');
  const briefOnlyPattern = patternGroups.find((item) => item.residualPattern === 'brief_only');

  assert.equal(runOnlyPattern.totalCount, 2);
  assert.equal(runOnlyPattern.attentionCount, 2);
  assert.equal(runOnlyPattern.historyCount, 0);
  assert.equal(briefOnlyPattern.totalCount, 1);
  assert.equal(briefOnlyPattern.attentionCount, 1);
  assert.equal(workspace.body.execution_checklist.focusContextTitle, '优先清理');
  assert.equal(workspace.body.execution_checklist.focusContextLinks[0].label, 'Run-only 残留 · 2 条');
  assert.match(workspace.body.execution_checklist.focusContextLinks[0].href, /residual_pattern=run_only_completed/);

  const response = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex&include_residual=1`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Run-only 残留/);
  assert.match(html, /Brief 残留/);
  assert.match(html, /主视图 2/);
  assert.match(html, /优先清理/);
  assert.match(html, /Run-only 残留 · 2 条/);

  const filteredWorkspace = await getJson(
    baseUrl,
    '/workspace/data?project_id=PRJ-cortex&include_residual=1&residual_pattern=run_only_completed',
  );
  assert.equal(filteredWorkspace.status, 200);
  assert.equal(filteredWorkspace.body.data_hygiene.residualPatternFilter, 'run_only_completed');
  assert.equal(filteredWorkspace.body.counts.total_tasks, 2);
  assert.ok(filteredWorkspace.body.tasks.every((task) => task.thread_key.startsWith('command:')));

  const filteredResponse = await fetch(
    `${baseUrl}/workspace?project_id=PRJ-cortex&include_residual=1&residual_pattern=run_only_completed`,
  );
  const filteredHtml = await filteredResponse.text();
  assert.equal(filteredResponse.status, 200);
  assert.match(filteredHtml, /当前只看：Run-only 残留/);
  assert.match(filteredHtml, /清除残留筛选/);
  assert.match(filteredHtml, /治理焦点：Run-only 残留/);
  assert.match(filteredHtml, /查看全部残留模式/);
  assert.match(filteredHtml, /当前筛选/);
  assert.match(filteredHtml, /hero-data-hygiene-guidance[\s\S]*?关联闭环：第 3 步/);
  assert.match(filteredHtml, /data-hero-data-hygiene-guidance/);
  assert.match(filteredHtml, /hero-data-hygiene-guidance[\s\S]*?Checkpoint 规则/);
  assert.match(filteredHtml, /hero-data-hygiene-guidance[\s\S]*?证据现场：/);
  assert.match(filteredHtml, /hero-data-hygiene-guidance[\s\S]*?打开证据现场/);
  assert.match(filteredHtml, /hero-data-hygiene-guidance[\s\S]*?(打开最近源位置|打开待治理线程)/);
  assert.match(filteredHtml, /hero-data-hygiene-guidance[\s\S]*?清除残留筛选/);
  assert.match(filteredHtml, /data-thread-governance-guidance[\s\S]*?当前治理节点[\s\S]*?Run-only 残留/);
  assert.match(filteredHtml, /data-thread-governance-guidance[\s\S]*?这一步处理/);
  assert.match(filteredHtml, /data-thread-governance-guidance[\s\S]*?验收条件/);
  assert.match(filteredHtml, /data-thread-governance-guidance[\s\S]*?治理规则/);
  assert.match(filteredHtml, /thread-governance[\s\S]*?打开证据现场/);
  assert.match(filteredHtml, /thread-governance[\s\S]*?清除残留筛选/);
});

test('workspace governance surfaces evidence quality for residual threads', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-governance-evidence-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T16:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    thread_key: 'command:legacy-run-only-001',
    thread_label: '继续',
    agent_name: 'agent-legacy',
    role: 'worker',
    phase: 'execute',
    status: 'completed',
    title: '继续',
    summary: '只保留了一条 run。',
    idempotency_key: 'legacy-run-only-001',
  });

  const brief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    thread_key: 'brief:legacy-checkpoint-brief-001',
    thread_label: 'v0.2 长程任务底座已接入',
    title: 'Cortex v0.2 长程任务底座升级',
    why: '这条 brief 只有 checkpoint 证据。',
    context: '模拟手工同步后只剩 brief + checkpoint 的历史残留。',
    what: '验证治理面板的证据状态说明。',
    status: 'in_progress',
    idempotency_key: 'legacy-checkpoint-brief-001',
  });

  await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    brief_id: brief.body.brief.brief_id,
    command_id: 'CMD-missing-legacy-001',
    stage: 'evaluate',
    status: 'passed',
    title: 'v0.2 长程任务底座已接入',
    summary: '只有 checkpoint，缺少上游 command 记录。',
    created_by: 'manual-sync',
    idempotency_key: 'legacy-checkpoint-brief-cp-001',
  });

  const workspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex&include_residual=1');
  assert.equal(workspace.status, 200);

  const runOnlyItem = workspace.body.thread_identity_governance.items.find(
    (item) => item.threadKey === 'command:legacy-run-only-001',
  );
  const checkpointBriefItem = workspace.body.thread_identity_governance.items.find(
    (item) => item.threadKey === 'brief:legacy-checkpoint-brief-001',
  );

  assert.equal(runOnlyItem.evidenceStatusLabel, '仅剩 Run 记录');
  assert.match(runOnlyItem.evidenceDetail, /无法回溯上游命令或评论|没有 command \/ receipt \/ checkpoint/);
  assert.equal(checkpointBriefItem.evidenceStatusLabel, 'Checkpoint 引用缺口');
  assert.match(checkpointBriefItem.evidenceDetail, /上游 command 记录没有保留下来|手工同步残留/);
  assert.equal(checkpointBriefItem.action.kind, 'recover_source_gap');
  assert.equal(checkpointBriefItem.action.label, '回到线程补来源');
  assert.match(checkpointBriefItem.action.href, /workspace\/threads\/brief%3Alegacy-checkpoint-brief-001/);

  const response = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex&include_residual=1`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /证据状态/);
  assert.match(html, /仅剩 Run 记录/);
  assert.match(html, /Checkpoint 引用缺口/);
  assert.match(html, /回到线程补来源/);
});

test('decision-only thread stays visible as its own workspace thread', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-decision-thread-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T14:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '已有主任务',
    why: '确保工作台里已经存在其他任务，避免 decision 被错误并过去。',
    context: '这个任务属于别的线程。',
    what: '继续执行已有任务。',
    status: 'in_progress',
    source_url: 'notion://page/page-existing/discussion/discussion-existing',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否允许直接上线新的线程聚合逻辑？',
    recommendation: '先在独立线程里保留这个红灯，不要并到已有任务。',
    why_now: '这个决策没有对应 brief，但必须在工作台里单独可见。',
    impact_scope: 'cross_module',
    requested_human_action: '请确认是否继续推进新的线程聚合方案。',
    source_url: 'notion://page/page-decision-only/discussion/discussion-decision-only/comment/comment-decision-only',
  });

  const workspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(workspace.status, 200);

  const decisionThread = workspace.body.thread_groups.find(
    (group) => group.thread_key === 'notion:page-decision-only:discussion-decision-only',
  );

  assert.ok(decisionThread);
  assert.equal(decisionThread.red_count, 1);
  assert.equal(decisionThread.task_count, 1);
  assert.match(decisionThread.tasks[0].title, /是否允许直接上线新的线程聚合逻辑/);
});

test('workspace current node and bucket can fall back to run / decision records when no command is visible', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-fallback-node-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T15:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    thread_key: 'thread:run-only',
    thread_label: 'Run Only Thread',
    agent_name: 'agent-router',
    role: 'router',
    phase: 'plan',
    status: 'completed',
    title: '完成路由规划',
    summary: '这个线程当前只有 run，没有 command/brief。',
  });

  const shadowCommand = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-shadow',
    target_type: 'page',
    target_id: 'page-shadow-receipt',
    page_id: 'page-shadow-receipt',
    discussion_id: 'discussion-shadow-receipt',
    comment_id: 'comment-shadow-receipt',
    body: '这条命令只用于支撑跨项目 receipt-only 线程测试。',
    owner_agent: 'agent-shadow',
    source_url: 'notion://page/page-shadow-receipt/discussion/discussion-shadow-receipt/comment/comment-shadow-receipt',
  });

  app.engine.recordReceipt({
    projectId: 'PRJ-cortex',
    commandId: shadowCommand.body.commandId,
    threadKey: 'thread:receipt-only',
    threadLabel: 'Receipt Only Thread',
    status: 'completed',
    receiptType: 'result',
    channel: 'notion_custom_agent',
    target: 'discussion://page-receipt-only/discussion-receipt-only',
    payload: {
      summary: '这条线程只有回执，没有 command / run / checkpoint。',
    },
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    thread_key: 'thread:green-decision-only',
    thread_label: 'Green Decision Thread',
    signal_level: 'green',
    status: 'proposed',
    question: '是否继续保持当前执行顺序？',
    recommendation: '继续保持，不需要打断人。',
    why_now: '验证首页在非红灯 decision-only 线程上也能显示真实节点。',
  });

  const archivedDecision = await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    thread_key: 'thread:archived-red-decision',
    thread_label: 'Archived Red Decision Thread',
    signal_level: 'red',
    question: '这条历史红灯是否已经处理完毕？',
    recommendation: '已归档，不需要继续占用系统处理中。',
    why_now: '验证归档后的单决策线程会进入完成区。',
  });

  await postJson(baseUrl, '/decisions/update-status', {
    decision_id: archivedDecision.body.decision.decision_id,
    status: 'archived',
  });

  const workspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(workspace.status, 200);

  const runOnlyTask = workspace.body.attention_view.completed.find((task) => task.thread_key === 'thread:run-only');
  const receiptOnlyTask = workspace.body.attention_view.completed.find((task) => task.thread_key === 'thread:receipt-only');
  const greenDecisionTask = workspace.body.attention_view.in_progress.find(
    (task) => task.thread_key === 'thread:green-decision-only',
  );
  const archivedDecisionTask = workspace.body.attention_view.completed.find(
    (task) => task.thread_key === 'thread:archived-red-decision',
  );

  assert.ok(runOnlyTask);
  assert.ok(receiptOnlyTask);
  assert.ok(greenDecisionTask);
  assert.ok(archivedDecisionTask);
  assert.equal(workspace.body.counts.in_progress_tasks, 1);
  assert.equal(workspace.body.counts.completed_tasks, 3);
  assert.match(runOnlyTask.current_node, /Run · 已完成 \/ Plan/);
  assert.match(receiptOnlyTask.current_node, /回执 · 已回执/);
  assert.match(receiptOnlyTask.latest_receipt_label, /已回执/);
  assert.match(greenDecisionTask.current_node, /决策 · 绿灯 \/ 待确认/);
  assert.match(archivedDecisionTask.current_node, /决策 · 红灯 \/ 已归档/);
});

test('workspace marks long-stale active execution as stalled instead of pretending it is still running', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-stale-active-'));
  let nowIso = '2026-05-01T09:00:00.000Z';
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date(nowIso),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const runningCommand = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-stale-run',
    page_id: 'page-stale-run',
    discussion_id: 'discussion-stale-run',
    comment_id: 'comment-stale-run',
    body: '继续推进老线程，但这次不要再把它误报成还在实时运行。',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-stale-run/discussion/discussion-stale-run/comment/comment-stale-run',
  });

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    command_id: runningCommand.body.commandId,
    agent_name: 'agent-router',
    role: 'router',
    phase: 'execute',
    status: 'running',
    title: '旧 run 仍被标成 running',
    summary: '这条 run 没有新的 receipt/checkpoint，应该在工作台里转成待回看。',
  });

  nowIso = '2026-05-03T12:00:00.000Z';

  const workspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(workspace.status, 200);
  assert.equal(workspace.body.counts.in_progress_tasks, 1);
  assert.equal(workspace.body.counts.stalled_tasks, 1);
  assert.equal(workspace.body.execution_checklist.completedCount, 4);
  assert.equal(workspace.body.execution_checklist.focusTitle, 'thread_key / thread_label 收口');
  assert.equal(workspace.body.execution_checklist.revisitContextTitle, '优先回看');
  assert.match(workspace.body.execution_checklist.revisitContextLinks[0].label, /待回看/);
  assert.match(
    workspace.body.execution_checklist.revisitContextLinks[0].href,
    /workspace\/threads\/notion%3Apage-stale-run%3Adiscussion-stale-run/,
  );

  const staleTask = workspace.body.attention_view.in_progress.find(
    (task) => task.thread_key === 'notion:page-stale-run:discussion-stale-run',
  );
  const staleGroup = workspace.body.thread_groups.find(
    (group) => group.thread_key === 'notion:page-stale-run:discussion-stale-run',
  );

  assert.ok(staleTask);
  assert.ok(staleGroup);
  assert.equal(staleTask.execution_status, 'stalled');
  assert.equal(staleTask.checklist_focus_label, '优先回看');
  assert.equal(staleTask.checklist_step_label, '闭环 3 / 5');
  assert.equal(staleTask.checklist_progress_label, '4 / 5 已收口');
  assert.match(
    staleTask.checklist_acceptance,
    /真实协作线程优先落到稳定 thread identity，减少 command:\* \/ decision:\* 这类泛化键。/,
  );
  assert.match(
    staleTask.checklist_checkpoint_rule,
    /每完成一段都要经过：实现 -> 测试 -> live probe -> 更新 checkpoint 文档。/,
  );
  assert.match(staleTask.checklist_focus_note, /当前需要优先回看的线程/);
  assert.equal(staleGroup.checklist_focus_label, '优先回看');
  assert.equal(staleGroup.checklist_step_label, '闭环 3 / 5');
  assert.equal(staleGroup.checklist_progress_label, '4 / 5 已收口');
  assert.match(
    staleGroup.checklist_acceptance,
    /真实协作线程优先落到稳定 thread identity，减少 command:\* \/ decision:\* 这类泛化键。/,
  );
  assert.match(
    staleGroup.checklist_checkpoint_rule,
    /每完成一段都要经过：实现 -> 测试 -> live probe -> 更新 checkpoint 文档。/,
  );
  assert.match(staleGroup.checklist_focus_note, /当前需要优先回看的线程/);
  assert.match(staleTask.current_node, /长时间未回执/);
  assert.match(staleTask.status_note, /降为待回看/);
  assert.match(staleTask.blocker_reason, /没有新的 run \/ receipt \/ checkpoint 更新/);
  assert.match(staleTask.recommended_action, /回看最近一次评论或 checkpoint/);

  const response = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex`);
  const html = await response.text();
  assert.match(html, /优先回看/);
  assert.match(html, /闭环 3 \/ 5/);
  assert.match(html, /执行清单：4 \/ 5 已收口/);
  assert.match(html, /待回看/);
  assert.match(html, /与当前闭环关系/);
  assert.match(html, /继续推进老线程，但这次不要再把它误报成还在实时运行。[\s\S]*?验收条件[\s\S]*?真实协作线程优先落到稳定 thread identity/);
  assert.match(html, /notion:page-stale-run:discussion-stale-run[\s\S]*?Checkpoint 规则[\s\S]*?每完成一段都要经过：实现 -&gt; 测试 -&gt; live probe -&gt; 更新 checkpoint 文档。/);
});

test('workspace attention view merges duplicate brief-only cards but keeps raw thread task count', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-duplicate-brief-merge-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-08T16:00:00.000Z'),
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const sharedBrief = {
    project_id: 'PRJ-cortex',
    thread_key: 'thread:pm-followup',
    thread_label: 'PM Followup',
    title: 'PM 跟进：@pm 把这段需求整理成 why/context/what',
    why: '验证首页是否会被同线程相近 brief 噪音淹没。',
    context: '两个 brief 都属于同一条评论线程，而且当前还没有进入 command/run。',
    what: '让 attention 视图只显示一张卡，但 thread 视图保留真实任务数。',
    status: 'draft',
  };

  await postJson(baseUrl, '/task-briefs', {
    ...sharedBrief,
    idempotency_key: 'brief-duplicate-001',
  });
  await postJson(baseUrl, '/task-briefs', {
    ...sharedBrief,
    idempotency_key: 'brief-duplicate-002',
  });

  const workspace = await getJson(baseUrl, '/workspace/data?project_id=PRJ-cortex');
  assert.equal(workspace.status, 200);
  assert.equal(workspace.body.counts.total_tasks, 1);
  assert.equal(workspace.body.counts.raw_total_tasks, 2);
  assert.equal(workspace.body.data_hygiene.merged_attention_duplicates, 1);
  assert.equal(workspace.body.attention_view.in_progress.length, 1);
  assert.equal(workspace.body.thread_groups.length, 1);
  assert.equal(workspace.body.thread_groups[0].task_count, 2);
  assert.equal(workspace.body.data_hygiene.concrete_thread_total, 1);
  assert.equal(workspace.body.data_hygiene.visible_low_specificity_thread_total, 0);
  assert.equal(workspace.body.attention_view.in_progress[0].merged_task_count, 2);
  assert.equal(workspace.body.attention_view.in_progress[0].thread_task_count, 2);

  const response = await fetch(`${baseUrl}/workspace?project_id=PRJ-cortex`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /首页已合并 1 张同线程相近卡/);
  assert.match(html, /同线程任务：2/);
  assert.match(html, /已合并相近卡：2/);
});
