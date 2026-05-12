import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCortexServer } from '../src/server.js';
import {
  buildWorkspaceDocumentPayload,
  pickWorkspaceDocumentThreadGroup,
  renderWorkspaceDocumentPage,
} from '../src/workspace-docs.js';

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

function extractSectionById(html, id) {
  const match = html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>([\\s\\S]*?)</section>`));
  return match ? match[1] : '';
}

test('workspace docs default thread picker prefers checklist focus before earlier red thread', () => {
  const earlierRedGroup = {
    thread_key: 'thread-red-earlier',
    red_count: 1,
    checklist_focus_label: '当前主闭环',
    tasks: [
      {
        brief_id: 'brief-red-earlier',
      },
    ],
  };
  const readyFocusGroup = {
    thread_key: 'thread-ready-focus',
    comment_ready_count: 1,
    checklist_focus_label: '优先回看',
    tasks: [
      {
        brief_id: 'brief-ready-focus',
      },
    ],
  };

  assert.equal(
    pickWorkspaceDocumentThreadGroup([earlierRedGroup, readyFocusGroup])?.thread_key,
    'thread-ready-focus',
  );
  assert.equal(
    pickWorkspaceDocumentThreadGroup([earlierRedGroup, readyFocusGroup], 'thread-red-earlier')?.thread_key,
    'thread-red-earlier',
  );
  assert.equal(
    pickWorkspaceDocumentThreadGroup([earlierRedGroup, readyFocusGroup], 'brief:brief-ready-focus')?.thread_key,
    'thread-ready-focus',
  );
});

test('workspace document page renders three-column execution surface', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-docs-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-docs-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T02:00:00.000Z'),
    cwd,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
    root_page_url: 'https://www.notion.so/project/cortex-workspace',
  });

  await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '线程文档现场验收',
    why: '需要验证首页可以跳进具体执行现场。',
    context: '至少应该有文档目录、中间文档区、右侧线程区。',
    what: '让 /workspace/docs/execution 可访问。',
    status: 'in_progress',
    source_url: 'notion://page/page-doc/discussion/discussion-doc',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否允许直接改动执行文档结构？',
    recommendation: '先在新路由中承接，不直接改旧链路。',
    why_now: '需要补文档协作页。',
    impact_scope: 'cross_module',
    source_url: 'notion://page/page-doc/discussion/discussion-doc',
  });

  await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-doc',
    page_id: 'page-doc',
    discussion_id: 'discussion-doc',
    comment_id: 'comment-doc',
    body: '为什么这个线程还没有继续跑？',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-doc/discussion/discussion-doc/comment/comment-doc',
  });

  const executionPayload = buildWorkspaceDocumentPayload(app.engine, 'PRJ-cortex', 'execution', { cwd });
  assert.strictEqual(executionPayload.execution_checklist.focus_guidance, executionPayload.execution_focus_guidance);
  assert.strictEqual(executionPayload.executionChecklist.focusGuidance, executionPayload.executionFocusGuidance);
  assert.strictEqual(executionPayload.thread_panel, executionPayload.threadPanel);
  assert.strictEqual(executionPayload.thread_event_summary, executionPayload.threadEventSummary);
  assert.strictEqual(executionPayload.thread_detail.comment_focus_map, executionPayload.comment_focus_map);
  assert.strictEqual(executionPayload.threadDetail.commentFocusMap, executionPayload.commentFocusMap);
  assert.strictEqual(executionPayload.thread_detail.selected_comment_focus, executionPayload.selected_comment_focus);
  assert.strictEqual(executionPayload.threadDetail.selectedCommentFocus, executionPayload.selectedCommentFocus);
  assert.strictEqual(
    executionPayload.focus_strip_workflow_guidance.nodeStateLabel,
    executionPayload.focusStripWorkflowGuidance.nodeStateLabel,
  );
  assert.equal(executionPayload.execution_focus_guidance.eyebrow, '当前主闭环');
  const workflowProofCard = executionPayload.execution_focus_guidance.proofCards.find(
    (card) => card.kind === 'execution-workflow-node',
  );
  const nodeAcceptanceProofCard = executionPayload.execution_focus_guidance.proofCards.find(
    (card) => card.kind === 'execution-node-acceptance',
  );
  const nodeCheckpointProofCard = executionPayload.execution_focus_guidance.proofCards.find(
    (card) => card.kind === 'execution-node-checkpoint-rule',
  );
  assert.ok(workflowProofCard);
  assert.ok(nodeAcceptanceProofCard);
  assert.ok(nodeCheckpointProofCard);
  assert.match(workflowProofCard.title, /当前节点 · 拍板 · 红灯 \/ 待拍板/);
  assert.match(workflowProofCard.body, /当前线程停在红灯拍板节点/);
  assert.ok(workflowProofCard.progressItems.some((item) => /线程状态：待拍板线程/.test(item)));
  assert.ok(workflowProofCard.progressItems.some((item) => /状态说明：1 条待分流评论 · 1 个红灯/.test(item)));
  assert.ok(
    workflowProofCard.progressItems.some(
      (item) => /这一步处理：/.test(item) && /补拍板或明确绕行动作/.test(item),
    ),
  );
  assert.equal(nodeAcceptanceProofCard.title, '这一步验收');
  assert.equal(nodeCheckpointProofCard.title, 'Checkpoint 规则');
  assert.equal(nodeAcceptanceProofCard.body, executionPayload.focus_strip_workflow_guidance.nodeAcceptance);
  assert.equal(nodeCheckpointProofCard.body, executionPayload.focus_strip_workflow_guidance.nodeCheckpointRule);
  assert.ok(executionPayload.execution_focus_guidance.proofCards.some((card) => card.kind === 'execution-focus-evidence'));
  assert.ok(executionPayload.execution_focus_guidance.actions.some((action) => action.label === '打开证据现场'));
  assert.match(executionPayload.thread_event_summary, /当前线程已投影 4 个事件/);
  assert.equal(executionPayload.threadPanel.queueSummary, executionPayload.thread_panel.queue_summary);
  assert.equal(executionPayload.threadPanel.stateLabel, executionPayload.thread_panel.state_label);
  assert.match(executionPayload.threadPanel.stateLabel, /待拍板线程/);
  assert.match(executionPayload.threadPanel.stateSummary, /1 条待分流评论 · 1 个红灯/);
  assert.match(executionPayload.threadPanel.stateAction, /补拍板或明确绕行动作/);
  assert.equal(executionPayload.thread_detail.comment_summary.triage_count, executionPayload.thread_detail.comment_summary.triageCount);
  assert.equal(executionPayload.thread_detail.comment_summary.ready_count, executionPayload.thread_detail.comment_summary.readyCount);
  assert.equal(executionPayload.thread_detail.comment_summary.default_focus.headline, executionPayload.thread_detail.comment_summary.defaultFocus.headline);
  assert.equal(executionPayload.thread_detail.comment_summary.selected_focus.headline, executionPayload.thread_detail.comment_summary.selectedFocus.headline);
  assert.equal(executionPayload.comment_focus_map.triage.comment?.queueBucket, 'triage');
  assert.equal(executionPayload.comment_focus_map.resolved.comment, null);
  assert.equal(executionPayload.comment_focus_map.resolved.selected_focus.count, 0);
  assert.equal(executionPayload.selected_comment_focus?.queueBucket, 'triage');
  assert.equal(
    executionPayload.thread_detail.comment_threads[0].queue_bucket,
    executionPayload.thread_detail.comment_threads[0].queueBucket,
  );
  assert.equal(
    executionPayload.thread_detail.comment_threads[0].command_id,
    executionPayload.thread_detail.comment_threads[0].commandId,
  );
  assert.equal(
    executionPayload.thread_detail.comment_threads[0].source_url,
    executionPayload.thread_detail.comment_threads[0].sourceUrl,
  );
  assert.ok(Array.isArray(executionPayload.thread_detail.comment_threads[0].collaboration_audit_items));
  assert.deepEqual(
    executionPayload.thread_detail.comment_threads[0].collaboration_audit_items,
    executionPayload.thread_detail.comment_threads[0].collaborationAuditItems,
  );
  assert.equal(
    executionPayload.thread_detail.comment_threads[0].collaboration_audit_items[0].kind_label,
    executionPayload.thread_detail.comment_threads[0].collaborationAuditItems[0].kindLabel,
  );
  assert.equal(
    executionPayload.selected_comment_focus.command_id,
    executionPayload.selected_comment_focus.commandId,
  );
  assert.equal(
    executionPayload.selected_comment_focus.source_url,
    executionPayload.selected_comment_focus.sourceUrl,
  );
  assert.deepEqual(
    executionPayload.selected_comment_focus.collaboration_audit_items,
    executionPayload.selected_comment_focus.collaborationAuditItems,
  );
  assert.equal(executionPayload.compose_owner_agent, 'agent-router');
  assert.match(executionPayload.topbar_status, /当前线程：/);

  const overriddenPayload = structuredClone(executionPayload);
  overriddenPayload.comment_focus_map.triage.comment = {
    ...overriddenPayload.comment_focus_map.triage.comment,
    nextAction: '来自 payload 覆盖的下一步',
  };
  overriddenPayload.commentFocusMap = overriddenPayload.comment_focus_map;
  overriddenPayload.selected_comment_focus = {
    ...overriddenPayload.selected_comment_focus,
    nextAction: '来自 payload 覆盖的下一步',
  };
  overriddenPayload.selectedCommentFocus = overriddenPayload.selected_comment_focus;
  overriddenPayload.thread_detail = {
    ...overriddenPayload.thread_detail,
    comment_focus_map: overriddenPayload.comment_focus_map,
    selected_comment_focus: overriddenPayload.selected_comment_focus,
    commentFocusMap: overriddenPayload.comment_focus_map,
    selectedCommentFocus: overriddenPayload.selected_comment_focus,
  };
  overriddenPayload.threadDetail = overriddenPayload.thread_detail;
  overriddenPayload.topbar_status = '来自 payload 的顶部状态';
  overriddenPayload.topbarStatus = overriddenPayload.topbar_status;
  overriddenPayload.compose_owner_agent = 'agent-from-payload';
  overriddenPayload.composeOwnerAgent = overriddenPayload.compose_owner_agent;
  overriddenPayload.thread_event_summary = '来自 payload 的线程事件摘要';
  overriddenPayload.threadEventSummary = overriddenPayload.thread_event_summary;
  const overriddenHtml = renderWorkspaceDocumentPage(overriddenPayload);
  assert.match(overriddenHtml, /来自 payload 的顶部状态/);
  assert.match(overriddenHtml, /来自 payload 覆盖的下一步/);
  assert.match(overriddenHtml, /agent-from-payload/);
  assert.match(overriddenHtml, /来自 payload 的线程事件摘要/);

  const camelCasePayload = structuredClone(executionPayload);
  camelCasePayload.selectedThread = camelCasePayload.selected_thread;
  delete camelCasePayload.selected_thread;
  camelCasePayload.threadPanel = camelCasePayload.thread_panel;
  delete camelCasePayload.thread_panel;
  camelCasePayload.executionChecklist = camelCasePayload.execution_checklist;
  delete camelCasePayload.execution_checklist;
  camelCasePayload.commentFocusMap = camelCasePayload.comment_focus_map;
  delete camelCasePayload.comment_focus_map;
  camelCasePayload.selectedCommentFocus = {
    ...camelCasePayload.selected_comment_focus,
    nextAction: '仅 camelCase 下一步',
  };
  delete camelCasePayload.selected_comment_focus;
  camelCasePayload.topbarStatus = '仅 camelCase 顶部状态';
  delete camelCasePayload.topbar_status;
  camelCasePayload.composeOwnerAgent = 'agent-camel-case-only';
  delete camelCasePayload.compose_owner_agent;
  camelCasePayload.threadEventSummary = '仅 camelCase 线程事件摘要';
  delete camelCasePayload.thread_event_summary;
  camelCasePayload.commentFocusMap.triage.comment = {
    ...camelCasePayload.commentFocusMap.triage.comment,
    nextAction: '仅 camelCase 下一步',
  };
  camelCasePayload.threadDetail = {
    ...camelCasePayload.threadDetail,
    executionSnapshot: camelCasePayload.threadDetail.executionSnapshot,
    commentSummary: camelCasePayload.threadDetail.commentSummary,
    commentThreads: camelCasePayload.threadDetail.commentThreads,
    openDecisions: camelCasePayload.threadDetail.openDecisions,
    sourceRecovery: camelCasePayload.threadDetail.sourceRecovery,
    commentFocusMap: camelCasePayload.commentFocusMap,
    selectedCommentFocus: camelCasePayload.selectedCommentFocus,
  };
  delete camelCasePayload.threadDetail.execution_snapshot;
  delete camelCasePayload.threadDetail.comment_summary;
  delete camelCasePayload.threadDetail.comment_threads;
  delete camelCasePayload.threadDetail.open_decisions;
  delete camelCasePayload.threadDetail.source_recovery;
  delete camelCasePayload.threadDetail.comment_focus_map;
  delete camelCasePayload.threadDetail.selected_comment_focus;
  delete camelCasePayload.thread_detail;
  const camelCaseHtml = renderWorkspaceDocumentPage(camelCasePayload);
  assert.match(camelCaseHtml, /仅 camelCase 顶部状态/);
  assert.match(camelCaseHtml, /仅 camelCase 下一步/);
  assert.match(camelCaseHtml, /agent-camel-case-only/);
  assert.match(camelCaseHtml, /仅 camelCase 线程事件摘要/);

  const snakeCaseSummaryPayload = structuredClone(executionPayload);
  const resolvedFilter = snakeCaseSummaryPayload.thread_detail.comment_summary.filters.find((filter) => filter.value === 'resolved');
  snakeCaseSummaryPayload.thread_detail = {
    ...snakeCaseSummaryPayload.thread_detail,
    comment_summary: {
      total: snakeCaseSummaryPayload.thread_detail.comment_summary.total,
      triage_count: snakeCaseSummaryPayload.thread_detail.comment_summary.triageCount,
      ready_count: snakeCaseSummaryPayload.thread_detail.comment_summary.readyCount,
      rejected_count: snakeCaseSummaryPayload.thread_detail.comment_summary.rejectedCount,
      resolved_count: snakeCaseSummaryPayload.thread_detail.comment_summary.resolvedCount,
      active_count: snakeCaseSummaryPayload.thread_detail.comment_summary.activeCount,
      headline: '仅 snake_case 评论总览',
      detail: '仅 snake_case 评论说明',
      default_filter: 'resolved',
      selected_filter: 'resolved',
      filters: snakeCaseSummaryPayload.thread_detail.comment_summary.filters.map((filter) => ({
        value: filter.value,
        label: filter.label,
        count: filter.count,
        headline: filter.headline,
        detail: filter.detail,
      })),
      default_focus: {
        ...resolvedFilter,
        headline: '仅 snake_case 默认焦点',
        detail: '仅 snake_case 默认焦点说明',
      },
      selected_focus: {
        ...resolvedFilter,
        headline: '仅 snake_case 当前焦点',
        detail: '仅 snake_case 当前焦点说明',
      },
    },
  };
  delete snakeCaseSummaryPayload.thread_detail.commentSummary;
  snakeCaseSummaryPayload.threadDetail = snakeCaseSummaryPayload.thread_detail;
  const snakeCaseSummaryHtml = renderWorkspaceDocumentPage(snakeCaseSummaryPayload);
  assert.match(snakeCaseSummaryHtml, /仅 snake_case 评论总览/);
  assert.match(snakeCaseSummaryHtml, /仅 snake_case 评论说明/);
  assert.match(snakeCaseSummaryHtml, /仅 snake_case 当前焦点/);
  assert.match(snakeCaseSummaryHtml, /仅 snake_case 当前焦点说明/);
  assert.match(snakeCaseSummaryHtml, /data-default-filter="resolved"/);

  const snakeCaseCommentPayload = structuredClone(executionPayload);
  const snakeCaseCommentCard = {
    title: '仅 snake_case 评论卡',
    summary: '仅 snake_case 评论摘要',
    queue_bucket: 'triage',
    queue_bucket_label: '仅 snake_case 评论分组',
    command_id: executionPayload.thread_detail.comment_threads[0].commandId,
    owner_agent: executionPayload.thread_detail.comment_threads[0].ownerAgent,
    command_status_label: '仅 snake_case 命令状态',
    execution_policy_label: '仅 snake_case 执行策略',
    task_state_label: '仅 snake_case 任务状态',
    reason_label: '仅 snake_case 判断原因',
    node_label: '仅 snake_case 节点',
    node_summary: '仅 snake_case 节点说明',
    node_acceptance: '仅 snake_case 验收',
    node_checkpoint_rule: '仅 snake_case Checkpoint 规则',
    node_evidence: '仅 snake_case 节点证据',
    next_action: '仅 snake_case 下一步',
    source_url: 'https://example.com/comment-source',
    collaboration_audit_summary: '仅 snake_case 协同审计摘要',
    collaboration_audit_items: [
      {
        kind: 'triage',
        kind_label: '仅 snake_case 审计标签',
        summary: '仅 snake_case 审计摘要',
        detail: '仅 snake_case 审计细节',
        time_label: '2026-05-09 10:00',
        status_label: '仅 snake_case 审计状态',
        owner_agent: 'agent-router',
        source_url: 'https://example.com/audit-source',
        tone: 'yellow',
      },
    ],
    flow_counts_label: '仅 snake_case 流转统计',
    latest_run_status_label: '仅 snake_case Run',
    latest_receipt_label: '仅 snake_case 回执',
    latest_checkpoint_summary: '仅 snake_case Checkpoint',
    related_task_label: '仅 snake_case 关联任务',
    related_task_href: '#task-snake',
  };
  snakeCaseCommentPayload.thread_detail = {
    ...snakeCaseCommentPayload.thread_detail,
    comment_threads: [snakeCaseCommentCard],
    comment_focus_map: {
      triage: {
        filter: 'triage',
        selected_focus: {
          value: 'triage',
          filter_value: 'triage',
          filterValue: 'triage',
          label: '待分流',
          count: 1,
          count_label: '1 条',
          headline: '仅 snake_case 评论焦点',
          detail: '仅 snake_case 评论焦点说明',
        },
        comment: snakeCaseCommentCard,
      },
    },
    selected_comment_focus: snakeCaseCommentCard,
    comment_summary: {
      ...snakeCaseCommentPayload.thread_detail.comment_summary,
      default_filter: 'triage',
      selected_filter: 'triage',
    },
  };
  delete snakeCaseCommentPayload.thread_detail.commentThreads;
  delete snakeCaseCommentPayload.thread_detail.commentFocusMap;
  delete snakeCaseCommentPayload.thread_detail.selectedCommentFocus;
  delete snakeCaseCommentPayload.thread_detail.commentSummary;
  snakeCaseCommentPayload.threadDetail = snakeCaseCommentPayload.thread_detail;
  snakeCaseCommentPayload.comment_focus_map = snakeCaseCommentPayload.thread_detail.comment_focus_map;
  delete snakeCaseCommentPayload.commentFocusMap;
  snakeCaseCommentPayload.selected_comment_focus = snakeCaseCommentPayload.thread_detail.selected_comment_focus;
  delete snakeCaseCommentPayload.selectedCommentFocus;
  const snakeCaseCommentHtml = renderWorkspaceDocumentPage(snakeCaseCommentPayload);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 评论焦点/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 评论焦点说明/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 评论卡/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 评论摘要/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 命令状态/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 节点/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 节点说明/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 验收/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case Checkpoint 规则/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 下一步/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 协同审计摘要/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 审计标签/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 审计摘要/);
  assert.match(snakeCaseCommentHtml, /仅 snake_case 审计细节/);

  const response = await fetch(`${baseUrl}/workspace/docs/execution?project_id=PRJ-cortex`);
  const html = await response.text();
  const focusStrip = extractSectionById(html, 'execution-focus-strip');

  assert.equal(response.status, 200);
  assert.match(html, /文档目录/);
  assert.match(html, /线程目录/);
  assert.match(html, /执行文档/);
  assert.match(html, /返回工作台/);
  assert.match(html, /文档导航/);
  assert.match(html, /风险举手/);
  assert.match(html, /评论约定/);
  assert.match(html, /href="#doc-heading-/);
  assert.match(html, /保存文档/);
  assert.match(html, /快速拍板/);
  assert.match(html, /协作输入/);
  assert.match(html, /直接继续执行/);
  assert.match(html, /线程事件/);
  assert.match(html, /data-comment-filter-bar/);
  assert.match(html, /data-comment-filter="all"/);
  assert.match(html, /data-comment-filter="triage"/);
  assert.match(html, /data-comment-filter="ready"/);
  assert.match(html, /data-comment-focus-for="triage"/);
  assert.match(html, /data-comment-focus-for="resolved"/);
  assert.match(html, /执行 Checklist/);
  assert.match(html, /id="execution-focus-strip"/);
  assert.match(html, /data-execution-focus-strip/);
  assert.match(html, /data-focus-proof-kind="execution-direct-links"/);
  assert.match(html, /data-focus-proof-kind="execution-workflow-node"/);
  assert.match(html, /data-focus-proof-kind="execution-node-acceptance"/);
  assert.match(html, /data-focus-proof-kind="execution-node-checkpoint-rule"/);
  assert.match(html, /data-focus-proof-kind="execution-focus-evidence"/);
  assert.match(html, /data-focus-proof-kind="execution-next-acceptance"/);
  assert.match(html, /data-focus-proof-kind="execution-checkpoint-rule"/);
  assert.match(html, /当前执行引导/);
  assert.match(html, /闭环进度/);
  assert.match(html, /80% · 4 \/ 5 已收口/);
  assert.match(html, /当前主闭环/);
  assert.match(html, /最近证据/);
  assert.match(html, /下一条验收/);
  assert.match(html, /现场直达/);
  assert.match(html, /查看任务流转/);
  assert.match(html, /查看评论线程 · 1 条/);
  assert.match(html, /查看快速拍板 · 1 条/);
  assert.match(html, /打开当前主闭环|打开线程治理/);
  assert.match(focusStrip, /证据现场：(线程治理|线程治理现场|历史层残留)/);
  assert.match(html, /红灯待拍板|红灯拍板|黄灯绕行中|黄灯绕行/);
  assert.match(html, /评论分流/);
  assert.match(focusStrip, /当前节点/);
  assert.match(focusStrip, /这一步验收/);
  assert.match(focusStrip, /Checkpoint 规则/);
  assert.match(html, /是否允许直接改动执行文档结构/);
  assert.match(html, /为什么这个线程还没有继续跑/);
  assert.match(html, /data-execution-summary-card[\s\S]*当前关联闭环/);
  assert.match(html, /data-execution-summary-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-execution-summary-card[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-execution-summary-card[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-execution-summary-card[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-checklist-relation-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-body-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-body-middle-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-body-middle="execution-summary-details"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-workflow-next-block="blocker-reason"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-workflow-next-block="requested-human-action"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-meta-grid-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-meta-grid-row="current-node"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-execution-checklist-card[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-execution-checklist-card[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-scene-card-body-context="execution-checklist-card"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-scene-card-body-middle-context="execution-checklist-card"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-scene-card-body-middle="execution-checklist-details"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-progress/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-progress-fill/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-meta-grid-context="execution-checklist-card"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-meta-grid-row="focus-title"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-meta-grid-row="acceptance"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-kpis/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-kpi="completed"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-mini-grid/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-mini-item/);
  assert.match(html, /验收条件/);
  assert.match(html, /4 \/ 5 个闭环已收口/);
  assert.match(html, /为什么现在处理/);
  assert.match(html, /影响范围/);
  assert.match(html, /打开原始上下文/);
  assert.match(html, /当前状态：待拍板线程/);
  assert.match(html, /当前聚焦：/);
  assert.match(html, /1 条待分流评论 · 1 个红灯/);
  assert.match(focusStrip, /线程状态：待拍板线程/);
  assert.match(focusStrip, /状态说明：(1 条待分流评论 · )?1 个红灯/);
  assert.match(focusStrip, /这一步处理：[^\n<]*补拍板或明确绕行动作/);
  assert.match(html, /id="thread-directory"/);
  assert.match(html, /id="comment-threads"/);
  assert.match(html, /id="quick-decisions"/);
  assert.match(html, /与当前闭环关系/);
  assert.match(html, /data-workspace-compose-card[\s\S]*当前关联闭环/);
  assert.match(html, /data-workspace-compose-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-comment-summary-card[\s\S]*当前关联闭环/);
  assert.match(html, /data-comment-summary-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-comment-summary-card[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-comment-summary-card[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-comment-summary-card[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-checklist-relation-context="comment-summary-card"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-comment-filter-status[\s\S]*当前关联闭环/);
  assert.match(html, /data-comment-filter-status[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-comment-filter-status[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-comment-filter-status[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-comment-filter-status[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-checklist-relation-context="comment-filter-status"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-comment-focus-entry[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-comment-focus-entry[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-body-context="comment-focus-card"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-workflow-context="comment-focus-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-comment-thread-card[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-comment-thread-card[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-body-context="comment-thread-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-workflow-context="comment-thread-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-checklist-relation-context="comment-thread-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-decision-card[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-decision-card[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-decision-card[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-decision-card[\s\S]*data-scene-card-body-context="decision-card"/);
  assert.match(html, /data-decision-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-decision-card[\s\S]*data-scene-card-workflow-context="decision-card"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-decision-card[\s\S]*data-checklist-relation-context="decision-card"/);
  assert.match(html, /data-decision-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*当前关联闭环/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-checklist-relation-context="thread-event-summary-card"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*命令/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*Checkpoint/);
  assert.match(html, /data-thread-event-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-thread-event-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-thread-event-card[\s\S]*线程状态 · 待拍板线程/);
  assert.match(html, /data-thread-event-card[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-thread-event-card[\s\S]*这一步处理：[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-thread-event-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-event-card[\s\S]*data-checklist-relation-context="thread-event-card"/);
  assert.match(html, /data-thread-event-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-event-card[\s\S]*跳到关联子任务/);
  assert.match(html, /data-thread-focus-card[\s\S]*当前闭环关系/);
  assert.match(html, /data-thread-focus-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-thread-focus-card[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-thread-focus-card[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-thread-focus-card[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-checklist-relation-context="thread-focus-card"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-stats-context="thread-focus-card"/);
  assert.match(html, /data-thread-stat="open-decisions"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*待拍板/);
  assert.match(html, /data-thread-stat="events"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*线程事件/);
  assert.match(html, /data-thread-stat="related-tasks"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*关联任务/);
  assert.match(html, /data-thread-stat="red-signals"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*红灯数量/);
  assert.match(html, /data-thread-workflow-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-thread-workflow-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-thread-workflow-card[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-thread-workflow-card[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-thread-workflow-card[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-body-context="thread-workflow-card"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-body-middle-context="thread-workflow-card"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-body-middle="thread-workflow-details"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-workflow-context="thread-workflow-card"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-checklist-relation-context="thread-workflow-card"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-box="workflow"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-note="workflow"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-list="workflow"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-button="continue"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-button="improve"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-button="retry"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-button="stop"/);
  assert.match(html, /data-thread-task-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-thread-task-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-thread-task-card[\s\S]*线程状态 · 待拍板线程/);
  assert.match(html, /data-thread-task-card[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-thread-task-card[\s\S]*这一步处理：[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-thread-task-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-task-card[\s\S]*data-checklist-relation-context="thread-task-card"/);
  assert.match(html, /data-thread-task-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*当前状态[\s\S]*待拍板线程/);
  assert.match(html, /data-workspace-compose-card[\s\S]*状态说明[\s\S]*1 条待分流评论 · 1 个红灯/);
  assert.match(html, /data-workspace-compose-card[\s\S]*这一步处理[\s\S]*补拍板或明确绕行动作/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-checklist-relation-context="compose-card"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-box="compose"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-note="compose"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-list="compose"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-button="comment"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-button="yellow"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-button="red"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-box="comment"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-note="comment"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-list="comment-reply"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-list="comment-promote"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-box="inbox"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-list="inbox"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="comment"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="continue"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="yellow"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="red"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="resolve"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="archive"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="snooze"/);

  const contextualResponse = await fetch(
    `${baseUrl}/workspace/docs/execution?project_id=PRJ-cortex&view=thread&thread_filter=red&comment_filter=ready`,
  );
  const contextualHtml = await contextualResponse.text();
  assert.equal(contextualResponse.status, 200);
  assert.match(contextualHtml, /data-default-filter="ready"/);
  assert.match(
    contextualHtml,
    /href="\/workspace\?project_id=PRJ-cortex&amp;view=thread&amp;thread_filter=red&amp;comment_filter=ready"/,
  );
  assert.match(
    contextualHtml,
    /href="\/workspace\/threads\/notion%3Apage-doc%3Adiscussion-doc\?project_id=PRJ-cortex&amp;view=thread&amp;thread_filter=red&amp;comment_filter=ready&amp;document_id=execution"/,
  );
});

test('workspace document page surfaces checklist relation in thread directory and thread focus', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-docs-thread-focus-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-docs-thread-focus-cwd-'));
  let nowIso = '2026-05-01T03:00:00.000Z';
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date(nowIso),
    cwd,
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
    title: '旧 run 仍被标成 running',
    why: '需要把待回看线程直接投影到三栏工作台现场。',
    context: '这条线程会先跑出一个 run，再故意长时间不更新，用来验证优先回看关系。',
    what: '让线程目录和线程摘要都能解释它为什么属于当前闭环。',
    status: 'in_progress',
    source_url: 'notion://page/page-stale-run/discussion/discussion-stale-run',
  });

  const runningCommand = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-stale-run',
    page_id: 'page-stale-run',
    discussion_id: 'discussion-stale-run',
    comment_id: 'comment-stale-run',
    body: '继续执行，但这次先不要写回 checkpoint',
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

  const response = await fetch(`${baseUrl}/workspace/docs/execution?project_id=PRJ-cortex`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /与当前闭环关系 · 优先回看 · 闭环 3 \/ 5/);
  assert.match(html, /这条卡属于当前需要优先回看的线程|这张卡属于当前需要优先回看的线程/);
  assert.match(html, /当前闭环关系 · 优先回看 · 闭环 3 \/ 5/);
  assert.match(html, /先确认它为什么从自动推进降成待回看/);
  assert.match(html, /执行清单：4 \/ 5 已收口/);
});

test('workspace memory document page renders reviewer workspace with governance groups and relation copy', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-memory-docs-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-memory-docs-cwd-'));
  let nowIso = '2026-05-01T03:00:00.000Z';
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date(nowIso),
    cwd,
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
    title: '旧 run 仍被标成 running',
    why: '需要把待回看线程直接投影到 memory reviewer 现场。',
    context: '这条线程会先跑出一个 run，再故意长时间不更新，用来验证优先回看关系。',
    what: '让 memory 候选和 suggestion 都解释自己为什么属于当前闭环。',
    status: 'in_progress',
    source_url: 'notion://page/page-stale-run/discussion/discussion-stale-run',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    thread_key: 'decision:legacy-orphan-001',
    thread_label: '旧孤立红灯',
    signal_level: 'red',
    status: 'needs_review',
    question: '这条旧红灯是否已经只剩历史意义？',
    recommendation: '如果没有更多来源证据，建议归档到历史层。',
    why_now: '这条孤立决策线程没有 discussion/source 线索，应该被 memory reviewer 现场标成当前主闭环的一部分。',
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

  const memoryCreate = await postJson(baseUrl, '/memory', {
    project_id: 'PRJ-cortex',
    layer: 'knowledge',
    type: 'pattern',
    title: '把老线程回看规则固化成 memory',
    summary: '这条 candidate 来自已经降成待回看的旧线程，memory reviewer 现场应该直接告诉人它属于优先回看。',
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
    payload: {
      memory_id: memoryCreate.body.memory.memory_id,
    },
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

  nowIso = '2026-05-02T12:00:00.000Z';
  app.store.createOrGetMemorySource({
    memoryId: memoryCreate.body.memory.memory_id,
    projectId: 'PRJ-cortex',
    sourceType: 'checkpoint',
    sourceRef: 'CP-memory-review-delta',
    summary: '后续又补了一条 checkpoint 证据，用来验证 reviewer 快照之后的证据变化提示。',
    evidence: {
      checkpoint_id: 'CP-memory-review-delta',
      stage: 'memory_review_followup',
    },
  });

  nowIso = '2026-05-03T12:00:00.000Z';

  const memoryPayload = buildWorkspaceDocumentPayload(app.engine, 'PRJ-cortex', 'memory', { cwd });
  assert.strictEqual(memoryPayload.memory_panel.focus_guidance, memoryPayload.memory_focus_guidance);
  assert.strictEqual(memoryPayload.memoryPanel.focusGuidance, memoryPayload.memoryFocusGuidance);
  assert.equal(memoryPayload.memory_focus_guidance.eyebrow, '记忆 reviewer 现场');
  assert.ok(memoryPayload.memory_focus_guidance.proofCards.some((card) => card.kind === 'memory-node-guidance'));
  assert.ok(memoryPayload.memory_focus_guidance.proofCards.some((card) => card.kind === 'memory-focus-evidence'));
  assert.ok(memoryPayload.memory_focus_guidance.actions.some((action) => action.label === '打开证据现场'));
  assert.match(memoryPayload.topbar_status, /当前 reviewer 焦点：/);
  assert.equal(
    memoryPayload.memory_governance.candidate_cards[0].memory_id,
    memoryPayload.memory_governance.candidateCards[0].memoryId,
  );
  assert.equal(
    memoryPayload.memory_governance.candidate_cards[0].evidence_summary,
    memoryPayload.memory_governance.candidateCards[0].evidenceSummary,
  );
  assert.equal(
    memoryPayload.memory_governance.candidate_cards[0].freshness_label,
    memoryPayload.memory_governance.candidateCards[0].freshnessLabel,
  );
  assert.equal(
    memoryPayload.memory_governance.candidate_cards[0].evidence_delta_label,
    memoryPayload.memory_governance.candidateCards[0].evidenceDeltaLabel,
  );
  assert.equal(
    memoryPayload.memory_governance.candidate_cards[0].revalidation_label,
    memoryPayload.memory_governance.candidateCards[0].revalidationLabel,
  );
  assert.equal(
    memoryPayload.memory_governance.candidate_cards[0].human_review_summary,
    memoryPayload.memory_governance.candidateCards[0].humanReviewSummary,
  );
  assert.equal(
    memoryPayload.memory_governance.candidate_cards[0].source_anchor_label,
    memoryPayload.memory_governance.candidateCards[0].sourceAnchorLabel,
  );
  assert.equal(
    memoryPayload.memory_governance.candidate_cards[0].source_anchor_href,
    memoryPayload.memory_governance.candidateCards[0].sourceAnchorHref,
  );
  assert.equal(
    memoryPayload.memory_panel.focus_item.memory_id,
    memoryPayload.memory_panel.focusItem.memoryId,
  );
  assert.equal(
    memoryPayload.memory_panel.focus_item.evidence_summary,
    memoryPayload.memory_panel.focusItem.evidenceSummary,
  );

  const snakeCaseMemoryPayload = structuredClone(memoryPayload);
  const snakeCaseMemoryCard = {
    title: '仅 snake_case 记忆卡',
    summary: '仅 snake_case 记忆摘要',
    type: 'memory',
    badge: 'memory',
    tone: 'yellow',
    memory_id: memoryPayload.memory_governance.candidateCards[0].memoryId,
    memory_status_label: '仅 snake_case 生命周期',
    review_state_label: '仅 snake_case Review',
    reviewer_recommendation_summary: '仅 snake_case reviewer 摘要',
    reviewer_rationale: '仅 snake_case reviewer 依据',
    evidence_summary: '仅 snake_case 证据线索',
    freshness_label: '仅 snake_case Freshness',
    freshness_detail: '仅 snake_case Freshness 细节',
    evidence_delta_label: '仅 snake_case 证据变化',
    evidence_delta_detail: '仅 snake_case 证据变化细节',
    revalidation_label: '仅 snake_case 重新校验',
    revalidation_detail: '仅 snake_case 重新校验细节',
    human_review_summary: '仅 snake_case 人工判断',
    source_anchor_label: '仅 snake_case source 锚点',
    source_anchor_detail: '仅 snake_case source 说明',
    source_anchor_href: 'https://example.com/snake-source',
    source_anchor_href_label: '仅 snake_case 打开 source',
    next_step: '仅 snake_case 记忆下一步',
    section_key: 'candidate',
    section_title: '仅 snake_case 队列',
    section_anchor_id: 'memory-candidates',
    section_next_action: '仅 snake_case 队列动作',
    checklist_focus_label: '当前主闭环',
    checklist_focus_note: '仅 snake_case 闭环说明',
    checklist_progress_label: '4 / 5 已收口',
    checklist_progress_summary: '执行清单：4 / 5 已收口',
  };
  const snakeCaseFocusItem = {
    ...snakeCaseMemoryCard,
    title: '仅 snake_case 焦点标题',
    summary: '仅 snake_case 焦点摘要',
    focus_label: '仅 snake_case 焦点关系',
    focus_note: '仅 snake_case 焦点说明',
    next_step: '仅 snake_case 焦点下一步',
  };
  snakeCaseMemoryPayload.memory_governance = {
    ...snakeCaseMemoryPayload.memory_governance,
    candidate_cards: [snakeCaseMemoryCard],
  };
  delete snakeCaseMemoryPayload.memory_governance.candidateCards;
  delete snakeCaseMemoryPayload.memoryGovernance;
  snakeCaseMemoryPayload.memory_panel = {
    ...snakeCaseMemoryPayload.memory_panel,
    summary: '仅 snake_case 焦点摘要',
    focus_item: snakeCaseFocusItem,
    focus_title: '仅 snake_case 焦点标题',
    focus_section_title: '仅 snake_case 队列',
    focus_label: '仅 snake_case 焦点关系',
    focus_note: '仅 snake_case 焦点说明',
    focus_evidence: '仅 snake_case 证据线索',
    focus_evidence_updated_at: '2026-05-03T12:00:00.000Z',
    next_action: '仅 snake_case 焦点下一步',
    sections: [
      {
        section_key: 'candidate',
        section_title: '仅 snake_case 队列',
        anchor_id: 'memory-candidates',
        summary: '仅 snake_case 队列摘要',
        empty_summary: '仅 snake_case 队列为空',
        next_action: '仅 snake_case 队列动作',
        count: 1,
        cards: [snakeCaseMemoryCard],
      },
      ...snakeCaseMemoryPayload.memory_panel.sections.slice(1),
    ],
  };
  delete snakeCaseMemoryPayload.memory_panel.focusItem;
  delete snakeCaseMemoryPayload.memory_panel.focusTitle;
  delete snakeCaseMemoryPayload.memory_panel.focusSectionTitle;
  delete snakeCaseMemoryPayload.memory_panel.focusLabel;
  delete snakeCaseMemoryPayload.memory_panel.focusNote;
  delete snakeCaseMemoryPayload.memory_panel.focusEvidence;
  delete snakeCaseMemoryPayload.memory_panel.focusEvidenceUpdatedAt;
  delete snakeCaseMemoryPayload.memory_panel.nextAction;
  delete snakeCaseMemoryPayload.memory_panel.focus_guidance;
  delete snakeCaseMemoryPayload.memory_panel.focusGuidance;
  delete snakeCaseMemoryPayload.memoryPanel;
  delete snakeCaseMemoryPayload.memory_focus_guidance;
  delete snakeCaseMemoryPayload.memoryFocusGuidance;
  const snakeCaseMemoryHtml = renderWorkspaceDocumentPage(snakeCaseMemoryPayload);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case 焦点标题/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case 焦点摘要/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case 焦点下一步/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case 记忆卡/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case 记忆摘要/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case reviewer 摘要/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case reviewer 依据/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case 证据线索/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case Freshness/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case 证据变化/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case 重新校验/);
  assert.match(snakeCaseMemoryHtml, /最近 source 锚点/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case source 锚点/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case source 说明/);
  assert.match(snakeCaseMemoryHtml, /仅 snake_case 打开 source/);
  assert.match(snakeCaseMemoryHtml, /https:\/\/example\.com\/snake-source/);

  const response = await fetch(`${baseUrl}/workspace/docs/memory?project_id=PRJ-cortex`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /id="memory-focus-strip"/);
  assert.match(html, /data-memory-focus-strip/);
  assert.match(html, /data-focus-proof-kind="memory-execution-relation"/);
  assert.match(html, /data-focus-proof-kind="memory-node-guidance"/);
  assert.match(html, /data-focus-proof-kind="memory-current-decision"/);
  assert.match(html, /data-focus-proof-kind="memory-step-decision"/);
  assert.match(html, /data-focus-proof-kind="memory-governance-rule"/);
  assert.match(html, /data-focus-proof-kind="memory-focus-evidence"/);
  assert.match(html, /当前执行引导/);
  assert.match(html, /记忆治理目录/);
  assert.match(html, /记忆 reviewer 现场/);
  assert.match(html, /Reviewer 摘要/);
  assert.match(html, /记忆候选/);
  assert.match(html, /Review 队列/);
  assert.match(html, /相关 Suggestions/);
  assert.match(html, /data-thread-stats-context="memory-reviewer-focus-card"/);
  assert.match(html, /data-thread-stat="candidates"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*记忆候选/);
  assert.match(html, /data-thread-stat="reviews"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*Review 队列/);
  assert.match(html, /data-thread-stat="suggestions"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*相关 Suggestions/);
  assert.match(html, /data-thread-stat="actionable-total"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*待治理总数/);
  assert.match(html, /data-memory-reviewer-focus-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-memory-reviewer-focus-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-memory-reviewer-focus-card[\s\S]*data-scene-card-body-context="memory-reviewer-focus-card"/);
  assert.match(html, /data-scene-card-body-context="memory-reviewer-focus-card"[\s\S]*与当前闭环关系/);
  assert.match(html, /data-memory-reviewer-focus-card[\s\S]*data-scene-card-body-middle-context="memory-reviewer-focus-card"/);
  assert.match(html, /data-memory-reviewer-focus-card[\s\S]*data-scene-card-body-middle="memory-reviewer-focus-details"/);
  assert.match(html, /data-memory-reviewer-focus-card[\s\S]*data-meta-grid-context="memory-reviewer-focus-card"/);
  assert.match(html, /data-memory-reviewer-focus-card[\s\S]*data-meta-grid-row="focus-title"/);
  assert.match(html, /data-memory-reviewer-focus-card[\s\S]*data-meta-grid-row="next-action"/);
  assert.match(html, /data-memory-reviewer-summary-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-memory-reviewer-summary-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-memory-reviewer-summary-card[\s\S]*data-scene-card-body-context="memory-reviewer-summary-card"/);
  assert.match(html, /data-scene-card-body-context="memory-reviewer-summary-card"[\s\S]*与当前闭环关系/);
  assert.match(html, /data-memory-reviewer-summary-card[\s\S]*data-scene-card-body-middle-context="memory-reviewer-summary-card"/);
  assert.match(html, /data-memory-reviewer-summary-card[\s\S]*data-scene-card-body-middle="memory-reviewer-summary-details"/);
  assert.match(html, /data-memory-reviewer-summary-card[\s\S]*data-workflow-next-block="current-decision"/);
  assert.match(html, /data-memory-reviewer-summary-card[\s\S]*data-meta-grid-context="memory-reviewer-summary-card"/);
  assert.match(html, /data-memory-reviewer-summary-card[\s\S]*data-meta-grid-row="focus-title"/);
  assert.match(html, /data-memory-reviewer-summary-card[\s\S]*data-meta-grid-row="checkpoint-rule"/);
  assert.match(html, /data-memory-governance-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-memory-governance-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-scene-card-body-context="memory-governance-card"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-scene-card-body-middle-context="memory-governance-card"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-scene-card-body-middle="memory-governance-details"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-workflow-next-block="next-step"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-meta-grid-context="memory-governance-card"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-meta-grid-row="lifecycle"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-meta-grid-row="source-anchor"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-memory-governance-meta-list/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-memory-governance-meta-item/);
  assert.match(html, /红灯待拍板|红灯拍板|黄灯绕行中|黄灯绕行/);
  assert.match(html, /记忆治理/);
  assert.match(html, /与当前闭环关系 · 当前主闭环 · 闭环 3 \/ 5/);
  assert.match(html, /与当前闭环关系 · 优先回看 · 闭环 3 \/ 5/);
  assert.match(html, /执行清单：4 \/ 5 已收口/);
  assert.match(html, /治理规则/);
  assert.match(html, /当前判断/);
  assert.match(html, /当前治理节点/);
  assert.match(html, /这一步判断/);
  assert.match(html, /最近证据/);
  assert.match(html, /更新于 2026-05-02 12:00:00Z/);
  assert.match(html, /证据现场：(记忆候选区|Review 队列|Suggestion 沉淀区|记忆治理现场)/);
  assert.match(html, /打开证据现场/);
  assert.match(html, /打开当前来源/);
  assert.match(html, /原生治理动作/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-memory-kind="memory"[\s\S]*data-memory-inline-action-box="memory"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-memory-kind="memory"[\s\S]*data-memory-inline-action-note="memory"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-memory-kind="memory"[\s\S]*data-memory-inline-action-list="memory"/);
  assert.match(html, /data-memory-inline-action-button="accepted"/);
  assert.match(html, /data-memory-inline-action-button="needs_followup"/);
  assert.match(html, /data-memory-inline-action-button="rejected"/);
  assert.match(html, /data-memory-inline-action-button="refresh"/);
  assert.match(html, /接受为 durable/);
  assert.match(html, /继续补证据/);
  assert.match(html, /拒绝沉淀/);
  assert.match(html, /重跑 reviewer/);
  assert.match(html, /Suggestion 沉淀动作/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-memory-kind="suggestion"[\s\S]*data-memory-inline-action-box="suggestion"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-memory-kind="suggestion"[\s\S]*data-memory-inline-action-note="suggestion"/);
  assert.match(html, /data-memory-governance-card[\s\S]*data-memory-kind="suggestion"[\s\S]*data-memory-inline-action-list="suggestion"/);
  assert.match(html, /data-memory-inline-action-button="accept"/);
  assert.match(html, /data-memory-inline-action-button="reject"/);
  assert.match(html, /转成 candidate memory/);
  assert.match(html, /暂不沉淀/);
  assert.match(html, /Freshness 体检/);
  assert.match(html, /证据变化/);
  assert.match(html, /重新校验建议/);
  assert.match(html, /较上次 reviewer 新增 1 条 source/);
  assert.match(html, /建议重新校验/);
  assert.match(html, /生命周期：候选/);
  assert.match(html, /Review：待 accept/);
  assert.doesNotMatch(html, /<h3 id="thread-directory"/);
  assert.doesNotMatch(html, /<h3 id="task-flow"/);
});

test('workspace memory document page renders reviewer workspace empty state without thread shell', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-memory-empty-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-memory-empty-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T02:05:00.000Z'),
    cwd,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-empty',
  });

  const response = await fetch(`${baseUrl}/workspace/docs/memory?project_id=PRJ-empty`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /记忆治理目录/);
  assert.match(html, /记忆 reviewer 现场/);
  assert.match(html, /当前没有待确认的记忆候选/);
  assert.match(html, /当前没有待处理的 memory review 事项/);
  assert.match(html, /当前没有需要继续跟进的 suggestions/);
  assert.doesNotMatch(html, /<h3 id="thread-directory"/);
  assert.doesNotMatch(html, /<h3 id="comment-threads"/);
});

test('workspace document page renders empty execution state when project has no threads yet', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-empty-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-empty-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T02:05:00.000Z'),
    cwd,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-empty',
  });

  const response = await fetch(`${baseUrl}/workspace/docs/execution?project_id=PRJ-empty`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /执行 Checklist/);
  assert.match(html, /id="execution-focus-strip"/);
  assert.match(html, /data-execution-focus-strip/);
  assert.match(html, /执行摘要/);
  assert.match(html, /等待线程进入/);
  assert.match(html, /当前还没有可见线程/);
  assert.match(html, /当前文档下还没有进入工作台的线程/);
  assert.match(html, /最近证据/);
  assert.match(html, /下一条验收/);
});

test('workspace thread route focuses a concrete thread from workspace task cards', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T02:30:00.000Z'),
    cwd,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const firstBrief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '线程详情页验收',
    why: '需要验证 task card 可以进入 thread detail。',
    context: '线程详情至少能聚焦一条线程和其任务。',
    what: '让 /workspace/threads/:threadId 可访问。',
    status: 'in_progress',
    source_url: 'notion://page/page-thread/discussion/discussion-thread',
  });

  const secondBrief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '线程详情页验收',
    why: '需要验证同线程多个子任务时，线程页还能区分原始任务。',
    context: '第二个 brief 与第一个 brief 属于同一线程，但应保留独立任务标识。',
    what: '让线程页展示任务标识、当前节点和最近更新。',
    status: 'draft',
    source_url: 'notion://page/page-thread/discussion/discussion-thread',
    idempotency_key: 'thread-detail-brief-2',
  });

  const encodedThread = encodeURIComponent('notion:page-thread:discussion-thread');
  const response = await fetch(
    `${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution&view=thread&thread_filter=red&comment_filter=resolved`,
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /data-default-filter="resolved"/);
  assert.match(html, /当前线程/);
  assert.match(html, /线程详情页验收/);
  assert.match(html, /当前聚焦：/);
  assert.match(html, /队列概览：/);
  assert.match(html, /当前活跃子任务/);
  assert.match(html, /子任务分布/);
  assert.match(html, /任务标识/);
  assert.match(html, /当前节点/);
  assert.match(html, /最近更新/);
  assert.match(html, /4 \/ 5 个闭环已收口/);
  assert.match(html, /id="execution-focus-strip"/);
  assert.match(html, /data-execution-focus-strip/);
  assert.match(html, /当前焦点状态/);
  assert.match(html, /最近证据/);
  assert.match(html, /下一条验收/);
  assert.match(html, /第 3 步 · 进行中/);
  assert.match(html, /任务流转[\s\S]*与当前闭环关系/);
  assert.match(html, /任务流转[\s\S]*执行清单：4 \/ 5 已收口/);
  const fallbackPayload = buildWorkspaceDocumentPayload(app.engine, 'PRJ-cortex', 'execution', {
    cwd,
    threadKey: 'notion:page-thread:discussion-thread',
    view: 'thread',
    threadFilter: 'red',
    commentFilter: 'resolved',
  });
  fallbackPayload.thread_detail.workflow.focusChecklistProgressSummary = '';
  fallbackPayload.threadDetail.workflow.focusChecklistProgressSummary = '';
  const fallbackHtml = renderWorkspaceDocumentPage(fallbackPayload);
  assert.match(
    fallbackHtml,
    /data-thread-workflow-card[\s\S]*与当前闭环关系[\s\S]*checklist-context-progress[^>]*>执行清单：4 \/ 5 已收口/,
  );
  assert.match(html, new RegExp(firstBrief.body.brief.brief_id));
  assert.match(html, new RegExp(secondBrief.body.brief.brief_id));
  assert.match(html, /打开线程详情|线程目录/);
  assert.match(
    html,
    /href="\/workspace\?project_id=PRJ-cortex&amp;view=thread&amp;thread_filter=red&amp;comment_filter=resolved"/,
  );
  assert.match(
    html,
    /href="\/workspace\/threads\/notion%3Apage-thread%3Adiscussion-thread\?project_id=PRJ-cortex&amp;view=thread&amp;thread_filter=red&amp;comment_filter=resolved&amp;document_id=execution"/,
  );
});

test('workspace thread route redirects stale brief aliases to the repaired canonical thread', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-redirect-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-redirect-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T02:35:00.000Z'),
    cwd,
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
    target_id: 'page-thread-redirect',
    page_id: 'page-thread-redirect',
    discussion_id: 'discussion-thread-redirect',
    comment_id: 'comment-thread-redirect',
    body: '把这条来源修补后的线程重新挂回真实 Notion discussion',
    owner_agent: 'agent-router',
    source_url:
      'notion://page/page-thread-redirect/discussion/discussion-thread-redirect/comment/comment-thread-redirect',
  });

  const brief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '旧 brief alias 线程',
    why: '需要验证修补后旧链接不会跳丢。',
    context: '原始链接仍然可能保留为 brief:TB-...。',
    what: '访问旧链接时应该自动回到真实 thread。',
    status: 'in_progress',
  });

  await postJson(baseUrl, '/task-briefs/update-source', {
    brief_id: brief.body.brief.brief_id,
    source_ref: `command:${commentResult.body.command.commandId}`,
    project_id: 'PRJ-cortex',
    document_id: 'execution',
    comment_filter: 'ready',
  });

  const staleThread = encodeURIComponent(`brief:${brief.body.brief.brief_id}`);
  const response = await fetch(
    `${baseUrl}/workspace/threads/${staleThread}?project_id=PRJ-cortex&document_id=execution&comment_filter=ready`,
    {
      redirect: 'manual',
    },
  );

  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get('location'),
    '/workspace/threads/notion%3Apage-thread-redirect%3Adiscussion-thread-redirect?project_id=PRJ-cortex&comment_filter=ready&document_id=execution',
  );
});

test('workspace thread summary surfaces blocker reason and recovery guidance for waiting decisions', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-decision-guidance-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-decision-guidance-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T03:30:00.000Z'),
    cwd,
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
    title: '红灯线程摘要增强',
    why: '需要让线程页在等待拍板时直接说清楚为什么卡住。',
    context: '这条线程会挂一个红灯决策，验证摘要层不用翻日志也能解释清楚。',
    what: '让线程页展示卡点原因、需要你做什么、为什么现在处理、影响范围和证据。',
    status: 'in_progress',
    source_url: 'notion://page/page-red/discussion/discussion-red/comment/comment-red',
  });

  await postJson(baseUrl, '/decisions', {
    project_id: 'PRJ-cortex',
    signal_level: 'red',
    question: '是否允许直接覆盖当前 thread identity 回填策略？',
    recommendation: '先不要直接覆盖，等你确认后再改写历史数据。',
    why_now: '这个决策会直接影响工作台当前看到的线程归属和后续审计口径。',
    impact_scope: 'cross_module',
    requested_human_action: '请确认是否允许覆盖历史 thread identity，并决定是局部修复还是批量回填。',
    evidence_refs: [
      { title: 'PRJ-cortex workspace live probe' },
      { title: '历史 brief thread key 样本' },
    ],
    source_url: 'notion://page/page-red/discussion/discussion-red/comment/comment-red',
  });

  const encodedThread = encodeURIComponent('notion:page-red:discussion-red');
  const response = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const html = await response.text();
  const focusStrip = extractSectionById(html, 'execution-focus-strip');

  assert.equal(response.status, 200);
  assert.match(html, /执行摘要/);
  assert.match(html, /当前执行引导/);
  assert.match(html, /红灯拍板/);
  assert.match(html, /等待拍板/);
  assert.match(html, /卡点原因/);
  assert.match(html, /需要你做什么/);
  assert.match(html, /为什么现在处理/);
  assert.match(html, /影响范围/);
  assert.match(html, /证据/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-body-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-body-middle-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-body-middle="execution-summary-details"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-workflow-next-block="blocker-reason"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-workflow-next-block="requested-human-action"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-meta-grid-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-meta-grid-row="why-now"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-meta-grid-row="impact-scope"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-meta-grid-row="evidence"/);
  assert.match(html, /快速拍板/);
  assert.match(html, /当前判断/);
  assert.match(html, /data-decision-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-decision-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-decision-card[\s\S]*data-checklist-relation-context="decision-card"/);
  assert.match(html, /data-decision-card[\s\S]*data-scene-card-body-context="decision-card"/);
  assert.match(html, /data-decision-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-decision-card[\s\S]*data-scene-card-workflow-context="decision-card"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-decision-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-decision-card[\s\S]*data-workflow-next-block="assessment"/);
  assert.match(html, /data-decision-card[\s\S]*data-workflow-next-block="evidence"/);
  assert.match(html, /data-decision-card[\s\S]*data-workflow-node-guidance-block="display"/);
  assert.match(html, /data-decision-card[\s\S]*data-workflow-next-block="acceptance"/);
  assert.match(html, /data-decision-card[\s\S]*data-workflow-next-block="checkpoint-rule"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-inline-action-box="decision"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-inline-action-note="decision"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-inline-action-list="decision"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-inline-action-button="approved"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-inline-action-button="changes_requested"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-inline-action-button="retry_requested"/);
  assert.match(html, /data-decision-card[\s\S]*data-thread-inline-action-button="stopped"/);
  assert.match(html, /这条红灯决策会阻塞当前线程继续推进，先拍板再继续。/);
  assert.match(html, /决策证据/);
  assert.match(html, /当前节点 · 拍板 · 红灯 \/ 待拍板/);
  assert.match(html, /这一步验收/);
  assert.match(html, /先给出允许继续、要求修改、重跑或停止中的一个明确结论。/);
  assert.match(html, /Checkpoint 规则/);
  assert.match(html, /红灯拍板后要立刻补 checkpoint 或线程回复/);
  assert.match(html, /是否允许直接覆盖当前 thread identity 回填策略/);
  assert.match(html, /请确认是否允许覆盖历史 thread identity/);
  assert.match(html, /这个决策会直接影响工作台当前看到的线程归属/);
  assert.match(html, /cross_module/);
  assert.match(html, /2 条证据/);
  assert.match(html, /PRJ-cortex workspace live probe/);
  assert.match(html, /历史 brief thread key 样本/);
  assert.match(html, /查看任务流转/);
  assert.match(html, /href="#task-flow"/);
  assert.match(focusStrip, /证据现场：(线程治理|线程治理现场|历史层残留)/);
  assert.match(focusStrip, /当前节点 · 拍板 · 红灯 \/ 待拍板/);
  assert.match(focusStrip, /状态说明：(1 条待分流评论 · )?1 个红灯/);
  assert.match(focusStrip, /这一步处理：[^\n<]*补拍板或明确绕行动作/);
  assert.match(focusStrip, /这一步验收/);
  assert.match(focusStrip, /先给出允许继续、要求修改、重跑或停止中的一个明确结论。/);
  assert.match(focusStrip, /Checkpoint 规则/);
  assert.match(focusStrip, /红灯拍板后要立刻补 checkpoint 或线程回复/);
});

test('workspace thread page surfaces source recovery guidance for checkpoint-backed brief residuals', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-source-recovery-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-source-recovery-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T03:45:00.000Z'),
    cwd,
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
    thread_key: 'brief:legacy-checkpoint-brief-001',
    thread_label: 'v0.2 长程任务底座已接入',
    title: 'Cortex v0.2 长程任务底座升级',
    why: '这条 brief 已经有 checkpoint 证据，但缺少更稳定来源。',
    context: '模拟手工同步后只剩 brief + checkpoint 的历史残留。',
    what: '验证线程页可以直接给出来源修补提示。',
    status: 'completed',
    idempotency_key: 'workspace-thread-source-recovery-brief',
  });

  await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    brief_id: brief.body.brief.brief_id,
    command_id: 'CMD-missing-thread-source-001',
    stage: 'evaluate',
    status: 'passed',
    title: 'v0.2 长程任务底座已接入',
    summary: '只有 checkpoint，缺少上游 command 记录。',
    next_step: '先把来源补回真实线程。',
    created_by: 'manual-sync',
    idempotency_key: 'workspace-thread-source-recovery-cp',
  });

  await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    brief_id: brief.body.brief.brief_id,
    stage: 'governance',
    status: 'completed',
    title: '后续治理回看',
    summary: '后续又补了一次治理 checkpoint，但没有留下 command_id。',
    next_step: '继续回看历史残留。',
    created_by: 'manual-sync',
    idempotency_key: 'workspace-thread-source-recovery-cp-later',
  });

  const response = await fetch(
    `${baseUrl}/workspace/threads/${encodeURIComponent('brief:legacy-checkpoint-brief-001')}?project_id=PRJ-cortex&include_residual=1&residual_pattern=checkpoint_backed_brief&document_id=execution`,
  );
  const html = await response.text();
  const focusStrip = extractSectionById(html, 'execution-focus-strip');

  assert.equal(response.status, 200);
  assert.match(html, /来源修补提示/);
  assert.match(html, /这条线程已经有 checkpoint 证据，但还没有回收到更稳定的来源线程/);
  assert.match(html, /证据状态/);
  assert.match(html, /Checkpoint 引用缺口/);
  assert.match(html, /建议来源/);
  assert.match(html, /已优先回收当前 primary brief 自己还能确认的来源锚点/);
  assert.match(html, /建议 source_ref/);
  assert.match(html, /value="command:CMD-missing-thread-source-001"/);
  assert.match(html, /source_url \/ source_ref/);
  assert.match(html, /保存来源线索/);
  assert.match(html, /data-source-recovery-submit/);
  assert.match(html, /placeholder="例如 command:CMD-/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*当前关联闭环/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*当前状态/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*状态说明/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*这一步处理/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-checklist-relation-context="source-recovery"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-scene-card-body-context="source-recovery"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-scene-card-body-middle-context="source-recovery"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-scene-card-body-middle="source-recovery-details"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-meta-grid-context="source-recovery"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-meta-grid-row="evidence-status"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-workflow-next-block="cleanup-hint"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-workflow-next-block="suggestion-hint"/);
  assert.match(html, /id="thread-source-recovery"[\s\S]*data-workflow-next-block="source-repair"/);
  assert.match(html, /返回线程治理/);
  assert.match(html, /先把来源补回真实线程/);
  assert.match(focusStrip, /证据现场：(历史层残留|线程治理现场)/);
  assert.match(focusStrip, /打开证据现场/);
  assert.match(focusStrip, /打开最近源位置|打开待治理线程/);
});

test('workspace document save route writes back to local markdown', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-save-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-save-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T03:00:00.000Z'),
    cwd,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const saveResult = await postJson(baseUrl, '/workspace/docs/execution/save', {
    project_id: 'PRJ-cortex',
    body: '# 新执行文档\n\n- 已保存到本地\n',
  });

  assert.equal(saveResult.status, 200);
  assert.equal(saveResult.body.ok, true);
  assert.match(saveResult.body.document.html, /新执行文档/);
  assert.equal(Array.isArray(saveResult.body.document.outline), true);
  assert.equal(saveResult.body.document.outline[0].title, '新执行文档');

  const savedPath = join(cwd, 'docs', 'prj-cortex-execution-doc.md');
  const savedMarkdown = readFileSync(savedPath, 'utf8');
  assert.match(savedMarkdown, /已保存到本地/);
});

test('workspace thread decision action endpoint updates open decision state', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-decision-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-decision-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T03:30:00.000Z'),
    cwd,
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
    question: '是否允许直接合并这个线程里的改动？',
    recommendation: '先由工作台拍板后再继续。',
    why_now: '需要验证线程内的快速拍板动作。',
    impact_scope: 'cross_module',
    source_url: 'notion://page/page-decision/discussion/discussion-decision',
  });

  const threadKey = encodeURIComponent('notion:page-decision:discussion-decision');
  const actionResult = await postJson(baseUrl, `/workspace/threads/${threadKey}/decision`, {
    project_id: 'PRJ-cortex',
    document_id: 'execution',
    decision_id: decisionResult.body.decision.decisionId,
    status: 'approved',
    decision_note: '直接在工作台内拍板通过。',
  });

  assert.equal(actionResult.status, 200);
  assert.equal(actionResult.body.ok, true);
  assert.equal(actionResult.body.decision.status, 'approved');
  assert.match(actionResult.body.refresh_url, /workspace\/threads/);
});

test('workspace thread comment endpoint can create a new comment-driven command inside the current thread', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-compose-comment-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-compose-comment-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T03:45:00.000Z'),
    cwd,
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
    title: '线程内协作输入',
    why: '需要验证不离开工作台也能发起下一步指令。',
    context: '当前线程应该能原地补充一条新评论。',
    what: '把执行总结压缩成 3 条并继续推进。',
    status: 'in_progress',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-compose/discussion/discussion-compose',
  });

  const threadKey = encodeURIComponent('notion:page-compose:discussion-compose');
  const commentResult = await postJson(baseUrl, `/workspace/threads/${threadKey}/comment`, {
    project_id: 'PRJ-cortex',
    document_id: 'execution',
    mode: 'comment',
    body: '把这条线程的下一步计划压缩成 3 条，然后继续推进。',
  });

  assert.equal(commentResult.status, 200);
  assert.equal(commentResult.body.ok, true);
  assert.equal(commentResult.body.workflow_path, 'command');
  assert.equal(commentResult.body.command.thread_key, 'notion:page-compose:discussion-compose');
  assert.equal(commentResult.body.command.owner_agent, 'agent-router');
  assert.match(commentResult.body.refresh_url, /workspace\/threads/);

  const threadResponse = await fetch(`${baseUrl}/workspace/threads/${threadKey}?project_id=PRJ-cortex&document_id=execution`);
  const html = await threadResponse.text();
  assert.equal(threadResponse.status, 200);
  assert.match(html, /下一步计划压缩成 3 条/);
});

test('workspace thread comment endpoint can escalate a red decision from the current thread', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-compose-red-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-compose-red-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T03:50:00.000Z'),
    cwd,
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
    title: '线程内红灯升级',
    why: '需要验证工作台可以直接登记红灯。',
    context: '当前线程里出现了不可逆阻塞。',
    what: '请尽快拍板是否允许跨模块直接改结构。',
    status: 'in_progress',
    owner_agent: 'agent-architect',
    source_url: 'notion://page/page-compose-red/discussion/discussion-compose-red',
  });

  const threadKey = encodeURIComponent('notion:page-compose-red:discussion-compose-red');
  const decisionResult = await postJson(baseUrl, `/workspace/threads/${threadKey}/comment`, {
    project_id: 'PRJ-cortex',
    document_id: 'execution',
    mode: 'red',
    body: '这个改动会污染多个模块，需要你先拍板是否继续。',
  });

  assert.equal(decisionResult.status, 200);
  assert.equal(decisionResult.body.ok, true);
  assert.equal(decisionResult.body.workflow_path, 'decision_request');
  assert.equal(decisionResult.body.signal_level, 'red');
  assert.equal(decisionResult.body.decision.thread_key, 'notion:page-compose-red:discussion-compose-red');
  assert.equal(decisionResult.body.decision.owner_agent, 'agent-architect');
});

test('comment workflow keeps a stable thread identity across command, run, and checkpoint', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-flow-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-flow-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T04:00:00.000Z'),
    cwd,
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
    target_id: 'page-flow',
    page_id: 'page-flow',
    discussion_id: 'discussion-flow',
    comment_id: 'comment-flow',
    body: '继续推进线程流转可视化',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-flow/discussion/discussion-flow/comment/comment-flow',
  });

  assert.equal(commentResult.status, 200);
  assert.equal(commentResult.body.command.thread_key, 'notion:page-flow:discussion-flow');

  const runResult = await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    command_id: commentResult.body.command.commandId,
    agent_name: 'agent-router',
    role: 'router',
    phase: 'execute',
    status: 'running',
    title: '正在推进线程流转可视化',
    summary: '让评论到任务流转在右栏直接可见。',
  });

  assert.equal(runResult.status, 200);
  assert.equal(runResult.body.run.thread_key, 'notion:page-flow:discussion-flow');

  const checkpointResult = await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    run_id: runResult.body.run.runId,
    command_id: commentResult.body.command.commandId,
    signal_level: 'green',
    stage: 'execute',
    status: 'passed',
    title: '线程流转可视化已接上',
    summary: '线程右栏已经能解释 comment -> command -> run 的关系。',
    next_step: '继续补红黄灯细节。',
    quality_grade: 'pass',
    anomaly_level: 'low',
    created_by: 'agent-router',
  });

  assert.equal(checkpointResult.status, 200);
  assert.equal(checkpointResult.body.checkpoint.thread_key, 'notion:page-flow:discussion-flow');

  const receiptResult = await postJson(baseUrl, '/webhook/agent-receipt', {
    project_id: 'PRJ-cortex',
    command_id: commentResult.body.command.commandId,
    agent_name: 'agent-router',
    status: 'completed',
    summary: '评论执行回执已落库',
    details: 'comment -> command -> receipt 这条链现在已经能在右栏直接看见。',
  });

  assert.equal(receiptResult.status, 200);
  assert.equal(receiptResult.body.command.receipt_count, 1);

  const deriveResult = await postJson(baseUrl, '/commands/derive', {
    parent_command_id: commentResult.body.command.commandId,
    owner_agent: 'agent-router',
    parsed_action: 'improve',
    instruction: '补充更多线程流转说明',
    reason: 'workspace_thread_action:improve',
  });

  assert.equal(deriveResult.status, 200);
  assert.equal(deriveResult.body.command.thread_key, 'notion:page-flow:discussion-flow');

  const encodedThread = encodeURIComponent('notion:page-flow:discussion-flow');
  const response = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const html = await response.text();
  const focusStrip = extractSectionById(html, 'execution-focus-strip');

  assert.equal(response.status, 200);
  assert.match(html, /任务流转/);
  assert.match(html, /执行摘要/);
  assert.match(html, /自动推进中/);
  assert.match(html, /聚焦子任务/);
  assert.match(html, /流转视角/);
  assert.match(html, /当前节点/);
  assert.match(html, /Run · 运行中 \/ Execute|Checkpoint · passed \/ Execute/);
  assert.match(html, /活跃度/);
  assert.match(html, /刚刚更新 · 0 分钟前/);
  assert.match(html, /最后动作/);
  assert.match(html, /Checkpoint · passed · 2026-05-09 04:00:00Z|Run · 运行中 · 2026-05-09 04:00:00Z/);
  assert.match(html, /评论意图：继续执行/);
  assert.match(html, /关联子任务/);
  assert.match(html, /当前聚焦子任务/);
  assert.match(html, /最近评论/);
  assert.match(html, /评论状态/);
  assert.match(html, /挂载关系/);
  assert.match(html, /直接挂载到该子任务/);
  assert.match(html, /命令状态：新建|命令状态：执行中|命令状态：已认领|命令状态：已完成/);
  assert.match(html, /继续补红黄灯细节/);
  assert.match(html, /流转统计/);
  assert.match(html, /2 条命令 \/ 1 个 Run \/ 1 个回执 \/ 2 个 Checkpoint/);
  assert.match(html, /任务流转[\s\S]*当前节点 · Checkpoint · passed/);
  assert.match(html, /任务流转[\s\S]*这一步验收/);
  assert.match(html, /任务流转[\s\S]*对应闭环验收：/);
  assert.match(html, /任务流转[\s\S]*Checkpoint 规则/);
  assert.match(html, /任务流转[\s\S]*总规则：每完成一段都要经过：实现/);
  assert.match(html, /当前聚焦：历史层 · 1 条/);
  assert.match(html, /这批评论主要用于历史审计和复盘，不应该继续占住当前线程的处理注意力/);
  assert.match(html, /后续派生动作/);
  assert.match(html, /最新回执/);
  assert.match(html, /评论执行回执已落库/);
  assert.match(html, /Checkpoint 摘要/);
  assert.match(html, /已认领|新建|执行中/);
  assert.match(html, /data-comment-command-action="continue"/);
  assert.match(html, /data-comment-reply-mode="comment"/);
  assert.match(html, /发送回复/);
  assert.match(html, /data-comment-reply-note="/);
  assert.match(html, /data-comment-note="/);
  assert.match(html, /继续执行/);
  assert.match(html, /要求修改/);
  assert.match(html, /跳到关联子任务/);
  assert.match(html, /打开关联评论/);
  assert.match(html, /打开原始评论/);
});

test('thread workflow falls back to latest comment when active subtask has no comment chain yet', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-fallback-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-fallback-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T04:10:00.000Z'),
    cwd,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const completedBrief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '线程旧任务',
    why: '旧评论链路已经跑过一轮。',
    context: '后续会有一个新的活跃子任务，但它暂时还没有评论链路。',
    what: '保留这条旧评论任务用于线程流转回退展示。',
    status: 'done',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-fallback/discussion/discussion-fallback',
  });

  const commentResult = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-fallback',
    page_id: 'page-fallback',
    discussion_id: 'discussion-fallback',
    comment_id: 'comment-fallback',
    body: '把旧任务的回执写完整。',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-fallback/discussion/discussion-fallback/comment/comment-fallback',
  });

  await postJson(baseUrl, '/commands/complete', {
    command_id: commentResult.body.command.commandId,
    agent_name: 'agent-router',
    result_summary: '旧任务的评论链路已经收口。',
  });

  await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    command_id: commentResult.body.command.commandId,
    signal_level: 'green',
    stage: 'execute',
    status: 'passed',
    title: '旧任务收口',
    summary: '这条旧评论任务已经完成。',
    next_step: '等待新的活跃子任务接入。',
    quality_grade: 'pass',
    anomaly_level: 'low',
    created_by: 'agent-router',
  });

  const activeBrief = await postJson(baseUrl, '/task-briefs', {
    project_id: 'PRJ-cortex',
    title: '线程新任务',
    why: '需要验证当前活跃子任务没有评论链路时，右栏会明确提示。',
    context: '这个子任务刚进入线程，还没有评论触发的 command。',
    what: '继续推进最新执行文档结构调整。',
    status: 'in_progress',
    owner_agent: 'agent-architect',
    source_url: 'notion://page/page-fallback/discussion/discussion-fallback',
    idempotency_key: 'thread-fallback-active-brief',
  });

  const encodedThread = encodeURIComponent('notion:page-fallback:discussion-fallback');
  const response = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const html = await response.text();
  const focusStrip = extractSectionById(html, 'execution-focus-strip');

  assert.equal(response.status, 200);
  assert.match(html, /当前活跃子任务还没有评论链路，以下先展示线程里最近一条评论任务。/);
  assert.match(html, new RegExp(activeBrief.body.brief.brief_id));
  assert.match(html, /线程新任务/);
  assert.match(html, /聚焦子任务/);
  assert.match(html, /流转视角/);
  assert.match(html, /关联子任务/);
  assert.match(html, /与当前聚焦关系/);
  assert.match(html, /推断为当前聚焦子任务|当前聚焦子任务|线程内其他子任务|尚未挂到具体子任务/);
  assert.match(html, /基于当前聚焦推断/);
  assert.match(html, /打开关联评论/);
  assert.match(html, /线程旧任务|把旧任务的回执写完整/);
});

test('thread workflow without comment chain still renders node-level checklist guidance', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-no-comment-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-thread-no-comment-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T04:20:00.000Z'),
    cwd,
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
    title: '还没接上评论链路的新线程',
    why: '需要确认 thread 页在没有 comment flow 时也会明确告诉人当前节点怎么过关。',
    context: '这个线程只有 task brief，还没有 notion comment 触发 command。',
    what: '先让 thread 页给出等待评论接入的节点级指引。',
    status: 'in_progress',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-no-comment/discussion/discussion-no-comment',
  });

  const encodedThread = encodeURIComponent('notion:page-no-comment:discussion-no-comment');
  const response = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /当前活跃子任务还没有评论驱动链路。/);
  assert.match(html, /任务流转[\s\S]*当前节点 · 等待评论接入/);
  assert.match(html, /任务流转[\s\S]*这一步验收/);
  assert.match(html, /任务流转[\s\S]*先让当前活跃子任务产出第一条 comment \/ command \/ run 或 checkpoint 证据。/);
  assert.match(html, /任务流转[\s\S]*Checkpoint 规则/);
  assert.match(html, /任务流转[\s\S]*链路刚建立时也要留下第一条 checkpoint/);
});

test('historical blank thread identities are backfilled on restart', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-backfill-'));
  const dbPath = join(dbDir, 'cortex.db');
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-backfill-cwd-'));
  const app = createCortexServer({
    dbPath,
    clock: () => new Date('2026-05-09T04:30:00.000Z'),
    cwd,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const commentResult = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-history',
    page_id: 'page-history',
    discussion_id: 'discussion-history',
    comment_id: 'comment-history',
    body: '继续推进历史线程归一化',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-history/discussion/discussion-history/comment/comment-history',
  });

  const runResult = await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    command_id: commentResult.body.command.commandId,
    agent_name: 'agent-router',
    role: 'router',
    phase: 'execute',
    status: 'running',
    title: '回填历史线程标识',
    summary: '让旧数据也能稳定挂回原线程。',
  });

  const checkpointResult = await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    run_id: runResult.body.run.runId,
    command_id: commentResult.body.command.commandId,
    signal_level: 'green',
    stage: 'execute',
    status: 'passed',
    title: '线程归一化完成',
    summary: '旧记录已经可以重新聚到同一线程。',
    next_step: '继续验证工作台聚合表现。',
    quality_grade: 'pass',
    anomaly_level: 'low',
    created_by: 'agent-router',
  });

  app.store.db.exec(`
    UPDATE commands SET thread_key = NULL, thread_label = NULL WHERE command_id = '${commentResult.body.command.commandId}';
    UPDATE runs SET thread_key = NULL, thread_label = NULL WHERE run_id = '${runResult.body.run.runId}';
    UPDATE checkpoints SET thread_key = NULL, thread_label = NULL WHERE checkpoint_id = '${checkpointResult.body.checkpoint.checkpointId}';
  `);

  app.close();

  const reopened = createCortexServer({
    dbPath,
    clock: () => new Date('2026-05-09T04:31:00.000Z'),
    cwd,
  });
  t.after(() => reopened.close());

  const reopenedCommand = reopened.store.getCommand(commentResult.body.command.commandId);
  const reopenedRun = reopened.store.getRun(runResult.body.run.runId);
  const reopenedStats = reopened.store.getThreadIdentityBackfillStats();

  assert.equal(reopenedCommand.threadKey, 'notion:page-history:discussion-history');
  assert.equal(reopenedRun.threadKey, 'notion:page-history:discussion-history');
  assert.ok(reopenedStats.total >= 3);
});

test('workspace thread page keeps inbox review items attached after inbox thread identity backfill', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-inbox-backfill-'));
  const dbPath = join(dbDir, 'cortex.db');
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-inbox-backfill-cwd-'));
  const app = createCortexServer({
    dbPath,
    clock: () => new Date('2026-05-09T04:45:00.000Z'),
    cwd,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const commentResult = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-inbox-backfill',
    page_id: 'page-inbox-backfill',
    discussion_id: 'discussion-inbox-backfill',
    comment_id: 'comment-inbox-backfill',
    body: '继续把这条评论线程推进下去',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-inbox-backfill/discussion/discussion-inbox-backfill/comment/comment-inbox-backfill',
  });

  const inboxResult = await postJson(baseUrl, '/inbox', {
    project_id: 'PRJ-cortex',
    queue: 'review',
    object_type: 'result',
    action_type: 'review',
    risk_level: 'yellow',
    status: 'open',
    title: '人工回看这条评论的执行结果',
    source_ref: `command:${commentResult.body.command.commandId}`,
    payload: {
      command_id: commentResult.body.command.commandId,
    },
  });

  assert.equal(inboxResult.status, 200);
  assert.equal(inboxResult.body.item.thread_key, 'notion:page-inbox-backfill:discussion-inbox-backfill');

  app.store.db.exec(`
    UPDATE inbox_items
    SET thread_key = NULL, thread_label = NULL
    WHERE item_id = '${inboxResult.body.item.item_id}';
  `);
  app.close();

  const reopened = createCortexServer({
    dbPath,
    clock: () => new Date('2026-05-09T05:00:00.000Z'),
    cwd,
  });
  t.after(() => reopened.close());

  const reopenedInbox = reopened.store.listInboxItems({ projectId: 'PRJ-cortex' })[0];
  const reopenedStats = reopened.store.getThreadIdentityBackfillStats();

  assert.equal(reopenedInbox.threadKey, 'notion:page-inbox-backfill:discussion-inbox-backfill');
  assert.match(reopenedInbox.threadLabel, /Notion|继续把这条评论线程推进下去/);
  assert.ok(reopenedStats.inboxItems >= 1);

  await new Promise((resolve) => reopened.server.listen(0, '127.0.0.1', resolve));
  const reopenedAddress = reopened.server.address();
  const reopenedBaseUrl = `http://127.0.0.1:${reopenedAddress.port}`;
  const encodedThread = encodeURIComponent('notion:page-inbox-backfill:discussion-inbox-backfill');
  const response = await fetch(`${reopenedBaseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /待处理/);
  assert.match(html, /人工回看这条评论的执行结果|1 条待分流评论/);
});

test('workspace thread page keeps suggestion events attached after suggestion thread identity backfill', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-suggestion-backfill-'));
  const dbPath = join(dbDir, 'cortex.db');
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-suggestion-backfill-cwd-'));
  const app = createCortexServer({
    dbPath,
    clock: () => new Date('2026-05-09T05:10:00.000Z'),
    cwd,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));

  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await postJson(baseUrl, '/projects/upsert', {
    project_id: 'PRJ-cortex',
  });

  const commentResult = await postJson(baseUrl, '/webhook/notion-comment', {
    project_id: 'PRJ-cortex',
    target_type: 'page',
    target_id: 'page-suggestion-backfill',
    page_id: 'page-suggestion-backfill',
    discussion_id: 'discussion-suggestion-backfill',
    comment_id: 'comment-suggestion-backfill',
    body: '继续收口 suggestion 的线程身份',
    owner_agent: 'agent-router',
    source_url:
      'notion://page/page-suggestion-backfill/discussion/discussion-suggestion-backfill/comment/comment-suggestion-backfill',
  });

  const suggestionResult = await postJson(baseUrl, '/suggestions', {
    project_id: 'PRJ-cortex',
    source_type: 'command',
    source_ref: `command:${commentResult.body.command.commandId}`,
    document_ref: 'notion://page/page-suggestion-backfill/discussion/discussion-suggestion-backfill',
    selected_text: '旧 thread identity 提示',
    proposed_text: '把 suggestion 也稳定挂回原 Notion discussion 线程',
    reason: '避免 thread page 重启后丢 suggestion 时间线',
    owner_agent: 'agent-router',
  });

  assert.equal(suggestionResult.status, 200);
  assert.equal(suggestionResult.body.suggestion.thread_key, 'notion:page-suggestion-backfill:discussion-suggestion-backfill');

  app.store.db.exec(`
    UPDATE suggestions
    SET thread_key = NULL, thread_label = NULL
    WHERE suggestion_id = '${suggestionResult.body.suggestion.suggestion_id}';
  `);
  app.close();

  const reopened = createCortexServer({
    dbPath,
    clock: () => new Date('2026-05-09T05:20:00.000Z'),
    cwd,
  });
  t.after(() => reopened.close());

  const reopenedSuggestion = reopened.store.getSuggestion(suggestionResult.body.suggestion.suggestion_id);
  const reopenedStats = reopened.store.getThreadIdentityBackfillStats();

  assert.equal(reopenedSuggestion.threadKey, 'notion:page-suggestion-backfill:discussion-suggestion-backfill');
  assert.match(reopenedSuggestion.threadLabel, /Notion|suggestion/i);
  assert.ok(reopenedStats.suggestions >= 1);

  await new Promise((resolve) => reopened.server.listen(0, '127.0.0.1', resolve));
  const reopenedAddress = reopened.server.address();
  const reopenedBaseUrl = `http://127.0.0.1:${reopenedAddress.port}`;
  const encodedThread = encodeURIComponent('notion:page-suggestion-backfill:discussion-suggestion-backfill');
  const response = await fetch(`${reopenedBaseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Suggestion · proposed/);
  assert.match(html, /把 suggestion 也稳定挂回原 Notion discussion 线程/);
});

test('workspace thread page renders actionable comment triage cards for non-executable comments', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-triage-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-triage-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T05:00:00.000Z'),
    cwd,
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
    target_id: 'page-triage',
    page_id: 'page-triage',
    discussion_id: 'discussion-triage',
    comment_id: 'comment-triage',
    body: '为什么这个线程没有继续跑？',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-triage/discussion/discussion-triage/comment/comment-triage',
  });

  assert.equal(commentResult.status, 200);
  assert.equal(commentResult.body.comment_execution_policy, 'inbox_only');

  const encodedThread = encodeURIComponent('notion:page-triage:discussion-triage');
  const response = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /评论线程/);
  assert.match(html, /当前最需要处理的是 1 条待分流评论/);
  assert.match(html, /1 待分流/);
  assert.match(html, /0 已接回执行/);
  assert.match(html, /当前聚焦：待分流 · 1 条/);
  assert.match(html, /先补一句明确指令，或决定是否升级成黄灯 \/ 红灯，让这批评论安全地接回执行链/);
  assert.match(html, /data-comment-focus-card/);
  assert.match(html, /当前节点 · Triage · 仅入收件箱/);
  assert.match(html, /先完成 triage \/ 快速拍板，再决定是否要继续派发成 command。/);
  assert.match(html, /等待人工分流/);
  assert.match(html, /仅进入 triage/);
  assert.match(html, /当前判断/);
  assert.match(html, /当前评论还停在 triage，还没有安全地接回执行链。/);
  assert.match(html, /data-comment-focus-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-comment-focus-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-checklist-relation-context="comment-focus-card"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-body-context="comment-focus-card"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-workflow-context="comment-focus-card"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-comment-thread-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-comment-thread-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-checklist-relation-context="comment-thread-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-body-context="comment-thread-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-workflow-context="comment-thread-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-workflow-next-block="assessment"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-workflow-next-block="evidence"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-workflow-node-guidance-block="display"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-workflow-next-block="acceptance"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-workflow-next-block="checkpoint-rule"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-workflow-next-block="next-action"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-workflow-next-block="audit-trail"/);
  assert.match(html, /执行证据/);
  assert.match(html, /当前节点 · Triage · 仅入收件箱/);
  assert.match(html, /当前评论只进入 triage，还没有直接下发成执行命令。/);
  assert.match(html, /这一步验收/);
  assert.match(html, /先完成 triage \/ 快速拍板，再决定是否要继续派发成 command。/);
  assert.match(html, /Checkpoint 规则/);
  assert.match(html, /没有明确执行动作前，不把它算作已推进闭环/);
  assert.match(html, /协同审计/);
  assert.match(html, /data-comment-audit-item="triage"/);
  assert.match(html, /待分流评论/);
  assert.match(html, /流转统计/);
  assert.match(html, /\d+ 条命令|命令/);
  assert.match(html, /当前只有问题，没有明确可执行动作/);
  assert.match(html, /data-default-filter="triage"/);
  assert.match(html, /comment-filter-button is-active/);
  assert.match(html, /data-comment-filter="triage"/);
  assert.match(html, /队列分组/);
  assert.doesNotMatch(html, /data-comment-command-action="continue"/);
  assert.match(html, /data-comment-reply-mode="comment"/);
  assert.match(html, /发送回复/);
  assert.match(html, /data-comment-reply-note="/);
  assert.match(html, /补充后继续/);
  assert.match(html, /补充后挂黄灯/);
  assert.match(html, /补充后发红灯/);
  assert.match(html, /标记已处理/);
  assert.match(html, /稍后处理/);
  assert.match(html, /打开原始评论/);
  assert.match(html, /查看任务流转/);
  assert.match(html, /href="#task-flow"/);

  const resolvedResponse = await fetch(
    `${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution&comment_filter=resolved`,
  );
  const resolvedHtml = await resolvedResponse.text();

  assert.equal(resolvedResponse.status, 200);
  assert.match(resolvedHtml, /data-default-filter="resolved"/);
  assert.match(resolvedHtml, /当前聚焦：历史层 · 0 条/);
  assert.match(resolvedHtml, /data-comment-focus-for="resolved"[\s\S]*当前筛选里暂时没有可展开的评论节点/);
  assert.match(resolvedHtml, /data-comment-focus-for="resolved"[\s\S]*回到评论线程列表/);
  assert.match(
    resolvedHtml,
    /href="\/workspace\?project_id=PRJ-cortex&amp;comment_filter=resolved"/,
  );
});

test('workspace thread inbox actions move triage comments between active and history states', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-inbox-actions-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-inbox-actions-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-10T02:00:00.000Z'),
    cwd,
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
    target_id: 'page-inbox-actions',
    page_id: 'page-inbox-actions',
    discussion_id: 'discussion-inbox-actions',
    comment_id: 'comment-inbox-actions',
    body: '这个线程现在为什么还没继续往前走？',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-inbox-actions/discussion/discussion-inbox-actions/comment/comment-inbox-actions',
  });

  assert.equal(commentResult.status, 200);
  assert.equal(commentResult.body.comment_execution_policy, 'inbox_only');

  const inboxItems = app.store.listInboxItems({ projectId: 'PRJ-cortex' });
  assert.equal(inboxItems.length, 1);
  const inboxItemId = inboxItems[0].itemId;

  const encodedThread = encodeURIComponent('notion:page-inbox-actions:discussion-inbox-actions');

  const resolveResult = await postJson(baseUrl, `/inbox/${encodeURIComponent(inboxItemId)}/act`, {
    action: 'resolve',
  });
  assert.equal(resolveResult.status, 200);
  assert.equal(resolveResult.body.item.status, 'resolved');

  const resolvedResponse = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const resolvedHtml = await resolvedResponse.text();

  assert.equal(resolvedResponse.status, 200);
  assert.match(resolvedHtml, /当前 1 条评论都已进入历史层/);
  assert.match(resolvedHtml, /1 历史层/);
  assert.match(resolvedHtml, /data-default-filter="resolved"/);
  assert.match(resolvedHtml, /当前聚焦：历史层 · 1 条/);
  assert.match(resolvedHtml, /data-thread-inline-action-box="inbox"/);
  assert.match(resolvedHtml, /data-thread-inline-action-list="inbox"/);
  assert.match(resolvedHtml, /data-inbox-action="reopen"/);
  assert.match(resolvedHtml, /data-thread-inline-action-button="reopen"/);
  assert.doesNotMatch(resolvedHtml, /data-inbox-action="resolve"/);
  assert.doesNotMatch(resolvedHtml, /data-inbox-action="snooze"/);

  const reopenResult = await postJson(baseUrl, `/inbox/${encodeURIComponent(inboxItemId)}/act`, {
    action: 'reopen',
  });
  assert.equal(reopenResult.status, 200);
  assert.equal(reopenResult.body.item.status, 'open');

  const reopenedResponse = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const reopenedHtml = await reopenedResponse.text();

  assert.equal(reopenedResponse.status, 200);
  assert.match(reopenedHtml, /当前最需要处理的是 1 条待分流评论/);
  assert.match(reopenedHtml, /1 待分流/);
  assert.match(reopenedHtml, /data-default-filter="triage"/);
  assert.match(reopenedHtml, /当前聚焦：待分流 · 1 条/);
  assert.match(reopenedHtml, /data-thread-inline-action-box="inbox"/);
  assert.match(reopenedHtml, /data-thread-inline-action-list="inbox"/);
  assert.match(reopenedHtml, /data-inbox-action="resolve"/);
  assert.match(reopenedHtml, /data-thread-inline-action-button="resolve"/);
  assert.match(reopenedHtml, /data-thread-inline-action-button="archive"/);
  assert.match(reopenedHtml, /data-inbox-action="snooze"/);
  assert.match(reopenedHtml, /data-thread-inline-action-button="snooze"/);
  assert.doesNotMatch(reopenedHtml, /data-inbox-action="reopen"/);
});

test('workspace thread inbox actions surface snoozed and archived guidance in-place', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-inbox-guidance-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-inbox-guidance-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-10T02:20:00.000Z'),
    cwd,
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
    target_id: 'page-inbox-guidance',
    page_id: 'page-inbox-guidance',
    discussion_id: 'discussion-inbox-guidance',
    comment_id: 'comment-inbox-guidance',
    body: '这条评论先稍后处理，再决定是否归档。',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-inbox-guidance/discussion/discussion-inbox-guidance/comment/comment-inbox-guidance',
  });

  assert.equal(commentResult.status, 200);
  assert.equal(commentResult.body.comment_execution_policy, 'inbox_only');

  const inboxItemId = app.store.listInboxItems({ projectId: 'PRJ-cortex' })[0].itemId;
  const encodedThread = encodeURIComponent('notion:page-inbox-guidance:discussion-inbox-guidance');

  const snoozeResult = await postJson(baseUrl, `/inbox/${encodeURIComponent(inboxItemId)}/act`, {
    action: 'snooze',
  });
  assert.equal(snoozeResult.status, 200);
  assert.equal(snoozeResult.body.item.status, 'snoozed');

  const snoozedResponse = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const snoozedHtml = await snoozedResponse.text();

  assert.equal(snoozedResponse.status, 200);
  assert.match(snoozedHtml, /当前最需要处理的是 1 条待分流评论/);
  assert.match(snoozedHtml, /data-default-filter="triage"/);
  assert.match(snoozedHtml, /当前判断[\s\S]*这条评论已暂缓处理，当前仍停在 triage，后续需要重新打开或直接处理完。/);
  assert.match(snoozedHtml, /下一步[\s\S]*这条评论已稍后处理，仍保留在 triage 队列中等待重新打开或直接处理完。/);
  assert.match(snoozedHtml, /data-thread-inline-action-box="inbox"/);
  assert.match(snoozedHtml, /data-thread-inline-action-list="inbox"/);
  assert.match(snoozedHtml, /data-inbox-action="resolve"/);
  assert.match(snoozedHtml, /data-inbox-action="archive"/);
  assert.match(snoozedHtml, /data-inbox-action="reopen"/);
  assert.match(snoozedHtml, /data-thread-inline-action-button="resolve"/);
  assert.match(snoozedHtml, /data-thread-inline-action-button="archive"/);
  assert.match(snoozedHtml, /data-thread-inline-action-button="reopen"/);
  assert.doesNotMatch(snoozedHtml, /data-inbox-action="snooze"/);

  const archiveResult = await postJson(baseUrl, `/inbox/${encodeURIComponent(inboxItemId)}/act`, {
    action: 'archive',
  });
  assert.equal(archiveResult.status, 200);
  assert.equal(archiveResult.body.item.status, 'archived');

  const archivedResponse = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const archivedHtml = await archivedResponse.text();

  assert.equal(archivedResponse.status, 200);
  assert.match(archivedHtml, /当前 1 条评论都已进入历史层/);
  assert.match(archivedHtml, /data-default-filter="resolved"/);
  assert.match(archivedHtml, /当前判断[\s\S]*这条评论已归档到历史层，当前主要用于回看和审计。/);
  assert.match(archivedHtml, /下一步[\s\S]*这条评论已归档到历史层；如需重新推进，可直接重新打开。/);
  assert.match(archivedHtml, /data-thread-inline-action-box="inbox"/);
  assert.match(archivedHtml, /data-thread-inline-action-list="inbox"/);
  assert.match(archivedHtml, /data-inbox-action="reopen"/);
  assert.match(archivedHtml, /data-thread-inline-action-button="reopen"/);
  assert.doesNotMatch(archivedHtml, /data-inbox-action="resolve"/);
  assert.doesNotMatch(archivedHtml, /data-inbox-action="archive"/);
  assert.doesNotMatch(archivedHtml, /data-inbox-action="snooze"/);
});

test('workspace thread page surfaces execution evidence for ready comment threads', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-ready-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-ready-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T05:20:00.000Z'),
    cwd,
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
    target_id: 'page-ready',
    page_id: 'page-ready',
    discussion_id: 'discussion-ready',
    comment_id: 'comment-ready',
    body: '继续推进线程级评论状态可视化',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-ready/discussion/discussion-ready/comment/comment-ready',
  });

  assert.equal(commentResult.status, 200);
  assert.equal(commentResult.body.comment_execution_policy, 'enqueue');

  await postJson(baseUrl, '/runs', {
    project_id: 'PRJ-cortex',
    command_id: commentResult.body.commandId,
    agent_name: 'agent-router',
    role: 'router',
    phase: 'execute',
    status: 'running',
    title: '正在处理 ready 评论线程',
    summary: '确认这条评论已经从 comment 回到 command/run 执行链。',
  });

  await postJson(baseUrl, '/checkpoints', {
    project_id: 'PRJ-cortex',
    command_id: commentResult.body.commandId,
    signal_level: 'green',
    stage: 'execute',
    status: 'running',
    title: 'ready 评论线程仍在执行',
    summary: '这条评论已经从 comment 回到 command/run/checkpoint 执行链。',
    next_step: '继续观察 ready 卡是否还能看到执行证据。',
    quality_grade: 'pass',
    anomaly_level: 'low',
    created_by: 'agent-router',
  });

  const encodedThread = encodeURIComponent('notion:page-ready:discussion-ready');
  const replyResult = await postJson(baseUrl, `/workspace/threads/${encodedThread}/comment`, {
    project_id: 'PRJ-cortex',
    document_id: 'execution',
    mode: 'comment',
    reply_only: true,
    body: '我先确认看到了这条评论，稍后补线程执行结果。',
    owner_agent: 'agent-router',
    reply_to_command_id: commentResult.body.commandId,
    reply_to_comment_title: '继续推进线程级评论状态可视化',
    reply_to_comment_summary: '来自 ready 评论线程的最新输入。',
  });

  assert.equal(replyResult.status, 200);
  assert.equal(replyResult.body.workflow_path, 'comment_history');
  assert.equal(replyResult.body.comment_intent, 'thread_reply');
  assert.equal(replyResult.body.command.parent_command_id, commentResult.body.commandId);

  const response = await fetch(`${baseUrl}/workspace/threads/${encodedThread}?project_id=PRJ-cortex&document_id=execution`);
  const html = await response.text();
  const focusStrip = extractSectionById(html, 'execution-focus-strip');

  assert.equal(response.status, 200);
  assert.match(html, /(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /当前状态：已接回执行线程/);
  assert.match(html, /data-execution-summary-card[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-execution-summary-card[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-execution-summary-card[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-checklist-relation-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-body-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-body-middle-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-scene-card-body-middle="execution-summary-details"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-meta-grid-context="execution-summary-card"/);
  assert.match(html, /data-execution-summary-card[\s\S]*data-meta-grid-row="current-node"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-execution-checklist-card[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-execution-checklist-card[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-scene-card-body-context="execution-checklist-card"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-scene-card-body-middle-context="execution-checklist-card"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-scene-card-body-middle="execution-checklist-details"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-progress/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-meta-grid-context="execution-checklist-card"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-meta-grid-row="focus-title"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-kpis/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-kpi="in-progress"/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-mini-grid/);
  assert.match(html, /data-execution-checklist-card[\s\S]*data-checklist-mini-item/);
  assert.match(html, /data-comment-summary-card[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-comment-summary-card[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-comment-summary-card[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-checklist-relation-context="comment-summary-card"/);
  assert.match(html, /data-comment-summary-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-comment-filter-status[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-comment-filter-status[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-comment-filter-status[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-checklist-relation-context="comment-filter-status"/);
  assert.match(html, /data-comment-filter-status[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /当前聚焦：已接回执行 · 1 条/);
  assert.match(html, /data-comment-focus-card/);
  assert.match(html, /当前节点 · Checkpoint · running/);
  assert.match(html, /先完成 checkpoint 指向的下一跳：继续观察 ready 卡是否还能看到执行证据。/);
  assert.match(html, /当前判断/);
  assert.match(html, /这条评论已经接回执行链，下一步重点是确认 agent 是否继续往前跑。/);
  assert.match(html, /data-comment-focus-entry[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-comment-focus-entry[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-comment-focus-entry[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-comment-focus-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-comment-focus-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-checklist-relation-context="comment-focus-card"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-body-context="comment-focus-card"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-workflow-context="comment-focus-card"/);
  assert.match(html, /data-comment-focus-entry[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-comment-thread-card[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-comment-thread-card[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-comment-thread-card[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-comment-thread-card[\s\S]*与当前闭环关系/);
  assert.match(html, /data-comment-thread-card[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-checklist-relation-context="comment-thread-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-body-context="comment-thread-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-workflow-context="comment-thread-card"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-thread-workflow-card[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-thread-workflow-card[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-body-context="thread-workflow-card"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-body-middle-context="thread-workflow-card"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-body-middle="thread-workflow-details"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-workflow-context="thread-workflow-card"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-checklist-relation-context="thread-workflow-card"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-workflow-node-guidance-block="display"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-workflow-next-block="acceptance"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-workflow-next-block="checkpoint-rule"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-workflow-next-block="next-action"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-box="workflow"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-note="workflow"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-list="workflow"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-button="continue"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-button="improve"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-button="retry"/);
  assert.match(html, /data-thread-workflow-card[\s\S]*data-thread-inline-action-button="stop"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-checklist-relation-context="thread-event-summary-card"/);
  assert.match(html, /data-thread-event-summary-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-event-card[\s\S]*线程状态 · 已接回执行线程/);
  assert.match(html, /data-thread-event-card[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-thread-event-card[\s\S]*这一步处理：[^\n<]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-thread-event-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-event-card[\s\S]*data-checklist-relation-context="thread-event-card"/);
  assert.match(html, /data-thread-event-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-task-card[\s\S]*线程状态 · 已接回执行线程/);
  assert.match(html, /data-thread-task-card[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-thread-task-card[\s\S]*这一步处理：[^\n<]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-thread-task-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-task-card[\s\S]*data-checklist-relation-context="thread-task-card"/);
  assert.match(html, /data-thread-task-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-focus-card[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-thread-focus-card[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-thread-focus-card[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-checklist-relation-context="thread-focus-card"/);
  assert.match(html, /data-thread-focus-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-thread-stats-context="thread-focus-card"/);
  assert.match(html, /data-thread-stat="open-decisions"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*待拍板/);
  assert.match(html, /data-thread-stat="events"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*线程事件/);
  assert.match(html, /data-thread-stat="related-tasks"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*关联任务/);
  assert.match(html, /data-thread-stat="red-signals"[\s\S]*data-thread-stat-value[\s\S]*data-thread-stat-label[\s\S]*红灯数量/);
  assert.match(html, /data-workspace-compose-card[\s\S]*当前状态[\s\S]*已接回执行线程/);
  assert.match(html, /data-workspace-compose-card[\s\S]*状态说明[\s\S]*(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(html, /data-workspace-compose-card[\s\S]*这一步处理[\s\S]*继续产生命令、Run 或 Checkpoint/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-scene-card-context-block="thread-state"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-state-guidance-block="state"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-state-guidance-block="summary"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-state-guidance-block="action"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-checklist-relation-context="compose-card"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-scene-card-context-block="checklist-relation"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-box="compose"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-note="compose"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-list="compose"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-button="comment"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-button="yellow"/);
  assert.match(html, /data-workspace-compose-card[\s\S]*data-thread-inline-action-button="red"/);
  assert.match(html, /执行证据/);
  assert.match(focusStrip, /当前节点 · Checkpoint · running/);
  assert.match(focusStrip, /线程状态：已接回执行线程/);
  assert.match(focusStrip, /状态说明：(当前有 1 条评论已经接回执行链|1 条已接回执行评论)/);
  assert.match(focusStrip, /这一步处理：[^\n<]*继续产生命令、Run 或 Checkpoint/);
  assert.match(focusStrip, /这一步验收/);
  assert.match(focusStrip, /先完成 checkpoint 指向的下一跳：继续观察 ready 卡是否还能看到执行证据。/);
  assert.match(focusStrip, /Checkpoint 规则/);
  assert.match(focusStrip, /checkpoint 至少要写清当前结果、下一跳和证据出处/);
  assert.match(html, /当前节点 · Checkpoint · running/);
  assert.match(html, /当前流转已经进入 checkpoint 节点/);
  assert.match(html, /这一步验收/);
  assert.match(html, /先完成 checkpoint 指向的下一跳：继续观察 ready 卡是否还能看到执行证据。/);
  assert.match(html, /Checkpoint 规则/);
  assert.match(html, /checkpoint 至少要写清当前结果、下一跳和证据出处/);
  assert.match(html, /1 条命令 \/ 1 条协同记录 \/ 1 个 Run \/ 1 个 Checkpoint/);
  assert.match(html, /协同记录/);
  assert.match(html, /1 条线程回复/);
  assert.match(html, /协同审计/);
  assert.match(html, /data-comment-audit-item="thread_reply"/);
  assert.match(html, /我先确认看到了这条评论，稍后补线程执行结果。/);
  assert.match(html, /流转统计[\s\S]*1 条命令 \/ 1 条线程回复 \/ 1 个 Run \/ 1 个 Checkpoint/);
  assert.match(html, /最近 Checkpoint：这条评论已经从 comment 回到 command\/run\/checkpoint 执行链。/);
  assert.match(html, /最近评论/);
  assert.match(html, /我先确认看到了这条评论，稍后补线程执行结果。/);
  assert.match(html, /关联任务[\s\S]*评论状态[\s\S]*线程回复 · 已记录回复 · 已归档/);
  assert.match(html, /任务流转[\s\S]*与当前闭环关系/);
  assert.match(html, /任务流转[\s\S]*执行清单：4 \/ 5 已收口/);
  assert.match(html, /data-default-filter="ready"/);
  assert.match(html, /查看任务流转/);
  assert.match(html, /href="#task-flow"/);
  assert.match(html, /data-comment-command-action="continue"/);
  assert.match(html, /data-comment-command-action="improve"/);
  assert.match(html, /data-comment-command-action="retry"/);
  assert.match(html, /data-comment-command-action="stop"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-box="comment"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-note="comment"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-list="comment-reply"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-list="comment-command"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="comment"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="continue"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="improve"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="retry"/);
  assert.match(html, /data-comment-thread-card[\s\S]*data-thread-inline-action-button="stop"/);
});

test('workspace thread comment endpoint can create a contextual reply anchored to an existing comment card', async (t) => {
  const dbDir = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-reply-'));
  const cwd = mkdtempSync(join(tmpdir(), 'cortex-workspace-comment-reply-cwd-'));
  const app = createCortexServer({
    dbPath: join(dbDir, 'cortex.db'),
    clock: () => new Date('2026-05-09T05:40:00.000Z'),
    cwd,
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
    target_id: 'page-reply',
    page_id: 'page-reply',
    discussion_id: 'discussion-reply',
    comment_id: 'comment-reply',
    body: '为什么这个线程没有继续跑？',
    owner_agent: 'agent-router',
    source_url: 'notion://page/page-reply/discussion/discussion-reply/comment/comment-reply',
  });

  assert.equal(commentResult.status, 200);

  const threadKey = encodeURIComponent('notion:page-reply:discussion-reply');
  const replyResult = await postJson(baseUrl, `/workspace/threads/${threadKey}/comment`, {
    project_id: 'PRJ-cortex',
    document_id: 'execution',
    mode: 'comment',
    reply_only: true,
    body: '我先确认看到了这条评论，晚点再回复。',
    owner_agent: 'agent-router',
    reply_to_command_id: commentResult.body.command.commandId,
    reply_to_comment_title: '为什么这个线程没有继续跑？',
    reply_to_comment_summary: '来自评论线程的最新输入。',
  });

  assert.equal(replyResult.status, 200);
  assert.equal(replyResult.body.ok, true);
  assert.equal(replyResult.body.workflow_path, 'comment_history');
  assert.equal(replyResult.body.comment_intent, 'thread_reply');
  assert.equal(replyResult.body.comment_execution_policy, 'log_only');
  assert.equal(replyResult.body.command.parent_command_id, commentResult.body.command.commandId);
  assert.match(replyResult.body.command.context_quote, /原地回复/);
  assert.match(replyResult.body.command.context_quote, /源评论：为什么这个线程没有继续跑/);
  assert.match(replyResult.body.command.source_url, /#comment-thread-CMD-/);
  assert.match(replyResult.body.refresh_url, /workspace\/threads/);
  assert.match(replyResult.body.refresh_url, /#comment-thread-CMD-/);
});
