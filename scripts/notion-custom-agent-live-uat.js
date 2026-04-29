import { randomUUID } from 'node:crypto';
import { buildNotionCustomAgentLiveUatReport, extractProjectScopePageIds, pickPrimaryProjectPageId } from '../src/notion-custom-agent-live-uat.js';
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

function buildIds(prefix) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    pageId: `${prefix}-page-${stamp}`,
    discussionId: `${prefix}-discussion-${stamp}`,
    commentId: `${prefix}-comment-${stamp}`,
  };
}

function buildSourceUrl(ids) {
  return `notion://page/${ids.pageId}/discussion/${ids.discussionId}/comment/${ids.commentId}`;
}

function scenarioResult(name, passed, details = {}, reason = null) {
  return {
    name,
    passed,
    reason,
    ...details,
  };
}

async function archivePendingOutboxForProject(baseUrl, projectId) {
  const pending = await requestJson(baseUrl, '/outbox?status=pending&limit=200');
  const messages = Array.isArray(pending.pending) ? pending.pending : [];
  const related = messages.filter((message) => {
    const payloadProjectId = compact(message?.payload?.project_id || message?.payload?.projectId);
    return payloadProjectId === projectId;
  });

  for (const message of related) {
    await requestJson(baseUrl, '/outbox/archive', {
      method: 'POST',
      body: {
        id: message.id,
        note: `notion custom agent live UAT cleanup for ${projectId}`,
      },
    });
  }

  const after = await requestJson(baseUrl, '/outbox?status=pending&limit=200');
  const remaining = (Array.isArray(after.pending) ? after.pending : []).filter((message) => {
    const payloadProjectId = compact(message?.payload?.project_id || message?.payload?.projectId);
    return payloadProjectId === projectId;
  });

  return {
    ok: remaining.length === 0,
    archived_outbox_count: related.length,
    remaining_pending_count: remaining.length,
  };
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = compact(args.base_url || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100');
const templateProjectId = compact(args.template_project || process.env.PROJECT_ID || 'PRJ-cortex');
const projectId = compact(args.project || `${templateProjectId}-live-uat-${Date.now()}`);
const agentName = compact(args.agent || 'agent-live-uat');
const agentActorId = compact(args.agent_actor_id || `notion-agent-${randomUUID()}`);

const projectsPayload = await requestJson(baseUrl, '/projects');
const templateProject = (Array.isArray(projectsPayload.projects) ? projectsPayload.projects : []).find(
  (project) => compact(project.project_id || project.projectId) === templateProjectId,
);

if (!templateProject) {
  throw new Error(`Template project not found: ${templateProjectId}`);
}

const tempProject = await requestJson(baseUrl, '/projects/upsert', {
  method: 'POST',
  body: {
    project_id: projectId,
    name: `${templateProject.name || templateProjectId} Live UAT`,
    status: 'active',
    root_page_url: templateProject.root_page_url || templateProject.rootPageUrl,
    review_window_note: templateProject.review_window_note || templateProject.reviewWindowNote,
    notification_channel: templateProject.notification_channel || templateProject.notificationChannel || 'smoke',
    notification_target: templateProject.notification_target || templateProject.notificationTarget || 'custom-agent-live-uat@local',
    notion_review_page_id: templateProject.notion_review_page_id || templateProject.notionReviewPageId,
    notion_parent_page_id: templateProject.notion_parent_page_id || templateProject.notionParentPageId,
    notion_memory_page_id: templateProject.notion_memory_page_id || templateProject.notionMemoryPageId,
    notion_scan_page_id: templateProject.notion_scan_page_id || templateProject.notionScanPageId,
  },
});

const project = tempProject.project || {};
const scopePageIds = extractProjectScopePageIds(project);
const primaryPageId = pickPrimaryProjectPageId(project) || randomUUID().replaceAll('-', '');
const unrelatedPageId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const scenarios = [];

const greenIds = buildIds('green');
greenIds.pageId = primaryPageId;
const green = await requestJson(baseUrl, '/webhook/notion-custom-agent', {
  method: 'POST',
  body: {
    project_id: projectId,
    page_id: greenIds.pageId,
    discussion_id: greenIds.discussionId,
    comment_id: greenIds.commentId,
    body: '@Cortex Router 请继续推进 live UAT green 场景。',
    owner_agent: agentName,
    invoked_agent: 'Cortex Router',
    source_url: buildSourceUrl(greenIds),
  },
});
scenarios.push(
  scenarioResult(
    'green_command',
    green.workflow_path === 'command' &&
      green.signal_level === 'green' &&
      /^CMD-/.test(String(green.command_id || '')),
    {
      workflow_path: green.workflow_path,
      signal_level: green.signal_level,
      command_id: green.command_id,
    },
    green.workflow_path === 'command' ? null : 'expected_command_path',
  ),
);

const yellowIds = buildIds('yellow');
yellowIds.pageId = primaryPageId;
const yellow = await requestJson(baseUrl, '/webhook/notion-custom-agent', {
  method: 'POST',
  body: {
    project_id: projectId,
    page_id: yellowIds.pageId,
    discussion_id: yellowIds.discussionId,
    comment_id: yellowIds.commentId,
    body: '这段流程我不太确定，先给建议再继续。',
    owner_agent: agentName,
    invoked_agent: 'Cortex Router',
    source_url: buildSourceUrl(yellowIds),
    decision_context: {
      question: '是否需要先补联调 checklist 再继续？',
      recommendation: '建议先补 checklist，再推进下一轮操作。',
    },
  },
});
scenarios.push(
  scenarioResult(
    'yellow_decision',
    yellow.workflow_path === 'decision_request' &&
      yellow.signal_level === 'yellow' &&
      /^DR-/.test(String(yellow.decision_id || '')),
    {
      workflow_path: yellow.workflow_path,
      signal_level: yellow.signal_level,
      decision_id: yellow.decision_id,
    },
    yellow.signal_level === 'yellow' ? null : 'expected_yellow_decision',
  ),
);

const redIds = buildIds('red');
redIds.pageId = primaryPageId;
const red = await requestJson(baseUrl, '/webhook/notion-custom-agent', {
  method: 'POST',
  body: {
    project_id: projectId,
    page_id: redIds.pageId,
    discussion_id: redIds.discussionId,
    comment_id: redIds.commentId,
    body: '直接整体覆盖现有结构并上线。',
    owner_agent: agentName,
    invoked_agent: 'Cortex Router',
    source_url: buildSourceUrl(redIds),
    signal_level: 'red',
    decision_context: {
      question: '是否直接整体覆盖现有结构并上线？',
      options: ['立即覆盖', '保留现状并增量迁移'],
      recommendation: '先保留现状并增量迁移。',
      requested_human_action: '请人工拍板发布策略。',
      impact_scope: 'cross_module',
      evidence_refs: ['doc:readme', 'doc:notion-custom-agents-collaboration'],
    },
  },
});
scenarios.push(
  scenarioResult(
    'red_decision',
    red.workflow_path === 'decision_request' &&
      red.signal_level === 'red' &&
      red.outbox_queued === true &&
      /^DR-/.test(String(red.decision_id || '')),
    {
      workflow_path: red.workflow_path,
      signal_level: red.signal_level,
      decision_id: red.decision_id,
      outbox_queued: red.outbox_queued,
    },
    red.outbox_queued === true ? null : 'expected_red_outbox',
  ),
);

const selfLoopIds = buildIds('self-loop');
selfLoopIds.pageId = primaryPageId;
const selfLoop = await requestJson(baseUrl, '/webhook/notion-custom-agent', {
  method: 'POST',
  body: {
    project_id: projectId,
    page_id: selfLoopIds.pageId,
    discussion_id: selfLoopIds.discussionId,
    comment_id: selfLoopIds.commentId,
    body: '这是 Cortex Router 刚发出的 agent 自己评论。',
    invoked_agent: 'Cortex Router',
    created_by: {
      id: agentActorId,
      type: 'bot',
      name: 'Cortex Router',
    },
    invoked_agent_actor_id: agentActorId,
    source_url: buildSourceUrl(selfLoopIds),
  },
});
scenarios.push(
  scenarioResult(
    'self_loop_guard',
    selfLoop.workflow_path === 'ignored' &&
      selfLoop.skip_reason === 'self_authored_comment' &&
      selfLoop.skipped === true,
    {
      workflow_path: selfLoop.workflow_path,
      skip_reason: selfLoop.skip_reason,
    },
    selfLoop.skip_reason === 'self_authored_comment' ? null : 'expected_self_loop_guard',
  ),
);

const scopeIds = buildIds('scope');
scopeIds.pageId = unrelatedPageId;
const scopeGuard = await requestJson(baseUrl, '/webhook/notion-custom-agent', {
  method: 'POST',
  body: {
    project_id: projectId,
    page_id: scopeIds.pageId,
    discussion_id: scopeIds.discussionId,
    comment_id: scopeIds.commentId,
    body: '这条评论来自项目外页面。',
    invoked_agent: 'Cortex Router',
    source_url: buildSourceUrl(scopeIds),
  },
});
scenarios.push(
  scenarioResult(
    'scope_guard',
    scopeGuard.workflow_path === 'ignored' &&
      scopeGuard.skip_reason === 'out_of_scope_page' &&
      scopePageIds.length > 0,
    {
      workflow_path: scopeGuard.workflow_path,
      skip_reason: scopeGuard.skip_reason,
      project_scope_page_ids: scopeGuard.project_scope_page_ids,
    },
    scopeGuard.skip_reason === 'out_of_scope_page' ? null : 'expected_scope_guard',
  ),
);

const claim = await requestJson(baseUrl, '/commands/claim-next', {
  method: 'POST',
  body: {
    project_id: projectId,
    agent_name: agentName,
    owner_agent: agentName,
  },
});
const claimedCommandId = compact(claim.command?.command_id || claim.command?.commandId);

const receipt = await requestJson(baseUrl, '/webhook/agent-receipt', {
  method: 'POST',
  body: {
    command_id: green.command_id,
    project_id: projectId,
    agent_name: agentName,
    status: 'success',
    receipt_type: 'result',
    signal_level: 'green',
    result_summary: 'notion custom agent live UAT receipt succeeded',
    reply_text: 'live UAT receipt 已完成。',
    channel: project.notification_channel || project.notificationChannel || 'smoke',
    target: project.notification_target || project.notificationTarget || 'custom-agent-live-uat@local',
    idempotency_key: `${projectId}:${green.command_id}:live-uat`,
  },
});
const commandListing = await requestJson(
  baseUrl,
  `/commands?project_id=${encodeURIComponent(projectId)}&command_id=${encodeURIComponent(green.command_id)}`,
);
const command = Array.isArray(commandListing.commands) ? commandListing.commands[0] || null : null;
const receipts = await requestJson(baseUrl, `/receipts?command_id=${encodeURIComponent(green.command_id)}`);

scenarios.push(
  scenarioResult(
    'receipt_writeback',
    claimedCommandId === green.command_id &&
      receipt.ok === true &&
      command?.status === 'done' &&
      Array.isArray(receipts.receipts) &&
      receipts.receipts.length > 0,
    {
      claimed_command_id: claimedCommandId,
      command_status: command?.status || null,
      receipt_count: Array.isArray(receipts.receipts) ? receipts.receipts.length : 0,
    },
    command?.status === 'done' ? null : 'expected_done_after_receipt',
  ),
);

const cleanup = await archivePendingOutboxForProject(baseUrl, projectId);
const report = buildNotionCustomAgentLiveUatReport({
  templateProjectId,
  projectId,
  scenarios,
  cleanup,
});

console.log(
  JSON.stringify(
    {
      ok: report.ok,
      status: report.status,
      template_project_id: templateProjectId,
      project_id: projectId,
      project,
      scope_page_ids: scopePageIds,
      scenarios,
      cleanup,
      claim,
      receipt,
      command,
      receipts,
      report,
    },
    null,
    2,
  ),
);
