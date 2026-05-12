import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractNotionPageId, normalizePublicMcpUrl } from './custom-agent-setup-bundle.js';
import { loadProjectEnv } from './project-env.js';
import { deriveThreadIdentity, humanThreadIdentitySource, threadSpecificity } from './thread-identity.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadProjectEnv(PROJECT_ROOT);

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderHtmlAttributeString(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => {
      if (value === true) {
        return ` ${escapeHtml(key)}`;
      }
      return ` ${escapeHtml(key)}="${escapeHtml(String(value))}"`;
    })
    .join('');
}

function normalizeWorkspaceView(value) {
  const raw = compact(value).toLowerCase();
  return ['attention', 'thread'].includes(raw) ? raw : 'attention';
}

function normalizeWorkspaceThreadFilter(value) {
  const raw = compact(value).toLowerCase();
  return ['all', 'triage', 'ready', 'red', 'active', 'completed'].includes(raw) ? raw : 'all';
}

function normalizeWorkspaceCommentFilter(value) {
  const raw = compact(value).toLowerCase();
  return ['all', 'triage', 'ready', 'rejected', 'resolved'].includes(raw) ? raw : 'all';
}

function normalizeWorkspaceFeedbackTone(value) {
  const raw = compact(value).toLowerCase();
  return ['info', 'success', 'error'].includes(raw) ? raw : 'info';
}

function appendWorkspaceFeedbackDetail(baseMessage, detail) {
  const base = compact(baseMessage);
  const suffix = compact(detail);
  if (!base) {
    return suffix;
  }
  return suffix ? `${base}：${suffix}` : base;
}

function buildWorkspaceFeedbackBase(scopeLabel, actionLabel = '') {
  const scope = compact(scopeLabel);
  const action = compact(actionLabel);
  if (!scope) {
    return action;
  }
  return action ? `首页动作已写回 · ${scope} · ${action}` : `首页动作已写回 · ${scope}`;
}

export function buildWorkspaceHomeDecisionFeedback(decisionNote = '') {
  return appendWorkspaceFeedbackDetail(buildWorkspaceFeedbackBase('决策拍板'), decisionNote);
}

export function buildWorkspaceHomeCommentFeedback(options = {}) {
  const target = compact(options.target).toLowerCase();
  const action = compact(options.action).toLowerCase();
  const note = options.note;
  let baseMessage = buildWorkspaceFeedbackBase('评论动作派发');

  if (target === 'reply') {
    baseMessage = buildWorkspaceFeedbackBase('线程回复');
  } else if (target === 'comment') {
    baseMessage = buildWorkspaceFeedbackBase(action === 'red' ? '红灯登记' : '黄灯登记');
  }

  return appendWorkspaceFeedbackDetail(baseMessage, note);
}

export function buildWorkspaceHomeMemoryReviewFeedback(action, reviewNote = '') {
  const normalizedAction = compact(action).toLowerCase();
  const baseMessage =
    normalizedAction === 'accepted'
      ? buildWorkspaceFeedbackBase('记忆治理', '接受为 durable memory')
      : normalizedAction === 'rejected'
        ? buildWorkspaceFeedbackBase('记忆治理', '拒绝沉淀')
        : normalizedAction === 'needs_followup'
          ? buildWorkspaceFeedbackBase('记忆治理', '标记继续补证据')
          : buildWorkspaceFeedbackBase('记忆治理');
  return appendWorkspaceFeedbackDetail(baseMessage, reviewNote);
}

export function buildWorkspaceHomeSuggestionFeedback(action, reviewNote = '') {
  const normalizedAction = compact(action).toLowerCase();
  const baseMessage =
    normalizedAction === 'accept'
      ? buildWorkspaceFeedbackBase('Suggestion 治理', '转成 candidate memory')
      : normalizedAction === 'reject'
        ? buildWorkspaceFeedbackBase('Suggestion 治理', '标记暂不沉淀')
        : buildWorkspaceFeedbackBase('Suggestion 治理');
  return appendWorkspaceFeedbackDetail(baseMessage, reviewNote);
}

export function buildWorkspaceContextQuery(projectId, options = {}) {
  const params = new URLSearchParams();
  const normalizedProjectId = compact(projectId);
  if (normalizedProjectId) {
    params.set('project_id', normalizedProjectId);
  }
  if (Boolean(options.includeSynthetic)) {
    params.set('include_synthetic', '1');
  }
  if (Boolean(options.includeResidual)) {
    params.set('include_residual', '1');
  }
  const residualPattern = compact(options.residualPattern || options.residual_pattern);
  if (residualPattern) {
    params.set('residual_pattern', residualPattern);
  }
  const view = normalizeWorkspaceView(options.view);
  if (view !== 'attention') {
    params.set('view', view);
  }
  const threadFilter = normalizeWorkspaceThreadFilter(options.threadFilter || options.thread_filter);
  if (threadFilter !== 'all') {
    params.set('thread_filter', threadFilter);
  }
  const commentFilter = normalizeWorkspaceCommentFilter(options.commentFilter || options.comment_filter);
  if (commentFilter !== 'all') {
    params.set('comment_filter', commentFilter);
  }
  const documentId = compact(options.documentId || options.document_id);
  if (documentId) {
    params.set('document_id', documentId);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function buildWorkspacePath(projectId, options = {}) {
  return `/workspace${buildWorkspaceContextQuery(projectId, options)}`;
}

export function buildWorkspaceThreadHref(projectId, threadKey, options = {}) {
  return `/workspace/threads/${encodeURIComponent(threadKey)}${buildWorkspaceContextQuery(projectId, {
    ...options,
    documentId: options.documentId || options.document_id || 'execution',
  })}`;
}

function summarize(text, maxLength = 120) {
  const normalized = compact(text);
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function notionPageUrlFromId(pageId) {
  const raw = String(pageId || '').trim();
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/-/g, '');
  if (/^[0-9a-fA-F]{32}$/.test(normalized)) {
    return `https://www.notion.so/${normalized}`;
  }

  return raw;
}

function formatIso(iso) {
  if (iso === undefined || iso === null || iso === '') {
    return '未记录';
  }

  if (typeof iso === 'number' || /^\d+$/.test(String(iso).trim())) {
    const numeric = Number(iso);
    if (!Number.isNaN(numeric) && numeric > 0) {
      const millis = numeric < 1e12 ? numeric * 1000 : numeric;
      return new Date(millis).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    }
  }

  const raw = String(iso).trim();
  return raw.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

const SYNTHETIC_PATTERNS = [
  /\[codex smoke/i,
  /\[test\]/i,
  /\bsmoke\b/i,
  /红灯直达测试/i,
  /快速唤醒测试/i,
  /红灯通知验收/i,
  /本地红灯通知 smoke/i,
  /验收链路：claim-next/i,
  /p0可测性验收/i,
  /agent-ext-e2e/i,
  /只回复：?\s*dark luxury itinerary agent online/i,
];

const CHECKLIST_FOCUS_LABEL_PRIORITY = ['优先回看', '当前主闭环', '历史层治理'];

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cardToneFromValue(value, fallback = 'neutral') {
  const raw = compact(value).toLowerCase();
  if (raw.includes('red') || raw.includes('failed') || raw.includes('stop')) {
    return 'red';
  }
  if (raw.includes('yellow') || raw.includes('review') || raw.includes('pending') || raw.includes('acknowledged')) {
    return 'yellow';
  }
  if (raw.includes('green') || raw.includes('done') || raw.includes('completed') || raw.includes('pass')) {
    return 'green';
  }
  if (raw.includes('running') || raw.includes('executing') || raw.includes('claimed')) {
    return 'blue';
  }
  return fallback;
}

function humanCommandStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'new') return '新建';
  if (raw === 'claimed') return '已认领';
  if (raw === 'executing') return '执行中';
  if (raw === 'done') return '已完成';
  if (raw === 'failed') return '失败';
  if (raw === 'cancelled') return '已取消';
  if (raw === 'archived') return '已归档';
  return status || '未知';
}

function humanBriefStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'draft') return '草稿中';
  if (raw === 'aligned') return '已对齐';
  if (raw === 'new') return '待拆解';
  if (raw === 'in_progress') return '执行中';
  if (raw === 'done' || raw === 'completed') return '已完成';
  if (raw === 'blocked') return '已阻塞';
  if (raw === 'cancelled') return '已取消';
  if (raw === 'archived') return '已归档';
  return status || '未知';
}

function humanCommentIntent(intent) {
  const raw = compact(intent).toLowerCase();
  if (raw === 'continue_task') return '继续执行';
  if (raw === 'thread_reply') return '线程回复';
  if (raw === 'structured_directive') return '结构化指令';
  if (raw === 'revise_task') return '修改执行';
  if (raw === 'restart_task') return '重做任务';
  if (raw === 'control_task') return '控制任务';
  if (raw === 'question') return '问题';
  if (raw === 'feedback') return '反馈';
  if (raw === 'needs_clarification') return '待澄清';
  if (raw === 'rejected') return '已拦截';
  return humanizeToken(intent) || '未分类';
}

function humanCommentExecutionPolicy(policy) {
  const raw = compact(policy).toLowerCase();
  if (raw === 'enqueue') return '进入执行队列';
  if (raw === 'log_only') return '仅记录到线程历史';
  if (raw === 'inbox_only') return '仅进入 triage';
  if (raw === 'reject') return '拒绝执行';
  return humanizeToken(policy) || '未记录';
}

function humanCommentTaskState(state) {
  const raw = compact(state).toLowerCase();
  if (raw === 'ready_to_execute') return '可继续执行';
  if (raw === 'logged_reply') return '已记录回复';
  if (raw === 'needs_triage') return '等待人工分流';
  if (raw === 'rejected') return '已拒绝';
  return humanizeToken(state) || '未记录';
}

function humanCommentReason(reason) {
  const raw = compact(reason).toLowerCase();
  if (raw === 'reply_only_comment') return '这是工作台里的线程回复，不进入 triage';
  if (raw === 'explicit_continue_instruction') return '评论里已经有明确执行指令';
  if (raw === 'explicit_revision_instruction') return '评论里已经明确要求修改';
  if (raw === 'explicit_restart_instruction') return '评论里已经明确要求重做';
  if (raw === 'explicit_stop_instruction') return '评论里已经明确要求停止';
  if (raw === 'explicit_clarification_request') return '评论本身是在请求澄清';
  if (raw === 'question_without_executable_directive') return '当前只有问题，没有明确可执行动作';
  if (raw === 'feedback_without_clear_directive') return '当前只有反馈，还没有明确执行指令';
  if (raw === 'no_clear_comment_intent') return '当前评论语义还不够明确';
  if (raw === 'unsafe_or_disallowed_instruction') return '评论触发了安全拦截';
  if (raw === 'structured_cortex_directive') return '这是结构化 Cortex 指令';
  if (raw === 'empty_comment') return '评论内容为空';
  return humanizeToken(reason) || '未记录';
}

function humanCommentBucket(bucket) {
  const raw = compact(bucket).toLowerCase();
  if (raw === 'triage') return '待分流';
  if (raw === 'ready') return '已接回执行';
  if (raw === 'rejected') return '已拦截';
  if (raw === 'resolved') return '历史层';
  return humanizeToken(bucket) || '未记录';
}

function stripCommentActionPrefix(value) {
  const raw = compact(value);
  return compact(raw.replace(/^\[(?:continue|improve|retry|stop|clarify|reply)\b[^\]]*\]\s*/i, ''));
}

function parseCommentIntentEventKey(value) {
  const raw = compact(value);
  const prefix = 'comment_intent:';
  if (!raw.startsWith(prefix)) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.slice(prefix.length));
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function findInboxItemForCommand(command, inboxItems = []) {
  return (
    inboxItems.find((item) => compact(item.payload?.command_id) === compact(command.commandId)) ||
    inboxItems.find((item) => compact(item.sourceRef) === `command:${command.commandId}`) ||
    null
  );
}

function classifyCommentThreadBucket(command, inboxItems = []) {
  const intent = parseCommentIntentEventKey(command.eventKey) || {};
  const inboxItem = findInboxItemForCommand(command, inboxItems);
  const executionPolicy = compact(intent.comment_execution_policy).toLowerCase();
  const taskState = compact(intent.comment_task_state).toLowerCase();
  const inboxStatus = compact(inboxItem?.status).toLowerCase();
  const commandStatus = compact(command.status).toLowerCase();

  if (executionPolicy === 'reject' || taskState === 'rejected') {
    return 'rejected';
  }

  if (
    executionPolicy === 'inbox_only' &&
    (!inboxStatus || inboxStatus === 'open' || inboxStatus === 'snoozed' || taskState === 'needs_triage')
  ) {
    return 'triage';
  }

  if (executionPolicy === 'enqueue' && !['done', 'archived', 'cancelled'].includes(commandStatus)) {
    return 'ready';
  }

  return 'resolved';
}

function buildLatestCommentCollaboration(command, bucket) {
  const intent = parseCommentIntentEventKey(command.eventKey) || {};
  const intentLabel = humanCommentIntent(intent.comment_intent);
  const statusLabel = humanCommandStatus(command.status);
  const policyLabel = humanCommentExecutionPolicy(intent.comment_execution_policy);
  const taskStateLabel = humanCommentTaskState(intent.comment_task_state);
  const reasonLabel = humanCommentReason(intent.comment_reason);
  const bucketLabel = humanCommentBucket(bucket);
  const strippedInstruction = summarize(stripCommentActionPrefix(command.instruction), 120);
  const summaryText =
    intent.comment_intent === 'thread_reply'
      ? strippedInstruction ||
        summarize(command.resultSummary, 120) ||
        summarize(command.contextQuote ? `引用：${command.contextQuote}` : '', 120) ||
        summarize(reasonLabel, 120)
      : summarize(command.resultSummary, 120) ||
        summarize(command.contextQuote ? `引用：${command.contextQuote}` : '', 120) ||
        strippedInstruction ||
        summarize(reasonLabel, 120);
  const detailParts = [
    bucketLabel ? `流向：${bucketLabel}` : '',
    policyLabel ? `策略：${policyLabel}` : '',
    taskStateLabel ? `状态：${taskStateLabel}` : '',
    reasonLabel ? `原因：${reasonLabel}` : '',
  ].filter(Boolean);

  return {
    latest_comment_bucket: bucket || null,
    latestCommentBucket: bucket || null,
    latest_comment_bucket_label: bucketLabel || null,
    latestCommentBucketLabel: bucketLabel || null,
    latest_comment_intent: intent.comment_intent || null,
    latestCommentIntent: intent.comment_intent || null,
    latest_comment_intent_label: intentLabel || null,
    latestCommentIntentLabel: intentLabel || null,
    latest_comment_policy: intent.comment_execution_policy || null,
    latestCommentPolicy: intent.comment_execution_policy || null,
    latest_comment_policy_label: policyLabel || null,
    latestCommentPolicyLabel: policyLabel || null,
    latest_comment_task_state: intent.comment_task_state || null,
    latestCommentTaskState: intent.comment_task_state || null,
    latest_comment_task_state_label: taskStateLabel || null,
    latestCommentTaskStateLabel: taskStateLabel || null,
    latest_comment_reason: intent.comment_reason || null,
    latestCommentReason: intent.comment_reason || null,
    latest_comment_reason_label: reasonLabel || null,
    latestCommentReasonLabel: reasonLabel || null,
    latest_comment_status: compact(command.status) || null,
    latestCommentStatus: compact(command.status) || null,
    latest_comment_status_label: statusLabel || null,
    latestCommentStatusLabel: statusLabel || null,
    latest_comment_title: [intentLabel, statusLabel].filter(Boolean).join(' · ') || '评论事件',
    latestCommentTitle: [intentLabel, statusLabel].filter(Boolean).join(' · ') || '评论事件',
    latest_comment_summary: summaryText || '最近一条协同事件已记录。',
    latestCommentSummary: summaryText || '最近一条协同事件已记录。',
    latest_comment_detail: detailParts.join(' · '),
    latestCommentDetail: detailParts.join(' · '),
  };
}

function buildThreadCommentAuditItem(command, bucket) {
  const latest = buildLatestCommentCollaboration(command, bucket);
  const intent = parseCommentIntentEventKey(command.eventKey) || {};
  const policy = compact(intent.comment_execution_policy).toLowerCase();
  const commentIntent = compact(intent.comment_intent).toLowerCase();
  let kind = 'collaboration';

  if (policy === 'log_only' && commentIntent === 'thread_reply') {
    kind = 'thread_reply';
  } else if (policy === 'log_only') {
    kind = 'note';
  } else if (policy === 'inbox_only') {
    kind = 'triage';
  } else if (policy === 'reject') {
    kind = 'rejected';
  }

  return {
    kind,
    kindLabel: labelTaskCollaborationHistory(command),
    tone: cardToneFromValue(policy === 'reject' ? 'red' : policy === 'inbox_only' ? 'yellow' : 'green', 'green'),
    title: latest.latest_comment_title || '协同记录',
    summary: latest.latest_comment_summary || '最近一条协同事件已记录。',
    detail: latest.latest_comment_detail || '',
    statusLabel: [latest.latest_comment_task_state_label, latest.latest_comment_status_label].filter(Boolean).join(' · '),
    timestamp: command.updatedAt || command.createdAt || null,
    timeLabel: formatIso(command.updatedAt || command.createdAt),
    ownerAgent: command.ownerAgent || '',
    sourceUrl: command.sourceUrl || '',
    commandId: command.commandId || '',
  };
}

function buildRecentThreadCommentEvent(command, bucket) {
  const latest = buildLatestCommentCollaboration(command, bucket);
  const bucketLabel = latest.latest_comment_bucket_label || humanCommentBucket(bucket);
  const tone =
    bucket === 'rejected'
      ? 'red'
      : bucket === 'triage'
        ? 'yellow'
        : bucket === 'ready'
          ? 'blue'
          : 'green';

  return {
    kind: classifyTaskFlowCommandRole(command) === 'collaboration' ? classifyCommentKindFromCommand(command) : 'execution',
    title: latest.latest_comment_title || '评论事件',
    summary: latest.latest_comment_summary || '最近一条评论事件已记录。',
    detail: latest.latest_comment_detail || '',
    bucket,
    bucketLabel,
    tone,
    timestamp: command.updatedAt || command.createdAt || null,
    timeLabel: formatIso(command.updatedAt || command.createdAt),
    commandId: command.commandId || '',
    ownerAgent: command.ownerAgent || '',
    sourceUrl: command.sourceUrl || '',
  };
}

function buildRecentCommentAuditItem(event = {}) {
  const kind = compact(event.kind).toLowerCase();
  const bucket = compact(event.bucket).toLowerCase();
  let kindLabel = '最近事件';

  if (kind === 'thread_reply') {
    kindLabel = '线程回复';
  } else if (kind === 'triage') {
    kindLabel = '待分流评论';
  } else if (kind === 'rejected') {
    kindLabel = '被拦截评论';
  } else if (kind === 'note') {
    kindLabel = '协同留痕';
  } else if (bucket === 'ready') {
    kindLabel = '继续执行';
  } else if (bucket === 'triage') {
    kindLabel = '待分流';
  } else if (bucket === 'rejected') {
    kindLabel = '已拦截';
  } else if (bucket === 'resolved') {
    kindLabel = '历史层';
  }

  return {
    kind: kind || bucket || 'recent',
    kindLabel,
    tone: event.tone || 'green',
    title: event.title || '最近事件',
    summary: event.summary || '最近一条评论事件已记录。',
    detail: event.detail || '',
    timestamp: event.timestamp || null,
    timeLabel: event.timeLabel || (event.timestamp ? formatIso(event.timestamp) : ''),
    sourceUrl: event.sourceUrl || '',
    commandId: event.commandId || '',
    ownerAgent: event.ownerAgent || '',
  };
}

function compareCommentTimelineEntriesDesc(left = {}, right = {}) {
  const timestampDelta = toEpochMs(right.timestamp) - toEpochMs(left.timestamp);
  if (timestampDelta !== 0) {
    return timestampDelta;
  }
  return compact(right.commandId).localeCompare(compact(left.commandId), 'en');
}

function resolveRecentCommentActionMode(group = {}, latestEvent = {}) {
  if (Number(group.comment_triage_count || group.commentTriageCount || 0) > 0) {
    return 'triage';
  }
  if (Number(group.comment_ready_count || group.commentReadyCount || 0) > 0) {
    return 'ready';
  }

  const bucket = compact(latestEvent.bucket).toLowerCase();
  if (bucket === 'triage') return 'triage';
  if (bucket === 'ready') return 'ready';
  return '';
}

function classifyCommentKindFromCommand(command = {}) {
  const intent = parseCommentIntentEventKey(command.eventKey) || {};
  const policy = compact(intent.comment_execution_policy).toLowerCase();
  const commentIntent = compact(intent.comment_intent).toLowerCase();

  if (policy === 'log_only' && commentIntent === 'thread_reply') {
    return 'thread_reply';
  }
  if (policy === 'log_only') {
    return 'note';
  }
  if (policy === 'inbox_only') {
    return 'triage';
  }
  if (policy === 'reject') {
    return 'rejected';
  }
  return 'execution';
}

function classifyTaskFlowCommandRole(command = {}) {
  const source = compact(command.source || command.sourceType).toLowerCase();
  if (source !== 'notion_comment') {
    return 'execution';
  }

  const intent = parseCommentIntentEventKey(command.eventKey) || {};
  const policy = compact(intent.comment_execution_policy).toLowerCase();
  return policy && policy !== 'enqueue' ? 'collaboration' : 'execution';
}

function labelTaskCollaborationHistory(command = {}) {
  const intent = parseCommentIntentEventKey(command.eventKey) || {};
  const policy = compact(intent.comment_execution_policy).toLowerCase();
  const commentIntent = compact(intent.comment_intent).toLowerCase();

  if (policy === 'log_only' && commentIntent === 'thread_reply') {
    return '线程回复';
  }
  if (policy === 'log_only') {
    return '协同留痕';
  }
  if (policy === 'inbox_only') {
    return '待分流评论';
  }
  if (policy === 'reject') {
    return '被拦截评论';
  }
  return '协同记录';
}

function summarizeCollaborationHistoryKinds(kindCounts = new Map()) {
  const entries = [...kindCounts.entries()]
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hans-CN'));

  return entries.map(([label, count]) => `${count} 条${label}`).join(' / ');
}

function summarizeTaskFlowDetails(task = {}) {
  const commands = Array.isArray(task.commands) ? task.commands : [];
  let executionCommandCount = 0;
  let collaborationHistoryCount = 0;
  const collaborationKindCounts = new Map();

  for (const command of commands) {
    if (classifyTaskFlowCommandRole(command) === 'collaboration') {
      collaborationHistoryCount += 1;
      const label = labelTaskCollaborationHistory(command);
      collaborationKindCounts.set(label, Number(collaborationKindCounts.get(label) || 0) + 1);
    } else {
      executionCommandCount += 1;
    }
  }

  return {
    executionCommandCount,
    collaborationHistoryCount,
    collaborationKindCounts,
    collaborationHistorySummary: summarizeCollaborationHistoryKinds(collaborationKindCounts),
    runCount: Array.isArray(task.runs) ? task.runs.length : 0,
    receiptCount: Array.isArray(task.receipts) ? task.receipts.length : 0,
    checkpointCount: Array.isArray(task.checkpoints) ? task.checkpoints.length : 0,
  };
}

function buildThreadCommentOverviewIndex(commands = [], inboxItems = [], project = null) {
  const overviewByThreadKey = new Map();

  for (const command of commands) {
    if (compact(command.source).toLowerCase() !== 'notion_comment') {
      continue;
    }

    const derivedThread = deriveThreadIdentity(command, project);
    const threadKey = compact(command.threadKey || command.thread_key || derivedThread.key);
    if (!threadKey) {
      continue;
    }

    const overview = overviewByThreadKey.get(threadKey) || {
      comment_count: 0,
      commentCount: 0,
      comment_triage_count: 0,
      commentTriageCount: 0,
      comment_ready_count: 0,
      commentReadyCount: 0,
      comment_rejected_count: 0,
      commentRejectedCount: 0,
      comment_resolved_count: 0,
      commentResolvedCount: 0,
      latest_comment_at: null,
      latestCommentAt: null,
      comment_status_summary: '',
      commentStatusSummary: '',
      latest_comment_bucket: null,
      latestCommentBucket: null,
      latest_comment_bucket_label: null,
      latestCommentBucketLabel: null,
      latest_comment_intent: null,
      latestCommentIntent: null,
      latest_comment_intent_label: null,
      latestCommentIntentLabel: null,
      latest_comment_policy: null,
      latestCommentPolicy: null,
      latest_comment_policy_label: null,
      latestCommentPolicyLabel: null,
      latest_comment_task_state: null,
      latestCommentTaskState: null,
      latest_comment_task_state_label: null,
      latestCommentTaskStateLabel: null,
      latest_comment_reason: null,
      latestCommentReason: null,
      latest_comment_reason_label: null,
      latestCommentReasonLabel: null,
      latest_comment_status: null,
      latestCommentStatus: null,
      latest_comment_status_label: null,
      latestCommentStatusLabel: null,
      latest_comment_title: '',
      latestCommentTitle: '',
      latest_comment_summary: '',
      latestCommentSummary: '',
      latest_comment_detail: '',
      latestCommentDetail: '',
      latest_collaboration_at: null,
      latestCollaborationAt: null,
      latest_collaboration_title: '',
      latestCollaborationTitle: '',
      latest_collaboration_summary: '',
      latestCollaborationSummary: '',
      latest_collaboration_detail: '',
      latestCollaborationDetail: '',
      collaboration_audit_items: [],
      collaborationAuditItems: [],
      recent_comment_events: [],
      recentCommentEvents: [],
      overview_summary: '',
      overviewSummary: '',
    };

    overview.comment_count += 1;
    overview.commentCount += 1;

    const bucket = classifyCommentThreadBucket(command, inboxItems);
    if (bucket === 'triage') {
      overview.comment_triage_count += 1;
      overview.commentTriageCount += 1;
    } else if (bucket === 'ready') {
      overview.comment_ready_count += 1;
      overview.commentReadyCount += 1;
    } else if (bucket === 'rejected') {
      overview.comment_rejected_count += 1;
      overview.commentRejectedCount += 1;
    } else {
      overview.comment_resolved_count += 1;
      overview.commentResolvedCount += 1;
    }

    const updatedAt = command.updatedAt || command.createdAt || null;
    if (toEpochMs(updatedAt) >= toEpochMs(overview.latest_comment_at)) {
      overview.latest_comment_at = updatedAt;
      overview.latestCommentAt = updatedAt;
      Object.assign(overview, buildLatestCommentCollaboration(command, bucket));
    }

    if (classifyTaskFlowCommandRole(command) === 'collaboration') {
      const auditItem = buildThreadCommentAuditItem(command, bucket);
      overview.collaboration_audit_items = [...overview.collaboration_audit_items, auditItem]
        .sort((left, right) => compareCommentTimelineEntriesDesc(left, right))
        .slice(0, 4);
      overview.collaborationAuditItems = overview.collaboration_audit_items;

      if (toEpochMs(updatedAt) >= toEpochMs(overview.latest_collaboration_at)) {
        overview.latest_collaboration_at = updatedAt;
        overview.latestCollaborationAt = updatedAt;
        overview.latest_collaboration_title = auditItem.title;
        overview.latestCollaborationTitle = auditItem.title;
        overview.latest_collaboration_summary = auditItem.summary;
        overview.latestCollaborationSummary = auditItem.summary;
        overview.latest_collaboration_detail = auditItem.detail;
        overview.latestCollaborationDetail = auditItem.detail;
      }
    }

    const recentEvent = buildRecentThreadCommentEvent(command, bucket);
    overview.recent_comment_events = [...overview.recent_comment_events, recentEvent]
      .sort((left, right) => compareCommentTimelineEntriesDesc(left, right))
      .slice(0, 6);
    overview.recentCommentEvents = overview.recent_comment_events;

    overviewByThreadKey.set(threadKey, overview);
  }

  for (const overview of overviewByThreadKey.values()) {
    if (overview.comment_triage_count > 0) {
      overview.comment_status_summary = `${overview.comment_triage_count} 条待分流评论`;
    } else if (overview.comment_ready_count > 0) {
      overview.comment_status_summary = `${overview.comment_ready_count} 条评论已接回执行`;
    } else if (overview.comment_rejected_count > 0) {
      overview.comment_status_summary = `${overview.comment_rejected_count} 条评论被拦截`;
    } else if (overview.comment_resolved_count > 0) {
      overview.comment_status_summary = `${overview.comment_resolved_count} 条评论已进入历史层`;
    } else {
      overview.comment_status_summary = '';
    }
    overview.commentStatusSummary = overview.comment_status_summary;
  }

  return overviewByThreadKey;
}

function buildThreadOverviewSummary(group) {
  const parts = [];
  if ((group.comment_triage_count || 0) > 0) {
    parts.push(`${group.comment_triage_count} 条待分流评论`);
  }
  if ((group.comment_ready_count || 0) > 0) {
    parts.push(`${group.comment_ready_count} 条已接回执行评论`);
  }
  if ((group.red_count || 0) > 0) {
    parts.push(`${group.red_count} 个红灯`);
  }
  if ((group.completed_count || 0) > 0) {
    parts.push(`${group.completed_count} 个已完成`);
  }
  return parts.join(' · ');
}

function humanDecisionStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'needs_review') return '待拍板';
  if (raw === 'proposed') return '待确认';
  if (raw === 'approved') return '已批准';
  if (raw === 'changes_requested') return '待修改';
  if (raw === 'retry_requested') return '待重试';
  if (raw === 'stopped') return '已停止';
  if (raw === 'resolved') return '已解决';
  if (raw === 'archived') return '已归档';
  return status || '未知';
}

function humanRunStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'running') return '运行中';
  if (raw === 'completed') return '已完成';
  if (raw === 'failed') return '失败';
  return status || '未知';
}

function humanReceiptStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'completed') return '已回执';
  if (raw === 'failed') return '失败回执';
  if (raw === 'delivered') return '已送达';
  if (raw === 'acknowledged') return '已确认';
  if (raw === 'read') return '已读';
  return status || '未知';
}

function humanMemoryStatus(memory) {
  if (memory.status === 'candidate') {
    if (memory.reviewState === 'pending_accept') {
      return '待人工确认';
    }
    if (memory.reviewState === 'needs_followup') {
      return '待补证据';
    }
  }
  return memory.status || '未知';
}

function humanizeToken(value) {
  const raw = compact(value);
  if (!raw) {
    return '';
  }

  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function humanMemoryLayer(layer) {
  const raw = compact(layer).toLowerCase();
  if (raw === 'base_memory') return 'Base Memory';
  if (raw === 'timeline') return 'Timeline';
  if (raw === 'knowledge') return 'Knowledge';
  return humanizeToken(layer);
}

function sortByUpdatedDesc(items = []) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.updated_at || left.updatedAt || left.created_at || left.createdAt || 0);
    const rightTime = Date.parse(right.updated_at || right.updatedAt || right.created_at || right.createdAt || 0);
    return rightTime - leftTime;
  });
}

function buildEntryLinks(project) {
  return [
    project.rootPageUrl ? { label: '工作台文档', url: project.rootPageUrl } : null,
    project.notionScanPageId ? { label: '执行文档', url: notionPageUrlFromId(project.notionScanPageId) } : null,
    project.notionMemoryPageId ? { label: '协作记忆', url: notionPageUrlFromId(project.notionMemoryPageId) } : null,
  ].filter(Boolean);
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function loadProjectNotionSyncStatus(projectId) {
  const normalizedProjectId = compact(projectId).toLowerCase();
  if (!normalizedProjectId) {
    return null;
  }

  const statusPath = resolve(PROJECT_ROOT, `docs/projects/${normalizedProjectId}/notion-sync-status.json`);

  try {
    const parsed = JSON.parse(readFileSync(statusPath, 'utf8'));
    return {
      statusPath,
      state: compact(parsed?.state) || 'unknown',
      title: compact(parsed?.title) || '最近同步落点',
      summary: compact(parsed?.summary) || '',
      pageTitle: compact(parsed?.pageTitle) || '',
      pageUrl: compact(parsed?.pageUrl) || '',
      verifiedAt: compact(parsed?.verifiedAt) || '',
      verifiedBy: compact(parsed?.verifiedBy) || '',
      notes: Array.isArray(parsed?.notes) ? parsed.notes.map((item) => compact(item)).filter(Boolean) : [],
    };
  } catch {
    return null;
  }
}

function humanWorkspaceIntegrationStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'ready_for_notion_setup') return '可挂接';
  if (raw === 'independent_authorization_required') return '需单独授权';
  if (raw === 'not_configured') return '未配置';
  return '待处理';
}

function buildWorkspaceNotionCollaboration(project = {}) {
  const publicMcpUrl = normalizePublicMcpUrl(process.env.CORTEX_MCP_PUBLIC_URL || '');
  const bearerConfigured = compact(process.env.CORTEX_MCP_BEARER_TOKEN).length > 0;
  const tokenMirrorConfigured = compact(process.env.NOTION_API_KEY).length > 0;
  const configuredPageIds = unique([
    extractNotionPageId(project.rootPageUrl || project.root_page_url),
    extractNotionPageId(project.notionParentPageId || project.notion_parent_page_id),
    extractNotionPageId(project.notionReviewPageId || project.notion_review_page_id),
    extractNotionPageId(project.notionMemoryPageId || project.notion_memory_page_id),
    extractNotionPageId(project.notionScanPageId || project.notion_scan_page_id),
  ]);
  const targetPageUrl =
    project.rootPageUrl ||
    project.root_page_url ||
    notionPageUrlFromId(project.notionParentPageId || project.notion_parent_page_id) ||
    null;
  const targetPageId = extractNotionPageId(targetPageUrl);
  const blockers = [];

  if (!publicMcpUrl) {
    blockers.push('public_mcp_url_missing');
  }
  if (!targetPageId) {
    blockers.push('target_page_missing');
  } else if (!configuredPageIds.includes(targetPageId)) {
    blockers.push('target_page_out_of_scope');
  }

  const customAgentStatus = blockers.length === 0 ? 'ready_for_notion_setup' : 'action_required';
  const syncProbe = loadProjectNotionSyncStatus(project.projectId || project.project_id);
  const customAgentSummary =
    customAgentStatus === 'ready_for_notion_setup'
      ? 'Custom Agent 主路径的本地前置条件已经齐备，但这只代表 Cortex 侧 ready；真实可直接 @Cortex 仍要看 OAuth 选中的 workspace、Notion UI 连接和 trigger 是否全部落住。'
      : 'Custom Agent 主路径还有本地缺口，先补公网 MCP 或项目 page scope。';
  const liveVerificationNotes =
    customAgentStatus === 'ready_for_notion_setup'
      ? [
          '当前“可挂接”只覆盖 Cortex 本地前置条件，不等于当前 Notion workspace 已经能直接 @Cortex。',
          '如果当前 Codex 会话里的 notion MCP 仍报 `Auth required`，先确认 OAuth 选中的是目标 Business workspace，再重新执行 `codex mcp login notion`；必要时重启 Codex 会话。',
          '如果 Notion Custom Agent 页面仍在 loading，优先排查 workspace 选错、workspace credit / plan 状态或连接未持久化，而不是先怀疑 Cortex MCP transport。',
        ]
      : [];

  return {
    title: 'Notion 协作接入',
    summary: customAgentSummary,
    custom_agent_status: customAgentStatus,
    customAgentStatus,
    custom_agent_status_label: humanWorkspaceIntegrationStatus(customAgentStatus),
    customAgentStatusLabel: humanWorkspaceIntegrationStatus(customAgentStatus),
    agent_name: 'Cortex',
    agentName: 'Cortex',
    public_mcp_url: publicMcpUrl,
    publicMcpUrl,
    public_mcp_configured: Boolean(publicMcpUrl),
    publicMcpConfigured: Boolean(publicMcpUrl),
    bearer_configured: bearerConfigured,
    bearerConfigured: bearerConfigured,
    sync_probe: syncProbe,
    syncProbe,
    target_page_url: targetPageUrl,
    targetPageUrl,
    target_page_id: targetPageId,
    targetPageId,
    configured_page_ids: configuredPageIds,
    configuredPageIds: configuredPageIds,
    project_scope_ready: Boolean(targetPageId && configuredPageIds.includes(targetPageId)),
    projectScopeReady: Boolean(targetPageId && configuredPageIds.includes(targetPageId)),
    blockers,
    next_actions:
      customAgentStatus === 'ready_for_notion_setup'
        ? [
            '先确认 Notion MCP OAuth 选中的就是目标 Business workspace，而不是个人 Free workspace。',
            '如果 Codex / notion MCP 仍报 `Auth required`，重新执行 `codex mcp login notion`，必要时重启当前会话。',
            '在 Notion 里创建或打开 `Cortex` Custom Agent',
            '挂上公网 MCP 连接，并填写 Authorization Bearer Token',
            '打开 mention trigger 与 comment-added trigger',
            '先用一条 green comment 做真实 @Cortex 联调',
          ]
        : [
            !publicMcpUrl ? '先补一个当前可用的公网 HTTPS MCP URL。' : null,
            !targetPageId ? '先把项目 root page 指向真实的 Notion 页面。' : null,
            targetPageId && !configuredPageIds.includes(targetPageId)
              ? '先把当前 Notion 根页写进 PRJ-cortex 的 project scope。'
              : null,
          ].filter(Boolean),
    nextActions:
      customAgentStatus === 'ready_for_notion_setup'
        ? [
            '先确认 Notion MCP OAuth 选中的就是目标 Business workspace，而不是个人 Free workspace。',
            '如果 Codex / notion MCP 仍报 `Auth required`，重新执行 `codex mcp login notion`，必要时重启当前会话。',
            '在 Notion 里创建或打开 `Cortex` Custom Agent',
            '挂上公网 MCP 连接，并填写 Authorization Bearer Token',
            '打开 mention trigger 与 comment-added trigger',
            '先用一条 green comment 做真实 @Cortex 联调',
          ]
        : [
            !publicMcpUrl ? '先补一个当前可用的公网 HTTPS MCP URL。' : null,
            !targetPageId ? '先把项目 root page 指向真实的 Notion 页面。' : null,
            targetPageId && !configuredPageIds.includes(targetPageId)
              ? '先把当前 Notion 根页写进 PRJ-cortex 的 project scope。'
              : null,
          ].filter(Boolean),
    token_mirror_status: tokenMirrorConfigured ? 'independent_authorization_required' : 'not_configured',
    tokenMirrorStatus: tokenMirrorConfigured ? 'independent_authorization_required' : 'not_configured',
    token_mirror_status_label: humanWorkspaceIntegrationStatus(
      tokenMirrorConfigured ? 'independent_authorization_required' : 'not_configured',
    ),
    tokenMirrorStatusLabel: humanWorkspaceIntegrationStatus(
      tokenMirrorConfigured ? 'independent_authorization_required' : 'not_configured',
    ),
    token_mirror_summary: tokenMirrorConfigured
      ? 'token-based mirror 与 Custom Agent 是独立授权链路；如果还要跑 notion:sync-all / bootstrap，需要单独确认页面已共享给 integration。'
      : '当前没有启用 token-based mirror；Notion UI 协作仍然可以单独使用 Custom Agent 主路径。',
    tokenMirrorSummary: tokenMirrorConfigured
      ? 'token-based mirror 与 Custom Agent 是独立授权链路；如果还要跑 notion:sync-all / bootstrap，需要单独确认页面已共享给 integration。'
      : '当前没有启用 token-based mirror；Notion UI 协作仍然可以单独使用 Custom Agent 主路径。',
    token_mirror_check_command: 'npm run notion:diagnose -- "<page-url>"',
    tokenMirrorCheckCommand: 'npm run notion:diagnose -- "<page-url>"',
    live_verification_notes: liveVerificationNotes,
    liveVerificationNotes,
  };
}

function mapProjectForDashboard(project) {
  return {
    ...project,
    project_id: project.projectId,
    root_page_url: project.rootPageUrl,
    review_window_note: project.reviewWindowNote,
    notification_channel: project.notificationChannel,
    notification_target: project.notificationTarget,
    notion_review_page_id: project.notionReviewPageId,
    notion_parent_page_id: project.notionParentPageId,
    notion_memory_page_id: project.notionMemoryPageId,
    notion_scan_page_id: project.notionScanPageId,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

function collectRecordTexts(record) {
  return Object.values(record || {})
    .filter((value) => typeof value === 'string')
    .map((value) => compact(value))
    .filter(Boolean);
}

function isSyntheticRecord(record) {
  const haystack = collectRecordTexts(record).join('\n');
  if (!haystack) {
    return false;
  }

  return SYNTHETIC_PATTERNS.some((pattern) => pattern.test(haystack));
}

function splitSynthetic(items = [], includeSynthetic = false) {
  if (includeSynthetic) {
    return {
      visible: [...items],
      hidden: [],
    };
  }

  const visible = [];
  const hidden = [];

  for (const item of items) {
    if (isSyntheticRecord(item)) {
      hidden.push(item);
      continue;
    }
    visible.push(item);
  }

  return {
    visible,
    hidden,
  };
}

function buildCommandCard(command) {
  return {
    id: command.commandId,
    type: 'command',
    tone: cardToneFromValue(command.status, 'blue'),
    badge: humanCommandStatus(command.status),
    title: summarize(command.instruction || command.resultSummary || command.commandId, 72),
    summary: summarize(command.contextQuote || command.resultSummary || `${command.source || 'unknown'} 指令`, 140),
    meta: [
      command.ownerAgent ? `负责人：${command.ownerAgent}` : null,
      command.source ? `来源：${command.source}` : null,
      command.updatedAt ? `更新时间：${formatIso(command.updatedAt)}` : null,
    ].filter(Boolean),
    link: command.sourceUrl || null,
  };
}

function buildRunCard(run) {
  return {
    id: run.runId,
    type: 'run',
    tone: cardToneFromValue(run.status, 'blue'),
    badge: humanRunStatus(run.status),
    title: summarize(run.title || `${run.role || 'agent'} run`, 72),
    summary: summarize(run.summary || `${run.agentName || 'agent'} 正在推进 ${run.phase || '当前阶段'}`, 140),
    meta: [
      run.agentName ? `Agent：${run.agentName}` : null,
      run.role ? `角色：${run.role}` : null,
      run.phase ? `阶段：${run.phase}` : null,
      run.updatedAt ? `更新时间：${formatIso(run.updatedAt)}` : null,
    ].filter(Boolean),
    link: null,
  };
}

function buildDecisionCard(decision) {
  return {
    id: decision.decisionId,
    type: 'decision',
    tone: cardToneFromValue(decision.signalLevel || decision.status, 'yellow'),
    badge: `${decision.signalLevel || 'yellow'} / ${humanDecisionStatus(decision.status)}`,
    title: summarize(decision.question, 72),
    summary: summarize(decision.recommendation || decision.context || decision.whyNow || '等待进一步处理', 140),
    meta: [
      decision.ownerAgent ? `建议负责人：${decision.ownerAgent}` : null,
      decision.requestedHumanAction ? `需要动作：${summarize(decision.requestedHumanAction, 44)}` : null,
      decision.updatedAt ? `更新时间：${formatIso(decision.updatedAt)}` : null,
    ].filter(Boolean),
    link: decision.sourceUrl || null,
  };
}

function buildInboxCard(item) {
  return {
    id: item.itemId,
    type: 'inbox',
    tone: cardToneFromValue(item.riskLevel || item.status, 'yellow'),
    badge: `${item.queue || 'queue'} / ${item.status || 'open'}`,
    title: summarize(item.title, 72),
    summary: summarize(item.summary || item.actionType || item.objectType, 140),
    meta: [
      item.objectType ? `对象：${item.objectType}` : null,
      item.assignedTo ? `分配给：${item.assignedTo}` : null,
      item.updatedAt ? `更新时间：${formatIso(item.updatedAt)}` : null,
    ].filter(Boolean),
    link: item.sourceUrl || null,
    threadKey: item.threadKey || item.thread_key || null,
    sourceRef: item.sourceRef || item.source_ref || null,
    sourceUrl: item.sourceUrl || item.source_url || null,
    memoryId: item.payload?.memory_id || item.payload?.memoryId || null,
    payload: item.payload || {},
  };
}

function buildCheckpointCard(checkpoint) {
  return {
    id: checkpoint.checkpointId,
    type: 'checkpoint',
    tone: cardToneFromValue(checkpoint.signalLevel || checkpoint.qualityGrade || checkpoint.status, 'green'),
    badge: [checkpoint.signalLevel, checkpoint.status].filter(Boolean).join(' / ') || 'checkpoint',
    title: summarize(checkpoint.title, 72),
    summary: summarize(checkpoint.summary || checkpoint.nextStep || '已产出新的 checkpoint', 140),
    meta: [
      checkpoint.stage ? `阶段：${checkpoint.stage}` : null,
      checkpoint.createdBy ? `创建者：${checkpoint.createdBy}` : null,
      checkpoint.updatedAt ? `更新时间：${formatIso(checkpoint.updatedAt)}` : null,
    ].filter(Boolean),
    link: null,
  };
}

function buildMemoryCard(memory) {
  return {
    id: memory.memoryId,
    memoryId: memory.memoryId,
    type: 'memory',
    tone: cardToneFromValue(memory.reviewState || memory.status, 'yellow'),
    badge: `${humanMemoryLayer(memory.layer)} / ${humanMemoryStatus(memory)}`,
    title: summarize(memory.title, 72),
    summary: summarize(memory.summary || memory.nextStep || '等待进一步整理', 140),
    nextStep: compact(memory.nextStep),
    meta: [
      memory.type ? `类型：${humanizeToken(memory.type)}` : null,
      memory.confidence ? `置信度：${memory.confidence}` : null,
      memory.updatedAt ? `更新时间：${formatIso(memory.updatedAt)}` : null,
    ].filter(Boolean),
    link: null,
  };
}

function buildSuggestionCard(suggestion) {
  return {
    id: suggestion.suggestionId,
    suggestionId: suggestion.suggestionId,
    type: 'suggestion',
    tone: cardToneFromValue(suggestion.status, 'yellow'),
    badge: `suggestion / ${suggestion.status || 'proposed'}`,
    title: summarize(suggestion.proposedText || suggestion.selectedText || suggestion.suggestionId, 72),
    summary: summarize(suggestion.reason || suggestion.documentRef || '等待处理建议', 140),
    meta: [
      suggestion.sourceType ? `来源：${suggestion.sourceType}` : null,
      suggestion.ownerAgent ? `负责人：${suggestion.ownerAgent}` : null,
      suggestion.appliedAt ? `处理时间：${formatIso(suggestion.appliedAt)}` : null,
    ].filter(Boolean),
    link: suggestion.documentRef || null,
    threadKey: suggestion.threadKey || suggestion.thread_key || null,
    sourceRef: suggestion.sourceRef || suggestion.source_ref || null,
    sourceUrl: suggestion.documentRef || suggestion.sourceUrl || suggestion.source_url || null,
  };
}

function humanMemoryLifecycle(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'candidate') return '候选';
  if (raw === 'durable') return 'Durable';
  if (raw === 'rejected') return '已拒绝';
  if (raw === 'archived') return '已归档';
  return humanizeToken(status) || '未记录';
}

function humanMemoryReviewState(reviewState) {
  const raw = compact(reviewState).toLowerCase();
  if (raw === 'pending_accept') return '待 accept';
  if (raw === 'accepted') return '已 accept';
  if (raw === 'rejected') return '已 reject';
  if (raw === 'needs_followup') return '待补证据';
  return humanizeToken(reviewState) || '未记录';
}

function summarizeReviewerRecommendation(recommendation) {
  const value = recommendation && typeof recommendation === 'object' ? recommendation : null;
  const status = compact(value?.recommendation).toLowerCase();
  if (status === 'recommend_accept') {
    return 'Reviewer-Agent 建议 accept 为 durable memory。';
  }
  if (status === 'recommend_reject') {
    return 'Reviewer-Agent 建议 reject，避免错误记忆进入 durable 层。';
  }
  if (status === 'needs_followup') {
    return 'Reviewer-Agent 建议先补证据，再决定 accept 或 reject。';
  }
  return '';
}

function summarizeHumanReview(review) {
  const value = review && typeof review === 'object' ? review : null;
  if (!value) {
    return '';
  }

  const pieces = [
    compact(value.actor) || 'reviewer-human',
    humanMemoryReviewState(value.final_review_state || value.finalReviewState),
    value.decided_at || value.decidedAt ? formatIso(value.decided_at || value.decidedAt) : '',
  ].filter(Boolean);
  const note = summarize(value.note, 120);
  return note ? `${pieces.join(' · ')} · ${note}` : pieces.join(' · ');
}

function countStructuredMemorySources(sources = []) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return 0;
  }

  return sources.filter((source) => {
    const evidence = source?.evidence;
    return Boolean(
      compact(source?.summary || source?.quoteText || source?.quote_text) ||
        (evidence && typeof evidence === 'object' && Object.keys(evidence).length > 0),
    );
  }).length;
}

function pickLatestMemorySource(sources = []) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return null;
  }

  return [...sources]
    .filter(Boolean)
    .sort((left, right) => toEpochMs(right?.createdAt || right?.created_at) - toEpochMs(left?.createdAt || left?.created_at))[0];
}

function formatRelativeAge(targetMs, nowMs) {
  if (!targetMs || !nowMs || targetMs > nowMs) {
    return '刚刚';
  }

  const diffMinutes = Math.max(0, Math.floor((nowMs - targetMs) / 60000));
  if (diffMinutes < 1) {
    return '0 分钟前';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
}

function buildMemoryFreshnessSummary(memory, sources = [], nowIso = '') {
  const latestSource = pickLatestMemorySource(sources);
  const latestSourceAt = latestSource?.createdAt || latestSource?.created_at || '';
  const latestSourceMs = toEpochMs(latestSourceAt);
  const freshnessRaw = compact(memory?.freshness);
  const freshnessMs = toEpochMs(freshnessRaw);
  const updatedAtMs = toEpochMs(memory?.updatedAt);
  const createdAtMs = toEpochMs(memory?.createdAt);
  const nowMs = toEpochMs(nowIso) || updatedAtMs || createdAtMs || latestSourceMs || 0;
  const anchorMs = freshnessMs || latestSourceMs || updatedAtMs || createdAtMs || 0;
  const ageDays = anchorMs && nowMs && nowMs >= anchorMs ? Math.floor((nowMs - anchorMs) / 86400000) : 0;

  let label = '未标 freshness';
  if (anchorMs) {
    if (ageDays >= 21) {
      label = '偏陈旧';
    } else if (ageDays >= 7) {
      label = '待回看';
    } else if (ageDays >= 1) {
      label = '可用';
    } else {
      label = '较新';
    }
  }

  const detail = [
    freshnessRaw
      ? `freshness=${formatIso(freshnessRaw)}${freshnessMs && nowMs ? `（${formatRelativeAge(freshnessMs, nowMs)}）` : ''}`
      : '当前还没有显式 freshness 标记',
    latestSourceMs
      ? `最近 source：${formatIso(latestSourceAt)}${nowMs ? `（${formatRelativeAge(latestSourceMs, nowMs)}）` : ''}`
      : '当前还没有 source',
    freshnessMs && latestSourceMs && latestSourceMs > freshnessMs ? '最新 source 比 freshness 更新，建议按新证据复核。' : '',
  ]
    .filter(Boolean)
    .join('；');

  return {
    label,
    detail,
    latestSource,
    latestSourceAt,
    latestSourceMs,
    ageDays,
  };
}

function buildMemoryEvidenceDeltaSummary(sources = [], reviewerRecommendation = null, humanReview = null) {
  const sourceCount = Array.isArray(sources) ? sources.length : 0;
  const evidenceCount = countStructuredMemorySources(sources);
  const reviewerSourceCount = Number(reviewerRecommendation?.checks?.source_count || 0);
  const reviewerEvidenceCount = Number(reviewerRecommendation?.checks?.evidence_count || 0);
  const sourceDelta = reviewerRecommendation ? Math.max(0, sourceCount - reviewerSourceCount) : 0;
  const evidenceDelta = reviewerRecommendation ? Math.max(0, evidenceCount - reviewerEvidenceCount) : 0;
  const humanReviewMs = toEpochMs(humanReview?.decided_at || humanReview?.decidedAt);
  const newSourcesAfterHuman = humanReviewMs
    ? sources.filter((source) => toEpochMs(source?.createdAt || source?.created_at) > humanReviewMs).length
    : 0;
  const latestSource = pickLatestMemorySource(sources);
  const latestSourceAt = latestSource?.createdAt || latestSource?.created_at || '';
  const latestSourcePreview = summarize(
    latestSource?.summary || latestSource?.quoteText || latestSource?.quote_text,
    120,
  );

  let label = '当前没有 source';
  if (sourceCount > 0) {
    if (sourceDelta > 0 || evidenceDelta > 0) {
      const deltaPieces = [];
      if (sourceDelta > 0) {
        deltaPieces.push(`${sourceDelta} 条 source`);
      }
      if (evidenceDelta > 0) {
        deltaPieces.push(`${evidenceDelta} 条 evidence`);
      }
      label = `较上次 reviewer 新增 ${deltaPieces.join(' / ')}`;
    } else if (newSourcesAfterHuman > 0) {
      label = `人工判断后新增 ${newSourcesAfterHuman} 条 source`;
    } else {
      label = `当前共有 ${sourceCount} 条 source / ${evidenceCount} 条 evidence`;
    }
  }

  const detail = [
    reviewerRecommendation
      ? `reviewer 快照：${reviewerSourceCount} 条 source / ${reviewerEvidenceCount} 条 evidence`
      : '当前还没有 reviewer 快照',
    humanReviewMs
      ? newSourcesAfterHuman > 0
        ? `人工判断后又进来 ${newSourcesAfterHuman} 条 source`
        : '人工判断后暂无新增 source'
      : '',
    latestSourceAt ? `最近一条：${formatIso(latestSourceAt)}` : '',
    latestSourcePreview ? `摘要：${latestSourcePreview}` : '',
  ]
    .filter(Boolean)
    .join('；');

  return {
    label,
    detail,
    hasReviewerDelta: sourceDelta > 0 || evidenceDelta > 0,
    hasHumanDelta: newSourcesAfterHuman > 0,
  };
}

function buildMemoryRevalidationSummary(memory, freshnessSummary, evidenceDeltaSummary, reviewerRecommendation = null, humanReview = null) {
  const humanReviewState = compact(humanReview?.final_review_state || humanReview?.finalReviewState).toLowerCase();

  if (!reviewerRecommendation) {
    return {
      label: '建议先跑 reviewer',
      detail: '这条 memory 还没有 reviewer 结论，先生成一版 accept / reject / needs_followup 基线。',
    };
  }

  if (evidenceDeltaSummary?.hasHumanDelta) {
    return {
      label: '建议重新校验',
      detail: '人工判断之后又出现了新 source，先重跑 reviewer，再决定是否调整当前结论。',
    };
  }

  if (evidenceDeltaSummary?.hasReviewerDelta) {
    return {
      label: '建议重新校验',
      detail: '相较 reviewer 快照已经有新增 source / evidence，可直接重跑 reviewer。',
    };
  }

  if (compact(memory?.reviewState).toLowerCase() === 'needs_followup') {
    return {
      label: '补证据后再重跑',
      detail: '当前 reviewer 仍建议补证据；先补齐 source / evidence / confidence，再重跑 reviewer 更有价值。',
    };
  }

  if (freshnessSummary?.label === '待回看' || freshnessSummary?.label === '偏陈旧') {
    return {
      label: '建议刷新 freshness',
      detail: '最近 evidence 已经偏旧；如果事实仍有效，建议补 freshness 或重跑 reviewer 再确认。',
    };
  }

  if (humanReviewState === 'accepted' || humanReviewState === 'rejected') {
    return {
      label: '当前无需重跑',
      detail: '已经有人类完成最终判断，且 review 后暂无新增证据；除非上下文明显变化，否则先沿用当前结论。',
    };
  }

  return {
    label: '当前结论可沿用',
    detail: '当前 reviewer 快照和最新 source 基本一致；除非摘要、证据或 confidence 发生变化，否则先不要浪费 reviewer 轮次。',
  };
}

function buildMemoryEvidenceSummary(sources = []) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return '';
  }

  const pieces = [];
  for (const source of sources.slice(0, 2)) {
    const sourceType = humanizeToken(source?.sourceType || source?.source_type || 'source');
    const summaryText = summarize(source?.summary || source?.quoteText || source?.quote_text, 96);
    if (summaryText) {
      pieces.push(`${sourceType}：${summaryText}`);
      continue;
    }
    if (source?.sourceUrl || source?.source_url) {
      pieces.push(`${sourceType}：${compact(source?.sourceUrl || source?.source_url)}`);
    }
  }

  return pieces.join('；');
}

function buildHomeMemorySourceAnchor(sources = []) {
  const latestSource = pickLatestMemorySource(sources) || (Array.isArray(sources) ? sources[0] : null);
  if (!latestSource) {
    return {
      label: '',
      detail: '',
      href: '',
      hrefLabel: '',
    };
  }

  const sourceTypeLabel = humanizeToken(latestSource?.sourceType || latestSource?.source_type || 'source');
  const sourceRef = compact(latestSource?.sourceRef || latestSource?.source_ref);
  const sourceUrl = compact(latestSource?.sourceUrl || latestSource?.source_url);
  const latestSourceAt = compact(latestSource?.createdAt || latestSource?.created_at);

  return {
    label: [sourceTypeLabel, sourceRef ? `ref=${sourceRef}` : sourceUrl ? '已记录 URL' : '未记录 ref'].filter(Boolean).join(' · '),
    detail: [
      latestSourceAt ? `最近记录：${formatIso(latestSourceAt)}` : '',
      sourceUrl ? '可直接打开原始 source' : '当前 source 还没有 URL，可先跳到 memory 文档继续追踪',
    ]
      .filter(Boolean)
      .join('；'),
    href: sourceUrl,
    hrefLabel: sourceUrl ? '打开最近 source' : '',
  };
}

function resolveHomeMemoryEvidenceContextLabel(card) {
  const sectionKey = compact(card?.type).toLowerCase();
  if (sectionKey === 'memory') {
    return '记忆候选区';
  }
  if (sectionKey === 'inbox') {
    return 'Review 队列';
  }
  if (sectionKey === 'suggestion') {
    return 'Suggestion 沉淀区';
  }
  return '记忆治理现场';
}

function buildHomeMemoryGovernanceInsights(detail, generatedAt = '') {
  const memory = detail?.memory;
  if (!memory) {
    return {};
  }

  const sources = Array.isArray(detail.sources) ? detail.sources : [];
  const reviewerRecommendation = memory.metadata?.reviewer_recommendation || null;
  const humanReview = memory.metadata?.human_review || null;
  const freshnessSummary = buildMemoryFreshnessSummary(memory, sources, generatedAt);
  const evidenceDeltaSummary = buildMemoryEvidenceDeltaSummary(sources, reviewerRecommendation, humanReview);
  const sourceAnchor = buildHomeMemorySourceAnchor(sources);
  const latestSource = pickLatestMemorySource(sources);
  const evidenceUpdatedAt = compact(latestSource?.createdAt || latestSource?.created_at || memory.updatedAt || memory.createdAt);
  const revalidationSummary = buildMemoryRevalidationSummary(
    memory,
    freshnessSummary,
    evidenceDeltaSummary,
    reviewerRecommendation,
    humanReview,
  );

  return {
    memoryStatus: memory.status,
    memoryStatusLabel: humanMemoryLifecycle(memory.status),
    reviewState: memory.reviewState,
    reviewStateLabel: humanMemoryReviewState(memory.reviewState),
    nextStep: compact(memory.nextStep),
    freshness: compact(memory.freshness),
    ownerAgent: compact(memory.ownerAgent),
    sourceCount: Number(memory.sourceCount || sources.length || 0),
    reviewerRecommendation,
    reviewerRecommendationSummary: summarizeReviewerRecommendation(reviewerRecommendation),
    reviewerRationale: summarize(reviewerRecommendation?.rationale, 180),
    reviewerPrompt: summarize(reviewerRecommendation?.human_prompt, 180),
    evidenceSummary: buildMemoryEvidenceSummary(sources),
    evidenceUpdatedAt,
    sourceAnchorLabel: sourceAnchor.label,
    sourceAnchorDetail: sourceAnchor.detail,
    sourceAnchorHref: sourceAnchor.href,
    sourceAnchorHrefLabel: sourceAnchor.hrefLabel,
    freshnessLabel: freshnessSummary.label,
    freshnessDetail: freshnessSummary.detail,
    evidenceDeltaLabel: evidenceDeltaSummary.label,
    evidenceDeltaDetail: evidenceDeltaSummary.detail,
    revalidationLabel: revalidationSummary.label,
    revalidationDetail: revalidationSummary.detail,
    humanReviewSummary: summarizeHumanReview(humanReview),
  };
}

function resolveHomeMemoryGovernanceId(card) {
  const directId = compact(card?.memoryId || card?.memory_id);
  if (directId) {
    return directId;
  }

  const payloadId = compact(card?.payload?.memory_id || card?.payload?.memoryId);
  if (payloadId) {
    return payloadId;
  }

  return compact(card?.type) === 'memory' ? compact(card?.id) : '';
}

function resolveHomeSuggestionGovernanceId(card) {
  const directId = compact(card?.suggestionId || card?.suggestion_id);
  if (directId) {
    return directId;
  }

  return compact(card?.type) === 'suggestion' ? compact(card?.id) : '';
}

function readHomeGovernanceDraftNote(card) {
  return compact(
    card?.nextStep ||
    card?.next_step ||
    card?.payload?.next_step ||
    card?.payload?.nextStep ||
    card?.payload?.review_note ||
    card?.payload?.reviewNote,
  );
}

function buildHomeMemoryGovernanceGuidance(card) {
  if (!card) {
    return null;
  }

  card = normalizeHomeMemoryGovernanceCard(card);

  const sectionKey = compact(card.type).toLowerCase();
  let nodeLabel = card.badge || '记忆治理';
  let nodeSummary = compact(card.reviewerRecommendationSummary || card.summary);
  let nodeDecision = compact(card.nextStep || card.homeGovernanceHint);

  if (sectionKey === 'suggestion') {
    nodeLabel = 'Suggestion 沉淀';
    nodeSummary =
      compact(card.summary) || '这条 suggestion 还没有真正进入 memory reviewer 判断，先决定是否值得转成 candidate memory。';
    nodeDecision =
      compact(card.nextStep) || '先决定转成 candidate memory，还是明确记成“暂不沉淀”，避免 suggestion 一直停在只读状态。';
  } else if (sectionKey === 'inbox') {
    nodeLabel = `Review${card.reviewStateLabel ? ` · ${card.reviewStateLabel}` : ''}`;
    nodeSummary =
      compact(card.reviewerRecommendationSummary) ||
      '这条 memory 已进入 review，当前重点是做 accept、needs_followup 或 reject 判断。';
    nodeDecision =
      compact(card.nextStep) || '先根据 reviewer 建议和最新 source / evidence 做 accept、继续补证据，或拒绝沉淀。';
  } else {
    nodeLabel = card.memoryStatusLabel || card.badge || '候选';
    nodeSummary =
      compact(card.reviewerRecommendationSummary || card.summary) ||
      '这条 candidate 还需要判断是否足够稳定，值得继续升到 durable memory。';
    nodeDecision =
      compact(card.nextStep) || '先判断 source / evidence / confidence 是否足够，再决定 accept、补证据或拒绝沉淀。';
  }

  const nodeEvidence = [
    compact(card.evidenceSummary),
    compact(card.freshnessLabel),
    compact(card.evidenceDeltaLabel),
    compact(card.revalidationLabel),
  ]
    .filter(Boolean)
    .join('；');

  const judgmentDetail = compact(
    card.reviewerRationale ||
    card.revalidationDetail ||
    card.humanReviewSummary ||
    (sectionKey === 'suggestion' ? card.homeGovernanceHint : ''),
  );

  const decisionDetail = compact(
    card.homeGovernanceHint && card.homeGovernanceHint !== nodeDecision ? card.homeGovernanceHint : '',
  );

  return {
    nodeLabel,
    nodeSummary,
    nodeDecision,
    nodeEvidence,
    judgmentDetail,
    decisionDetail,
  };
}

function buildThreadGovernanceGuidance(threadIdentityGovernance = {}, executionChecklist = null) {
  const items = Array.isArray(threadIdentityGovernance.items) ? threadIdentityGovernance.items : [];
  const focusItem = items.find((item) => compact(item.visibility).toLowerCase() === 'attention') || items[0] || null;
  const patternGroups = Array.isArray(threadIdentityGovernance.patternGroups)
    ? threadIdentityGovernance.patternGroups
    : [];
  const focusPattern =
    threadIdentityGovernance.focusedPattern ||
    patternGroups.find((group) => compact(group.residualPattern) === compact(focusItem.residualPattern)) ||
    null;
  const defaultViewClosed =
    Number(threadIdentityGovernance.attentionThreadTotal || 0) === 0 &&
    Number(threadIdentityGovernance.historyThreadTotal || 0) > 0;
  const threadIdentityChecklistItem = Array.isArray(executionChecklist?.items)
    ? executionChecklist.items.find((item) => compact(item.id) === 'thread-identity') || null
    : null;
  const threadIdentityStepNumber = Number(
    threadIdentityChecklistItem?.stepNumber || threadIdentityChecklistItem?.step_number || 0,
  );
  const threadIdentityAcceptance = compact(
    threadIdentityChecklistItem?.acceptance ||
      threadIdentityChecklistItem?.checklistAcceptance ||
      threadIdentityChecklistItem?.checklist_acceptance,
  );
  const attentionThreadTotal = Number(threadIdentityGovernance.attentionThreadTotal || 0);
  const historyThreadTotal = Number(threadIdentityGovernance.historyThreadTotal || 0);
  const concreteThreadTotal = Number(threadIdentityGovernance.concreteThreadTotal || 0);

  const nodeLabel =
    focusPattern?.residualPatternLabel ||
    focusItem?.residualPatternLabel ||
    focusItem?.kindLabel ||
    (concreteThreadTotal > 0 ? '线程身份已收口' : '线程治理');
  const nodeSummary =
    focusPattern?.scopeSummary ||
    compact(focusItem?.reason) ||
    compact(threadIdentityGovernance.summary) ||
    '当前没有额外治理判断。';
  const nodeAction = focusItem?.action?.label
    ? `${focusItem.action.label}；${compact(focusItem.cleanupHint) || '处理完后刷新当前治理视图。'}`
    : compact(focusItem?.cleanupHint) ||
      (concreteThreadTotal > 0
        ? '当前主视图已经收口；只有在需要回看历史残留时，再展开线程治理继续处理。'
        : '打开线程现场确认最后一条有效证据。');
  const nodeEvidence = [
    focusItem?.evidenceStatusLabel ? `证据状态：${focusItem.evidenceStatusLabel}` : '',
    compact(focusItem?.evidenceDetail),
    focusItem?.sourceLabel ? `线程来源：${focusItem.sourceLabel}` : '',
    !focusItem && concreteThreadTotal > 0 ? `稳定线程：${concreteThreadTotal} 条` : '',
  ]
    .filter(Boolean)
    .join('；');
  const nodeRule = defaultViewClosed
    ? '主视图已收口时，优先在历史层治理里清掉泛化线程，不再让历史残留重新占住当前执行注意力。'
    : '优先把泛化 thread key 回收到真实 comment / discussion / source；只有确认只剩历史审计价值时，才直接归档。';
  const progressLabel = [
    threadIdentityStepNumber > 0 ? `关联闭环：第 ${threadIdentityStepNumber} 步` : '',
    executionChecklist?.progressLabel ? `执行清单：${executionChecklist.progressLabel}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const judgmentDetail = [
    `主视图 ${attentionThreadTotal} 条`,
    `历史层 ${historyThreadTotal} 条`,
    `稳定线程 ${concreteThreadTotal} 条`,
    threadIdentityGovernance.focusedPattern?.residualPatternLabel
      ? `当前筛选：${threadIdentityGovernance.focusedPattern.residualPatternLabel}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const actionDetail = [
    focusItem?.sourceHref ? '可直接打开最近源位置继续核对。' : '',
    compact(threadIdentityGovernance.residualPatternFilter)
      ? '处理完当前模式后，记得清除残留筛选再回到全局治理视图。'
      : '处理完后刷新当前治理视图，确认首页只剩稳定线程来源。',
  ]
    .filter(Boolean)
    .join(' ');

  return buildPanelGuidanceModel(
    {
      nodeLabel,
      nodeSummary,
      nodeAction,
      nodeEvidence,
      judgmentDetail,
      actionDetail,
    },
    {
      progressLabel,
      checklistAcceptance: threadIdentityAcceptance,
      checklistCheckpointRule: nodeRule,
    },
  );
}

function filterThreadGroupsForView(threadGroups = [], filter = 'all') {
  const normalizedFilter = normalizeWorkspaceThreadFilter(filter);
  return (Array.isArray(threadGroups) ? threadGroups : []).filter((group) =>
    buildThreadGroupVisibilityState(group, normalizedFilter).visible,
  );
}

function buildThreadFilterLabelMap(filters = []) {
  const labelMap = {
    all: '全部',
    triage: '待分流评论',
    ready: '已接回执行',
    red: '红灯',
    active: '进行中',
    completed: '已完成',
  };

  (Array.isArray(filters) ? filters : []).forEach((filter) => {
    const key = normalizeWorkspaceThreadFilter(filter?.key);
    const label = compact(filter?.label);
    if (key && label) {
      labelMap[key] = label;
    }
  });

  return labelMap;
}

function resolveThreadGroupFilterLabels(groupOrFilters = [], labelMap = {}) {
  const filterKeys =
    groupOrFilters && typeof groupOrFilters === 'object' && !Array.isArray(groupOrFilters)
      ? buildThreadGroupFilterKeys(groupOrFilters)
      : normalizeThreadGroupFilterKeys(groupOrFilters);
  const resolvedLabelMap = buildThreadFilterLabelMap(
    Object.entries(labelMap || {}).map(([key, label]) => ({ key, label })),
  );
  const specificKeys = filterKeys.filter((key) => key !== 'all');
  const keys = specificKeys.length > 0 ? specificKeys : ['all'];
  return keys.map((key) => resolvedLabelMap[key] || humanizeToken(key) || key);
}

function buildThreadGroupFilterNote(groupOrFilters = [], labelMap = {}) {
  return `当前归类：${resolveThreadGroupFilterLabels(groupOrFilters, labelMap).join(' / ')}`;
}

function buildThreadGroupVisibilityReason(visibilityState = {}, labelMap = {}) {
  const resolvedLabelMap = buildThreadFilterLabelMap(
    Object.entries(labelMap || {}).map(([key, label]) => ({ key, label })),
  );
  const activeFilter = normalizeWorkspaceThreadFilter(visibilityState.filter);
  const activeLabel = resolvedLabelMap[activeFilter] || '全部';
  const membershipLabel = resolveThreadGroupFilterLabels(
    visibilityState.filterKeys || ['all'],
    resolvedLabelMap,
  ).join(' / ');

  if (visibilityState.visible) {
    if (activeFilter === 'all') {
      return '当前筛选是“全部”，这条线程默认展示。';
    }
    return `当前筛选是“${activeLabel}”，这条线程命中该状态。`;
  }

  return `当前筛选是“${activeLabel}”，这条线程当前归类为${membershipLabel}，所以暂时隐藏。`;
}

function pickThreadViewFocusGroup(visibleGroups = [], filter = 'all') {
  const normalizedFilter = normalizeWorkspaceThreadFilter(filter);
  if (!Array.isArray(visibleGroups) || visibleGroups.length === 0) {
    return null;
  }

  return (
    pickTopChecklistFocus(visibleGroups) ||
    (normalizedFilter === 'red'
      ? visibleGroups.find((group) => Number(group.red_count || group.redCount || 0) > 0)
      : null) ||
    visibleGroups.find((group) => Number(group.red_count || group.redCount || 0) > 0) ||
    visibleGroups[0] ||
    null
  );
}

export function resolveThreadViewGuidanceMode(filter = 'all', topGroup = null) {
  const normalizedFilter = normalizeWorkspaceThreadFilter(filter);
  if (normalizedFilter !== 'all') {
    return normalizedFilter;
  }
  if (!topGroup || typeof topGroup !== 'object') {
    return 'all';
  }

  if (Number(topGroup.red_count || topGroup.redCount || 0) > 0) {
    return 'red';
  }
  if (Number(topGroup.comment_triage_count || topGroup.commentTriageCount || 0) > 0) {
    return 'triage';
  }
  if (Number(topGroup.comment_ready_count || topGroup.commentReadyCount || 0) > 0) {
    return 'ready';
  }
  if (Number(topGroup.in_progress_count || topGroup.inProgressCount || 0) > 0) {
    return 'active';
  }
  if (Number(topGroup.completed_count || topGroup.completedCount || 0) > 0) {
    return 'completed';
  }
  return 'all';
}

export function buildThreadGuidanceDescriptor(topGroup = null, filter = 'all') {
  const normalizedFilter = normalizeWorkspaceThreadFilter(filter);
  const guidanceMode = resolveThreadViewGuidanceMode(normalizedFilter, topGroup);

  if (!topGroup || typeof topGroup !== 'object') {
    return {
      guidanceMode,
      nodeLabel:
        guidanceMode === 'triage'
          ? '当前没有待分流线程'
          : guidanceMode === 'ready'
            ? '当前没有已接回执行线程'
            : guidanceMode === 'red'
              ? '当前没有红灯线程'
              : guidanceMode === 'active'
                ? '当前没有处理中线程'
                : guidanceMode === 'completed'
                  ? '当前没有已完成线程'
                  : '当前没有线程现场',
      nodeSummary: '当前筛选下没有线程，试试切回“全部”或其他状态继续查看协作现场。',
      nodeAction:
        guidanceMode === 'all'
          ? '等待新的线程进入执行现场；新线程出现后，这里会优先告诉你先看哪一条。'
          : '切回“全部”或其他筛选，继续查看当前最需要介入的线程。',
      actionLinkLabel: '',
    };
  }

  const topThreadLabel = summarize(
    topGroup.thread_label || topGroup.threadLabel || topGroup.thread_key || topGroup.threadKey || '',
    28,
  );
  let nodeLabel = '线程执行现场';
  let nodeSummary =
    compact(topGroup.overview_summary || topGroup.overviewSummary) ||
    compact(topGroup.checklist_focus_note || topGroup.checklistFocusNote) ||
    `${topThreadLabel || '当前焦点线程'} 是当前最值得先看的线程现场。`;
  let nodeAction = topThreadLabel ? `先打开 ${topThreadLabel}，沿当前线程继续推进。` : '先打开当前焦点线程继续推进。';
  let actionLinkLabel = '打开焦点线程';

  if (guidanceMode === 'triage') {
    nodeLabel = '待分流评论线程';
    nodeSummary =
      compact(topGroup.comment_status_summary || topGroup.commentStatusSummary) ||
      `${topThreadLabel || '当前焦点线程'} 还停在评论分流入口，需要先明确下一步任务。`;
    nodeAction = topThreadLabel
      ? `先打开 ${topThreadLabel}，把评论转成下一步任务、回复动作或明确归档。`
      : '先把评论转成下一步任务、回复动作或明确归档。';
    actionLinkLabel = '进入评论分流现场';
  } else if (guidanceMode === 'ready') {
    nodeLabel = '已接回执行线程';
    nodeSummary =
      compact(topGroup.overview_summary || topGroup.overviewSummary) ||
      `${topThreadLabel || '当前焦点线程'} 已经接回执行链，接下来重点确认它有没有继续产生命令、Run 或 Checkpoint。`;
    nodeAction = topThreadLabel
      ? `先打开 ${topThreadLabel}，确认它已经继续产生命令、Run 或 Checkpoint。`
      : '先确认这批线程已经继续产生命令、Run 或 Checkpoint。';
    actionLinkLabel = '进入执行回流现场';
  } else if (guidanceMode === 'active') {
    nodeLabel = '执行中线程';
    nodeSummary =
      compact(topGroup.overview_summary || topGroup.overviewSummary) ||
      `${topThreadLabel || '当前焦点线程'} 仍在执行链里推进，接下来重点确认最新 command / Run / Checkpoint 还在持续刷新。`;
    nodeAction = topThreadLabel
      ? `先打开 ${topThreadLabel}，确认它的最新 command、Run 或 Checkpoint 还在继续往前跑。`
      : '先确认这批执行中线程的最新 command、Run 或 Checkpoint 还在继续往前跑。';
    actionLinkLabel = '打开执行中线程';
  } else if (guidanceMode === 'completed') {
    nodeLabel = '已完成线程';
    nodeSummary =
      compact(topGroup.overview_summary || topGroup.overviewSummary) ||
      `${topThreadLabel || '当前焦点线程'} 已进入已完成层，接下来重点确认它留下的回执、Checkpoint 和后续沉淀动作是否已经完整。`;
    nodeAction = topThreadLabel
      ? `先打开 ${topThreadLabel}，确认它的回执、Checkpoint 和后续沉淀动作都已经收口。`
      : '先确认这批已完成线程的回执、Checkpoint 和后续沉淀动作都已经收口。';
    actionLinkLabel = '打开已完成线程';
  } else if (guidanceMode === 'red') {
    nodeLabel = '待拍板线程';
    nodeSummary =
      compact(topGroup.overview_summary || topGroup.overviewSummary) ||
      `${topThreadLabel || '当前焦点线程'} 仍带着红灯决策，需要先拍板再继续推进。`;
    nodeAction = topThreadLabel
      ? `先打开 ${topThreadLabel}，补拍板或明确绕行动作，再确认线程继续往下跑。`
      : '先补拍板或明确绕行动作，再确认线程继续往下跑。';
    actionLinkLabel = '打开待拍板线程';
  } else if (compact(topGroup.checklist_focus_label || topGroup.checklistFocusLabel)) {
    nodeLabel = compact(topGroup.checklist_focus_label || topGroup.checklistFocusLabel);
    nodeSummary =
      compact(topGroup.checklist_focus_note || topGroup.checklistFocusNote) ||
      compact(topGroup.overview_summary || topGroup.overviewSummary) ||
      nodeSummary;
  }

  return {
    guidanceMode,
    nodeLabel,
    nodeSummary,
    nodeAction,
    actionLinkLabel,
  };
}

function buildThreadViewGuidance(threadGroups = [], filter = 'all', executionChecklist = null) {
  const normalizedFilter = normalizeWorkspaceThreadFilter(filter);
  const visibleGroups = filterThreadGroupsForView(threadGroups, normalizedFilter);
  const topGroup = pickThreadViewFocusGroup(visibleGroups, normalizedFilter);
  const descriptor = buildThreadGuidanceDescriptor(topGroup, normalizedFilter);
  const guidanceMode = descriptor.guidanceMode;
  const totalVisible = visibleGroups.length;
  const triageTotal = visibleGroups.reduce(
    (sum, group) => sum + Number(group.comment_triage_count || group.commentTriageCount || 0),
    0,
  );
  const readyTotal = visibleGroups.reduce(
    (sum, group) => sum + Number(group.comment_ready_count || group.commentReadyCount || 0),
    0,
  );
  const redTotal = visibleGroups.reduce((sum, group) => sum + Number(group.red_count || group.redCount || 0), 0);
  const activeTotal = visibleGroups.reduce(
    (sum, group) => sum + Number(group.in_progress_count || group.inProgressCount || 0),
    0,
  );
  const completedTotal = visibleGroups.reduce(
    (sum, group) => sum + Number(group.completed_count || group.completedCount || 0),
    0,
  );
  const primaryTask = Array.isArray(topGroup?.tasks) ? topGroup.tasks[0] || null : null;
  const topThreadHref = compact(primaryTask?.thread_href || primaryTask?.threadHref);
  const topSourceHref = compact(primaryTask?.primary_link || primaryTask?.primaryLink);
  const topThreadLabel = summarize(
    topGroup?.thread_label || topGroup?.threadLabel || topGroup?.thread_key || topGroup?.threadKey || '',
    28,
  );
  const progressContext = topGroup
    ? buildChecklistProgressContext(executionChecklist, {
        stepNumber: Number(topGroup.checklist_step_number || topGroup.checklistStepNumber || 0),
        stepTitle: compact(topGroup.checklist_step_title || topGroup.checklistStepTitle),
      })
    : buildChecklistProgressContext(executionChecklist, {});
  const progressLabel = [
    compact(progressContext.checklistStepLabel),
    compact(progressContext.checklistProgressLabel)
      ? `执行清单：${compact(progressContext.checklistProgressLabel)}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  if (!topGroup) {
    return buildPanelGuidanceModel(
      {
        nodeLabel: descriptor.nodeLabel,
        nodeSummary: descriptor.nodeSummary,
        nodeAction: descriptor.nodeAction,
        nodeEvidence: guidanceMode === 'all' ? '当前线程数：0' : `筛选 ${guidanceMode} · 当前线程数：0`,
      },
      {
        progressLabel,
        checklistAcceptance: compact(executionChecklist?.nextAcceptance),
        checklistCheckpointRule: compact(executionChecklist?.checkpointRule),
      },
    );
  }

  const actionLinks = [];
  if (topThreadHref) {
    actionLinks.push({
      label: descriptor.actionLinkLabel,
      href: topThreadHref,
    });
  }

  return buildPanelGuidanceModel(
    {
      nodeLabel: descriptor.nodeLabel,
      nodeSummary: descriptor.nodeSummary,
      nodeAction: descriptor.nodeAction,
      nodeEvidence: [
        `${totalVisible} 条线程`,
        triageTotal > 0 ? `${triageTotal} 条待分流评论` : '',
        readyTotal > 0 ? `${readyTotal} 条已接回执行评论` : '',
        redTotal > 0 ? `${redTotal} 个红灯` : '',
        activeTotal > 0 ? `${activeTotal} 个处理中` : '',
        completedTotal > 0 ? `${completedTotal} 个已完成` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      judgmentDetail:
        compact(topGroup.checklist_focus_note || topGroup.checklistFocusNote) ||
        `当前筛选 ${totalVisible} 条线程，先处理最上面的 ${topThreadLabel || '焦点线程'}。`,
      actionDetail: compact(topGroup.thread_href || topGroup.threadHref)
        ? `焦点线程：${topThreadLabel || compact(topGroup.thread_key || topGroup.threadKey)}`
        : '',
      proofLabel: summarize(
        compact(primaryTask?.execution_proof || primaryTask?.executionProof) ||
          compact(topGroup.comment_status_summary || topGroup.commentStatusSummary) ||
          compact(topGroup.overview_summary || topGroup.overviewSummary) ||
          '',
        72,
      ),
      proofHref: topThreadHref,
      proofUpdatedAt:
        primaryTask?.latest_updated_at || primaryTask?.latestUpdatedAt || topGroup.latest_updated_at || null,
      proofContextLabel: topThreadLabel || compact(topGroup.thread_key || topGroup.threadKey),
      proofSourceHref: topSourceHref,
      proofSourceLabel: '打开源位置',
      actionLinks,
    },
    {
      progressLabel,
      checklistAcceptance: compact(executionChecklist?.nextAcceptance),
      checklistCheckpointRule: compact(executionChecklist?.checkpointRule),
    },
  );
}

function buildThreadViewGuidanceByFilter(threadGroups = [], executionChecklist = null) {
  return {
    all: buildThreadViewGuidance(threadGroups, 'all', executionChecklist),
    triage: buildThreadViewGuidance(threadGroups, 'triage', executionChecklist),
    ready: buildThreadViewGuidance(threadGroups, 'ready', executionChecklist),
    red: buildThreadViewGuidance(threadGroups, 'red', executionChecklist),
    active: buildThreadViewGuidance(threadGroups, 'active', executionChecklist),
    completed: buildThreadViewGuidance(threadGroups, 'completed', executionChecklist),
  };
}

function buildHeroDataHygieneGuidance(dataHygiene = {}, threadIdentityGovernance = {}, options = {}) {
  const visibleRecoverableTotal = Number(dataHygiene.visible_recoverable_total || dataHygiene.visibleRecoverableTotal || 0);
  const visibleRecoverablePreview = compact(dataHygiene.visible_recoverable_preview || dataHygiene.visibleRecoverablePreview);
  const hiddenLowSpecificityTotal = Number(
    dataHygiene.hidden_low_specificity_total || dataHygiene.hiddenLowSpecificityTotal || 0,
  );
  const hiddenLowSpecificityCompletedTotal = Number(
    dataHygiene.hidden_low_specificity_completed_total || dataHygiene.hiddenLowSpecificityCompletedTotal || 0,
  );
  const hiddenLowSpecificityStalledTotal = Number(
    dataHygiene.hidden_low_specificity_stalled_total || dataHygiene.hiddenLowSpecificityStalledTotal || 0,
  );
  const visibleLowSpecificityThreadTotal = Number(
    dataHygiene.visible_low_specificity_thread_total || dataHygiene.visibleLowSpecificityThreadTotal || 0,
  );
  const visibleLowSpecificityPreview = compact(
    dataHygiene.visible_low_specificity_preview || dataHygiene.visibleLowSpecificityPreview,
  );
  const concreteThreadTotal = Number(dataHygiene.concrete_thread_total || dataHygiene.concreteThreadTotal || 0);
  const rawLowSpecificityThreadTotal = Number(
    dataHygiene.raw_low_specificity_thread_total || dataHygiene.rawLowSpecificityThreadTotal || 0,
  );
  const mergedAttentionDuplicates = Number(
    dataHygiene.merged_attention_duplicates || dataHygiene.mergedAttentionDuplicates || 0,
  );
  const includeResidual = Boolean(dataHygiene.include_residual || dataHygiene.includeResidual);
  const patternGroups = Array.isArray(threadIdentityGovernance.patternGroups)
    ? threadIdentityGovernance.patternGroups
    : [];
  const focusPattern = threadIdentityGovernance.focusedPattern || patternGroups[0] || null;
  const focusPatternLabel = compact(focusPattern?.residualPatternLabel || focusPattern?.residualPattern);
  const focusPatternSummary = compact(focusPattern?.scopeSummary);
  const defaultViewClosed =
    Number(threadIdentityGovernance.attentionThreadTotal || 0) === 0 &&
    Number(threadIdentityGovernance.historyThreadTotal || 0) > 0;
  const focusStepNumber = Number(options.focusStepNumber || 0);
  const focusProgressLabel = compact(options.focusProgressLabel);
  const focusContextTitle = compact(options.focusContextTitle);
  const acceptance = compact(options.acceptance);
  const checkpointRule = compact(options.checkpointRule);
  const focusEvidenceLabel = compact(options.focusEvidenceLabel);
  const focusEvidenceHref = compact(options.focusEvidenceHref);
  const focusEvidenceUpdatedAt = compact(options.focusEvidenceUpdatedAt);
  const focusEvidenceContextLabel = compact(options.focusEvidenceContextLabel);
  const focusEvidenceSourceHref = compact(options.focusEvidenceSourceHref);
  const focusEvidenceSourceLabel = compact(options.focusEvidenceSourceLabel);
  const actionLinks = [];
  const seenHrefs = new Set();
  const pushLink = (label, href) => {
    const normalizedLabel = compact(label);
    const normalizedHref = compact(href);
    if (!normalizedLabel || !normalizedHref || seenHrefs.has(normalizedHref)) {
      return;
    }
    seenHrefs.add(normalizedHref);
    actionLinks.push({
      label: normalizedLabel,
      href: normalizedHref,
    });
  };

  if (
    visibleRecoverableTotal === 0 &&
    hiddenLowSpecificityTotal === 0 &&
    visibleLowSpecificityThreadTotal === 0 &&
    concreteThreadTotal === 0 &&
    rawLowSpecificityThreadTotal === 0 &&
    mergedAttentionDuplicates === 0
  ) {
    return null;
  }

  const evidenceBits = [
    focusPatternSummary,
    visibleLowSpecificityPreview ? `主视图待治理：${visibleLowSpecificityPreview}` : '',
    visibleRecoverablePreview ? `待恢复：${visibleRecoverablePreview}` : '',
    hiddenLowSpecificityTotal > 0
      ? `历史层已折叠 ${hiddenLowSpecificityStalledTotal} 条待回看 / ${hiddenLowSpecificityCompletedTotal} 条已完成`
      : '',
    mergedAttentionDuplicates > 0 ? `首页已合并 ${mergedAttentionDuplicates} 张同线程相近卡` : '',
  ].filter(Boolean);

  let nodeLabel = '线程身份已收口';
  let nodeSummary = '';
  let nodeAction = '';

  if (visibleLowSpecificityThreadTotal > 0) {
    nodeLabel = focusPatternLabel || (includeResidual ? '历史层已展开，先治理泛化线程' : '主视图线程身份待收口');
    nodeSummary = includeResidual
      ? `当前已展开历史层，前台直接显示 ${visibleLowSpecificityThreadTotal} 条泛化线程；先把它们挂回真实 comment / discussion / source，再切回聚焦视图。`
      : `主视图里还有 ${visibleLowSpecificityThreadTotal} 条泛化线程仍停在 command / brief / decision 层级，当前先把 thread_key 收回真实来源。`;
    nodeAction = visibleLowSpecificityPreview
      ? `先处理 ${visibleLowSpecificityPreview}，把 thread_key 挂回真实 comment / discussion / source；处理完后再确认首页只剩稳定线程。`
      : includeResidual
        ? '先在当前历史层逐条补回真实来源，确认没有继续执行价值后再切回聚焦视图。'
        : '先打开线程治理，把主视图里的泛化线程逐条挂回真实 comment / discussion / source。';
  } else if (hiddenLowSpecificityTotal > 0) {
    nodeLabel = focusPatternLabel || '历史残留已折叠';
    nodeSummary = defaultViewClosed
      ? `主视图已经收口到 ${concreteThreadTotal} 条稳定线程，当前默认折叠 ${hiddenLowSpecificityTotal} 条低特异度历史线程，避免旧残留重新占住当前执行注意力。`
      : `当前默认折叠 ${hiddenLowSpecificityTotal} 条低特异度历史线程，让首页先聚焦真实执行线程，再决定哪些历史残留值得恢复。`;
    nodeAction =
      hiddenLowSpecificityStalledTotal > 0
        ? `如需继续清理，先展开历史层处理 ${hiddenLowSpecificityStalledTotal} 条待回看，再决定 ${hiddenLowSpecificityCompletedTotal} 条已完成记录只保留审计还是继续恢复。`
        : `如需继续清理，展开历史层逐批核对 ${hiddenLowSpecificityCompletedTotal} 条已完成记录，只把仍需恢复的线程带回主视图。`;
  } else if (visibleRecoverableTotal > 0) {
    nodeLabel = '具体线程待恢复';
    nodeSummary = `当前仍有 ${visibleRecoverableTotal} 条具体线程停在 waiting_human / stalled，线程来源已经稳定，但执行链还没有真正接回去。`;
    nodeAction = visibleRecoverablePreview
      ? `先恢复 ${visibleRecoverablePreview}，补齐 command / checkpoint / 回复后再确认它们退出待恢复状态。`
      : '先打开线程现场，补齐 command / checkpoint / 回复，再确认这批线程退出待恢复状态。';
  } else if (mergedAttentionDuplicates > 0) {
    nodeLabel = '首页卡片已去重';
    nodeSummary = `首页已合并 ${mergedAttentionDuplicates} 张同线程相近卡，避免同一评论线程下的 brief 噪音淹没当前判断。`;
    nodeAction = '如需核对真实任务数，切到线程视图；首页继续只保留治理上最该看的那一张。';
  } else {
    nodeSummary = `当前 ${concreteThreadTotal} 条聚焦线程都已有稳定来源，主视图暂时不需要额外数据卫生治理。`;
    nodeAction =
      rawLowSpecificityThreadTotal > 0
        ? '只有在需要回看历史残留时再展开历史层，避免旧泛化线程重新拉回当前主视图。'
        : '继续沿当前执行闭环推进；新的泛化线程只在确实失去来源时再进入治理队列。';
  }

  if (visibleLowSpecificityThreadTotal > 0 && focusPatternLabel) {
    pushLink(`查看${focusPatternLabel}`, options.focusPatternHref);
  }
  if (hiddenLowSpecificityTotal > 0 || includeResidual) {
    pushLink(options.residualToggleLabel || (includeResidual ? '切回聚焦视图' : '查看全部历史线程'), options.residualToggleHref);
  }
  if (dataHygiene.residual_pattern_filter) {
    pushLink(options.clearResidualPatternLabel || '清除残留筛选', options.clearResidualPatternHref);
  }
  pushLink(options.threadGovernanceLabel || '打开线程治理', options.threadGovernanceHref);

  return buildPanelGuidanceModel(
    {
      nodeLabel,
      nodeSummary,
      nodeAction,
      nodeEvidence: evidenceBits.join('；'),
      proofLabel: focusEvidenceLabel,
      proofHref: focusEvidenceHref,
      proofUpdatedAt: focusEvidenceUpdatedAt,
      proofContextLabel: focusEvidenceContextLabel,
      proofSourceHref: focusEvidenceSourceHref,
      proofSourceLabel: focusEvidenceSourceLabel,
      actionLinks,
    },
    {
      progressEntries: [
        focusStepNumber > 0 ? `关联闭环：第 ${focusStepNumber} 步` : '',
        focusContextTitle || '',
        focusProgressLabel ? `执行清单：${focusProgressLabel}` : '',
      ],
      checklistAcceptance: acceptance,
      checklistCheckpointRule: checkpointRule,
    },
  );
}

function resolveExecutionChecklistEvidenceContextLabel(itemId, options = {}) {
  const normalizedId = compact(itemId);
  if (normalizedId === 'task-entry') {
    return options.threadBacked ? '线程执行现场' : '线程目录';
  }
  if (normalizedId === 'task-comment-linkage') {
    return options.threadBacked ? '评论线程现场' : '评论流转';
  }
  if (normalizedId === 'thread-identity') {
    if (options.hasResidualPattern) {
      return options.defaultViewClosed ? '历史层残留' : '线程治理现场';
    }
    return '线程治理';
  }
  if (normalizedId === 'decision-visibility') {
    return options.threadBacked ? '决策线程现场' : '决策区';
  }
  if (normalizedId === 'doc-workspace') {
    return '协作输入区';
  }
  return '';
}

function renderHomeGovernanceActionPanel(card) {
  card = normalizeHomeMemoryGovernanceCard(card);

  if (!card?.showGovernanceActions) {
    return '';
  }

  const memoryId = resolveHomeMemoryGovernanceId(card);
  if (memoryId) {
    const draftNote = readHomeGovernanceDraftNote(card);
    const hint = compact(card.homeGovernanceHint) || '接受后会升成 durable memory；如果还缺证据，也可以直接留在 reviewer 队列继续补证据。';
    return `
      <div
        class="workspace-inline-action-box"
        data-home-memory-review-box
        data-home-governance-action-box="memory"
        data-memory-id="${escapeHtml(memoryId)}"
      >
        <strong>首页直达治理</strong>
        <p class="workspace-inline-hint">${escapeHtml(hint)}</p>
        <textarea
          class="workspace-inline-note"
          data-home-memory-review-note
          data-home-governance-action-note="memory"
          placeholder="可选：补一句 reviewer 判断，会一起写回 memory 现场。"
        >${escapeHtml(draftNote)}</textarea>
        <div class="workspace-inline-actions" data-home-governance-action-list="memory">
          <button
            type="button"
            class="governance-action-button"
            data-home-memory-review-action="accepted"
            data-home-governance-action-button="accepted"
            data-memory-id="${escapeHtml(memoryId)}"
          >
            接受为 durable
          </button>
          <button
            type="button"
            class="governance-action-button"
            data-home-memory-review-action="needs_followup"
            data-home-governance-action-button="needs_followup"
            data-memory-id="${escapeHtml(memoryId)}"
          >
            继续补证据
          </button>
          <button
            type="button"
            class="governance-action-button"
            data-home-memory-review-action="rejected"
            data-home-governance-action-button="rejected"
            data-memory-id="${escapeHtml(memoryId)}"
          >
            拒绝沉淀
          </button>
          <button
            type="button"
            class="governance-action-button"
            data-home-memory-reviewer-refresh
            data-home-governance-action-button="refresh-reviewer"
            data-memory-id="${escapeHtml(memoryId)}"
          >
            重跑 reviewer
          </button>
        </div>
      </div>
    `;
  }

  const suggestionId = resolveHomeSuggestionGovernanceId(card);
  if (!suggestionId) {
    return '';
  }

  const hint = compact(card.homeGovernanceHint) || '接受后会生成 candidate memory，并把这里补的说明一起带回 source。';
  return `
    <div
      class="workspace-inline-action-box"
      data-home-suggestion-review-box
      data-home-governance-action-box="suggestion"
      data-suggestion-id="${escapeHtml(suggestionId)}"
    >
      <strong>Suggestion 沉淀动作</strong>
      <p class="workspace-inline-hint">${escapeHtml(hint)}</p>
      <textarea
        class="workspace-inline-note"
        data-home-suggestion-review-note
        data-home-governance-action-note="suggestion"
        placeholder="可选：补一句为什么值得沉淀，或说明为什么当前先不转 memory。"
      ></textarea>
      <div class="workspace-inline-actions" data-home-governance-action-list="suggestion">
        <button
          type="button"
          class="governance-action-button"
          data-home-suggestion-review-action="accept"
          data-home-governance-action-button="accept"
          data-suggestion-id="${escapeHtml(suggestionId)}"
        >
          转成 candidate memory
        </button>
        <button
          type="button"
          class="governance-action-button"
          data-home-suggestion-review-action="reject"
          data-home-governance-action-button="reject"
          data-suggestion-id="${escapeHtml(suggestionId)}"
        >
          暂不沉淀
        </button>
      </div>
    </div>
  `;
}

function renderHomeMemoryGovernanceSignals(card) {
  card = normalizeHomeMemoryGovernanceCard(card);
  if (!isHomeMemoryGovernanceCard(card)) {
    return '';
  }

  const guidance = buildHomeMemoryGovernanceGuidance(card);
  const evidenceContextLabel = resolveHomeMemoryEvidenceContextLabel(card);
  const gridHtml = renderMetaGrid(
    [
      card?.memoryStatusLabel ? { key: 'lifecycle', label: '生命周期', value: card.memoryStatusLabel } : null,
      card?.reviewStateLabel ? { key: 'review-state', label: 'Review', value: card.reviewStateLabel } : null,
      guidance?.nodeLabel
        ? {
            key: 'governance-node',
            label: '当前治理节点',
            value: guidance.nodeEvidence ? `${guidance.nodeLabel} · 最近治理证据：${guidance.nodeEvidence}` : guidance.nodeLabel,
          }
        : null,
      guidance?.nodeSummary
        ? {
            key: 'current-judgment',
            label: '当前判断',
            value: guidance.judgmentDetail ? `${guidance.nodeSummary} · ${guidance.judgmentDetail}` : guidance.nodeSummary,
          }
        : null,
      card?.reviewerRecommendationSummary
        ? {
            key: 'reviewer-summary',
            label: 'Reviewer 建议',
            value: card.reviewerRationale || card.reviewerPrompt
              ? `${card.reviewerRecommendationSummary} · ${card.reviewerRationale || card.reviewerPrompt}`
              : card.reviewerRecommendationSummary,
          }
        : null,
      card?.evidenceSummary
        ? {
            key: 'evidence',
            label: '最近证据',
            value: [
              card.evidenceSummary,
              card.evidenceUpdatedAt ? `更新于 ${formatIso(card.evidenceUpdatedAt)}` : '',
              evidenceContextLabel ? `证据现场：${evidenceContextLabel}` : '',
            ]
              .filter(Boolean)
              .join(' · '),
          }
        : null,
      card?.freshnessLabel
        ? {
            key: 'freshness',
            label: 'Freshness 体检',
            value: card.freshnessDetail ? `${card.freshnessLabel} · ${card.freshnessDetail}` : card.freshnessLabel,
          }
        : null,
      card?.evidenceDeltaLabel
        ? {
            key: 'evidence-delta',
            label: '证据变化',
            value: card.evidenceDeltaDetail ? `${card.evidenceDeltaLabel} · ${card.evidenceDeltaDetail}` : card.evidenceDeltaLabel,
          }
        : null,
      card?.revalidationLabel
        ? {
            key: 'revalidation',
            label: '重新校验建议',
            value: card.revalidationDetail ? `${card.revalidationLabel} · ${card.revalidationDetail}` : card.revalidationLabel,
          }
        : null,
      card?.humanReviewSummary
        ? {
            key: 'human-review',
            label: '最近人工判断',
            value: card.humanReviewSummary,
          }
        : null,
      card?.sourceAnchorLabel
        ? {
            key: 'source-anchor',
            label: '最近 source 锚点',
            value: [
              card.sourceAnchorLabel,
              card.sourceAnchorDetail,
              card.sourceAnchorHrefLabel || (card.sourceAnchorHref ? '打开关联位置' : ''),
            ]
              .filter(Boolean)
              .join(' · '),
          }
        : null,
    ].filter(Boolean),
    {
      context: 'home-memory-governance-card',
    },
  );
  const nextStepTitle = guidance?.nodeDecision ? '这一步判断' : '下一步';
  const nextStepBody = compact(guidance?.nodeDecision || card.nextStep || card.homeGovernanceHint);
  const nextStepDetail = compact(
    card.homeGovernanceHint && card.homeGovernanceHint !== nextStepBody ? card.homeGovernanceHint : guidance?.decisionDetail || '',
  );
  const nextStepHtml = renderWorkflowNextSection(nextStepTitle, nextStepBody, {
    context: 'home-memory-governance-card',
    block: 'next-step',
    extraHtml:
      nextStepDetail || card.sourceAnchorHref
        ? `
          ${nextStepDetail ? `<span class="muted">${escapeHtml(nextStepDetail)}</span>` : ''}
          ${
            card.sourceAnchorHref
              ? `<a class="task-link" href="${escapeHtml(card.sourceAnchorHref)}" target="_blank" rel="noreferrer">${escapeHtml(card.sourceAnchorHrefLabel || '打开关联位置')}</a>`
              : ''
          }
        `
        : '',
  });

  return [gridHtml, nextStepHtml].filter(Boolean).join('');
}

function buildCommentCard(command) {
  const commentIntent = parseCommentIntentEventKey(command.eventKey) || {};
  const intent = commentIntent.comment_intent || null;
  const policy = commentIntent.comment_execution_policy || null;
  const reason = commentIntent.comment_reason || null;
  const confidence = commentIntent.comment_confidence || null;
  const tone =
    policy === 'reject'
      ? 'red'
      : policy === 'inbox_only'
        ? 'yellow'
        : cardToneFromValue(command.status, 'green');

  return {
    id: command.commandId,
    type: 'comment',
    tone,
    badge: intent ? `${humanCommentIntent(intent)} / ${humanCommandStatus(command.status)}` : humanCommandStatus(command.status),
    title: summarize(command.instruction, 72),
    summary: summarize(command.contextQuote ? `引用：${command.contextQuote}` : command.resultSummary || '最新评论事件', 140),
    meta: [
      command.ownerAgent ? `路由到：${command.ownerAgent}` : null,
      policy ? `处理策略：${policy}` : null,
      confidence ? `置信度：${confidence}` : null,
      reason ? `原因：${reason}` : null,
      command.createdAt ? `创建时间：${formatIso(command.createdAt)}` : null,
    ].filter(Boolean),
    link: command.sourceUrl || null,
  };
}

function renderCards(cards = [], emptyText = '当前没有内容。') {
  if (cards.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  }

  return cards
    .map(
      (card) => {
        const meta = [
          ...buildChecklistMetaEntries(card, { includeStep: false, includeProgress: true }),
          ...(card.meta || []),
        ];
        const governanceCard = isHomeMemoryGovernanceCard(card);
        const bodyBlocks = renderHomeCardBodyBlocks({
          context: 'home-grid-card',
          record: card,
          middleHtml: renderHomeMemoryGovernanceSignals(card),
          middleAttributes: {
            'data-home-card-body-middle': 'home-grid-details',
          },
        });
        return `
        <article
          class="task-card tone-${escapeHtml(card.tone)}"
          data-home-grid-card
          data-home-grid-kind="${escapeHtml(card.type || 'task')}"
        >
          <div class="task-card-top">
            <span class="task-badge">${escapeHtml(card.badge || card.type)}</span>
            <span class="task-kind">${escapeHtml(card.type)}</span>
          </div>
          <h3>${escapeHtml(card.title || '未命名事项')}</h3>
          <p>${escapeHtml(card.summary || '暂无补充说明')}</p>
          ${bodyBlocks}
	          <ul class="task-meta"${renderHtmlAttributeString(
              governanceCard
                ? {
                    'data-home-memory-governance-meta-list': card.type || 'memory',
                  }
                : {},
            )}>
	            ${meta
                .map(
                  (metaItem) => `<li${renderHtmlAttributeString(
                    governanceCard
                      ? {
                          'data-home-memory-governance-meta-item': card.type || 'memory',
                        }
                      : {},
                  )}>${escapeHtml(metaItem)}</li>`,
                )
                .join('')}
	          </ul>
	          ${renderHomeGovernanceActionPanel(card)}
	          ${
	            card.link
	              ? `<a class="task-link" href="${escapeHtml(card.link)}" target="_blank" rel="noreferrer">打开关联位置</a>`
	              : ''
	          }
        </article>
      `;
      },
    )
    .join('');
}

export function pickTopChecklistFocus(items = []) {
  return (
    [...items]
      .filter((item) => compact(item.focusLabel || item.checklist_focus_label || item.checklistFocusLabel))
      .sort((left, right) => {
        const leftIndex = CHECKLIST_FOCUS_LABEL_PRIORITY.indexOf(compact(left.focusLabel || left.checklist_focus_label || left.checklistFocusLabel));
        const rightIndex = CHECKLIST_FOCUS_LABEL_PRIORITY.indexOf(compact(right.focusLabel || right.checklist_focus_label || right.checklistFocusLabel));
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
      })[0] || null
  );
}

function buildChecklistStepLabel(stepNumber, totalCount) {
  const normalizedStepNumber = Number(stepNumber || 0);
  const normalizedTotalCount = Number(totalCount || 0);
  if (normalizedStepNumber <= 0 || normalizedTotalCount <= 0) {
    return '';
  }

  return `闭环 ${normalizedStepNumber} / ${normalizedTotalCount}`;
}

function buildChecklistProgressContext(executionChecklist = null, options = {}) {
  if (!executionChecklist) {
    return {
      checklist_step_number: 0,
      checklistStepNumber: 0,
      checklist_step_label: '',
      checklistStepLabel: '',
      checklist_step_title: '',
      checklistStepTitle: '',
      checklist_progress_label: '',
      checklistProgressLabel: '',
      checklist_progress_note: '',
      checklistProgressNote: '',
      checklist_progress_summary: '',
      checklistProgressSummary: '',
      checklist_acceptance: '',
      checklistAcceptance: '',
      checklist_checkpoint_rule: '',
      checklistCheckpointRule: '',
      checklist_focus_title: '',
      checklistFocusTitle: '',
      checklist_focus_summary: '',
      checklistFocusSummary: '',
    };
  }

  const totalCount = Number(executionChecklist.totalCount || executionChecklist.items?.length || 0);
  const stepNumber = Number(options.stepNumber || 0);
  const stepTitle = compact(options.stepTitle);
  const acceptance = compact(options.acceptance || executionChecklist.nextAcceptance);
  const checkpointRule = compact(options.checkpointRule || executionChecklist.checkpointRule);
  const focusTitle = compact(options.focusTitle || executionChecklist.focusTitle);
  const focusSummary = compact(options.focusSummary || executionChecklist.focusSummary);
  const stepLabel = buildChecklistStepLabel(stepNumber, totalCount);
  const progressLabel =
    compact(executionChecklist.progressLabel) ||
    (totalCount > 0 ? `${Number(executionChecklist.completedCount || 0)} / ${totalCount} 已收口` : '');
  const progressParts = [];
  const progressPercent = Number(executionChecklist.progressPercent || 0);
  const remainingHeadline = compact(executionChecklist.remainingHeadline);
  if (progressPercent > 0) {
    progressParts.push(`${progressPercent}%`);
  }
  if (remainingHeadline) {
    progressParts.push(remainingHeadline);
  }
  const progressNote = progressParts.join(' · ');
  const progressSummary = [
    progressLabel ? `执行清单：${progressLabel}` : '',
    progressNote,
  ].filter(Boolean).join(' · ');

  return {
    checklist_step_number: stepNumber,
    checklistStepNumber: stepNumber,
    checklist_step_label: stepLabel,
    checklistStepLabel: stepLabel,
    checklist_step_title: stepTitle,
    checklistStepTitle: stepTitle,
    checklist_progress_label: progressLabel,
    checklistProgressLabel: progressLabel,
    checklist_progress_note: progressNote,
    checklistProgressNote: progressNote,
    checklist_progress_summary: progressSummary,
    checklistProgressSummary: progressSummary,
    checklist_acceptance: acceptance,
    checklistAcceptance: acceptance,
    checklist_checkpoint_rule: checkpointRule,
    checklistCheckpointRule: checkpointRule,
    checklist_focus_title: focusTitle,
    checklistFocusTitle: focusTitle,
    checklist_focus_summary: focusSummary,
    checklistFocusSummary: focusSummary,
  };
}

function buildChecklistMetaEntries(record = {}, options = {}) {
  const includeStep = options.includeStep !== false;
  const includeProgress = options.includeProgress !== false;
  const stepLabel = compact(record.checklist_step_label || record.checklistStepLabel || record.focusStepLabel);
  const stepTitle = compact(record.checklist_step_title || record.checklistStepTitle || record.focusStepTitle);
  const progressLabel = compact(record.checklist_progress_label || record.checklistProgressLabel || record.progressLabel);
  const meta = [];

  if (includeStep && stepLabel) {
    meta.push(`关联闭环：${stepLabel}${stepTitle ? ` · ${stepTitle}` : ''}`);
  }
  if (includeProgress && progressLabel) {
    meta.push(`执行清单：${progressLabel}`);
  }

  return meta;
}

function buildFallbackCenterChecklistSummary(executionChecklist = null) {
  if (!executionChecklist) {
    return {
      checklistHeadline: '',
      checklistFocusLabel: '',
      checklistFocusStepLabel: '',
      checklistNote: '',
      checklistProgressLabel: '',
      checklistProgressSummary: '',
    };
  }

  const fallbackContext = buildChecklistProgressContext(executionChecklist, {
    stepNumber: Number(executionChecklist.focusStepNumber || 0),
    focusSummary: compact(executionChecklist.focusSummary || executionChecklist.summary),
  });
  const focusLabel = compact(executionChecklist.revisitContextTitle || executionChecklist.focusContextTitle);
  const focusStepLabel = compact(fallbackContext.checklistStepLabel);
  const checklistHeadline = ['当前关联闭环', focusLabel, focusStepLabel].filter(Boolean).join(' · ');

  return {
    checklistHeadline,
    checklistFocusLabel: focusLabel,
    checklistFocusStepLabel: focusStepLabel,
    checklistNote: compact(fallbackContext.checklistFocusSummary),
    checklistProgressLabel: compact(fallbackContext.checklistProgressLabel),
    checklistProgressSummary: compact(fallbackContext.checklistProgressSummary),
  };
}

function buildCenterChecklistSummary(items = [], executionChecklist = null) {
  const fallbackSummary = buildFallbackCenterChecklistSummary(executionChecklist);
  const topFocus = pickTopChecklistFocus(Array.isArray(items) ? items.filter(Boolean) : []);
  if (!topFocus) {
    return fallbackSummary;
  }

  const focusLabel = compact(topFocus.focusLabel || topFocus.checklist_focus_label || topFocus.checklistFocusLabel);
  const focusStepLabel = compact(topFocus.focusStepLabel || topFocus.checklist_step_label || topFocus.checklistStepLabel);
  const focusNote = compact(topFocus.focusNote || topFocus.checklist_focus_note || topFocus.checklistFocusNote);
  const progressLabel = compact(topFocus.progressLabel || topFocus.checklist_progress_label || topFocus.checklistProgressLabel);
  const progressSummary = compact(topFocus.checklistProgressSummary || topFocus.checklist_progress_summary || topFocus.checklistProgressSummary);
  const checklistHeadline = ['当前关联闭环', focusLabel, focusStepLabel].filter(Boolean).join(' · ') || fallbackSummary.checklistHeadline;

  return {
    checklistHeadline,
    checklistFocusLabel: focusLabel || fallbackSummary.checklistFocusLabel,
    checklistFocusStepLabel: focusStepLabel || fallbackSummary.checklistFocusStepLabel,
    checklistNote: focusNote || fallbackSummary.checklistNote,
    checklistProgressLabel: progressLabel || fallbackSummary.checklistProgressLabel,
    checklistProgressSummary: progressSummary || fallbackSummary.checklistProgressSummary,
  };
}

function renderCenterChecklistSummaryCallout(record = {}) {
  const headline = compact(record.checklistHeadline || record.checklist_headline);
  const note = compact(record.checklistNote || record.checklist_note);
  const progressLabel = compact(record.checklistProgressLabel || record.checklist_progress_label || record.progressLabel);
  const progressSummary = compact(record.checklistProgressSummary || record.checklist_progress_summary);
  const progressDetail = progressSummary || (progressLabel ? `执行清单：${progressLabel}` : '');
  if (!headline && !note && !progressDetail) {
    return '';
  }

  return `
    <div class="decision-focus-callout">
      <strong>${escapeHtml(headline || '当前关联闭环')}</strong>
      ${note ? `<span>${escapeHtml(note)}</span>` : ''}
      ${progressDetail ? `<span class="checklist-context-progress">${escapeHtml(progressDetail)}</span>` : ''}
    </div>
  `;
}

function renderCenterFocusGuidanceStrip(guidance = null, options = {}) {
  if (!guidance) {
    return '';
  }

  const nodeTitle = compact(options.nodeTitle) || '当前节点';
  const summaryTitle = compact(options.summaryTitle) || '当前判断';
  const actionTitle = compact(options.actionTitle) || '这一步处理';
  const dataAttribute = compact(options.dataAttribute);
  const acceptanceLabel = compact(options.acceptanceLabel) || '验收条件';
  const checkpointLabel = compact(options.checkpointLabel) || 'Checkpoint 规则';
  const bindingPrefix = compact(options.bindingPrefix).replace(/[^a-z0-9_-]/gi, '');
  const bindAttr = (suffix) => (bindingPrefix ? ` data-${bindingPrefix}-${suffix}` : '');
  const renderOptionalDetail = (value, suffix, prefix = '') => {
    const normalized = compact(value);
    if (!bindingPrefix && !normalized) {
      return '';
    }

    return `<span class="checklist-context-progress"${bindAttr(suffix)}${normalized ? '' : ' hidden'}>${escapeHtml(
      normalized ? `${prefix}${normalized}` : '',
    )}</span>`;
  };

  if (!guidance.nodeLabel && !guidance.nodeSummary && !guidance.nodeAction) {
    return '';
  }

  return `
    <div class="governance-grid governance-guidance-grid"${dataAttribute ? ` ${escapeHtml(dataAttribute)}` : ''}>
      <div class="decision-focus-callout">
        <strong>${escapeHtml(nodeTitle)}</strong>
        <span${bindAttr('node-label')}>${escapeHtml(guidance.nodeLabel || '当前没有额外节点说明。')}</span>
        ${renderOptionalDetail(guidance.nodeEvidence, 'node-evidence', '最近依据：')}
      </div>
      <div class="decision-focus-callout">
        <strong>${escapeHtml(summaryTitle)}</strong>
        <span${bindAttr('node-summary')}>${escapeHtml(guidance.nodeSummary || '当前没有额外判断。')}</span>
        ${renderOptionalDetail(guidance.progressLabel, 'progress-label')}
        ${renderOptionalDetail(guidance.judgmentDetail, 'judgment-detail')}
      </div>
      <div class="decision-focus-callout">
        <strong>${escapeHtml(actionTitle)}</strong>
        <span${bindAttr('node-action')}>${escapeHtml(guidance.nodeAction || '打开当前现场继续处理。')}</span>
        ${renderOptionalDetail(guidance.actionDetail, 'action-detail')}
      </div>
      ${renderChecklistGuidanceBlocks(guidance, {
        className: 'decision-focus-callout',
        acceptanceLabel,
        checkpointLabel,
        bindingPrefix,
      })}
    </div>
  `;
}

function renderChecklistRelationCallout(record = {}, options = {}) {
  const source = record || {};
  const className = compact(options.className) || 'decision-focus-callout';
  const title = compact(options.title) || '与当前闭环关系';
  const focusLabel = compact(source.focusLabel || source.checklist_focus_label || source.checklistFocusLabel);
  const focusStepLabel = compact(source.focusStepLabel || source.checklist_step_label || source.checklistStepLabel);
  const note = compact(source.focusNote || source.checklist_focus_note || source.checklistFocusNote);
  const progressLabel = compact(source.progressLabel || source.checklist_progress_label || source.checklistProgressLabel);
  const progressSummary = compact(source.checklistProgressSummary || source.checklist_progress_summary);
  const progressDetail = progressSummary || (progressLabel ? `执行清单：${progressLabel}` : '');
  if (!focusLabel && !focusStepLabel && !note && !progressDetail) {
    return '';
  }

  return `
    <div class="${escapeHtml(className)}">
      <strong>${escapeHtml([title, focusLabel, focusStepLabel].filter(Boolean).join(' · ') || title)}</strong>
      ${note ? `<span>${escapeHtml(note)}</span>` : ''}
      ${progressDetail ? `<span class="checklist-context-progress">${escapeHtml(progressDetail)}</span>` : ''}
    </div>
  `;
}

function readChecklistAcceptance(record = {}) {
  const source = record || {};
  return compact(source.checklist_acceptance || source.checklistAcceptance || source.acceptance);
}

function readChecklistCheckpointRule(record = {}) {
  const source = record || {};
  return compact(source.checklist_checkpoint_rule || source.checklistCheckpointRule || source.checkpoint_rule || source.checkpointRule);
}

function normalizeGuidanceActionLinks(actionLinks = []) {
  return (Array.isArray(actionLinks) ? actionLinks : [])
    .map((item) => ({
      label: compact(item?.label),
      href: compact(item?.href),
    }))
    .filter((item) => item.label && item.href);
}

function buildPanelGuidanceModel(base = {}, options = {}) {
  const source = base && typeof base === 'object' ? base : {};
  const record = options.record && typeof options.record === 'object' ? options.record : null;
  const hasActionLinksOverride = Object.prototype.hasOwnProperty.call(options, 'actionLinks');
  const hasProofUpdatedAtOverride = Object.prototype.hasOwnProperty.call(options, 'proofUpdatedAt');
  const progressEntries = Array.isArray(options.progressEntries)
    ? options.progressEntries.map((item) => compact(item)).filter(Boolean)
    : [];
  const progressLabel =
    compact(options.progressLabel) ||
    (progressEntries.length > 0 ? progressEntries.join(' · ') : '') ||
    compact(source.progressLabel || source.progress_label);

  return {
    nodeLabel: compact(options.nodeLabel || source.nodeLabel || source.node_label),
    nodeSummary: compact(options.nodeSummary || source.nodeSummary || source.node_summary),
    nodeAction: compact(options.nodeAction || source.nodeAction || source.node_action || source.nodeDecision),
    nodeEvidence: compact(options.nodeEvidence || source.nodeEvidence || source.node_evidence),
    progressLabel,
    judgmentDetail: compact(options.judgmentDetail || source.judgmentDetail || source.judgment_detail),
    actionDetail: compact(
      options.actionDetail || source.actionDetail || source.action_detail || source.decisionDetail,
    ),
    proofLabel: compact(options.proofLabel || source.proofLabel || source.proof_label),
    proofHref: compact(options.proofHref || source.proofHref || source.proof_href),
    proofUpdatedAt: hasProofUpdatedAtOverride
      ? options.proofUpdatedAt
      : source.proofUpdatedAt || source.proof_updated_at || null,
    proofContextLabel: compact(
      options.proofContextLabel || source.proofContextLabel || source.proof_context_label,
    ),
    proofSourceHref: compact(options.proofSourceHref || source.proofSourceHref || source.proof_source_href),
    proofSourceLabel: compact(
      options.proofSourceLabel || source.proofSourceLabel || source.proof_source_label,
    ),
    actionLinks: normalizeGuidanceActionLinks(
      hasActionLinksOverride ? options.actionLinks : source.actionLinks || source.action_links,
    ),
    checklistAcceptance: compact(
      options.checklistAcceptance ||
        source.checklistAcceptance ||
        source.checklist_acceptance ||
        (record ? readChecklistAcceptance(record) : ''),
    ),
    checklistCheckpointRule: compact(
      options.checklistCheckpointRule ||
        source.checklistCheckpointRule ||
        source.checklist_checkpoint_rule ||
        (record ? readChecklistCheckpointRule(record) : ''),
    ),
  };
}

function pickPrimaryDecisionId(record = {}) {
  const source = record || {};
  return [
    source.decision_id,
    source.decisionId,
    ...(Array.isArray(source.decision_ids) ? source.decision_ids : []),
    ...(Array.isArray(source.decisionIds) ? source.decisionIds : []),
  ]
    .map((value) => compact(value))
    .find(Boolean) || null;
}

function pickPrimaryCommandId(record = {}) {
  const source = record || {};
  return [
    source.command_id,
    source.commandId,
    ...(Array.isArray(source.command_ids) ? source.command_ids : []),
    ...(Array.isArray(source.commandIds) ? source.commandIds : []),
  ]
    .map((value) => compact(value))
    .find(Boolean) || null;
}

function renderChecklistGuidanceBlocks(record = {}, options = {}) {
  const acceptance = readChecklistAcceptance(record);
  const checkpointRule = readChecklistCheckpointRule(record);
  const className = compact(options.className) || 'decision-focus-callout';
  const acceptanceLabel = compact(options.acceptanceLabel) || '验收条件';
  const checkpointLabel = compact(options.checkpointLabel) || 'Checkpoint 规则';
  const bindingPrefix = compact(options.bindingPrefix).replace(/[^a-z0-9_-]/gi, '');
  const renderBlock = (label, value, key) => {
    const normalized = compact(value);
    if (!bindingPrefix && !normalized) {
      return '';
    }

    return `
      <div class="${escapeHtml(className)}"${bindingPrefix ? ` data-${bindingPrefix}-${key}-block${normalized ? '' : ' hidden'}` : ''}>
        <strong>${escapeHtml(label)}</strong>
        <span${bindingPrefix ? ` data-${bindingPrefix}-${key}` : ''}>${escapeHtml(normalized)}</span>
      </div>
    `;
  };

  return [
    renderBlock(acceptanceLabel, acceptance, 'acceptance'),
    renderBlock(checkpointLabel, checkpointRule, 'checkpoint'),
  ]
    .filter(Boolean)
    .join('');
}

function renderHomeCardCallout(title = '', body = '', options = {}) {
  const normalizedTitle = compact(title);
  const normalizedBody = compact(body);
  const detail = compact(options.detail);
  const extraHtml = typeof options.extraHtml === 'string' ? options.extraHtml : '';
  if (!normalizedTitle && !normalizedBody && !detail && !extraHtml) {
    return '';
  }

  const className = compact(options.className) || 'decision-focus-callout';
  return `
    <div class="${escapeHtml(className)}"${renderHtmlAttributeString(options.attributes || {})}>
      ${normalizedTitle ? `<strong>${escapeHtml(normalizedTitle)}</strong>` : ''}
      ${normalizedBody ? `<span>${escapeHtml(normalizedBody)}</span>` : ''}
      ${detail ? `<span class="checklist-context-progress">${escapeHtml(detail)}</span>` : ''}
      ${extraHtml}
    </div>
  `;
}

function renderMetaGrid(items = [], options = {}) {
  const rows = items.filter((item) => compact(item?.value));
  if (rows.length === 0) {
    return '';
  }

  return `
    <dl class="meta-grid"${renderHtmlAttributeString({
      ...(options.context ? { 'data-meta-grid-context': options.context } : {}),
      ...((options && options.attributes) || {}),
    })}>
      ${rows
        .map(
          (item) => `
            <div class="meta-grid-row"${renderHtmlAttributeString({
              ...(item?.key ? { 'data-meta-grid-row': item.key } : {}),
              ...((item && item.attributes) || {}),
            })}>
              <dt>${escapeHtml(item.label)}</dt>
              <dd>${escapeHtml(item.value)}</dd>
            </div>
          `,
        )
        .join('')}
    </dl>
  `;
}

function renderWorkflowNextSection(title = '', body = '', options = {}) {
  const normalizedTitle = compact(title);
  const normalizedBody = compact(body);
  const extraHtml = typeof options.extraHtml === 'string' ? options.extraHtml : '';
  if (!normalizedTitle && !normalizedBody && !extraHtml) {
    return '';
  }

  return `
    <div class="${escapeHtml(options.className || 'workflow-next')}"${renderHtmlAttributeString({
      ...(options.context ? { 'data-workflow-next-context': options.context } : {}),
      ...(options.block ? { 'data-workflow-next-block': options.block } : {}),
      ...(options.attributes || {}),
    })}>
      ${normalizedTitle ? `<strong>${escapeHtml(normalizedTitle)}</strong>` : ''}
      ${normalizedBody ? `<span class="${escapeHtml(options.bodyClassName || 'muted')}">${escapeHtml(normalizedBody)}</span>` : ''}
      ${extraHtml}
    </div>
  `;
}

function renderHomeCardBodyBlocks({ context = '', record = {}, middleHtml = '', middleAttributes = {}, attributes = {} } = {}) {
  const relationHtml = renderChecklistRelationCallout(record);
  const guidanceHtml = renderChecklistGuidanceBlocks(record);
  const normalizedMiddleHtml = typeof middleHtml === 'string' ? middleHtml : '';
  const middleBlockHtml = normalizedMiddleHtml
    ? `
      <div class="home-card-body-middle"${renderHtmlAttributeString({
        'data-home-card-body-middle-context': context || 'home-card',
        ...(middleAttributes || {}),
      })}>
        ${normalizedMiddleHtml}
      </div>
    `
    : '';

  if (!relationHtml && !guidanceHtml && !middleBlockHtml) {
    return '';
  }

  return `
    <div class="home-card-body-blocks"${renderHtmlAttributeString({
      'data-home-card-body-context': context || 'home-card',
      ...(attributes || {}),
    })}>
      ${relationHtml}
      ${guidanceHtml}
      ${middleBlockHtml}
    </div>
  `;
}

function renderWorkspaceCardBodyBlocks({
  context = '',
  record = {},
  relationOptions = {},
  guidanceOptions = {},
  middleHtml = '',
  middleAttributes = {},
  attributes = {},
} = {}) {
  const relationHtml = renderChecklistRelationCallout(record, relationOptions);
  const guidanceHtml = renderChecklistGuidanceBlocks(record, guidanceOptions);
  const normalizedMiddleHtml = typeof middleHtml === 'string' ? middleHtml : '';
  const middleBlockHtml = normalizedMiddleHtml
    ? `
      <div class="workspace-card-body-middle"${renderHtmlAttributeString({
        'data-workspace-card-body-middle-context': context || 'workspace-card',
        ...(middleAttributes || {}),
      })}>
        ${normalizedMiddleHtml}
      </div>
    `
    : '';

  if (!relationHtml && !guidanceHtml && !middleBlockHtml) {
    return '';
  }

  return `
    <div class="workspace-card-body-blocks"${renderHtmlAttributeString({
      'data-workspace-card-body-context': context || 'workspace-card',
      ...(attributes || {}),
    })}>
      ${relationHtml}
      ${guidanceHtml}
      ${middleBlockHtml}
    </div>
  `;
}

function renderGuidanceProofRow(record = {}, options = {}) {
  const bindingPrefix = compact(options.bindingPrefix).replace(/[^a-z0-9_-]/gi, '');
  const bindAttr = (suffix) => (bindingPrefix ? ` data-${bindingPrefix}-${suffix}` : '');
  const source = record || {};
  const proofLabel = compact(source.proofLabel || source.proof_label);
  const proofHref = compact(source.proofHref || source.proof_href);
  const proofUpdatedAt = compact(source.proofUpdatedAt || source.proof_updated_at);
  const proofContextLabel = compact(source.proofContextLabel || source.proof_context_label);
  const proofSourceHref = compact(source.proofSourceHref || source.proof_source_href);
  const hasContent = Boolean(proofLabel || proofHref || proofUpdatedAt || proofContextLabel || proofSourceHref);
  if (!bindingPrefix && !hasContent) {
    return '';
  }

  const className = compact(options.className) || 'hero-checklist-proof';
  const proofSourceLabel = compact(source.proofSourceLabel || source.proof_source_label) || '打开源位置';
  const proofLabelText = compact(options.label) || '最近证据';
  const proofContextText = compact(options.contextLabel) || '证据现场';
  const proofLinkLabel = compact(options.proofLinkLabel) || '打开证据现场';

  return `
    <div class="${escapeHtml(className)}"${bindAttr('row')}${hasContent ? '' : ' hidden'}>
      <span${bindAttr('label')}${proofLabel ? '' : ' hidden'}>${escapeHtml(
        proofLabel ? `${proofLabelText}：${proofLabel}` : '',
      )}</span>
      <span${bindAttr('updated-at')}${proofUpdatedAt ? '' : ' hidden'}>${escapeHtml(
        proofUpdatedAt ? `更新于 ${formatIso(proofUpdatedAt)}` : '',
      )}</span>
      <span${bindAttr('context')}${proofContextLabel ? '' : ' hidden'}>${escapeHtml(
        proofContextLabel ? `${proofContextText}：${proofContextLabel}` : '',
      )}</span>
      <a class="checklist-link" href="${escapeHtml(proofHref || '#')}"${bindAttr('link')}${proofHref ? '' : ' hidden'}>${escapeHtml(
        proofLinkLabel,
      )}</a>
      ${
        proofSourceHref
          ? `<a class="checklist-link" href="${escapeHtml(proofSourceHref)}" target="_blank" rel="noreferrer"${bindAttr(
              'source-link',
            )}>${escapeHtml(proofSourceLabel)}</a>`
          : bindingPrefix
            ? `<a class="checklist-link" href="#" target="_blank" rel="noreferrer"${bindAttr('source-link')} hidden>${escapeHtml(
                proofSourceLabel,
              )}</a>`
          : ''
      }
    </div>
  `;
}

function renderGuidanceActionLinks(record = {}, options = {}) {
  const bindingPrefix = compact(options.bindingPrefix).replace(/[^a-z0-9_-]/gi, '');
  const source = record || {};
  const actionLinks = Array.isArray(source.actionLinks || source.action_links)
    ? (source.actionLinks || source.action_links).filter((item) => compact(item?.label) && compact(item?.href))
    : [];
  if (!bindingPrefix && actionLinks.length === 0) {
    return '';
  }

  const className = compact(options.className) || 'hero-checklist-actions';
  return `
    <div class="${escapeHtml(className)}"${bindingPrefix ? ` data-${bindingPrefix}-links` : ''}${actionLinks.length > 0 ? '' : ' hidden'}>
      ${actionLinks
        .map((item) => `<a class="checklist-link" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
        .join('')}
    </div>
  `;
}

function buildAttentionViewGuidance(attentionView = {}, executionChecklist = null) {
  const waitingTasks = Array.isArray(attentionView.waiting_human) ? attentionView.waiting_human : [];
  const inProgressTasks = Array.isArray(attentionView.in_progress) ? attentionView.in_progress : [];
  const completedTasks = Array.isArray(attentionView.completed) ? attentionView.completed : [];
  const focusTask = waitingTasks[0] || inProgressTasks[0] || completedTasks[0] || null;
  if (!focusTask) {
    return null;
  }

  const bucket = compact(focusTask.attention_bucket || focusTask.attentionBucket).toLowerCase();
  const checklistFocusLabel = compact(focusTask.checklist_focus_label || focusTask.checklistFocusLabel);
  const checklistStepLabel = compact(focusTask.checklist_step_label || focusTask.checklistStepLabel);
  const checklistProgressLabel = compact(focusTask.checklist_progress_label || focusTask.checklistProgressLabel);
  const currentNode = compact(focusTask.current_node || focusTask.currentNode);
  const taskTitle = summarize(compact(focusTask.title), 36);
  const threadLabel = compact(focusTask.thread_label || focusTask.threadLabel || focusTask.thread_key || focusTask.threadKey);
  const threadHref = compact(focusTask.thread_href || focusTask.threadHref);
  const sourceHref = compact(focusTask.primary_link || focusTask.primaryLink);
  const blockerReason = compact(focusTask.blocker_reason || focusTask.blockerReason);
  const recommendedAction = compact(
    focusTask.recommended_action || focusTask.recommendedAction || focusTask.next_step || focusTask.nextStep,
  );
  const executionProof = compact(focusTask.execution_proof || focusTask.executionProof);
  const latestReceiptLabel = compact(focusTask.latest_receipt_label || focusTask.latestReceiptLabel);
  const latestCheckpointSummary = compact(
    focusTask.latest_checkpoint_summary || focusTask.latestCheckpointSummary,
  );
  const latestUpdatedAt = focusTask.latest_updated_at || focusTask.latestUpdatedAt || null;

  let nodeLabel = checklistFocusLabel || '当前注意力焦点';
  let nodeSummary = blockerReason || compact(focusTask.summary || focusTask.status_note || focusTask.statusNote) || '当前没有额外判断。';
  let nodeAction = recommendedAction || '进入当前执行现场继续推进。';
  let actionLinkLabel = '进入执行现场';
  let bucketSummary = `${waitingTasks.length} 条待拍板 · ${inProgressTasks.length} 条系统处理中 · ${completedTasks.length} 条已完成`;

  if (bucket === 'waiting_human') {
    nodeLabel = checklistFocusLabel || '待拍板任务';
    nodeSummary =
      blockerReason ||
      compact(focusTask.summary || focusTask.status_note || focusTask.statusNote) ||
      `${taskTitle || '当前焦点任务'} 仍在等待你拍板，这是当前最优先需要介入的一条。`;
    nodeAction = recommendedAction || '先拍板或明确绕行动作，再确认线程继续往下跑。';
    actionLinkLabel = '进入拍板现场';
    bucketSummary = `待拍板 ${waitingTasks.length} 条，先处理最上面的 ${taskTitle || '焦点任务'}。`;
  } else if (bucket === 'completed') {
    nodeLabel = checklistFocusLabel || '已完成任务';
    nodeSummary =
      compact(focusTask.summary || focusTask.status_note || focusTask.statusNote) ||
      `${taskTitle || '当前焦点任务'} 已进入已完成层，接下来重点确认回执、Checkpoint 和沉淀动作是否完整。`;
    nodeAction = recommendedAction || '回看已完成现场，确认回执、Checkpoint 和后续沉淀动作都已收口。';
    actionLinkLabel = '回看已完成现场';
    bucketSummary = `已完成 ${completedTasks.length} 条，当前优先回看 ${taskTitle || '焦点任务'} 的收尾质量。`;
  } else {
    nodeLabel = checklistFocusLabel || '执行中任务';
    nodeSummary =
      compact(focusTask.summary || focusTask.status_note || focusTask.statusNote) ||
      `${taskTitle || '当前焦点任务'} 仍在系统推进链里，接下来重点确认最新 command / Run / Checkpoint 还在继续刷新。`;
    nodeAction = recommendedAction || '进入执行现场，确认最新 command、Run 或 Checkpoint 还在继续往前跑。';
    actionLinkLabel = '进入执行现场';
    bucketSummary = `系统处理中 ${inProgressTasks.length} 条，当前优先盯住 ${taskTitle || '焦点任务'}。`;
  }

  const actionLinks = [];
  if (threadHref) {
    actionLinks.push({
      label: actionLinkLabel,
      href: threadHref,
    });
  }

  return buildPanelGuidanceModel(
    {
      nodeLabel,
      nodeSummary,
      nodeAction,
      nodeEvidence: [
        currentNode ? `当前节点：${currentNode}` : '',
        focusTask.thread_source_label || focusTask.threadSourceLabel
          ? `线程来源：${focusTask.thread_source_label || focusTask.threadSourceLabel}`
          : '',
        latestUpdatedAt ? `最近更新：${formatIso(latestUpdatedAt)}` : '',
      ]
        .filter(Boolean)
        .join('；'),
      judgmentDetail: bucketSummary,
      actionDetail: threadLabel ? `焦点线程：${threadLabel}` : taskTitle ? `焦点任务：${taskTitle}` : '',
      proofLabel: summarize(
        executionProof ||
          (latestReceiptLabel ? `最近回执：${latestReceiptLabel}` : '') ||
          latestCheckpointSummary ||
          compact(focusTask.summary || focusTask.status_note || focusTask.statusNote) ||
          '',
        72,
      ),
      proofHref: threadHref,
      proofUpdatedAt: latestUpdatedAt,
      proofContextLabel: threadLabel || taskTitle,
      proofSourceHref: sourceHref,
      proofSourceLabel: '打开源位置',
      actionLinks,
    },
    {
      progressLabel: [checklistStepLabel, checklistProgressLabel ? `执行清单：${checklistProgressLabel}` : '']
        .filter(Boolean)
        .join(' · '),
      checklistAcceptance: readChecklistAcceptance(focusTask) || compact(executionChecklist?.nextAcceptance),
      checklistCheckpointRule:
        readChecklistCheckpointRule(focusTask) || compact(executionChecklist?.checkpointRule),
    },
  );
}

function buildHomeCommentCenterGuidance(commentWorkflow = {}) {
  const focusItem = pickHomeCommentWorkflowFocusItem(commentWorkflow);
  if (!focusItem) {
    return null;
  }

  const actionMode = compact(focusItem.actionMode).toLowerCase();
  const nodeLabel =
    compact(focusItem.currentNode) ||
    (actionMode === 'triage'
      ? '评论分流'
      : actionMode === 'ready'
      ? '执行回流'
      : compact(focusItem.badge) || '最近评论');
  const nodeEvidence = [
    compact(focusItem.proofValue),
    compact(focusItem.latestCollaborationSummary),
    compact(focusItem.latestCollaborationDetail),
  ]
    .filter(Boolean)
    .join('；');
  const judgmentDetail = compact(focusItem.summary && focusItem.summary !== focusItem.blockerReason ? focusItem.summary : '');
  const actionDetail = compact(focusItem.focusNote && focusItem.focusNote !== focusItem.actionValue ? focusItem.focusNote : '');

  return buildPanelGuidanceModel(
    {
      nodeLabel,
      nodeSummary: compact(focusItem.blockerReason || focusItem.summary || '当前没有额外说明。'),
      nodeAction: compact(focusItem.actionValue || '打开线程继续查看。'),
      nodeEvidence,
      judgmentDetail,
      actionDetail,
    },
    {
      record: focusItem,
      progressEntries: buildChecklistMetaEntries(focusItem),
    },
  );
}

function pickHomeCommentWorkflowFocusItem(commentWorkflow = {}) {
  const normalizedCommentWorkflow = normalizeCommentWorkflowPayload(commentWorkflow);
  const triageItems = Array.isArray(normalizedCommentWorkflow.triageItems)
    ? normalizedCommentWorkflow.triageItems
    : [];
  const readyItems = Array.isArray(normalizedCommentWorkflow.readyItems)
    ? normalizedCommentWorkflow.readyItems
    : [];
  const recentCommentCards = Array.isArray(normalizedCommentWorkflow.recentCommentCards)
    ? normalizedCommentWorkflow.recentCommentCards
    : [];
  const checklistAlignedFocus =
    pickTopChecklistFocus([...triageItems, ...readyItems, ...recentCommentCards]) || null;
  if (checklistAlignedFocus) {
    return normalizeCommentWorkflowItem(checklistAlignedFocus);
  }

  return (
    triageItems[0] ||
    readyItems[0] ||
    recentCommentCards[0] ||
    null
  );
}

export function normalizeCommentWorkflowAuditItem(item = {}) {
  const source = item && typeof item === 'object' ? item : {};
  return {
    ...source,
    kindLabel: source.kindLabel || source.kind_label || '',
    kind_label: source.kindLabel || source.kind_label || '',
    timeLabel: source.timeLabel || source.time_label || '',
    time_label: source.timeLabel || source.time_label || '',
  };
}

export function normalizeCommentWorkflowItem(item = {}) {
  const source = item && typeof item === 'object' ? item : {};
  const collaborationAuditItems = Array.isArray(source.collaborationAuditItems)
    ? source.collaborationAuditItems
    : Array.isArray(source.collaboration_audit_items)
      ? source.collaboration_audit_items
      : [];
  return {
    ...source,
    blockerReason: source.blockerReason || source.blocker_reason || '',
    blocker_reason: source.blockerReason || source.blocker_reason || '',
    actionLabel: source.actionLabel || source.action_label || '',
    action_label: source.actionLabel || source.action_label || '',
    actionValue: source.actionValue || source.action_value || '',
    action_value: source.actionValue || source.action_value || '',
    proofLabel: source.proofLabel || source.proof_label || '',
    proof_label: source.proofLabel || source.proof_label || '',
    proofValue: source.proofValue || source.proof_value || '',
    proof_value: source.proofValue || source.proof_value || '',
    currentNode: source.currentNode || source.current_node || '',
    current_node: source.currentNode || source.current_node || '',
    threadKey: source.threadKey || source.thread_key || '',
    thread_key: source.threadKey || source.thread_key || '',
    commandId: source.commandId || source.command_id || '',
    command_id: source.commandId || source.command_id || '',
    ownerAgent: source.ownerAgent || source.owner_agent || '',
    owner_agent: source.ownerAgent || source.owner_agent || '',
    replyCapable: source.replyCapable ?? source.reply_capable ?? false,
    reply_capable: source.replyCapable ?? source.reply_capable ?? false,
    actionMode: source.actionMode || source.action_mode || '',
    action_mode: source.actionMode || source.action_mode || '',
    sourceHref: source.sourceHref || source.source_href || '',
    source_href: source.sourceHref || source.source_href || '',
    hrefLabel: source.hrefLabel || source.href_label || '',
    href_label: source.hrefLabel || source.href_label || '',
    focusLabel: source.focusLabel || source.focus_label || '',
    focus_label: source.focusLabel || source.focus_label || '',
    focusNote: source.focusNote || source.focus_note || '',
    focus_note: source.focusNote || source.focus_note || '',
    focusStepLabel: source.focusStepLabel || source.focus_step_label || '',
    focus_step_label: source.focusStepLabel || source.focus_step_label || '',
    focusStepTitle: source.focusStepTitle || source.focus_step_title || '',
    focus_step_title: source.focusStepTitle || source.focus_step_title || '',
    progressLabel: source.progressLabel || source.progress_label || '',
    progress_label: source.progressLabel || source.progress_label || '',
    progressNote: source.progressNote || source.progress_note || '',
    progress_note: source.progressNote || source.progress_note || '',
    checklistProgressSummary:
      source.checklistProgressSummary || source.checklist_progress_summary || '',
    checklist_progress_summary:
      source.checklistProgressSummary || source.checklist_progress_summary || '',
    latestCollaborationTitle:
      source.latestCollaborationTitle || source.latest_collaboration_title || '',
    latest_collaboration_title:
      source.latestCollaborationTitle || source.latest_collaboration_title || '',
    latestCollaborationSummary:
      source.latestCollaborationSummary || source.latest_collaboration_summary || '',
    latest_collaboration_summary:
      source.latestCollaborationSummary || source.latest_collaboration_summary || '',
    latestCollaborationDetail:
      source.latestCollaborationDetail || source.latest_collaboration_detail || '',
    latest_collaboration_detail:
      source.latestCollaborationDetail || source.latest_collaboration_detail || '',
    auditLabel: source.auditLabel || source.audit_label || '',
    audit_label: source.auditLabel || source.audit_label || '',
    collaborationAuditItems: collaborationAuditItems.map((entry) => normalizeCommentWorkflowAuditItem(entry)),
    collaboration_audit_items: collaborationAuditItems.map((entry) => normalizeCommentWorkflowAuditItem(entry)),
  };
}

function normalizeCommentWorkflowPayload(commentWorkflow = {}) {
  const source = commentWorkflow && typeof commentWorkflow === 'object' ? commentWorkflow : {};
  const countsSource = source.counts && typeof source.counts === 'object' ? source.counts : {};
  const triageItems = Array.isArray(source.triageItems)
    ? source.triageItems
    : Array.isArray(source.triage_items)
      ? source.triage_items
      : [];
  const readyItems = Array.isArray(source.readyItems)
    ? source.readyItems
    : Array.isArray(source.ready_items)
      ? source.ready_items
      : [];
  const recentCommentCards = Array.isArray(source.recentCommentCards)
    ? source.recentCommentCards
    : Array.isArray(source.recent_comment_cards)
      ? source.recent_comment_cards
      : [];
  const focusGuidance = source.focusGuidance || source.focus_guidance || null;
  const counts = {
    ...countsSource,
    triageThreads: Number(countsSource.triageThreads ?? countsSource.triage_threads ?? 0),
    triageComments: Number(countsSource.triageComments ?? countsSource.triage_comments ?? 0),
    readyThreads: Number(countsSource.readyThreads ?? countsSource.ready_threads ?? 0),
    readyComments: Number(countsSource.readyComments ?? countsSource.ready_comments ?? 0),
    recentComments: Number(countsSource.recentComments ?? countsSource.recent_comments ?? 0),
    recentThreads: Number(countsSource.recentThreads ?? countsSource.recent_threads ?? 0),
  };

  return {
    ...source,
    counts: {
      ...counts,
      triage_threads: counts.triageThreads,
      triage_comments: counts.triageComments,
      ready_threads: counts.readyThreads,
      ready_comments: counts.readyComments,
      recent_comments: counts.recentComments,
      recent_threads: counts.recentThreads,
    },
    triageItems: triageItems.map((item) => normalizeCommentWorkflowItem(item)),
    triage_items: triageItems.map((item) => normalizeCommentWorkflowItem(item)),
    readyItems: readyItems.map((item) => normalizeCommentWorkflowItem(item)),
    ready_items: readyItems.map((item) => normalizeCommentWorkflowItem(item)),
    recentCommentCards: recentCommentCards.map((item) => normalizeCommentWorkflowItem(item)),
    recent_comment_cards: recentCommentCards.map((item) => normalizeCommentWorkflowItem(item)),
    focusGuidance,
    focus_guidance: focusGuidance,
  };
}

function normalizeHomeMemoryGovernanceCard(card = {}) {
  const source = card && typeof card === 'object' ? card : {};
  const memoryId = compact(source.memoryId || source.memory_id || resolveHomeMemoryGovernanceId(source));
  const suggestionId = compact(
    source.suggestionId ||
      source.suggestion_id ||
      resolveHomeSuggestionGovernanceId(source),
  );
  const memoryStatus = compact(source.memoryStatus || source.memory_status);
  const memoryStatusLabel = compact(source.memoryStatusLabel || source.memory_status_label);
  const reviewState = compact(source.reviewState || source.review_state);
  const reviewStateLabel = compact(source.reviewStateLabel || source.review_state_label);
  const nextStep = compact(source.nextStep || source.next_step);
  const freshness = compact(source.freshness);
  const ownerAgent = compact(source.ownerAgent || source.owner_agent);
  const sourceCount = Number(source.sourceCount ?? source.source_count ?? 0);
  const reviewerRecommendation =
    source.reviewerRecommendation || source.reviewer_recommendation || null;
  const reviewerRecommendationSummary = compact(
    source.reviewerRecommendationSummary || source.reviewer_recommendation_summary,
  );
  const reviewerRationale = compact(source.reviewerRationale || source.reviewer_rationale);
  const reviewerPrompt = compact(source.reviewerPrompt || source.reviewer_prompt);
  const evidenceSummary = compact(source.evidenceSummary || source.evidence_summary);
  const evidenceUpdatedAt = source.evidenceUpdatedAt || source.evidence_updated_at || null;
  const sourceAnchorLabel = compact(source.sourceAnchorLabel || source.source_anchor_label);
  const sourceAnchorDetail = compact(source.sourceAnchorDetail || source.source_anchor_detail);
  const sourceAnchorHref = compact(source.sourceAnchorHref || source.source_anchor_href);
  const sourceAnchorHrefLabel = compact(
    source.sourceAnchorHrefLabel || source.source_anchor_href_label,
  );
  const freshnessLabel = compact(source.freshnessLabel || source.freshness_label);
  const freshnessDetail = compact(source.freshnessDetail || source.freshness_detail);
  const evidenceDeltaLabel = compact(
    source.evidenceDeltaLabel || source.evidence_delta_label,
  );
  const evidenceDeltaDetail = compact(
    source.evidenceDeltaDetail || source.evidence_delta_detail,
  );
  const revalidationLabel = compact(source.revalidationLabel || source.revalidation_label);
  const revalidationDetail = compact(
    source.revalidationDetail || source.revalidation_detail,
  );
  const humanReviewSummary = compact(
    source.humanReviewSummary || source.human_review_summary,
  );
  const showGovernanceActions =
    source.showGovernanceActions ?? source.show_governance_actions ?? false;
  const homeGovernanceHint = compact(
    source.homeGovernanceHint || source.home_governance_hint,
  );
  const focusLabel = compact(source.focusLabel || source.focus_label);
  const focusNote = compact(source.focusNote || source.focus_note);
  const focusStepLabel = compact(source.focusStepLabel || source.focus_step_label);
  const focusStepTitle = compact(source.focusStepTitle || source.focus_step_title);
  const progressLabel = compact(source.progressLabel || source.progress_label);
  const progressNote = compact(source.progressNote || source.progress_note);
  const checklistProgressSummary = compact(
    source.checklistProgressSummary || source.checklist_progress_summary,
  );

  return {
    ...source,
    memoryId,
    memory_id: memoryId,
    suggestionId,
    suggestion_id: suggestionId,
    memoryStatus,
    memory_status: memoryStatus,
    memoryStatusLabel,
    memory_status_label: memoryStatusLabel,
    reviewState,
    review_state: reviewState,
    reviewStateLabel,
    review_state_label: reviewStateLabel,
    nextStep,
    next_step: nextStep,
    freshness,
    ownerAgent,
    owner_agent: ownerAgent,
    sourceCount,
    source_count: sourceCount,
    reviewerRecommendation,
    reviewer_recommendation: reviewerRecommendation,
    reviewerRecommendationSummary,
    reviewer_recommendation_summary: reviewerRecommendationSummary,
    reviewerRationale,
    reviewer_rationale: reviewerRationale,
    reviewerPrompt,
    reviewer_prompt: reviewerPrompt,
    evidenceSummary,
    evidence_summary: evidenceSummary,
    evidenceUpdatedAt,
    evidence_updated_at: evidenceUpdatedAt,
    sourceAnchorLabel,
    source_anchor_label: sourceAnchorLabel,
    sourceAnchorDetail,
    source_anchor_detail: sourceAnchorDetail,
    sourceAnchorHref,
    source_anchor_href: sourceAnchorHref,
    sourceAnchorHrefLabel,
    source_anchor_href_label: sourceAnchorHrefLabel,
    freshnessLabel,
    freshness_label: freshnessLabel,
    freshnessDetail,
    freshness_detail: freshnessDetail,
    evidenceDeltaLabel,
    evidence_delta_label: evidenceDeltaLabel,
    evidenceDeltaDetail,
    evidence_delta_detail: evidenceDeltaDetail,
    revalidationLabel,
    revalidation_label: revalidationLabel,
    revalidationDetail,
    revalidation_detail: revalidationDetail,
    humanReviewSummary,
    human_review_summary: humanReviewSummary,
    showGovernanceActions,
    show_governance_actions: showGovernanceActions,
    homeGovernanceHint,
    home_governance_hint: homeGovernanceHint,
    focusLabel,
    focus_label: focusLabel,
    focusNote,
    focus_note: focusNote,
    focusStepLabel,
    focus_step_label: focusStepLabel,
    focusStepTitle,
    focus_step_title: focusStepTitle,
    progressLabel,
    progress_label: progressLabel,
    progressNote,
    progress_note: progressNote,
    checklistProgressSummary,
    checklist_progress_summary: checklistProgressSummary,
  };
}

function isHomeMemoryGovernanceCard(card = {}) {
  const normalizedCard = normalizeHomeMemoryGovernanceCard(card);
  const kind = compact(normalizedCard.type).toLowerCase();
  return Boolean(
    normalizedCard.memoryId ||
      normalizedCard.suggestionId ||
      normalizedCard.showGovernanceActions ||
      normalizedCard.reviewerRecommendationSummary ||
      normalizedCard.evidenceSummary ||
      normalizedCard.sourceAnchorLabel ||
      ['memory', 'suggestion', 'inbox'].includes(kind),
  );
}

function normalizeHomeMemoryGovernancePayload(memoryGovernance = {}) {
  const source = memoryGovernance && typeof memoryGovernance === 'object' ? memoryGovernance : {};
  const countsSource = source.counts && typeof source.counts === 'object' ? source.counts : {};
  const candidateCards = Array.isArray(source.candidateCards)
    ? source.candidateCards
    : Array.isArray(source.candidate_cards)
      ? source.candidate_cards
      : [];
  const reviewCards = Array.isArray(source.reviewCards)
    ? source.reviewCards
    : Array.isArray(source.review_cards)
      ? source.review_cards
      : [];
  const suggestionCards = Array.isArray(source.suggestionCards)
    ? source.suggestionCards
    : Array.isArray(source.suggestion_cards)
      ? source.suggestion_cards
      : [];
  const focusGuidanceSource = source.focusGuidance || source.focus_guidance || null;
  const focusGuidance = focusGuidanceSource ? buildPanelGuidanceModel(focusGuidanceSource) : null;
  const counts = {
    ...countsSource,
    candidates: Number(countsSource.candidates ?? countsSource.candidate_count ?? 0),
    reviews: Number(countsSource.reviews ?? countsSource.review_count ?? 0),
    suggestions: Number(countsSource.suggestions ?? countsSource.suggestion_count ?? 0),
  };

  return {
    ...source,
    memoryDocHref: compact(source.memoryDocHref || source.memory_doc_href),
    memory_doc_href: compact(source.memoryDocHref || source.memory_doc_href),
    counts: {
      ...counts,
      candidate_count: counts.candidates,
      review_count: counts.reviews,
      suggestion_count: counts.suggestions,
    },
    candidateCards: candidateCards.map((item) => normalizeHomeMemoryGovernanceCard(item)),
    candidate_cards: candidateCards.map((item) => normalizeHomeMemoryGovernanceCard(item)),
    reviewCards: reviewCards.map((item) => normalizeHomeMemoryGovernanceCard(item)),
    review_cards: reviewCards.map((item) => normalizeHomeMemoryGovernanceCard(item)),
    suggestionCards: suggestionCards.map((item) => normalizeHomeMemoryGovernanceCard(item)),
    suggestion_cards: suggestionCards.map((item) => normalizeHomeMemoryGovernanceCard(item)),
    focusGuidance,
    focus_guidance: focusGuidance,
  };
}

function pickHomeMemoryGovernanceFocusCard(memoryGovernance = {}) {
  const normalizedMemoryGovernance = normalizeHomeMemoryGovernancePayload(memoryGovernance);
  const candidateCards = Array.isArray(normalizedMemoryGovernance.candidateCards)
    ? normalizedMemoryGovernance.candidateCards
    : [];
  const reviewCards = Array.isArray(normalizedMemoryGovernance.reviewCards)
    ? normalizedMemoryGovernance.reviewCards
    : [];
  const suggestionCards = Array.isArray(normalizedMemoryGovernance.suggestionCards)
    ? normalizedMemoryGovernance.suggestionCards
    : [];
  const checklistAlignedFocus =
    pickTopChecklistFocus([...candidateCards, ...reviewCards, ...suggestionCards]) || null;
  if (checklistAlignedFocus) {
    return normalizeHomeMemoryGovernanceCard(checklistAlignedFocus);
  }

  return (
    reviewCards[0] ||
    candidateCards[0] ||
    suggestionCards[0] ||
    null
  );
}

function buildHomeMemoryCenterGuidance(memoryGovernance = {}) {
  const focusItem = pickHomeMemoryGovernanceFocusCard(memoryGovernance);
  if (!focusItem) {
    return null;
  }

  const guidance = buildHomeMemoryGovernanceGuidance(focusItem);
  if (!guidance) {
    return null;
  }

  return buildPanelGuidanceModel(
    {
      ...guidance,
      nodeAction: guidance.nodeDecision,
      actionDetail: compact(
        focusItem.focusNote && focusItem.focusNote !== guidance.nodeDecision ? focusItem.focusNote : guidance.decisionDetail,
      ),
    },
    {
      record: focusItem,
      progressEntries: buildChecklistMetaEntries(focusItem),
    },
  );
}

function buildHomeDecisionCenterGuidance(decisionFocus = {}) {
  const focusItem = pickHomeDecisionFocusItem(decisionFocus);
  if (!focusItem) {
    return null;
  }

  const nodeLabel =
    compact(focusItem.currentNode) ||
    compact(focusItem.badge) ||
    (compact(focusItem.type).toLowerCase() === 'memory' ? '记忆候选' : '决策拍板');
  const nodeEvidence = [
    compact(focusItem.executionProof),
    compact(focusItem.threadSourceLabel) ? `线程来源：${compact(focusItem.threadSourceLabel)}` : '',
  ]
    .filter(Boolean)
    .join('；');
  const judgmentDetail = compact(focusItem.summary && focusItem.summary !== focusItem.blockerReason ? focusItem.summary : '');
  const actionDetail = compact(focusItem.focusNote && focusItem.focusNote !== focusItem.actionValue ? focusItem.focusNote : '');

  return buildPanelGuidanceModel(
    {
      nodeLabel,
      nodeSummary:
        compact(focusItem.blockerReason || focusItem.summary || decisionFocus.focusReason) ||
        '当前没有需要额外解释的阻塞点，先按 Checklist 和线程现场继续推进。',
      nodeAction: compact(focusItem.actionValue) || '打开当前决策现场继续处理。',
      nodeEvidence,
      judgmentDetail,
      actionDetail,
    },
    {
      record: focusItem,
      progressEntries: buildChecklistMetaEntries(focusItem),
    },
  );
}

function pickHomeDecisionFocusItem(decisionFocus = {}) {
  const redItems = Array.isArray(decisionFocus.redItems) ? decisionFocus.redItems : [];
  const yellowItems = Array.isArray(decisionFocus.yellowItems) ? decisionFocus.yellowItems : [];
  const memoryCandidates = Array.isArray(decisionFocus.memoryCandidates)
    ? decisionFocus.memoryCandidates
    : [];
  const checklistAlignedFocus =
    pickTopChecklistFocus([...redItems, ...yellowItems, ...memoryCandidates]) || null;
  if (checklistAlignedFocus) {
    return checklistAlignedFocus;
  }

  return (
    redItems[0] ||
    yellowItems[0] ||
    memoryCandidates[0] ||
    null
  );
}

function buildNotionCollaborationGuidance(notionCollaboration = {}) {
  const nextActions = Array.isArray(notionCollaboration.nextActions) ? notionCollaboration.nextActions : [];
  const syncProbe = notionCollaboration.syncProbe || null;
  const publicMcpConfigured = Boolean(notionCollaboration.publicMcpConfigured);
  const projectScopeReady = Boolean(notionCollaboration.projectScopeReady);
  const customAgentReady = compact(notionCollaboration.customAgentStatus) === 'ready_for_notion_setup';

  let nodeLabel = '协作接入待补齐';
  if (syncProbe?.state === 'success') {
    nodeLabel = '最近同步落点';
  } else if (customAgentReady) {
    nodeLabel = 'Custom Agent 准备态';
  }

  const nodeSummary =
    compact(syncProbe?.summary || notionCollaboration.summary) ||
    '当前只知道配置 ready，还没有把最近一次真实同步落点显式挂到工作台上。';
  const nodeAction =
    compact(nextActions[0]) ||
    (customAgentReady
      ? '先用一条 green comment 做真实 @Cortex 联调。'
      : '先补公网 MCP 或项目 page scope，再继续 Notion 协作联调。');
  const nodeEvidence = [
    compact(syncProbe?.pageTitle),
    syncProbe?.verifiedAt ? `最近验证：${syncProbe.verifiedAt}` : '',
    notionCollaboration.targetPageUrl ? '目标页已配置' : '',
  ]
    .filter(Boolean)
    .join('；');

  return buildPanelGuidanceModel(
    {
      nodeLabel,
      nodeSummary,
      nodeAction,
      nodeEvidence,
      judgmentDetail: compact(
        notionCollaboration.liveVerificationNotes?.[0] ||
          notionCollaboration.blockers?.[0] ||
          notionCollaboration.tokenMirrorSummary,
      ),
      actionDetail: nextActions.length > 1 ? nextActions[1] : '',
    },
    {
      progressEntries: [
        `Custom Agent：${notionCollaboration.customAgentStatusLabel || '未记录'}`,
        `公网 MCP：${publicMcpConfigured ? '已配置' : '未配置'}`,
        `Page Scope：${projectScopeReady ? '已纳入' : '未纳入'}`,
      ],
      checklistAcceptance:
        '目标 Business workspace、目标页 scope 与公网 MCP 都已落住，且首页能指出最近一次真实同步落点。',
      checklistCheckpointRule:
        '先确认 OAuth workspace 与 Bearer 配置，再用一条 green comment 做真实 @Cortex 联调，并把最近同步落点挂回工作台。',
    },
  );
}

function buildRuntimeHealthViewModel(payload, options = {}) {
  const runtimeStatusUrl = compact(options.runtimeStatusUrl);
  const fallbackAction =
    '如果这里出现端口漂移、旧进程占用或 managed 进程缺失，优先执行 npm run automation:restart。';

  if (payload == null) {
    return {
      headline: '正在读取 live runtime、health probe 与端口监听状态。',
      severityLabel: '读取中',
      runningLabel: '-- / --',
      listenerLabel: '--',
      healthProbeLabel: '读取中',
      summary: '正在确认当前 workspace 页面吃到的是不是最新 Cortex server。',
      actionLabel: '待判断',
      actionText: fallbackAction,
      metaItems: ['等待 runtime status 返回…'],
      guidance: {
        nodeLabel: '正在读取 live runtime',
        nodeSummary: '还在确认当前前台吃到的是不是最新 Cortex server。',
        nodeAction: '等待 runtime status 返回后，再决定是否需要恢复动作。',
        nodeEvidence: 'live listener / managed 进程 / health probe',
        progressLabel: runtimeStatusUrl ? `状态接口：${runtimeStatusUrl}` : '状态接口待确认',
        judgmentDetail: '如果检测到端口漂移、旧进程占用或 health probe 异常，这里会立刻改写成明确判断。',
        actionDetail: '优先先看 live listener 是否对齐当前 repo 与 managed pid。',
      },
    };
  }

  if (payload.ok !== true) {
    return {
      headline: 'runtime status 暂时不可用，请稍后重试。',
      severityLabel: '不可用',
      runningLabel: '-- / --',
      listenerLabel: '未读到',
      healthProbeLabel: '未读到',
      summary: compact(payload.error) || '当前没有拿到 runtime status 返回。',
      actionLabel: '待重试',
      actionText: fallbackAction,
      metaItems: ['请稍后重试 /workspace/runtime-status。'],
      guidance: {
        nodeLabel: 'runtime status 暂不可用',
        nodeSummary: compact(payload.error) || '当前没有拿到 live runtime 的最新判断。',
        nodeAction: '先重试 runtime status；如果持续失败，再重启 automation runtime。',
        nodeEvidence: compact(payload.error),
        progressLabel: runtimeStatusUrl ? `状态接口：${runtimeStatusUrl}` : '状态接口待确认',
        judgmentDetail: '这通常说明状态接口暂时不可达，而不是业务协作面板本身出错。',
        actionDetail: '优先确认本地 server 仍在监听，再决定是否执行 automation:restart。',
      },
    };
  }

  const severityLabels = {
    healthy: '健康',
    degraded: '需关注',
    blocking: '阻塞',
  };
  const severity = payload.severity || 'degraded';
  const liveListener = payload.live_listener || payload.liveListener || {};
  const processCounts = payload.process_counts || payload.processCounts || {};
  const healthProbe = payload.health_probe || payload.healthProbe || null;
  const hasHealthProbe = healthProbe != null;
  const healthProbeOk = hasHealthProbe ? healthProbe.ok === true : null;
  const coveredProcesses = Array.isArray(payload.covered_processes || payload.coveredProcesses)
    ? payload.covered_processes || payload.coveredProcesses
    : [];
  const runningCount = Number.isFinite(processCounts.running) ? processCounts.running : null;
  const totalCount = Number.isFinite(processCounts.total) ? processCounts.total : null;
  const stoppedCount = Number.isFinite(processCounts.stopped)
    ? processCounts.stopped
    : totalCount != null && runningCount != null
    ? Math.max(totalCount - runningCount, 0)
    : null;
  const runningLabel = `${runningCount ?? '--'} / ${totalCount ?? '--'}`;
  const metaItems = [];

  if (liveListener.port) {
    metaItems.push(`端口 ${liveListener.port}`);
  }
  if (liveListener.pid) {
    metaItems.push(`listener pid ${liveListener.pid}`);
  }
  if (liveListener.matches_repo_server || liveListener.matchesRepoServer) {
    metaItems.push('listener 已确认属于当前 repo');
  } else if (liveListener.pid) {
    metaItems.push('listener 归属仍待确认');
  }
  if (liveListener.matches_managed_pid || liveListener.matchesManagedPid) {
    metaItems.push('listener 已对齐 managed pid');
  }
  if (liveListener.drift_detected || liveListener.driftDetected) {
    metaItems.push('检测到端口漂移');
  }
  if (liveListener.working_directory || liveListener.workingDirectory) {
    metaItems.push(`cwd ${liveListener.working_directory || liveListener.workingDirectory}`);
  }
  if (coveredProcesses.length) {
    metaItems.push(`health probe 兜底：${coveredProcesses.join(', ')}`);
  }
  if (liveListener.command) {
    metaItems.push(liveListener.command);
  }

  let nodeLabel = 'runtime 已对齐';
  if (liveListener.drift_detected || liveListener.driftDetected) {
    nodeLabel = 'live listener 漂移';
  } else if (stoppedCount != null && stoppedCount > 0 && runningCount === 0) {
    nodeLabel = 'managed runtime 未拉起';
  } else if (stoppedCount != null && stoppedCount > 0) {
    nodeLabel = 'managed 进程掉线';
  } else if (hasHealthProbe && healthProbeOk === false) {
    nodeLabel = 'health probe 未确认';
  } else if (liveListener.pid && !(liveListener.matches_managed_pid || liveListener.matchesManagedPid)) {
    nodeLabel = liveListener.matches_repo_server || liveListener.matchesRepoServer ? 'listener 待完全对齐' : 'listener 待确认';
  } else if (liveListener.pid) {
    nodeLabel = 'runtime 已对齐';
  } else {
    nodeLabel = 'live listener 待确认';
  }

  const listenerJudgment =
    liveListener.drift_detected || liveListener.driftDetected
      ? '当前 live listener 与 managed pid 不一致，首页可能还在吃旧进程。'
      : liveListener.matches_repo_server || liveListener.matchesRepoServer
      ? liveListener.matches_managed_pid || liveListener.matchesManagedPid
        ? '当前 live listener 已确认来自当前 repo，并且和 managed pid 对齐。'
        : '当前 live listener 已确认来自当前 repo，但还没完全对齐 managed pid。'
      : liveListener.pid
      ? '当前 live listener 已存在，但归属仍待确认。'
      : '当前还没有确认到稳定的 live listener。';
  const healthProbeJudgment =
    healthProbeOk === true
      ? 'health probe 已确认 cortex-p0。'
      : healthProbeOk === false
      ? 'health probe 还没确认到 cortex-p0。'
      : hasHealthProbe
      ? 'health probe 已返回，但状态还需要继续确认。'
      : 'health probe 尚未返回。';

  const progressParts = [];
  if (runningCount != null && totalCount != null) {
    progressParts.push(`Managed ${runningCount} / ${totalCount} 运行中`);
  }
  if (stoppedCount != null && stoppedCount > 0) {
    progressParts.push(`${stoppedCount} 个未运行`);
  }
  if (healthProbeOk === true) {
    progressParts.push('health probe 已确认');
  } else if (healthProbeOk === false) {
    progressParts.push('health probe 待核实');
  }
  if (liveListener.port) {
    progressParts.push(`live 端口 ${liveListener.port}`);
  }

  return {
    headline: compact(payload.headline) || 'runtime 状态已更新。',
    severityLabel: severityLabels[severity] || severity,
    runningLabel,
    listenerLabel: liveListener.pid ? `PID ${liveListener.pid}` : '未监听',
    healthProbeLabel: healthProbeOk === true ? 'health ok' : healthProbeOk === false ? 'health 待核实' : '未读取',
    summary: compact(payload.headline) || 'runtime 状态已更新。',
    actionLabel: severity === 'healthy' ? '无需动作' : severity === 'blocking' ? '立即处理' : '建议处理',
    actionText: compact(payload.recommendation) || '当前无需额外动作。',
    metaItems: metaItems.length ? metaItems : ['当前没有额外 runtime 诊断信息。'],
    guidance: {
      nodeLabel,
      nodeSummary:
        compact(payload.headline) || '当前没有额外 runtime 判断，继续观察 live listener 与 managed runtime。',
      nodeAction: compact(payload.recommendation) || '当前无需额外动作。',
      nodeEvidence: metaItems.slice(0, 3).join('；'),
      progressLabel: progressParts.join(' · '),
      judgmentDetail: [listenerJudgment, healthProbeJudgment].filter(Boolean).join(' '),
      actionDetail:
        runtimeStatusUrl && severity !== 'healthy'
          ? `状态接口：${runtimeStatusUrl}`
          : coveredProcesses.length
          ? `health probe 兜底：${coveredProcesses.join(', ')}`
          : runtimeStatusUrl
          ? `状态接口：${runtimeStatusUrl}`
          : '',
    },
  };
}

function buildChecklistFocusTaskStub(projectId, record = {}, workspaceContext = {}) {
  const derivedThread = deriveThreadIdentity(record, { projectId });
  const threadKey = compact(record.threadKey || record.thread_key || derivedThread.key);
  if (!threadKey) {
    return null;
  }

  const threadHref = buildWorkspaceThreadHref(projectId, threadKey, workspaceContext);
  return {
    thread_key: threadKey,
    threadKey,
    thread_href: threadHref,
    threadHref,
  };
}

function annotateCardWithChecklistFocus(
  card,
  sourceRecords = [],
  projectId,
  workspaceContext = {},
  executionChecklist = null,
  checklistOptions = {},
) {
  if (!executionChecklist) {
    return card;
  }

  const fallbackCard = {
    ...card,
    ...buildChecklistProgressContext(card.executionChecklist || executionChecklist),
  };
  const rawSources = Array.isArray(sourceRecords) && sourceRecords.length > 0 ? sourceRecords : [card];
  const taskStubs = rawSources
    .map((record) => buildChecklistFocusTaskStub(projectId, record, workspaceContext))
    .filter(Boolean);

  if (taskStubs.length === 0) {
    return fallbackCard;
  }

  const annotated = annotateTasksWithChecklistFocus(taskStubs, executionChecklist, checklistOptions);
  const topFocus = pickTopChecklistFocus(annotated);
  if (!topFocus) {
    return fallbackCard;
  }

  return {
    ...fallbackCard,
    focusLabel: compact(topFocus.checklist_focus_label || topFocus.checklistFocusLabel),
    focusNote: compact(topFocus.checklist_focus_note || topFocus.checklistFocusNote),
    ...buildChecklistProgressContext(executionChecklist, {
      stepNumber: Number(topFocus.checklist_step_number || topFocus.checklistStepNumber || 0),
      stepTitle: compact(topFocus.checklist_step_title || topFocus.checklistStepTitle),
    }),
  };
}

function renderCount(label, value, tone = 'neutral', options = {}) {
  const content = `
    <div class="count-label">${escapeHtml(label)}</div>
    <div class="count-value">${escapeHtml(String(value))}</div>
    ${options.helper ? `<div class="count-helper">${escapeHtml(options.helper)}</div>` : ''}
  `;
  if (options.href) {
    return `
      <a class="count-card count-card-link tone-${escapeHtml(tone)}" href="${escapeHtml(options.href)}">
        ${content}
      </a>
    `;
  }

  return `
    <div class="count-card tone-${escapeHtml(tone)}">
      ${content}
    </div>
  `;
}

function buildWorkspaceExecutionChecklist(projectId, counts = {}, threadGovernance = null, attentionView = null, workspaceContext = {}) {
  const executionDocHref = `/workspace/docs/execution${buildWorkspaceContextQuery(projectId, workspaceContext)}`;
  const waitingTasks = Array.isArray(attentionView?.waiting_human) ? attentionView.waiting_human : [];
  const inProgressTasks = Array.isArray(attentionView?.in_progress) ? attentionView.in_progress : [];
  const completedTasks = Array.isArray(attentionView?.completed) ? attentionView.completed : [];
  const visibleTasks = [...waitingTasks, ...inProgressTasks, ...completedTasks];
  const latestVisibleTask = [...visibleTasks].sort(
    (left, right) =>
      toEpochMs(right.latest_updated_at || right.latestUpdatedAt || right.last_checkpoint_at || right.lastCheckpointAt) -
      toEpochMs(left.latest_updated_at || left.latestUpdatedAt || left.last_checkpoint_at || left.lastCheckpointAt),
  )[0] || null;
  const activeThreadCount = Number(counts.active_threads || counts.activeThreads || visibleTasks.length || 0);
  const commentLinkedTasks = visibleTasks.filter((task) => {
    const inboxCount = Number(task.inbox_item_ids?.length || task.inboxItemIds?.length || 0);
    const sourceLabel = compact(task.thread_source_label || task.threadSourceLabel);
    return inboxCount > 0 || sourceLabel === 'Notion 讨论' || Boolean(task.blocker_reason || task.blockerReason);
  });
  const commentEvidenceTask = [...commentLinkedTasks].sort(
    (left, right) =>
      toEpochMs(right.latest_updated_at || right.latestUpdatedAt || right.last_checkpoint_at || right.lastCheckpointAt) -
      toEpochMs(left.latest_updated_at || left.latestUpdatedAt || left.last_checkpoint_at || left.lastCheckpointAt),
  )[0] || latestVisibleTask;
  const topResidualPattern = threadGovernance?.patternGroups?.[0] || null;
  const threadIdentityAttentionTotal = Number(threadGovernance?.attentionThreadTotal || 0);
  const threadIdentityHistoryTotal = Number(threadGovernance?.historyThreadTotal || 0);
  const threadIdentityConcreteTotal = Number(threadGovernance?.concreteThreadTotal || 0);
  const threadIdentityDefaultViewClosed = threadIdentityAttentionTotal === 0 && threadIdentityHistoryTotal > 0;
  const decisionEvidenceTask = waitingTasks[0] || inProgressTasks[0] || latestVisibleTask;
  const redTaskCount = visibleTasks.filter(
    (task) => compact(task.decision_signal || task.decisionSignal).toLowerCase() === 'red',
  ).length;
  const yellowTaskCount = visibleTasks.filter(
    (task) => compact(task.decision_signal || task.decisionSignal).toLowerCase() === 'yellow',
  ).length;
  const threadIdentityProgressNote = threadGovernance
    ? `当前：主视图 ${threadIdentityAttentionTotal} 条，历史层 ${threadIdentityHistoryTotal} 条，稳定线程 ${threadIdentityConcreteTotal} 条。`
    : '继续减少低特异度线程键，让真实评论线程和多子任务线程更稳定。';
  const threadIdentitySummary = threadIdentityDefaultViewClosed
    ? '默认工作台已收口到稳定线程，后续重点转为历史层治理。'
    : '继续减少低特异度线程键，让真实评论线程和多子任务线程更稳定。';
  const threadIdentityStatusLabel = threadIdentityDefaultViewClosed ? '主视图已收口' : '进行中';
  const items = [
    {
      id: 'task-entry',
      priority: 'P0',
      status: 'completed',
      title: '任务卡进入真实执行现场',
      summary: '首页任务卡已经能直接进入 thread / document 执行现场，不再停在总览页。',
      acceptance: '任务卡能打开 /workspace/threads/:threadId，并看到文档、评论、决策和事件。',
      evidenceLabel:
        activeThreadCount > 0
          ? `当前 ${activeThreadCount} 条活跃线程都可以直接进入执行现场。`
          : '执行现场入口已经就绪，等待真实线程继续进入。',
      evidenceUpdatedAt: latestVisibleTask?.latest_updated_at || latestVisibleTask?.latestUpdatedAt || null,
      evidenceHref: latestVisibleTask?.thread_href || latestVisibleTask?.threadHref || `${executionDocHref}#thread-directory`,
      evidenceContextLabel: resolveExecutionChecklistEvidenceContextLabel('task-entry', {
        threadBacked: Boolean(latestVisibleTask?.thread_href || latestVisibleTask?.threadHref),
      }),
      sourceHref: latestVisibleTask?.primary_link || latestVisibleTask?.primaryLink || null,
      sourceLinkLabel: latestVisibleTask?.primary_link || latestVisibleTask?.primaryLink ? '打开源位置' : null,
      href: `${executionDocHref}#thread-directory`,
      linkLabel: '打开线程目录',
    },
    {
      id: 'task-comment-linkage',
      priority: 'P0',
      status: 'completed',
      title: '评论与任务双向定位',
      summary: '评论卡可以跳到关联子任务，任务卡也能反向打开关联评论。',
      acceptance: '线程页同时出现“跳到关联子任务”和“打开关联评论”，并诚实区分直接绑定与推断。',
      evidenceLabel:
        commentLinkedTasks.length > 0
          ? `当前 ${commentLinkedTasks.length} 条线程保留评论/回访上下文，可继续双向跳转。`
          : '评论与任务的双向定位链路已经就绪。',
      evidenceUpdatedAt: commentEvidenceTask?.latest_updated_at || commentEvidenceTask?.latestUpdatedAt || null,
      evidenceHref: commentEvidenceTask?.thread_href || commentEvidenceTask?.threadHref || `${executionDocHref}#comment-threads`,
      evidenceContextLabel: resolveExecutionChecklistEvidenceContextLabel('task-comment-linkage', {
        threadBacked: Boolean(commentEvidenceTask?.thread_href || commentEvidenceTask?.threadHref),
      }),
      sourceHref: commentEvidenceTask?.primary_link || commentEvidenceTask?.primaryLink || null,
      sourceLinkLabel: commentEvidenceTask?.primary_link || commentEvidenceTask?.primaryLink ? '打开源位置' : null,
      href: `${executionDocHref}#comment-threads`,
      linkLabel: '查看评论流转',
    },
    {
      id: 'thread-identity',
      priority: 'P0',
      status: 'in_progress',
      title: 'thread_key / thread_label 收口',
      summary: threadIdentitySummary,
      acceptance: '真实协作线程优先落到稳定 thread identity，减少 command:* / decision:* 这类泛化键。',
      progressNote: threadIdentityProgressNote,
      evidenceLabel: topResidualPattern
        ? `${threadIdentityDefaultViewClosed ? '当前历史层焦点' : '当前残留焦点'}：${
            topResidualPattern.residualPatternLabel || topResidualPattern.residualPattern
          } · ${topResidualPattern.totalCount || 0} 条。`
        : '当前主视图与历史层都已收口到稳定线程来源。',
      evidenceUpdatedAt: topResidualPattern?.latestUpdatedAt || latestVisibleTask?.latest_updated_at || latestVisibleTask?.latestUpdatedAt || null,
      evidenceHref: topResidualPattern
        ? buildWorkspacePath(projectId, {
            ...workspaceContext,
            includeResidual: true,
            residualPattern: topResidualPattern.residualPattern,
          })
        : `${buildWorkspacePath(projectId, workspaceContext)}#thread-governance`,
      evidenceContextLabel: resolveExecutionChecklistEvidenceContextLabel('thread-identity', {
        hasResidualPattern: Boolean(topResidualPattern),
        defaultViewClosed: threadIdentityDefaultViewClosed,
      }),
      sourceHref: topResidualPattern?.sourceHref || topResidualPattern?.focusHref || null,
      sourceLinkLabel: topResidualPattern?.sourceHref
        ? '打开最近源位置'
        : topResidualPattern?.focusHref
          ? '打开待治理线程'
          : null,
      href: `${buildWorkspacePath(projectId, workspaceContext)}#thread-governance`,
      linkLabel: '打开线程治理',
      statusLabelOverride: threadIdentityStatusLabel,
    },
    {
      id: 'decision-visibility',
      priority: 'P0',
      status: 'completed',
      title: '红黄灯与评论流转解释增强',
      summary: '让人不用翻日志，也能看懂现在为什么卡住、系统准备怎么继续。',
      acceptance: '黄灯绕行、红灯等待、评论 triage 三类状态都能在前台直接解释清楚。',
      evidenceLabel:
        redTaskCount > 0 || yellowTaskCount > 0
          ? `当前待拍板 ${redTaskCount} 条，黄灯/处理中 ${yellowTaskCount || inProgressTasks.length} 条。`
          : '当前红黄灯解释链路已就绪，等待下一轮真实决策流量进入。',
      evidenceUpdatedAt: decisionEvidenceTask?.latest_updated_at || decisionEvidenceTask?.latestUpdatedAt || null,
      evidenceHref: decisionEvidenceTask?.thread_href || decisionEvidenceTask?.threadHref || `${executionDocHref}#quick-decisions`,
      evidenceContextLabel: resolveExecutionChecklistEvidenceContextLabel('decision-visibility', {
        threadBacked: Boolean(decisionEvidenceTask?.thread_href || decisionEvidenceTask?.threadHref),
      }),
      sourceHref: decisionEvidenceTask?.primary_link || decisionEvidenceTask?.primaryLink || null,
      sourceLinkLabel: decisionEvidenceTask?.primary_link || decisionEvidenceTask?.primaryLink ? '打开源位置' : null,
      href: `${executionDocHref}#quick-decisions`,
      linkLabel: '查看决策区',
    },
    {
      id: 'doc-workspace',
      priority: 'P0+',
      status: 'completed',
      title: '单文档三栏协作页继续产品化',
      summary: '在现有三栏主壳上继续提升编辑、评论和任务编排体验。',
      acceptance: '左目录、中编辑区、右评论线程形成稳定主路径，但暂不强行上完整 block editor。',
      evidenceLabel:
        activeThreadCount > 0
          ? `当前 ${activeThreadCount} 条活跃线程共享同一套文档 / 评论 / 决策三栏现场。`
          : '三栏协作页已经就绪，等待更多真实线程进入。',
      evidenceUpdatedAt: latestVisibleTask?.latest_updated_at || latestVisibleTask?.latestUpdatedAt || null,
      evidenceHref: `${executionDocHref}#workspace-compose`,
      evidenceContextLabel: resolveExecutionChecklistEvidenceContextLabel('doc-workspace'),
      sourceHref: latestVisibleTask?.primary_link || latestVisibleTask?.primaryLink || null,
      sourceLinkLabel: latestVisibleTask?.primary_link || latestVisibleTask?.primaryLink ? '打开源位置' : null,
      href: `${executionDocHref}#workspace-compose`,
      linkLabel: '打开协作输入',
    },
  ];

  const completedItems = items.filter((item) => item.status === 'completed');
  const inProgressItems = items.filter((item) => item.status === 'in_progress');
  const pendingItems = items.filter((item) => item.status === 'pending');
  const focusItem = inProgressItems[0] || pendingItems[0] || items[items.length - 1];
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedItems.length / totalCount) * 100) : 0;
  const remainingItems = items.filter((item) => item.status !== 'completed');
  const statusLabelForItem = (status) =>
    status === 'completed' ? '已完成' : status === 'in_progress' ? '进行中' : '待执行';
  const enhancedItems = items.map((item, index) => ({
    ...item,
    stepNumber: index + 1,
    statusLabel: item.statusLabelOverride || statusLabelForItem(item.status),
    isFocus: item.id === focusItem?.id,
  }));
  const focusContextLinks =
    focusItem?.id === 'thread-identity' && threadGovernance?.patternGroups?.length
      ? threadGovernance.patternGroups.slice(0, 3).map((group) => ({
          label: `${group.residualPatternLabel || '未分类'} · ${group.totalCount || 0} 条`,
          href: buildWorkspacePath(projectId, {
            ...workspaceContext,
            includeResidual: true,
            residualPattern: group.residualPattern,
          }),
        }))
      : [];
  const revisitContextLinks = Array.isArray(attentionView?.in_progress)
    ? attentionView.in_progress
        .filter((task) => compact(task.execution_status || task.executionStatus).toLowerCase() === 'stalled')
        .slice(0, 3)
        .map((task) => ({
          label: `${summarize(task.title || '待回看线程', 24)} · 待回看`,
          href: task.thread_href || task.threadHref || '#',
        }))
    : [];

  return {
    title: '执行 Checklist',
    summary: `${completedItems.length} / ${items.length} 个闭环已收口`,
    progressPercent,
    totalCount,
    remainingCount: remainingItems.length,
    progressLabel: `${completedItems.length} / ${totalCount} 已收口`,
    remainingHeadline:
      remainingItems.length > 0
        ? `还剩 ${remainingItems.length} 个闭环需要继续推进。`
        : '当前没有剩余闭环，主路径已经全部收口。',
    heartbeatNote: 'Autopilot heartbeat 已恢复：每 10 分钟回到当前线程继续推进。',
    checkpointRule: '每完成一段都要经过：实现 -> 测试 -> live probe -> 更新 checkpoint 文档。',
    focusTitle: focusItem?.title || '',
    focusSummary: focusItem?.summary || '',
    focusStatusLabel: focusItem?.statusLabelOverride || (focusItem ? statusLabelForItem(focusItem.status) : ''),
    focusStepNumber: focusItem ? items.findIndex((item) => item.id === focusItem.id) + 1 : 0,
    nextAcceptance: focusItem?.acceptance || '',
    focusHref: focusItem?.href || '',
    focusLinkLabel: focusItem?.linkLabel || '打开当前主闭环',
    focusEvidenceLabel: focusItem?.evidenceLabel || '',
    focusEvidenceUpdatedAt: focusItem?.evidenceUpdatedAt || null,
    focusEvidenceHref: focusItem?.evidenceHref || '',
    focusEvidenceContextLabel: focusItem?.evidenceContextLabel || '',
    focusEvidenceSourceHref: focusItem?.sourceHref || '',
    focusEvidenceSourceLabel: focusItem?.sourceLinkLabel || '',
    focusContextTitle: focusContextLinks.length > 0 ? (threadIdentityDefaultViewClosed ? '历史层治理' : '优先清理') : '',
    focusContextLinks,
    revisitContextTitle: revisitContextLinks.length > 0 ? '优先回看' : '',
    revisitContextLinks,
    completedCount: completedItems.length,
    inProgressCount: inProgressItems.length,
    pendingCount: pendingItems.length,
    remainingItems: remainingItems.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      statusLabel: item.statusLabelOverride || statusLabelForItem(item.status),
      href: item.href,
      linkLabel: item.linkLabel,
    })),
    items: enhancedItems,
  };
}

function annotateTasksWithChecklistFocus(tasks = [], executionChecklist = null, options = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0 || !executionChecklist) {
    return tasks;
  }

  const focusHref = compact(executionChecklist.focusHref);
  const focusEvidenceHref = compact(executionChecklist.focusEvidenceHref);
  const revisitHrefSet = new Set(
    (executionChecklist.revisitContextLinks || []).map((item) => compact(item.href)).filter(Boolean),
  );
  const focusItem = executionChecklist.items?.find((item) => item.isFocus) || null;
  const focusStepNumber = Number(focusItem?.stepNumber || executionChecklist.focusStepNumber || 0);
  const focusStepTitle = compact(focusItem?.title || executionChecklist.focusTitle);
  const focusResidualPattern = compact(options.focusResidualPattern);
  const residualPatternByThreadKey = options.residualPatternByThreadKey || new Map();
  const threadIdentityClosed = Boolean(options.threadIdentityDefaultViewClosed);

  return tasks.map((task) => {
    const threadHref = compact(task.thread_href || task.threadHref);
    const threadKey = compact(task.thread_key || task.threadKey);
    const residualPattern = compact(residualPatternByThreadKey.get(threadKey));
    let checklistFocusLabel = '';
    let checklistFocusNote = '';
    let checklistStepNumber = 0;
    let checklistStepTitle = '';

    if (threadHref && revisitHrefSet.has(threadHref)) {
      checklistFocusLabel = executionChecklist.revisitContextTitle || '优先回看';
      checklistFocusNote = '这张卡属于当前需要优先回看的线程，先确认它为什么从自动推进降成待回看。';
      checklistStepNumber = focusStepNumber;
      checklistStepTitle = focusStepTitle;
    } else if (
      executionChecklist.items?.find((item) => item.isFocus)?.id === 'thread-identity' &&
      focusResidualPattern &&
      residualPattern &&
      residualPattern === focusResidualPattern
    ) {
      checklistFocusLabel = threadIdentityClosed ? '历史层治理' : '当前主闭环';
      checklistFocusNote = threadIdentityClosed
        ? '这张卡属于当前历史层治理焦点，主视图已收口后优先处理这类残留线程。'
        : '这张卡属于当前的 thread identity 收口闭环，优先减少泛化线程和来源缺口。';
      checklistStepNumber = focusStepNumber;
      checklistStepTitle = focusStepTitle;
    } else if (threadHref && (threadHref === focusHref || threadHref === focusEvidenceHref)) {
      checklistFocusLabel = '当前主闭环';
      checklistFocusNote = '这张卡就是当前 Checklist 焦点对应的线程现场。';
      checklistStepNumber = focusStepNumber;
      checklistStepTitle = focusStepTitle;
    }

    return {
      ...task,
      checklist_focus_label: checklistFocusLabel,
      checklistFocusLabel,
      checklist_focus_note: checklistFocusNote,
      checklistFocusNote,
      ...buildChecklistProgressContext(executionChecklist, {
        stepNumber: checklistStepNumber,
        stepTitle: checklistStepTitle,
      }),
    };
  });
}

function annotateThreadGroupsWithChecklistFocus(threadGroups = [], executionChecklist = null) {
  if (!Array.isArray(threadGroups) || threadGroups.length === 0) {
    return threadGroups;
  }

  return threadGroups.map((group) => {
    const tasks = Array.isArray(group.tasks) ? group.tasks : [];
    const topFocusTask = pickTopChecklistFocus(tasks);

    const checklistFocusLabel = compact(topFocusTask?.checklist_focus_label);
    const checklistFocusNote = compact(topFocusTask?.checklist_focus_note);

    return {
      ...group,
      checklist_focus_label: checklistFocusLabel,
      checklistFocusLabel,
      checklist_focus_note: checklistFocusNote,
      checklistFocusNote,
      ...buildChecklistProgressContext(executionChecklist, {
        stepNumber: Number(topFocusTask?.checklist_step_number || topFocusTask?.checklistStepNumber || 0),
        stepTitle: compact(topFocusTask?.checklist_step_title || topFocusTask?.checklistStepTitle),
      }),
    };
  });
}

export function buildTaskDashboardPayload(engine, projectId, options = {}) {
  const includeSynthetic = Boolean(options.includeSynthetic);
  const review = engine.buildProjectReview(projectId);
  const resolvedProjectId = review.project.projectId;
  const briefs = sortByUpdatedDesc(engine.listTaskBriefs({ projectId: resolvedProjectId }).briefs || []);
  const checkpoints = sortByUpdatedDesc(engine.listCheckpoints({ projectId: resolvedProjectId, limit: 24 }).checkpoints || []);
  const inboxItems = sortByUpdatedDesc(engine.listInbox({ projectId: resolvedProjectId, limit: 24 }).items || []);
  const memories = sortByUpdatedDesc(engine.listMemory({ projectId: resolvedProjectId, limit: 24 }).memories || []);
  const suggestions = sortByUpdatedDesc(engine.listSuggestions({ projectId: resolvedProjectId, limit: 24 }).suggestions || []);
  const receipts = sortByUpdatedDesc(engine.getReceiptsByProject(resolvedProjectId, { limit: 12 }).receipts || []);
  const filteredBriefs = splitSynthetic(briefs, includeSynthetic);
  const filteredCheckpoints = splitSynthetic(checkpoints, includeSynthetic);
  const filteredRedDecisions = splitSynthetic(review.summary.redDecisions, includeSynthetic);
  const filteredYellowDecisions = splitSynthetic(review.summary.yellowDecisions, includeSynthetic);
  const filteredGreenNotes = splitSynthetic(review.summary.greenNotes, includeSynthetic);
  const filteredActiveCommands = splitSynthetic(review.summary.activeCommands, includeSynthetic);
  const filteredRecentDoneCommands = splitSynthetic(review.summary.recentDoneCommands, includeSynthetic);
  const filteredNotionCommands = splitSynthetic(review.summary.notionCommands, includeSynthetic);
  const filteredRecentRuns = splitSynthetic(review.summary.recentRuns, includeSynthetic);
  const filteredInboxItems = splitSynthetic(inboxItems, includeSynthetic);
  const filteredMemories = splitSynthetic(memories, includeSynthetic);
  const filteredSuggestions = splitSynthetic(suggestions, includeSynthetic);
  const filteredReceipts = splitSynthetic(receipts, includeSynthetic);

  const openInboxItems = filteredInboxItems.visible.filter((item) => !['resolved', 'archived'].includes(item.status));
  const candidateMemories = filteredMemories.visible.filter((memory) => memory.status === 'candidate');
  const openSuggestions = filteredSuggestions.visible.filter((suggestion) => !['accepted', 'rejected'].includes(suggestion.status));
  const recentReceipts = filteredReceipts.visible.filter((receipt) => receipt.status === 'completed');
  const runningRuns = filteredRecentRuns.visible.filter((run) => run.status === 'running');
  const latestCheckpoint = filteredCheckpoints.visible[0] || null;
  const latestBrief = filteredBriefs.visible[0] || null;
  const entryLinks = buildEntryLinks(review.project);
  const nextSteps = [];
  if (filteredRedDecisions.visible.length > 0) {
    nextSteps.push(`有 ${filteredRedDecisions.visible.length} 个红灯事项需要立即拍板。`);
  }
  if (filteredYellowDecisions.visible.length > 0) {
    nextSteps.push(`有 ${filteredYellowDecisions.visible.length} 个黄灯事项已挂起，等 review 窗口统一处理。`);
  }
  if (filteredActiveCommands.visible.length > 0) {
    nextSteps.push(`有 ${filteredActiveCommands.visible.length} 条执行指令还在队列中。`);
  }
  if (nextSteps.length === 0) {
    if (latestCheckpoint?.nextStep) {
      nextSteps.push(latestCheckpoint.nextStep);
    } else if (latestBrief?.what) {
      nextSteps.push(`继续推进：${summarize(latestBrief.what, 84)}`);
    } else if (latestBrief?.title) {
      nextSteps.push(`继续推进：${latestBrief.title}`);
    } else {
      nextSteps.push('当前没有阻塞项，可以继续推进下一轮执行。');
    }
  }
  const nextStep = nextSteps[0] || '暂无';
  const checkpointSignal = latestCheckpoint?.signalLevel || null;
  const trajectoryStatus =
    filteredRedDecisions.visible.length > 0 || checkpointSignal === 'red'
      ? '已偏离，需要立即拍板'
      : filteredYellowDecisions.visible.length > 0 || checkpointSignal === 'yellow'
        ? '存在待对齐项，但还没有脱轨'
        : '未见脱轨信号，当前推进方向正常';
  const trajectoryReason =
    filteredRedDecisions.visible.length > 0
      ? `当前有 ${filteredRedDecisions.visible.length} 个红灯事项未处理，继续推进会放大错误成本。`
      : filteredYellowDecisions.visible.length > 0
        ? `当前有 ${filteredYellowDecisions.visible.length} 个黄灯事项待 review，需要在合适窗口收口。`
        : checkpointSignal === 'red' || checkpointSignal === 'yellow'
          ? latestCheckpoint?.summary || '最近 checkpoint 需要进一步处理。'
          : filteredActiveCommands.visible.length > 0
            ? `当前有 ${filteredActiveCommands.visible.length} 条执行项在推进，但没有发现需要你立即拍板的阻塞。`
            : latestCheckpoint?.summary || '当前没有红灯、黄灯或积压执行项。';

  const doingCards = [
    ...filteredActiveCommands.visible.map(buildCommandCard),
    ...runningRuns.map(buildRunCard),
  ].slice(0, 8);

  const waitingCards = [
    ...filteredRedDecisions.visible.map(buildDecisionCard),
    ...filteredYellowDecisions.visible.map(buildDecisionCard),
    ...openInboxItems.map(buildInboxCard),
    ...openSuggestions.map(buildSuggestionCard),
  ].slice(0, 10);

  const completedCards = [
    latestCheckpoint ? buildCheckpointCard(latestCheckpoint) : null,
    ...filteredRecentDoneCommands.visible.map(buildCommandCard),
    ...recentReceipts.slice(0, 3).map((receipt) => ({
      id: receipt.receiptId,
      type: 'receipt',
      tone: 'green',
      badge: receipt.signal || receipt.status || 'completed',
      title: summarize(receipt.payload?.summary || receipt.commandId || '最新回执', 72),
      summary: summarize(receipt.payload?.details || receipt.target || '已收到完成回执', 140),
      meta: [
        receipt.channel ? `渠道：${receipt.channel}` : null,
        receipt.createdAt ? `回执时间：${formatIso(receipt.createdAt)}` : null,
      ].filter(Boolean),
      link: null,
    })),
  ]
    .filter(Boolean)
    .slice(0, 8);

  const memoryCards = candidateMemories.map(buildMemoryCard).slice(0, 8);
  const commentCards = filteredNotionCommands.visible.map(buildCommentCard).slice(0, 6);
  const hiddenSyntheticCounts = {
    briefs: filteredBriefs.hidden.length,
    checkpoints: filteredCheckpoints.hidden.length,
    redDecisions: filteredRedDecisions.hidden.length,
    yellowDecisions: filteredYellowDecisions.hidden.length,
    greenNotes: filteredGreenNotes.hidden.length,
    activeCommands: filteredActiveCommands.hidden.length,
    recentDoneCommands: filteredRecentDoneCommands.hidden.length,
    recentRuns: filteredRecentRuns.hidden.length,
    openInbox: filteredInboxItems.hidden.length,
    candidateMemories: filteredMemories.hidden.filter((memory) => memory.status === 'candidate').length,
    openSuggestions: filteredSuggestions.hidden.filter((suggestion) => !['accepted', 'rejected'].includes(suggestion.status)).length,
    recentComments: filteredNotionCommands.hidden.length,
    recentReceipts: filteredReceipts.hidden.length,
  };
  const hiddenSyntheticTotal = Object.values(hiddenSyntheticCounts).reduce((sum, value) => sum + value, 0);
  const hiddenSynthetic = {
    briefs: hiddenSyntheticCounts.briefs,
    checkpoints: hiddenSyntheticCounts.checkpoints,
    red_decisions: hiddenSyntheticCounts.redDecisions,
    redDecisions: hiddenSyntheticCounts.redDecisions,
    yellow_decisions: hiddenSyntheticCounts.yellowDecisions,
    yellowDecisions: hiddenSyntheticCounts.yellowDecisions,
    green_notes: hiddenSyntheticCounts.greenNotes,
    greenNotes: hiddenSyntheticCounts.greenNotes,
    active_commands: hiddenSyntheticCounts.activeCommands,
    activeCommands: hiddenSyntheticCounts.activeCommands,
    recent_done_commands: hiddenSyntheticCounts.recentDoneCommands,
    recentDoneCommands: hiddenSyntheticCounts.recentDoneCommands,
    recent_runs: hiddenSyntheticCounts.recentRuns,
    recentRuns: hiddenSyntheticCounts.recentRuns,
    open_inbox: hiddenSyntheticCounts.openInbox,
    openInbox: hiddenSyntheticCounts.openInbox,
    candidate_memories: hiddenSyntheticCounts.candidateMemories,
    candidateMemories: hiddenSyntheticCounts.candidateMemories,
    open_suggestions: hiddenSyntheticCounts.openSuggestions,
    openSuggestions: hiddenSyntheticCounts.openSuggestions,
    recent_comments: hiddenSyntheticCounts.recentComments,
    recentComments: hiddenSyntheticCounts.recentComments,
    recent_receipts: hiddenSyntheticCounts.recentReceipts,
    recentReceipts: hiddenSyntheticCounts.recentReceipts,
  };

  return {
    ok: true,
    generated_at: engine.store.clock().toISOString(),
    generatedAt: engine.store.clock().toISOString(),
    project: mapProjectForDashboard(review.project),
    hero: {
      current_task: latestCheckpoint?.title || latestBrief?.title || '未设置当前任务',
      currentTask: latestCheckpoint?.title || latestBrief?.title || '未设置当前任务',
      current_phase:
        latestCheckpoint
          ? [latestCheckpoint.stage, latestCheckpoint.status, latestCheckpoint.qualityGrade, latestCheckpoint.anomalyLevel]
              .filter(Boolean)
              .join(' / ')
          : '等待新 checkpoint',
      currentPhase:
        latestCheckpoint
          ? [latestCheckpoint.stage, latestCheckpoint.status, latestCheckpoint.qualityGrade, latestCheckpoint.anomalyLevel]
              .filter(Boolean)
              .join(' / ')
          : '等待新 checkpoint',
      trajectory_status: trajectoryStatus,
      trajectoryStatus: trajectoryStatus,
      trajectory_reason: trajectoryReason,
      trajectoryReason: trajectoryReason,
      next_step: nextStep,
      nextStep: nextStep,
      entry_links: entryLinks,
      entryLinks: entryLinks,
      review_window_note: review.project.reviewWindowNote || null,
      reviewWindowNote: review.project.reviewWindowNote || null,
    },
    counts: {
      active_commands: filteredActiveCommands.visible.length,
      activeCommands: filteredActiveCommands.visible.length,
      running_runs: runningRuns.length,
      runningRuns: runningRuns.length,
      red_decisions: filteredRedDecisions.visible.length,
      redDecisions: filteredRedDecisions.visible.length,
      yellow_decisions: filteredYellowDecisions.visible.length,
      yellowDecisions: filteredYellowDecisions.visible.length,
      open_inbox: openInboxItems.length,
      openInbox: openInboxItems.length,
      candidate_memories: candidateMemories.length,
      candidateMemories: candidateMemories.length,
      open_suggestions: openSuggestions.length,
      openSuggestions: openSuggestions.length,
      recent_done_commands: filteredRecentDoneCommands.visible.length,
      recentDoneCommands: filteredRecentDoneCommands.visible.length,
      recent_comments: filteredNotionCommands.visible.length,
      recentComments: filteredNotionCommands.visible.length,
    },
    data_hygiene: {
      include_synthetic: includeSynthetic,
      includeSynthetic: includeSynthetic,
      hidden_synthetic_total: hiddenSyntheticTotal,
      hiddenSyntheticTotal: hiddenSyntheticTotal,
      hidden_synthetic: hiddenSynthetic,
      hiddenSynthetic: hiddenSynthetic,
    },
    sections: {
      doing: doingCards,
      waiting: waitingCards,
      completed: completedCards,
      memory_candidates: memoryCards,
      memoryCandidates: memoryCards,
      recent_comments: commentCards,
      recentComments: commentCards,
    },
  };
}

export function renderTaskDashboardPage(payload) {
  const project = payload.project;
  const hero = payload.hero;
  const counts = payload.counts;
  const dataHygiene = payload.data_hygiene;
  const sections = payload.sections;
  const projectId = project.projectId;
  const jsonUrl = `/dashboard/data?project_id=${encodeURIComponent(projectId)}${dataHygiene.include_synthetic ? '&include_synthetic=1' : ''}`;
  const syntheticToggleUrl = `/dashboard?project_id=${encodeURIComponent(projectId)}${dataHygiene.include_synthetic ? '' : '&include_synthetic=1'}`;
  const countMarkup = [
    renderCount('执行中指令', counts.active_commands, counts.active_commands > 0 ? 'blue' : 'neutral'),
    renderCount('运行中 Agent', counts.running_runs, counts.running_runs > 0 ? 'blue' : 'neutral'),
    renderCount('红灯决策', counts.red_decisions, counts.red_decisions > 0 ? 'red' : 'neutral'),
    renderCount('黄灯事项', counts.yellow_decisions, counts.yellow_decisions > 0 ? 'yellow' : 'neutral'),
    renderCount('待处理 Inbox', counts.open_inbox, counts.open_inbox > 0 ? 'yellow' : 'neutral'),
    renderCount('记忆候选', counts.candidate_memories, counts.candidate_memories > 0 ? 'green' : 'neutral'),
  ].join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(projectId)} Task Board</title>
    <style>
      :root {
        --bg: #f4efe6;
        --bg-panel: rgba(255, 250, 242, 0.88);
        --ink: #1f2320;
        --muted: #5f695f;
        --line: rgba(44, 56, 46, 0.12);
        --shadow: 0 24px 60px rgba(69, 53, 35, 0.12);
        --red: #b74b3f;
        --yellow: #c28a2e;
        --green: #2f7a58;
        --blue: #2b648b;
        --neutral: #6a6f69;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(232, 196, 135, 0.35), transparent 28rem),
          radial-gradient(circle at top right, rgba(137, 174, 153, 0.28), transparent 24rem),
          linear-gradient(180deg, #fbf6ee 0%, #f0eadf 100%);
        min-height: 100vh;
      }

      .shell {
        max-width: 1240px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: linear-gradient(135deg, rgba(255,255,255,0.82), rgba(244,236,222,0.92));
        box-shadow: var(--shadow);
        padding: 28px;
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -8% -45% auto;
        width: 320px;
        height: 320px;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(47,122,88,0.18), transparent 68%);
        pointer-events: none;
      }

      .hero-top,
      .hero-actions,
      .hero-links,
      .counts,
      .sections {
        position: relative;
        z-index: 1;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .eyebrow .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--green);
        box-shadow: 0 0 0 8px rgba(47, 122, 88, 0.08);
      }

      h1 {
        margin: 14px 0 10px;
        font-size: clamp(32px, 5vw, 56px);
        line-height: 0.96;
        letter-spacing: -0.03em;
        max-width: 9ch;
      }

      .hero-summary {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
        gap: 18px;
        align-items: start;
      }

      .hero-copy p {
        margin: 0 0 10px;
        color: var(--muted);
        line-height: 1.65;
        font-size: 15px;
      }

      .hero-callout {
        border: 1px solid var(--line);
        border-radius: 20px;
        background: rgba(255,255,255,0.66);
        padding: 18px;
      }

      .hero-callout strong {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        color: var(--muted);
      }

      .hero-callout div {
        font-size: 18px;
        line-height: 1.45;
      }

      .hero-actions {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 18px;
      }

      .button,
      .button-secondary {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        font: inherit;
        cursor: pointer;
        text-decoration: none;
      }

      .button {
        background: var(--ink);
        color: white;
      }

      .button-secondary {
        background: rgba(255,255,255,0.7);
        color: var(--ink);
        border: 1px solid var(--line);
      }

      .refresh-note {
        color: var(--muted);
        font-size: 13px;
      }

      .hero-links {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 18px;
      }

      .hero-links a {
        color: var(--blue);
        text-decoration: none;
        font-size: 14px;
        border-bottom: 1px solid rgba(43,100,139,0.3);
      }

      .counts {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
        margin-top: 22px;
      }

      .count-card {
        border-radius: 20px;
        padding: 16px;
        border: 1px solid var(--line);
        background: var(--bg-panel);
      }

      .count-card-link {
        display: block;
        color: inherit;
        text-decoration: none;
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
      }

      .count-card-link:hover {
        transform: translateY(-1px);
        box-shadow: 0 12px 24px rgba(66, 54, 38, 0.08);
        border-color: rgba(29, 34, 32, 0.18);
      }

      .count-label {
        font-size: 13px;
        color: var(--muted);
        margin-bottom: 10px;
      }

      .count-value {
        font-size: 30px;
        line-height: 1;
        letter-spacing: -0.04em;
      }

      .count-helper {
        margin-top: 10px;
        font-size: 12px;
        color: var(--muted);
      }

      .tone-red { border-color: rgba(183, 75, 63, 0.22); }
      .tone-yellow { border-color: rgba(194, 138, 46, 0.22); }
      .tone-green { border-color: rgba(47, 122, 88, 0.22); }
      .tone-blue { border-color: rgba(43, 100, 139, 0.22); }

      .sections {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-top: 22px;
      }

      .section-panel {
        border-radius: 24px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.74);
        box-shadow: 0 18px 42px rgba(97, 77, 46, 0.08);
        padding: 20px;
      }

      .section-panel h2 {
        margin: 0 0 6px;
        font-size: 22px;
        letter-spacing: -0.02em;
      }

      .section-panel .section-note {
        margin: 0 0 18px;
        color: var(--muted);
        font-size: 14px;
      }

      .task-grid {
        display: grid;
        gap: 12px;
      }

      .task-card {
        border-radius: 18px;
        padding: 16px;
        background: rgba(255,255,255,0.82);
        border: 1px solid var(--line);
      }

      .task-card-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 10px;
      }

      .task-badge {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: white;
        background: var(--neutral);
      }

      .tone-red .task-badge { background: var(--red); }
      .tone-yellow .task-badge { background: var(--yellow); }
      .tone-green .task-badge { background: var(--green); }
      .tone-blue .task-badge { background: var(--blue); }

      .task-kind {
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .task-card h3 {
        margin: 0 0 8px;
        font-size: 18px;
        line-height: 1.25;
      }

      .task-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
        font-size: 14px;
      }

      .task-meta {
        list-style: none;
        margin: 12px 0 0;
        padding: 0;
        display: grid;
        gap: 5px;
        color: var(--muted);
        font-size: 12px;
      }

      .task-link {
        display: inline-block;
        margin-top: 12px;
        color: var(--blue);
        text-decoration: none;
        font-size: 13px;
      }

      .empty-state {
        padding: 22px 16px;
        border-radius: 18px;
        border: 1px dashed var(--line);
        color: var(--muted);
        background: rgba(255,255,255,0.55);
        text-align: center;
      }

      @media (max-width: 1080px) {
        .counts {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .sections,
        .hero-summary {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .shell {
          padding: 18px 14px 28px;
        }

        .hero,
        .section-panel {
          border-radius: 20px;
        }

        .counts {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="eyebrow">
          <span class="dot"></span>
          <span>${escapeHtml(project.projectId)} live task board</span>
        </div>
        <h1>任务清单可视化</h1>
        <div class="hero-summary">
          <div class="hero-copy">
            <p>当前任务：${escapeHtml(hero.current_task)}</p>
            <p>当前阶段：${escapeHtml(hero.current_phase)}</p>
            <p>轨迹判断：${escapeHtml(hero.trajectory_status)}</p>
            <p>${escapeHtml(hero.trajectory_reason)}</p>
          </div>
          <div class="hero-callout">
            <strong>下一步</strong>
            <div>${escapeHtml(hero.next_step)}</div>
          </div>
        </div>
        <div class="hero-actions">
          <button class="button" type="button" onclick="window.location.reload()">立即刷新</button>
          <a class="button-secondary" href="${escapeHtml(jsonUrl)}" target="_blank" rel="noreferrer">查看 JSON</a>
          <span class="refresh-note">最近刷新：${escapeHtml(formatIso(payload.generated_at))}</span>
          <span class="refresh-note" data-refresh-label>15s 后自动刷新</span>
        </div>
        ${
          hero.entry_links.length > 0 || hero.review_window_note
            ? `<div class="hero-links">
                ${hero.entry_links
                  .map(
                    (link) =>
                      `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`,
                  )
                  .join('')}
                ${
                  hero.review_window_note
                    ? `<span class="refresh-note">Review 窗口：${escapeHtml(hero.review_window_note)}</span>`
                    : ''
                }
              </div>`
            : ''
        }
        ${
          dataHygiene.hidden_synthetic_total > 0 || dataHygiene.include_synthetic
            ? `<div class="hero-links">
                <span class="refresh-note">${
                  dataHygiene.include_synthetic
                    ? `当前已显示 smoke / 验收残留数据。`
                    : `已默认隐藏 ${dataHygiene.hidden_synthetic_total} 条 smoke / 验收残留数据。`
                }</span>
                <a href="${escapeHtml(syntheticToggleUrl)}">${dataHygiene.include_synthetic ? '切回净化视图' : '查看完整原始视图'}</a>
              </div>`
            : ''
        }
        <div class="counts">${countMarkup}</div>
      </section>

      <div class="sections">
        <section class="section-panel">
          <h2>现在在做</h2>
          <p class="section-note">你可以直接看到当前正在推进的命令和 agent run。</p>
          <div class="task-grid">${renderCards(sections.doing, '当前没有执行中的任务。')}</div>
        </section>

        <section class="section-panel">
          <h2>等你拍板</h2>
          <p class="section-note">红灯、黄灯、待 review 的 inbox 和 suggestion 会集中放这里。</p>
          <div class="task-grid">${renderCards(sections.waiting, '当前没有需要拍板或 review 的事项。')}</div>
        </section>

        <section class="section-panel">
          <h2>最近完成</h2>
          <p class="section-note">最新 checkpoint、完成指令和回执会优先展示。</p>
          <div class="task-grid">${renderCards(sections.completed, '还没有完成记录。')}</div>
        </section>

        <section class="section-panel">
          <h2>记忆候选</h2>
          <p class="section-note">这里会显示等待审核的人机协作记忆。</p>
          <div class="task-grid">${renderCards(sections.memory_candidates, '当前没有待确认的记忆候选。')}</div>
        </section>

        <section class="section-panel" style="grid-column: 1 / -1;">
          <h2>最近评论回流</h2>
          <p class="section-note">方便你确认 Notion 侧评论有没有进入 Cortex 执行链路。</p>
          <div class="task-grid">${renderCards(sections.recent_comments, '最近没有新的评论事件。')}</div>
        </section>
      </div>
    </div>
    <script>
      (() => {
        const label = document.querySelector('[data-refresh-label]');
        let remaining = 15;
        const timer = setInterval(() => {
          remaining -= 1;
          if (label) {
            label.textContent = remaining > 0 ? remaining + 's 后自动刷新' : '正在刷新...';
          }
          if (remaining <= 0) {
            clearInterval(timer);
            window.location.reload();
          }
        }, 1000);
      })();
    </script>
  </body>
</html>`;
}

const ACTIVE_COMMAND_STATUSES = new Set(['new', 'claimed', 'executing']);
const TERMINAL_DECISION_STATUSES = new Set(['approved', 'resolved', 'archived', 'stopped']);
const TERMINAL_INBOX_STATUSES = new Set(['resolved', 'archived']);
const COMPLETED_BRIEF_STATUSES = new Set(['done', 'completed', 'archived']);
const COMPLETED_RUN_STATUSES = new Set(['completed']);
const COMPLETED_CHECKPOINT_STATUSES = new Set(['passed', 'completed']);
const GOVERNANCE_DIRECT_ARCHIVE_BRIEF_PATTERNS = new Set(['brief_only', 'brief_only_dormant']);
const GOVERNANCE_FOLDABLE_ARCHIVED_BRIEF_PATTERNS = new Set([
  'brief_only',
  'brief_only_dormant',
  'checkpoint_backed_brief',
]);
const STALE_ACTIVE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const STALE_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
const RESIDUAL_COMPLETED_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
const RESIDUAL_STALLED_TIMEOUT_MS = 21 * 24 * 60 * 60 * 1000;

function toEpochMs(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && numeric > 0) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
  }

  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatAgeLabel(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs <= 0) {
    return '刚刚';
  }

  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  if (hours < 24) {
    return `${Math.max(hours, 1)} 小时`;
  }

  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  if (days < 30) {
    return `${Math.max(days, 1)} 天`;
  }

  const months = Math.floor(days / 30);
  return `${Math.max(months, 1)} 个月`;
}

function latestRecord(items = []) {
  return [...items].sort((left, right) => {
    return (
      toEpochMs(right.updatedAt || right.createdAt || right.startedAt || right.completedAt) -
      toEpochMs(left.updatedAt || left.createdAt || left.startedAt || left.completedAt)
    );
  })[0] || null;
}

function summarizeTaskFlowCounts(task) {
  const counts = summarizeTaskFlowDetails(task);
  const pieces = [];
  if (counts.executionCommandCount > 0) {
    pieces.push(`${counts.executionCommandCount} 条命令`);
  }
  if (counts.collaborationHistoryCount > 0) {
    pieces.push(`${counts.collaborationHistoryCount} 条协同记录`);
  }
  if (counts.runCount > 0) {
    pieces.push(`${counts.runCount} 个 Run`);
  }
  if (counts.receiptCount > 0) {
    pieces.push(`${counts.receiptCount} 个回执`);
  }
  if (counts.checkpointCount > 0) {
    pieces.push(`${counts.checkpointCount} 个 Checkpoint`);
  }

  return pieces.join(' / ') || '尚未形成执行链';
}

function sortCommandsForTaskAttachment(commands = []) {
  return [...commands].sort((left, right) => {
    const leftRole = classifyTaskFlowCommandRole(left);
    const rightRole = classifyTaskFlowCommandRole(right);
    if (leftRole !== rightRole) {
      return leftRole === 'execution' ? -1 : 1;
    }

    return (
      toEpochMs(right.updatedAt || right.createdAt) - toEpochMs(left.updatedAt || left.createdAt) ||
      compact(left.commandId).localeCompare(compact(right.commandId), 'en')
    );
  });
}

function normalizeTone(signalLevel, executionStatus) {
  if (executionStatus === 'waiting_human' || signalLevel === 'red') {
    return 'red';
  }
  if (executionStatus === 'stalled' || signalLevel === 'yellow') {
    return 'yellow';
  }
  if (executionStatus === 'completed') {
    return 'green';
  }
  if (executionStatus === 'in_progress') {
    return 'blue';
  }
  return 'neutral';
}

function humanSignalLevel(signalLevel) {
  const raw = compact(signalLevel).toLowerCase();
  if (raw === 'red') return '红灯';
  if (raw === 'yellow') return '黄灯';
  if (raw === 'green') return '绿灯';
  return '未标记';
}

function humanTaskExecutionStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'waiting_human') return '等待许可';
  if (raw === 'stalled') return '待回看';
  if (raw === 'completed') return '已完成';
  return '系统处理中';
}

function chooseTaskTitle(kind, artifact) {
  if (artifact?.title) {
    return artifact.title;
  }

  if (artifact?.question) {
    return summarize(artifact.question, 72);
  }

  if (artifact?.instruction) {
    return summarize(artifact.instruction, 72);
  }

  if (artifact?.payload?.summary) {
    return summarize(artifact.payload.summary, 72);
  }

  if (artifact?.summary) {
    return summarize(artifact.summary, 72);
  }

  const rawKind = compact(kind);
  return rawKind ? `${humanizeToken(rawKind)} 任务` : '未命名任务';
}

function createTaskSeedFromBrief(brief, project) {
  const thread = deriveThreadIdentity(brief, project);
  return {
    taskId: brief.briefId,
    title: brief.title,
    summary: summarize(brief.what || brief.context || brief.why, 140),
    synthetic: false,
    brief,
    threadKey: thread.key,
    threadLabel: thread.label || brief.title,
    threadConcrete: thread.concrete,
    threadSourceKind: thread.sourceKind || null,
    threadSourceLabel: thread.sourceLabel || humanThreadIdentitySource(thread.key),
    commands: [],
    runs: [],
    decisions: [],
    checkpoints: [],
    inboxItems: [],
    suggestions: [],
    receipts: [],
    latestUpdatedAt: brief.updatedAt || brief.createdAt || null,
  };
}

function createSyntheticTaskSeed(kind, artifact, project, thread = deriveThreadIdentity(artifact, project)) {
  return {
    taskId: `${kind}:${artifact.briefId || artifact.commandId || artifact.runId || artifact.decisionId || artifact.itemId || artifact.suggestionId || artifact.receiptId || stableHash(JSON.stringify(artifact))}`,
    title: chooseTaskTitle(kind, artifact),
    summary: summarize(artifact.summary || artifact.instruction || artifact.question || artifact.reason || artifact.payload?.details || '', 140),
    synthetic: true,
    brief: null,
    threadKey: thread.key,
    threadLabel: thread.label || chooseTaskTitle(kind, artifact),
    threadConcrete: thread.concrete,
    threadSourceKind: thread.sourceKind || null,
    threadSourceLabel: thread.sourceLabel || humanThreadIdentitySource(thread.key),
    commands: [],
    runs: [],
    decisions: [],
    checkpoints: [],
    inboxItems: [],
    suggestions: [],
    receipts: [],
    latestUpdatedAt:
      artifact.updatedAt || artifact.createdAt || artifact.startedAt || artifact.completedAt || artifact.appliedAt || null,
  };
}

function touchTask(task, timestamp) {
  if (!timestamp) {
    return;
  }

  if (toEpochMs(timestamp) >= toEpochMs(task.latestUpdatedAt)) {
    task.latestUpdatedAt = timestamp;
  }
}

function attachArtifact(task, collectionKey, artifact, project, thread = deriveThreadIdentity(artifact, project)) {
  task[collectionKey].push(artifact);

  const currentSpecificity = threadSpecificity(task.threadKey);
  const nextSpecificity = threadSpecificity(thread.key);
  if (
    thread.concrete &&
    (!task.threadConcrete ||
      task.threadKey.startsWith('brief:') ||
      task.threadKey.startsWith('project:') ||
      nextSpecificity > currentSpecificity)
  ) {
    task.threadKey = thread.key;
    task.threadLabel = thread.label || task.threadLabel;
    task.threadConcrete = true;
    task.threadSourceKind = thread.sourceKind || task.threadSourceKind;
    task.threadSourceLabel = thread.sourceLabel || humanThreadIdentitySource(thread.key);
  } else if (!task.threadSourceLabel) {
    task.threadSourceKind = thread.sourceKind || task.threadSourceKind;
    task.threadSourceLabel = thread.sourceLabel || humanThreadIdentitySource(task.threadKey);
  }

  if (!task.title || task.synthetic) {
    task.title = task.title || chooseTaskTitle(collectionKey, artifact);
  }

  if (!task.summary) {
    task.summary = summarize(artifact.summary || artifact.instruction || artifact.question || artifact.reason || '', 140);
  }

  touchTask(task, artifact.updatedAt || artifact.createdAt || artifact.startedAt || artifact.completedAt || artifact.appliedAt);
}

function findTaskIndexByReference(tasks, matchers = []) {
  for (const matcher of matchers) {
    const index = matcher();
    if (Number.isInteger(index) && index >= 0) {
      return index;
    }
  }

  return -1;
}

function pickFallbackTaskIndex(tasks) {
  if (tasks.length === 0) {
    return -1;
  }

  const ranked = tasks
    .map((task, index) => ({
      task,
      index,
      score:
        (task.synthetic ? 0 : 5) +
        (task.brief && compact(task.brief.status).toLowerCase() === 'in_progress' ? 2 : 0) +
        (task.commands.some((command) => ACTIVE_COMMAND_STATUSES.has(compact(command.status).toLowerCase())) ? 1 : 0),
    }))
    .sort((left, right) => {
      return right.score - left.score || toEpochMs(right.task.latestUpdatedAt) - toEpochMs(left.task.latestUpdatedAt) || left.index - right.index;
    });

  return ranked[0]?.index ?? -1;
}

function pickBestTaskIndex(tasks, artifact, project, thread = deriveThreadIdentity(artifact, project)) {
  if (tasks.length === 0) {
    return -1;
  }

  let best = { index: -1, score: -1 };

  tasks.forEach((task, index) => {
    let score = 0;

    if (thread.key && task.threadKey === thread.key) {
      score += 6;
    }
    if (task.brief?.channelSessionId && artifact.channelSessionId && task.brief.channelSessionId === artifact.channelSessionId) {
      score += 5;
    }
    if (
      task.brief?.targetType &&
      artifact.targetType &&
      task.brief.targetType === artifact.targetType &&
      task.brief.targetId === artifact.targetId
    ) {
      score += 5;
    }
    if (task.brief?.sourceUrl && artifact.sourceUrl && task.brief.sourceUrl === artifact.sourceUrl) {
      score += 4;
    }
    if (task.brief?.source && artifact.source && task.brief.source === artifact.source) {
      score += 2;
    }

    if (score > best.score) {
      best = { index, score };
    }
  });

  if (best.score > 0) {
    return best.index;
  }

  if (!thread.concrete) {
    return pickFallbackTaskIndex(tasks);
  }

  return -1;
}

function summarizeTaskState(task, project, nowIso) {
  const openRedDecision = latestRecord(
    task.decisions.filter((decision) => {
      return compact(decision.signalLevel).toLowerCase() === 'red' && !TERMINAL_DECISION_STATUSES.has(compact(decision.status).toLowerCase());
    }),
  );
  const openYellowDecision = latestRecord(
    task.decisions.filter((decision) => {
      return compact(decision.signalLevel).toLowerCase() === 'yellow' && !TERMINAL_DECISION_STATUSES.has(compact(decision.status).toLowerCase());
    }),
  );
  const openGreenDecision = latestRecord(
    task.decisions.filter((decision) => compact(decision.signalLevel).toLowerCase() === 'green'),
  );
  const openRedInbox = latestRecord(
    task.inboxItems.filter((item) => compact(item.riskLevel).toLowerCase() === 'red' && !TERMINAL_INBOX_STATUSES.has(compact(item.status).toLowerCase())),
  );
  const openYellowInbox = latestRecord(
    task.inboxItems.filter((item) => compact(item.riskLevel).toLowerCase() === 'yellow' && !TERMINAL_INBOX_STATUSES.has(compact(item.status).toLowerCase())),
  );
  const activeCommand = latestRecord(
    task.commands.filter((command) => ACTIVE_COMMAND_STATUSES.has(compact(command.status).toLowerCase())),
  );
  const runningRun = latestRecord(task.runs.filter((run) => compact(run.status).toLowerCase() === 'running'));
  const latestRun = latestRecord(task.runs);
  const failedRun = latestRecord(task.runs.filter((run) => compact(run.status).toLowerCase() === 'failed'));
  const failedCommand = latestRecord(task.commands.filter((command) => compact(command.status).toLowerCase() === 'failed'));
  const failedReceipt = latestRecord(task.receipts.filter((receipt) => compact(receipt.status).toLowerCase() === 'failed'));
  const latestCheckpoint = latestRecord(task.checkpoints);
  const latestReceipt = latestRecord(task.receipts);
  const latestCommand = latestRecord(task.commands);
  const latestDecision = latestRecord(task.decisions);
  const hasTerminalCheckpoint = COMPLETED_CHECKPOINT_STATUSES.has(compact(latestCheckpoint?.status).toLowerCase());
  const hasTerminalDecision = TERMINAL_DECISION_STATUSES.has(compact(latestDecision?.status).toLowerCase());
  const hasCompletedRun = COMPLETED_RUN_STATUSES.has(compact(latestRun?.status).toLowerCase());

  const waitingHuman = Boolean(openRedDecision || openRedInbox);
  const hasYellowHold = Boolean(openYellowDecision || openYellowInbox);
  const hasFailure =
    task.commands.some((command) => compact(command.status).toLowerCase() === 'failed') ||
    task.runs.some((run) => compact(run.status).toLowerCase() === 'failed');
  const hasCompletionSignal =
    COMPLETED_BRIEF_STATUSES.has(compact(task.brief?.status).toLowerCase()) ||
    task.commands.some((command) => compact(command.status).toLowerCase() === 'done') ||
    task.receipts.some((receipt) => compact(receipt.status).toLowerCase() === 'completed') ||
    hasTerminalCheckpoint ||
    hasTerminalDecision ||
    hasCompletedRun;

  const isActive = Boolean(runningRun || (activeCommand && !hasTerminalCheckpoint));
  const latestActivityAt = toEpochMs(
    task.latestUpdatedAt ||
      latestCheckpoint?.updatedAt ||
      latestCheckpoint?.createdAt ||
      latestReceipt?.updatedAt ||
      latestReceipt?.createdAt ||
      latestRun?.updatedAt ||
      latestRun?.completedAt ||
      latestRun?.startedAt ||
      latestRun?.createdAt ||
      latestCommand?.updatedAt ||
      latestCommand?.createdAt ||
      latestDecision?.updatedAt ||
      latestDecision?.createdAt ||
      task.brief?.updatedAt ||
      task.brief?.createdAt,
  );
  const ageMs = toEpochMs(nowIso) - latestActivityAt;
  const staleActive = isActive && latestActivityAt > 0 && ageMs >= STALE_ACTIVE_TIMEOUT_MS;
  const staleDormant = !isActive && !hasCompletionSignal && latestActivityAt > 0 && ageMs >= STALE_IDLE_TIMEOUT_MS;
  const completed = !waitingHuman && !isActive && hasCompletionSignal && !hasYellowHold;
  const stalled = !waitingHuman && !completed && (hasYellowHold || hasFailure || staleActive || staleDormant);
  const executionStatus = waitingHuman ? 'waiting_human' : completed ? 'completed' : stalled ? 'stalled' : 'in_progress';
  const attentionBucket = completed ? 'completed' : waitingHuman ? 'waiting_human' : 'in_progress';
  const decisionSignal =
    openRedDecision || openRedInbox
      ? 'red'
      : openYellowDecision || openYellowInbox
        ? 'yellow'
        : openGreenDecision
          ? 'green'
          : compact(latestCheckpoint?.signalLevel).toLowerCase() || (completed ? 'green' : 'green');

  const nextStep =
    openRedDecision?.requestedHumanAction ||
    openRedInbox?.summary ||
    openYellowDecision?.requestedHumanAction ||
    openYellowInbox?.summary ||
    latestCheckpoint?.nextStep ||
    activeCommand?.instruction ||
    latestCommand?.resultSummary ||
    latestReceipt?.payload?.summary ||
    task.brief?.what ||
    task.summary ||
    '等待下一步动作';

  const staleAgeLabel = ageMs > 0 ? formatAgeLabel(ageMs) : null;
  const currentNode = openRedDecision
    ? `决策 · ${humanSignalLevel(openRedDecision.signalLevel)} / ${humanDecisionStatus(openRedDecision.status)}`
    : staleActive && runningRun
      ? `Run · 长时间未回执${runningRun.phase ? ` / ${humanizeToken(runningRun.phase)}` : ''}`
      : staleActive && activeCommand
        ? `命令 · 长时间未收口${activeCommand.parsedAction ? ` / ${humanizeToken(activeCommand.parsedAction)}` : ''}`
    : runningRun
      ? `Run · ${humanRunStatus(runningRun.status)}${runningRun.phase ? ` / ${humanizeToken(runningRun.phase)}` : ''}`
      : activeCommand
        ? `命令 · ${humanCommandStatus(activeCommand.status)}${activeCommand.parsedAction ? ` / ${humanizeToken(activeCommand.parsedAction)}` : ''}`
      : latestCheckpoint
        ? `Checkpoint · ${compact(latestCheckpoint.status) || '已记录'}${latestCheckpoint.stage ? ` / ${humanizeToken(latestCheckpoint.stage)}` : ''}`
        : latestRun
          ? `Run · ${humanRunStatus(latestRun.status)}${latestRun.phase ? ` / ${humanizeToken(latestRun.phase)}` : ''}`
          : latestCommand
            ? `命令 · ${humanCommandStatus(latestCommand.status)}${latestCommand.parsedAction ? ` / ${humanizeToken(latestCommand.parsedAction)}` : ''}`
            : latestReceipt
              ? `回执 · ${humanReceiptStatus(latestReceipt.status)}`
            : latestDecision
              ? `决策 · ${humanSignalLevel(latestDecision.signalLevel || decisionSignal)} / ${humanDecisionStatus(latestDecision.status)}`
              : task.brief
                ? `任务简报 · ${humanBriefStatus(task.brief.status)}`
                : '尚未形成可见执行节点';

  const flowCounts = summarizeTaskFlowDetails(task);
  const executionProof = summarizeTaskFlowCounts(task);
  const latestReceiptLabel = latestReceipt ? `${humanReceiptStatus(latestReceipt.status)} · ${formatIso(latestReceipt.createdAt)}` : null;
  const latestReceiptSummary = summarize(
    latestReceipt?.payload?.summary || latestReceipt?.payload?.details || latestReceipt?.target || '',
    140,
  );
  const latestCheckpointSummary = summarize(
    latestCheckpoint?.summary || latestCheckpoint?.nextStep || latestCheckpoint?.title || '',
    140,
  );

  const statusNote = waitingHuman
    ? '红灯已挂起，等待你拍板后继续。'
    : stalled && staleActive
      ? `这条执行链已经 ${staleAgeLabel || '较长时间'} 没有新回执，系统先把它降为待回看。`
      : stalled && staleDormant
        ? `这条任务已经 ${staleAgeLabel || '较长时间'} 没有新动作，系统先把它降为待回看。`
    : stalled
      ? '系统已绕行，后续需要回看这个任务。'
      : completed
        ? '执行链路已收口，可以进入回看或沉淀。'
        : hasYellowHold
        ? '黄灯已记录，系统正在继续推进其余安全步骤。'
        : '当前没有红灯阻塞，Agent 正在继续推进。';

  const blockerReasonRaw = waitingHuman
    ? openRedDecision?.question ||
      openRedInbox?.title ||
      openRedInbox?.summary ||
      openRedDecision?.context ||
      openRedDecision?.recommendation ||
      ''
    : stalled && staleActive
      ? `最近 ${staleAgeLabel || '较长时间'} 没有新的 run / receipt / checkpoint 更新。`
      : stalled && staleDormant
        ? `最近 ${staleAgeLabel || '较长时间'} 没有新的 brief / command / checkpoint 更新。`
    : stalled
      ? openYellowDecision?.question ||
        openYellowInbox?.title ||
        openYellowInbox?.summary ||
        failedRun?.summary ||
        failedCommand?.resultSummary ||
        failedCommand?.instruction ||
        failedReceipt?.payload?.summary ||
        failedReceipt?.payload?.details ||
        latestCheckpoint?.summary ||
        ''
      : '';
  const blockerReason = blockerReasonRaw ? summarize(blockerReasonRaw, 140) : null;
  const recommendedAction = waitingHuman
    ? summarize(nextStep, 140)
    : stalled && (staleActive || staleDormant)
      ? '回看最近一次评论或 checkpoint，决定继续执行、重试，还是把它归档成历史线程。'
      : stalled
        ? summarize(nextStep, 140)
        : null;

  const ownerAgent =
    runningRun?.agentName ||
    activeCommand?.ownerAgent ||
    latestCommand?.ownerAgent ||
    openRedDecision?.ownerAgent ||
    openYellowDecision?.ownerAgent ||
    task.brief?.ownerAgent ||
    null;

  const primaryLink =
    openRedDecision?.sourceUrl ||
    activeCommand?.sourceUrl ||
    latestCommand?.sourceUrl ||
    openRedInbox?.sourceUrl ||
    openYellowInbox?.sourceUrl ||
    task.brief?.sourceUrl ||
    null;

  return {
    task_id: task.taskId,
    taskId: task.taskId,
    brief_id: task.brief?.briefId || null,
    briefId: task.brief?.briefId || null,
    brief_status: task.brief?.status || null,
    briefStatus: task.brief?.status || null,
    title: task.title,
    summary: task.summary || summarize(task.brief?.context || task.brief?.why || task.brief?.what || '', 140),
    thread_key: task.threadKey,
    threadKey: task.threadKey,
    thread_label: task.threadLabel,
    threadLabel: task.threadLabel,
    thread_source_kind: task.threadSourceKind || null,
    threadSourceKind: task.threadSourceKind || null,
    thread_source_label: task.threadSourceLabel || humanThreadIdentitySource(task.threadKey),
    threadSourceLabel: task.threadSourceLabel || humanThreadIdentitySource(task.threadKey),
    decision_signal: decisionSignal,
    decisionSignal,
    execution_status: executionStatus,
    executionStatus,
    attention_bucket: attentionBucket,
    attentionBucket,
    owner_agent: ownerAgent,
    ownerAgent,
    current_node: currentNode,
    currentNode,
    execution_proof: executionProof,
    executionProof,
    execution_command_count: flowCounts.executionCommandCount,
    executionCommandCount: flowCounts.executionCommandCount,
    collaboration_history_count: flowCounts.collaborationHistoryCount,
    collaborationHistoryCount: flowCounts.collaborationHistoryCount,
    collaboration_history_summary: flowCounts.collaborationHistorySummary || null,
    collaborationHistorySummary: flowCounts.collaborationHistorySummary || null,
    latest_receipt_label: latestReceiptLabel,
    latestReceiptLabel,
    latest_receipt_summary: latestReceiptSummary || null,
    latestReceiptSummary: latestReceiptSummary || null,
    latest_checkpoint_summary: latestCheckpointSummary || null,
    latestCheckpointSummary: latestCheckpointSummary || null,
    blocker_reason: blockerReason,
    blockerReason,
    recommended_action: recommendedAction,
    recommendedAction,
    next_step: summarize(nextStep, 140),
    nextStep: summarize(nextStep, 140),
    status_note: statusNote,
    statusNote,
    last_checkpoint_at: latestCheckpoint?.updatedAt || latestCheckpoint?.createdAt || null,
    lastCheckpointAt: latestCheckpoint?.updatedAt || latestCheckpoint?.createdAt || null,
    latest_updated_at:
      latestCheckpoint?.updatedAt ||
      latestCheckpoint?.createdAt ||
      runningRun?.updatedAt ||
      activeCommand?.updatedAt ||
      latestCommand?.updatedAt ||
      latestReceipt?.createdAt ||
      task.latestUpdatedAt ||
      null,
    latestUpdatedAt:
      latestCheckpoint?.updatedAt ||
      latestCheckpoint?.createdAt ||
      runningRun?.updatedAt ||
      activeCommand?.updatedAt ||
      latestCommand?.updatedAt ||
      latestReceipt?.createdAt ||
      task.latestUpdatedAt ||
      null,
    command_count: task.commands.length,
    commandCount: task.commands.length,
    run_count: task.runs.length,
    runCount: task.runs.length,
    receipt_count: task.receipts.length,
    receiptCount: task.receipts.length,
    command_ids: task.commands.map((command) => command.commandId).filter(Boolean),
    commandIds: task.commands.map((command) => command.commandId).filter(Boolean),
    run_ids: task.runs.map((run) => run.runId).filter(Boolean),
    runIds: task.runs.map((run) => run.runId).filter(Boolean),
    decision_ids: task.decisions.map((decision) => decision.decisionId).filter(Boolean),
    decisionIds: task.decisions.map((decision) => decision.decisionId).filter(Boolean),
    checkpoint_ids: task.checkpoints.map((checkpoint) => checkpoint.checkpointId).filter(Boolean),
    checkpointIds: task.checkpoints.map((checkpoint) => checkpoint.checkpointId).filter(Boolean),
    receipt_ids: task.receipts.map((receipt) => receipt.receiptId).filter(Boolean),
    receiptIds: task.receipts.map((receipt) => receipt.receiptId).filter(Boolean),
    inbox_item_ids: task.inboxItems.map((item) => item.itemId).filter(Boolean),
    inboxItemIds: task.inboxItems.map((item) => item.itemId).filter(Boolean),
    suggestion_ids: task.suggestions.map((suggestion) => suggestion.suggestionId).filter(Boolean),
    suggestionIds: task.suggestions.map((suggestion) => suggestion.suggestionId).filter(Boolean),
    waiting_human: waitingHuman,
    waitingHuman,
    stalled,
    synthetic: task.synthetic,
    tone: normalizeTone(decisionSignal, executionStatus),
    primary_link: primaryLink,
    primaryLink,
    thread_href: `/workspace/threads/${encodeURIComponent(task.threadKey)}?project_id=${encodeURIComponent(project.projectId)}&document_id=execution`,
    threadHref: `/workspace/threads/${encodeURIComponent(task.threadKey)}?project_id=${encodeURIComponent(project.projectId)}&document_id=execution`,
  };
}

function renderWorkspaceTaskCard(task) {
  const nextStepLabel = task.recommended_action ? '推荐动作' : '下一步';
  const compactMeta = [
    task.owner_agent ? `负责人 ${task.owner_agent}` : null,
    task.latest_updated_at ? `更新 ${formatIso(task.latest_updated_at)}` : null,
    task.thread_label ? `线程 ${summarize(task.thread_label, 28)}` : null,
  ].filter(Boolean);
  const detailMeta = [
    ...buildChecklistMetaEntries(task, { includeStep: false, includeProgress: true }),
    task.thread_label ? `线程：${task.thread_label}` : null,
    task.thread_source_label ? `线程来源：${task.thread_source_label}` : null,
    task.thread_task_count > 1 ? `同线程任务：${task.thread_task_count}` : null,
    task.merged_task_count > 1 ? `已合并相近卡：${task.merged_task_count}` : null,
    task.owner_agent ? `负责人：${task.owner_agent}` : null,
    task.last_checkpoint_at ? `最近 checkpoint：${formatIso(task.last_checkpoint_at)}` : null,
    task.latest_updated_at ? `最近更新：${formatIso(task.latest_updated_at)}` : null,
  ].filter(Boolean);
  const taskStatusLabel =
    task.execution_status === 'waiting_human'
      ? '需要你拍板'
      : task.execution_status === 'completed'
        ? '已完成'
        : task.decision_signal === 'yellow' || task.execution_status === 'stalled'
          ? '黄灯待回看'
          : '执行中';
  const bodyBlocks = renderWorkspaceCardBodyBlocks({
    context: 'workspace-task-card',
    record: task,
    relationOptions: { className: 'workspace-next-step workspace-focus-callout' },
    guidanceOptions: { className: 'workspace-next-step' },
    middleHtml: `
      <div class="workspace-proof-grid">
        ${
          task.blocker_reason
            ? `
              <div class="workspace-proof-item">
                <strong>卡点原因</strong>
                <span>${escapeHtml(task.blocker_reason)}</span>
              </div>
            `
            : ''
        }
        <div class="workspace-proof-item">
          <strong>当前节点</strong>
          <span>${escapeHtml(task.current_node || '尚未形成可见执行节点')}</span>
        </div>
        <div class="workspace-proof-item">
          <strong>执行链</strong>
          <span>${escapeHtml(task.execution_proof || '尚未形成执行链')}</span>
        </div>
        ${
          task.latest_receipt_label
            ? `
              <div class="workspace-proof-item">
                <strong>最近回执</strong>
                <span>${escapeHtml(task.latest_receipt_label)}</span>
              </div>
            `
            : ''
        }
        ${
          task.latest_receipt_summary
            ? `
              <div class="workspace-proof-item">
                <strong>回执摘要</strong>
                <span>${escapeHtml(task.latest_receipt_summary)}</span>
              </div>
            `
            : task.latest_checkpoint_summary
              ? `
                <div class="workspace-proof-item">
                  <strong>Checkpoint 摘要</strong>
                  <span>${escapeHtml(task.latest_checkpoint_summary)}</span>
                </div>
              `
              : ''
        }
      </div>
      <div class="workspace-next-step">
        <strong>${escapeHtml(nextStepLabel)}</strong>
        <span>${escapeHtml(task.recommended_action || task.next_step)}</span>
      </div>
    `,
    middleAttributes: {
      'data-workspace-card-body-middle': 'workspace-task-details',
    },
  });

  return `
    <article class="workspace-task-card tone-${escapeHtml(task.tone)}" data-workspace-task-card>
      <div class="workspace-task-top">
        <div class="workspace-badges">
          <span class="workspace-badge signal-${escapeHtml(task.decision_signal)}">${escapeHtml(humanSignalLevel(task.decision_signal))}</span>
          <span class="workspace-status">${escapeHtml(taskStatusLabel)}</span>
          ${
            task.checklist_focus_label
              ? `<span class="workspace-status workspace-status-focus">${escapeHtml(task.checklist_focus_label)}</span>`
              : ''
          }
          ${
            task.checklist_step_label
              ? `<span class="workspace-status workspace-status-step">${escapeHtml(task.checklist_step_label)}</span>`
              : ''
          }
        </div>
        <span class="workspace-thread-id">${escapeHtml(task.thread_key)}</span>
      </div>
      <h3>${escapeHtml(task.title || '未命名任务')}</h3>
      <p class="workspace-task-summary">${escapeHtml(summarize(task.summary || task.status_note || '暂无任务摘要', 90))}</p>
      <div class="workspace-next-step workspace-next-step-primary">
        <strong>${escapeHtml(nextStepLabel)}</strong>
        <span>${escapeHtml(summarize(task.recommended_action || task.next_step, 110))}</span>
      </div>
      ${
        compactMeta.length > 0
          ? `<div class="workspace-compact-meta">${compactMeta.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
          : ''
      }
      <details class="workspace-task-details">
        <summary>证据和上下文</summary>
        <p class="workspace-task-note">${escapeHtml(task.status_note)}</p>
        ${bodyBlocks}
        <ul class="task-meta">
          ${detailMeta.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </details>
      <div class="workspace-links">
        <a class="task-link" href="${escapeHtml(task.thread_href || task.threadHref || '#')}">进入现场</a>
        ${
          task.primary_link
            ? `<a class="task-link" href="${escapeHtml(task.primary_link)}" target="_blank" rel="noreferrer">源位置</a>`
            : ''
        }
      </div>
    </article>
  `;
}

function renderWorkspaceTaskList(tasks = [], emptyText = '当前没有任务。') {
  if (tasks.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  }

  return tasks.map((task) => renderWorkspaceTaskCard(task)).join('');
}

function renderThreadGroupHeadline(group = {}, labelMap = {}) {
  const threadLabel = compact(group.thread_label || group.threadLabel || group.thread_key || group.threadKey);
  const threadKey = compact(group.thread_key || group.threadKey);
  const updatedAt = group.latest_updated_at || group.latestUpdatedAt || null;
  const overviewSummary = compact(group.overview_summary || group.overviewSummary);
  const filterNote = buildThreadGroupFilterNote(group, labelMap);

  return `
    <div data-thread-group-copy>
      <h3 data-thread-group-title>${escapeHtml(threadLabel || '未命名线程')}</h3>
      <p data-thread-group-meta>
        <span data-thread-group-key>${escapeHtml(threadKey)}</span>
        <span data-thread-group-updated>${escapeHtml(`最近更新 ${formatIso(updatedAt)}`)}</span>
      </p>
      <p class="section-note" data-thread-group-filter-note>${escapeHtml(filterNote)}</p>
      ${
        overviewSummary
          ? `<p class="section-note" data-thread-group-overview>${escapeHtml(overviewSummary)}</p>`
          : ''
      }
    </div>
  `;
}

function buildThreadGroupStatItems(group = {}) {
  const items = [];
  const checklistFocusLabel = compact(group.checklist_focus_label || group.checklistFocusLabel);
  const checklistStepLabel = compact(group.checklist_step_label || group.checklistStepLabel);

  if (checklistFocusLabel) {
    items.push({ key: 'focus', label: checklistFocusLabel });
  }
  if (checklistStepLabel) {
    items.push({ key: 'step', label: checklistStepLabel });
  }

  items.push({ key: 'tasks', label: `${Number(group.task_count || 0)} 个任务` });
  items.push({ key: 'active', label: `${Number(group.in_progress_count || 0)} 个处理中` });
  items.push({ key: 'completed', label: `${Number(group.completed_count || 0)} 个已完成` });
  items.push({ key: 'red', label: `${Number(group.red_count || 0)} 个红灯` });

  if (Number(group.comment_triage_count || 0) > 0) {
    items.push({ key: 'triage', label: `${Number(group.comment_triage_count || 0)} 条待分流评论` });
  }
  if (Number(group.comment_ready_count || 0) > 0) {
    items.push({ key: 'ready', label: `${Number(group.comment_ready_count || 0)} 条已接回执行` });
  }

  return items;
}

function renderThreadGroupStats(group = {}) {
  const items = buildThreadGroupStatItems(group);
  if (items.length === 0) {
    return '';
  }

  return `
    <div class="thread-group-stats" data-thread-group-stats>
      ${items
        .map(
          (item) =>
            `<span class="thread-stat"${renderHtmlAttributeString({
              'data-thread-group-stat': item.key,
            })}>${escapeHtml(item.label)}</span>`,
        )
        .join('')}
    </div>
  `;
}

function renderThreadGroupDetails(group = {}) {
  return `
    <div class="thread-task-list" data-thread-group-task-list>
      ${renderWorkspaceTaskList(Array.isArray(group.tasks) ? group.tasks : [], '这个线程下还没有任务。')}
    </div>
  `;
}

function buildThreadGroupFilterKeys(group = {}) {
  return [
    'all',
    Number(group.comment_triage_count || group.commentTriageCount || 0) > 0 ? 'triage' : '',
    Number(group.comment_ready_count || group.commentReadyCount || 0) > 0 ? 'ready' : '',
    Number(group.red_count || group.redCount || 0) > 0 ? 'red' : '',
    Number(group.in_progress_count || group.inProgressCount || 0) > 0 ? 'active' : '',
    Number(group.completed_count || group.completedCount || 0) > 0 ? 'completed' : '',
  ].filter(Boolean);
}

function normalizeThreadGroupFilterKeys(filters = []) {
  const items = Array.isArray(filters)
    ? filters
    : String(filters || '')
        .split(/\s+/)
        .filter(Boolean);
  const normalizedItems = items
    .map((item) => normalizeWorkspaceThreadFilter(item))
    .filter(Boolean);
  return Array.from(new Set(normalizedItems.length > 0 ? normalizedItems : ['all']));
}

function buildThreadGroupVisibilityState(groupOrFilters = [], filter = 'all') {
  const normalizedFilter = normalizeWorkspaceThreadFilter(filter);
  const filterKeys =
    groupOrFilters && typeof groupOrFilters === 'object' && !Array.isArray(groupOrFilters)
      ? buildThreadGroupFilterKeys(groupOrFilters)
      : normalizeThreadGroupFilterKeys(groupOrFilters);
  const visible = normalizedFilter === 'all' || filterKeys.includes(normalizedFilter);

  return {
    filter: normalizedFilter,
    filterKeys,
    visible,
    visibility: visible ? 'visible' : 'hidden',
  };
}

function buildThreadFilterState(filters = [], activeFilter = 'all', visibleCount = null) {
  const items = Array.isArray(filters) ? filters : [];
  const normalizedFilter = normalizeWorkspaceThreadFilter(activeFilter);
  const fallback = items.find((filter) => compact(filter?.key) === 'all') || items[0] || {};
  const matched = items.find((filter) => compact(filter?.key) === normalizedFilter) || fallback;
  const resolvedCount =
    visibleCount === null || visibleCount === undefined || visibleCount === ''
      ? Number(matched?.count || 0)
      : Number(visibleCount || 0);

  return {
    key: compact(matched?.key) || normalizedFilter || 'all',
    label: compact(matched?.label) || '全部',
    count: Number.isFinite(resolvedCount) ? resolvedCount : 0,
  };
}

function buildThreadFilterEmptyCopy(filterState = {}) {
  const state = filterState && typeof filterState === 'object' ? filterState : {};
  const label = compact(state.label) || '全部';
  if (label === '全部') {
    return '当前还没有可展示的线程分组。';
  }
  return `当前筛选下没有${label}线程，试试切回“全部”或其他状态。`;
}

function renderThreadPanelHead(filterState = {}) {
  const state = filterState && typeof filterState === 'object' ? filterState : {};
  const label = compact(state.label) || '全部';
  const count = Number(state.count || 0);

  return `
    <div class="panel-head" data-thread-panel-head>
      <div>
        <h2 data-thread-panel-title>按线程</h2>
        <p data-thread-panel-note>同一条协作线程下拆了哪些任务、哪些在跑、哪些已经红灯卡住。</p>
      </div>
      <div class="thread-filter-summary" data-thread-filter-summary>
        <strong data-thread-filter-summary-label>${escapeHtml(`当前筛选：${label}`)}</strong>
        <span data-thread-filter-summary-count>${escapeHtml(`${count} 条线程`)}</span>
      </div>
    </div>
  `;
}

function renderThreadFilterEmptyState(filterState = {}, hidden = true, copyOverride = '') {
  const state = filterState && typeof filterState === 'object' ? filterState : {};
  const label = compact(state.label) || '全部';
  const count = Number(state.count || 0);
  const copy = compact(copyOverride) || buildThreadFilterEmptyCopy(state);

  return `
    <div class="empty-state" data-thread-filter-empty${hidden ? ' hidden' : ''}>
      <strong data-thread-filter-empty-label>${escapeHtml(`当前筛选：${label}`)}</strong>
      <span data-thread-filter-empty-count>${escapeHtml(`${count} 条线程`)}</span>
      <p data-thread-filter-empty-copy>${escapeHtml(copy)}</p>
    </div>
  `;
}

function renderThreadFilterBar(filters = [], activeFilter = 'all') {
  const items = Array.isArray(filters) ? filters : [];
  if (items.length === 0) {
    return '';
  }

  return `
    <div class="thread-filter-bar" role="tablist" aria-label="线程筛选" data-thread-filter-bar>
      ${items
        .map((filter) => {
          const key = compact(filter?.key);
          const label = compact(filter?.label) || key || '筛选';
          const count = Number(filter?.count || 0);
          const isActive = key === activeFilter;
          return `
            <button
              class="thread-filter-button${isActive ? ' is-active' : ''}"
              type="button"
              data-thread-filter="${escapeHtml(key || 'all')}"
              data-thread-filter-option
              data-thread-filter-state="${escapeHtml(isActive ? 'active' : 'inactive')}"
            >
              <span data-thread-filter-label>${escapeHtml(label)}</span>
              <span aria-hidden="true"> · </span>
              <span data-thread-filter-count>${escapeHtml(String(count))}</span>
            </button>
          `;
        })
        .join('')}
    </div>
  `;
}

function buildWorkspaceDecisionFocusTaskItem(task, toneOverride = null) {
  const decisionSignal = compact(task.decision_signal || task.decisionSignal).toLowerCase() || 'yellow';
  const tone = toneOverride || (decisionSignal === 'red' ? 'red' : decisionSignal === 'yellow' ? 'yellow' : 'blue');
  const blockerReason = compact(task.blocker_reason || task.blockerReason);
  const recommendedAction = compact(task.recommended_action || task.recommendedAction || task.next_step || task.nextStep);
  const checklistFocusLabel = compact(task.checklist_focus_label || task.checklistFocusLabel);
  const checklistFocusNote = compact(task.checklist_focus_note || task.checklistFocusNote);
  const checklistStepLabel = compact(task.checklist_step_label || task.checklistStepLabel);
  const checklistStepTitle = compact(task.checklist_step_title || task.checklistStepTitle);
  const checklistProgressLabel = compact(task.checklist_progress_label || task.checklistProgressLabel);
  const checklistProgressNote = compact(task.checklist_progress_note || task.checklistProgressNote);
  const checklistProgressSummary = compact(task.checklist_progress_summary || task.checklistProgressSummary);
  const checklistAcceptance = readChecklistAcceptance(task);
  const checklistCheckpointRule = readChecklistCheckpointRule(task);
  const currentNode = compact(task.current_node || task.currentNode);
  const executionProof = compact(task.execution_proof || task.executionProof);
  const threadKey = compact(task.thread_key || task.threadKey);
  const decisionId = pickPrimaryDecisionId(task);
  const meta = [
    ...buildChecklistMetaEntries(task, { includeStep: false, includeProgress: true }),
    task.thread_label ? `线程：${task.thread_label}` : null,
    task.thread_source_label ? `来源：${task.thread_source_label}` : null,
    currentNode ? `当前节点：${currentNode}` : null,
    executionProof ? `执行链：${executionProof}` : null,
    task.latest_updated_at ? `最近更新：${formatIso(task.latest_updated_at)}` : null,
  ].filter(Boolean);

  return {
    id: task.task_id || task.thread_key || task.title,
    type: 'task',
    tone,
    badge: decisionSignal === 'red' ? '红灯待拍板' : '黄灯绕行中',
    title: task.title || '未命名任务',
    summary: task.summary || task.status_note || '暂无补充说明',
    blockerReason,
    actionLabel: decisionSignal === 'red' ? '建议拍板' : '建议下一跳',
    actionValue: recommendedAction,
    meta,
    currentNode,
    executionProof,
    threadSourceLabel: compact(task.thread_source_label || task.threadSourceLabel),
    focusLabel: checklistFocusLabel,
    focusNote: checklistFocusNote,
    focusStepLabel: checklistStepLabel,
    focusStepTitle: checklistStepTitle,
    progressLabel: checklistProgressLabel,
    progressNote: checklistProgressNote,
    checklistProgressSummary,
    checklistAcceptance,
    checklistCheckpointRule,
    threadKey,
    decisionId,
    actionable: Boolean(threadKey && decisionId),
    href: task.thread_href || task.threadHref || null,
    hrefLabel: decisionSignal === 'red' ? '进入拍板现场' : '进入执行现场',
    sourceHref: task.primary_link || task.primaryLink || null,
  };
}

function buildWorkspaceDecisionFocusMemoryItem(card) {
  const checklistAcceptance = readChecklistAcceptance(card);
  const checklistCheckpointRule = readChecklistCheckpointRule(card);
  return {
    id: card.id,
    type: 'memory',
    tone: card.tone || 'yellow',
    badge: '记忆候选',
    currentNode: '记忆候选',
    title: card.title || '未命名记忆候选',
    summary: card.summary || '等待 review 判断是否升为 durable memory。',
    blockerReason: null,
    actionLabel: '下一步',
    actionValue: '进入 review，决定 accept / reject / needs_followup。',
    meta: [
      ...buildChecklistMetaEntries(card, { includeStep: false, includeProgress: true }),
      ...(Array.isArray(card.meta) ? card.meta : []),
    ],
    focusLabel: compact(card.focusLabel),
    focusNote: compact(card.focusNote),
    focusStepLabel: compact(card.checklist_step_label || card.checklistStepLabel),
    focusStepTitle: compact(card.checklist_step_title || card.checklistStepTitle),
    progressLabel: compact(card.checklist_progress_label || card.checklistProgressLabel),
    progressNote: compact(card.checklist_progress_note || card.checklistProgressNote),
    checklistProgressSummary: compact(card.checklist_progress_summary || card.checklistProgressSummary),
    checklistAcceptance,
    checklistCheckpointRule,
    href: card.link || null,
    hrefLabel: card.link ? '打开候选来源' : null,
    sourceHref: null,
  };
}

function renderWorkspaceDecisionFocusList(items = [], emptyText = '当前没有事项。') {
  if (items.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  }

  return items
    .map((item) => ({
      item,
      bodyBlocks: renderHomeCardBodyBlocks({
        context: 'decision-focus-card',
        record: item,
        middleHtml: [
          item.blockerReason
            ? renderHomeCardCallout('卡点原因', item.blockerReason, {
                attributes: { 'data-home-card-callout': 'blocker-reason' },
              })
            : '',
          item.actionValue
            ? renderHomeCardCallout(item.actionLabel || '下一步', item.actionValue, {
                attributes: { 'data-home-card-callout': 'next-action' },
              })
            : '',
        ]
          .filter(Boolean)
          .join(''),
        middleAttributes: {
          'data-home-card-body-middle': 'decision-focus-details',
        },
      }),
    }))
    .map(
      ({ item, bodyBlocks }) => `
        <article
          class="decision-focus-card tone-${escapeHtml(item.tone || 'neutral')}"
          data-home-decision-focus-card
          data-home-card-kind="${escapeHtml(item.type || 'task')}"
        >
          <div class="task-card-top">
            <span class="task-badge">${escapeHtml(item.badge || item.type || '事项')}</span>
            <span class="task-kind">${escapeHtml(item.type === 'memory' ? 'memory' : 'task')}</span>
          </div>
          <h3>${escapeHtml(item.title || '未命名事项')}</h3>
          <p>${escapeHtml(item.summary || '暂无补充说明')}</p>
          ${bodyBlocks}
          <ul class="task-meta">
            ${(item.meta || []).map((meta) => `<li>${escapeHtml(meta)}</li>`).join('')}
          </ul>
          ${
            item.actionable
              ? `
                <div
                  class="workspace-inline-action-box"
                  data-home-decision-box
                  data-home-inline-action-box="decision"
                >
                  <strong>首页直达动作</strong>
                  <textarea
                    class="workspace-inline-note"
                    data-home-decision-note
                    data-home-inline-action-note="decision"
                    placeholder="可选：补一句拍板说明，会一起记进这条决策记录。"
                  ></textarea>
                  <div class="workspace-inline-actions" data-home-inline-action-list="decision">
                    <button
                      type="button"
                      class="governance-action-button"
                      data-home-decision-action="approved"
                      data-home-inline-action-button="approved"
                      data-decision-id="${escapeHtml(item.decisionId)}"
                      data-thread-key="${escapeHtml(item.threadKey)}"
                    >
                      允许继续
                    </button>
                    <button
                      type="button"
                      class="governance-action-button"
                      data-home-decision-action="changes_requested"
                      data-home-inline-action-button="changes_requested"
                      data-decision-id="${escapeHtml(item.decisionId)}"
                      data-thread-key="${escapeHtml(item.threadKey)}"
                    >
                      要求修改
                    </button>
                    <button
                      type="button"
                      class="governance-action-button"
                      data-home-decision-action="retry_requested"
                      data-home-inline-action-button="retry_requested"
                      data-decision-id="${escapeHtml(item.decisionId)}"
                      data-thread-key="${escapeHtml(item.threadKey)}"
                    >
                      要求重跑
                    </button>
                    <button
                      type="button"
                      class="governance-action-button"
                      data-home-decision-action="stopped"
                      data-home-inline-action-button="stopped"
                      data-decision-id="${escapeHtml(item.decisionId)}"
                      data-thread-key="${escapeHtml(item.threadKey)}"
                    >
                      停止任务
                    </button>
                  </div>
                </div>
              `
              : ''
          }
          <div class="workspace-links">
            ${
              item.href && item.hrefLabel
                ? `<a class="task-link" href="${escapeHtml(item.href)}">${escapeHtml(item.hrefLabel)}</a>`
                : ''
            }
            ${
              item.sourceHref
                ? `<a class="task-link" href="${escapeHtml(item.sourceHref)}" target="_blank" rel="noreferrer">打开源位置</a>`
                : ''
            }
          </div>
        </article>
      `,
    )
    .join('');
}

function buildWorkspaceDecisionFocus(projectId, attentionView = {}, dashboard = {}, workspaceContext = {}) {
  const waitingHuman = Array.isArray(attentionView.waiting_human) ? attentionView.waiting_human : [];
  const inProgress = Array.isArray(attentionView.in_progress) ? attentionView.in_progress : [];
  const redTasks = waitingHuman.filter(
    (task) => compact(task.decision_signal || task.decisionSignal).toLowerCase() === 'red',
  );
  const yellowTasks = inProgress.filter(
    (task) => compact(task.decision_signal || task.decisionSignal).toLowerCase() === 'yellow',
  );
  const memoryCards =
    dashboard.sections?.memory_candidates ||
    dashboard.sections?.memoryCandidates ||
    [];
  const focusTask = redTasks[0] || yellowTasks[0] || null;
  const focusHref =
    focusTask?.thread_href ||
    focusTask?.threadHref ||
    `${buildWorkspacePath(projectId, { ...workspaceContext, view: 'attention' })}#attention-view`;

  let summary = '当前没有红灯或黄灯决策，系统主要在按既定路径继续推进。';
  if (redTasks.length > 0) {
    summary = `当前有 ${redTasks.length} 条红灯待拍板；黄灯 ${yellowTasks.length} 条仍在系统绕行，避免把所有不确定性都打断到你这里。`;
  } else if (yellowTasks.length > 0) {
    summary = `当前没有红灯，黄灯 ${yellowTasks.length} 条仍在系统处理中；首页会优先告诉你它们为什么绕行、下一步准备怎么回流。`;
  } else if (memoryCards.length > 0) {
    summary = `当前没有阻塞性决策，但还有 ${memoryCards.length} 条记忆候选待 review，可在 checkpoint 后继续沉淀。`;
  }

  const redItems = redTasks.slice(0, 4).map((task) => buildWorkspaceDecisionFocusTaskItem(task, 'red'));
  const yellowItems = yellowTasks.slice(0, 4).map((task) => buildWorkspaceDecisionFocusTaskItem(task, 'yellow'));
  const memoryCandidates = memoryCards.slice(0, 4).map((card) => buildWorkspaceDecisionFocusMemoryItem(card));
  const checklistSummary = buildCenterChecklistSummary([...redItems, ...yellowItems, ...memoryCandidates], dashboard.executionChecklist || null);
  const focusGuidance = buildHomeDecisionCenterGuidance({
    redItems,
    yellowItems,
    memoryCandidates,
    focusReason:
      focusTask?.blocker_reason ||
      focusTask?.blockerReason ||
      focusTask?.recommended_action ||
      focusTask?.recommendedAction ||
      focusTask?.status_note ||
      focusTask?.statusNote ||
      null,
  });

  return {
    title: '决策中枢',
    summary,
    focusHeadline: focusTask ? `当前最该先看的，是「${focusTask.title || '未命名任务'}」` : '当前没有需要优先拍板的任务',
    focusReason:
      focusTask?.blocker_reason ||
      focusTask?.blockerReason ||
      focusTask?.recommended_action ||
      focusTask?.recommendedAction ||
      focusTask?.status_note ||
      focusTask?.statusNote ||
      null,
    focusHref,
    focusLinkLabel: focusTask ? '打开当前决策现场' : '回到注意力总览',
    focusGuidance,
    ...checklistSummary,
    redItems,
    yellowItems,
    memoryCandidates,
    counts: {
      red: redTasks.length,
      yellow: yellowTasks.length,
      memory: memoryCards.length,
    },
  };
}

function buildWorkspaceCommentWorkflowThreadItem(group, projectId, workspaceContext = {}, mode = 'triage') {
  const primaryTask = Array.isArray(group.tasks) ? group.tasks[0] || null : null;
  const isTriage = mode === 'triage';
  const commentCount = Number(
    isTriage ? group.comment_triage_count || group.commentTriageCount || 0 : group.comment_ready_count || group.commentReadyCount || 0,
  );
  const checklistFocusLabel = compact(group.checklist_focus_label || group.checklistFocusLabel);
  const checklistFocusNote = compact(group.checklist_focus_note || group.checklistFocusNote);
  const checklistStepLabel = compact(group.checklist_step_label || group.checklistStepLabel);
  const checklistStepTitle = compact(group.checklist_step_title || group.checklistStepTitle);
  const checklistProgressLabel = compact(group.checklist_progress_label || group.checklistProgressLabel);
  const checklistProgressNote = compact(group.checklist_progress_note || group.checklistProgressNote);
  const checklistProgressSummary = compact(group.checklist_progress_summary || group.checklistProgressSummary);
  const blockerReason = isTriage
    ? '当前评论还停在 triage，还没有继续下发为执行任务。'
    : '这条评论已经接回执行链，下一步重点是确认 agent 是否继续往前跑。';
  const actionValue = isTriage
    ? '打开线程后决定继续执行、要求修改，或把它升级成黄灯 / 红灯。'
    : compact(primaryTask?.recommended_action || primaryTask?.recommendedAction || primaryTask?.next_step || primaryTask?.nextStep) ||
      '打开线程确认最新评论带出的命令、Run 和回执是否继续流动。';
  const executionProof = compact(primaryTask?.execution_proof || primaryTask?.executionProof);
  const latestReceiptLabel = compact(primaryTask?.latest_receipt_label || primaryTask?.latestReceiptLabel);
  const latestCheckpointSummary = compact(primaryTask?.latest_checkpoint_summary || primaryTask?.latestCheckpointSummary);
  const commandId = pickPrimaryCommandId(primaryTask);
  const ownerAgent = compact(primaryTask?.owner_agent || primaryTask?.ownerAgent);
  const threadKey = compact(group.thread_key || group.threadKey);
  const collaborationHistorySummary = compact(primaryTask?.collaboration_history_summary || primaryTask?.collaborationHistorySummary);
  const collaborationAuditItems = Array.isArray(group.collaboration_audit_items || group.collaborationAuditItems)
    ? (group.collaboration_audit_items || group.collaborationAuditItems)
    : [];
  const latestCollaborationTitle = compact(group.latest_collaboration_title || group.latestCollaborationTitle);
  const latestCollaborationSummary = compact(group.latest_collaboration_summary || group.latestCollaborationSummary);
  const latestCollaborationDetail = compact(group.latest_collaboration_detail || group.latestCollaborationDetail);
  const currentNode = compact(primaryTask?.current_node || primaryTask?.currentNode || (isTriage ? '评论分流' : '执行回流'));
  const proofSegments = [
    executionProof,
    latestReceiptLabel ? `最近回执：${latestReceiptLabel}` : '',
    latestCheckpointSummary ? `最近 Checkpoint：${summarize(latestCheckpointSummary, 72)}` : '',
  ].filter(Boolean);

  return {
    id: `${group.thread_key}:${mode}`,
    type: 'thread',
    tone: isTriage ? 'yellow' : 'blue',
    badge: isTriage ? '待分流评论' : '已接回执行',
    title: group.thread_label || group.thread_key || '未命名线程',
    summary:
      group.comment_status_summary ||
      group.overview_summary ||
      primaryTask?.summary ||
      '当前没有更多评论线程摘要。',
    blockerReason,
    actionLabel: '建议动作',
    actionValue,
    focusLabel: checklistFocusLabel,
    focusNote: checklistFocusNote,
    focusStepLabel: checklistStepLabel,
    focusStepTitle: checklistStepTitle,
    progressLabel: checklistProgressLabel,
    progressNote: checklistProgressNote,
    checklistProgressSummary,
    checklistAcceptance: readChecklistAcceptance(group),
    checklistCheckpointRule: readChecklistCheckpointRule(group),
    latestCollaborationTitle,
    latestCollaborationSummary,
    latestCollaborationDetail,
    collaborationAuditItems,
    meta: [
      ...buildChecklistMetaEntries(group, { includeStep: false, includeProgress: true }),
      `评论状态：${commentCount} 条${isTriage ? '待分流' : '已接回执行'}`,
      collaborationHistorySummary ? `协同记录：${collaborationHistorySummary}` : null,
      primaryTask?.title ? `当前聚焦：${primaryTask.title}` : null,
      primaryTask?.current_node ? `当前节点：${primaryTask.current_node}` : null,
      group.latest_comment_at ? `最近评论：${formatIso(group.latest_comment_at)}` : null,
      group.latest_updated_at ? `最近更新：${formatIso(group.latest_updated_at)}` : null,
    ].filter(Boolean),
    proofLabel: proofSegments.length > 0 ? '执行证据' : '',
    proofValue: proofSegments.join('；'),
    currentNode,
    threadKey,
    commandId,
    ownerAgent,
    replyCapable: Boolean(threadKey && commandId),
    actionMode: isTriage ? 'triage' : 'ready',
    actionable: Boolean(threadKey && commandId && ownerAgent),
    href: `${buildWorkspaceThreadHref(projectId, group.thread_key, {
      ...workspaceContext,
      commentFilter: isTriage ? 'triage' : 'ready',
    })}#comment-threads`,
    hrefLabel: isTriage ? '进入评论分流现场' : '进入执行回流现场',
    sourceHref: primaryTask?.primary_link || primaryTask?.primaryLink || null,
  };
}

function buildWorkspaceRecentCommentThreadItem(group, projectId, workspaceContext = {}) {
  const recentEvents = (group.recent_comment_events || group.recentCommentEvents || [])
    .filter(Boolean)
    .sort((left, right) => compareCommentTimelineEntriesDesc(left, right));
  const latestEvent = recentEvents[0] || null;
  if (!latestEvent) {
    return null;
  }

  const primaryTask = Array.isArray(group.tasks) ? group.tasks[0] || null : null;
  const threadKey = compact(group.thread_key || group.threadKey);
  const commandId = compact(latestEvent.commandId || pickPrimaryCommandId(primaryTask));
  const ownerAgent = compact(latestEvent.ownerAgent || primaryTask?.owner_agent || primaryTask?.ownerAgent);
  const bucket = compact(latestEvent.bucket).toLowerCase();
  const actionMode = resolveRecentCommentActionMode(group, latestEvent);
  const commentFilter = actionMode || bucket || 'all';
  const collaborationAuditItems = recentEvents.slice(0, 4).map((event) => buildRecentCommentAuditItem(event));
  const recentEventCount = collaborationAuditItems.length;
  const currentNode = compact(
    primaryTask?.current_node ||
    primaryTask?.currentNode ||
    latestEvent.title ||
    latestEvent.bucketLabel ||
    '最近评论',
  );
  const proofSegments = [
    compact(primaryTask?.execution_proof || primaryTask?.executionProof),
    compact(primaryTask?.latest_receipt_label || primaryTask?.latestReceiptLabel)
      ? `最近回执：${compact(primaryTask?.latest_receipt_label || primaryTask?.latestReceiptLabel)}`
      : '',
    compact(primaryTask?.latest_checkpoint_summary || primaryTask?.latestCheckpointSummary)
      ? `最近 Checkpoint：${summarize(compact(primaryTask?.latest_checkpoint_summary || primaryTask?.latestCheckpointSummary), 72)}`
      : '',
  ].filter(Boolean);

  let blockerReason = '最近几条评论事件已经收口到同一线程，可直接作为线程回看入口。';
  if (actionMode === 'triage') {
    blockerReason = '最近几条评论仍挂在 triage，这张卡会把待分流问题和上下文收在同一条线程里，方便直接判断该继续执行还是升级黄灯/红灯。';
  } else if (actionMode === 'ready') {
    blockerReason =
      compact(latestEvent.kind).toLowerCase() === 'thread_reply'
        ? '最近一次线程回复已经写回，这条线程仍在执行回流链里，可直接确认命令、Run 和 Checkpoint 是否继续流动。'
        : '最近几条评论已经接回执行链，重点是确认这条线程的命令、Run 和 Checkpoint 是否继续流动。';
  } else if (bucket === 'rejected') {
    blockerReason = '最近一条评论被规则拦截，首页可以先判断是否需要重写说明或升级成决策。';
  } else if (compact(latestEvent.kind).toLowerCase() === 'thread_reply') {
    blockerReason = '最近一条线程回复已经写回，可直接作为异步协作和审计入口。';
  }

  return {
    id: `${threadKey}:${latestEvent.commandId || latestEvent.timestamp || 'recent'}`,
    type: 'thread',
    tone: latestEvent.tone || 'green',
    timestamp: latestEvent.timestamp || null,
    recentEventCount,
    auditLabel: '最近流转',
    badge: `最近评论 · ${latestEvent.bucketLabel || '未分类'}`,
    title: group.thread_label || group.thread_key || '未命名线程',
    summary:
      recentEventCount > 1
        ? `最近 ${recentEventCount} 条评论事件已收口到这条线程；最新一条：${latestEvent.summary || '最近一条评论事件已记录。'}`
        : latestEvent.summary || group.comment_status_summary || '最近一条评论事件已记录。',
    blockerReason,
    actionLabel: '建议动作',
    actionValue:
      compact(primaryTask?.recommended_action || primaryTask?.recommendedAction || primaryTask?.next_step || primaryTask?.nextStep) ||
      '打开线程继续回看这条评论事件与后续协作留痕。',
    focusLabel: compact(group.checklist_focus_label || group.checklistFocusLabel),
    focusNote: compact(group.checklist_focus_note || group.checklistFocusNote),
    focusStepLabel: compact(group.checklist_step_label || group.checklistStepLabel),
    focusStepTitle: compact(group.checklist_step_title || group.checklistStepTitle),
    progressLabel: compact(group.checklist_progress_label || group.checklistProgressLabel),
    progressNote: compact(group.checklist_progress_note || group.checklistProgressNote),
    checklistProgressSummary: compact(group.checklist_progress_summary || group.checklistProgressSummary),
    checklistAcceptance: readChecklistAcceptance(group),
    checklistCheckpointRule: readChecklistCheckpointRule(group),
    latestCollaborationTitle: '',
    latestCollaborationSummary: '',
    latestCollaborationDetail: '',
    collaborationAuditItems,
    meta: [
      ...buildChecklistMetaEntries(group, { includeStep: false, includeProgress: true }),
      recentEventCount > 1 ? `最近事件数：${recentEventCount} 条` : null,
      group.comment_status_summary ? `线程状态：${group.comment_status_summary}` : null,
      latestEvent.title ? `最近事件：${latestEvent.title}` : null,
      latestEvent.detail ? `事件明细：${latestEvent.detail}` : null,
      primaryTask?.title ? `当前聚焦：${primaryTask.title}` : null,
      primaryTask?.current_node ? `当前节点：${primaryTask.current_node}` : null,
      latestEvent.timeLabel ? `事件时间：${latestEvent.timeLabel}` : null,
    ].filter(Boolean),
    proofLabel: proofSegments.length > 0 ? '执行证据' : '',
    proofValue: proofSegments.join('；'),
    currentNode,
    threadKey,
    commandId,
    ownerAgent,
    replyCapable: Boolean(threadKey && commandId),
    actionMode,
    actionable: Boolean(threadKey && commandId && ownerAgent && ['triage', 'ready'].includes(actionMode)),
    href: `${buildWorkspaceThreadHref(projectId, group.thread_key, {
      ...workspaceContext,
      commentFilter,
    })}#comment-threads`,
    hrefLabel: '打开线程回看评论',
    sourceHref: latestEvent.sourceUrl || primaryTask?.primary_link || primaryTask?.primaryLink || null,
  };
}

function renderWorkspaceCommentWorkflowList(items = [], emptyText = '当前没有评论流转事项。') {
  if (items.length === 0) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  }

  return items
    .map((item) => normalizeCommentWorkflowItem(item))
    .map((item) => ({
      item,
      bodyBlocks: renderHomeCardBodyBlocks({
        context: 'comment-workflow-card',
        record: item,
        middleHtml: [
          renderHomeCardCallout('当前判断', item.blockerReason || '当前没有额外说明。', {
            attributes: { 'data-home-card-callout': 'assessment' },
          }),
          item.latestCollaborationTitle
            ? renderHomeCardCallout(
                `最近协同 · ${item.latestCollaborationTitle}`,
                item.latestCollaborationSummary || '最近一条协同事件已记录。',
                {
                  detail: item.latestCollaborationDetail,
                  attributes: { 'data-home-card-callout': 'latest-collaboration' },
                },
              )
            : '',
          renderWorkspaceCommentAuditList(item.collaborationAuditItems, item.auditLabel || '协同审计'),
          renderHomeCardCallout(item.actionLabel || '建议动作', item.actionValue || '打开线程继续查看。', {
            attributes: { 'data-home-card-callout': 'next-action' },
          }),
          item.proofValue
            ? renderHomeCardCallout(item.proofLabel || '执行证据', item.proofValue, {
                attributes: { 'data-home-card-callout': 'proof' },
              })
            : '',
        ]
          .filter(Boolean)
          .join(''),
        middleAttributes: {
          'data-home-card-body-middle': 'comment-workflow-details',
        },
      }),
    }))
    .map(
      ({ item, bodyBlocks }) => `
        <article
          class="decision-focus-card tone-${escapeHtml(item.tone || 'neutral')}"
          data-home-comment-workflow-card
          data-home-card-kind="${escapeHtml(item.type || 'thread')}"
        >
          <div class="task-card-top">
            <span class="task-badge">${escapeHtml(item.badge || item.type || '线程')}</span>
            <span class="task-kind">${escapeHtml(item.type || 'thread')}</span>
          </div>
          <h3>${escapeHtml(item.title || '未命名线程')}</h3>
          <p>${escapeHtml(item.summary || '暂无补充说明')}</p>
          ${bodyBlocks}
          <ul class="task-meta">
            ${(item.meta || []).map((meta) => `<li>${escapeHtml(meta)}</li>`).join('')}
          </ul>
          ${
            item.actionable || item.replyCapable
              ? `
                <div
                  class="workspace-inline-action-box"
                  data-home-comment-box
                  data-home-inline-action-box="comment"
                >
                  <strong>首页直达动作</strong>
                  <textarea
                    class="workspace-inline-note"
                    data-home-comment-note
                    data-home-inline-action-note="comment"
                    placeholder="${
                      item.replyCapable
                        ? escapeHtml('先写一句明确回复；如果还要继续执行、升黄灯或升红灯，也会复用这里的说明。')
                        : item.actionMode === 'triage'
                        ? escapeHtml('可选：补一句如何接回执行；若升级黄灯/红灯，会直接作为说明。')
                        : escapeHtml('可选：补一句继续执行、修改、重跑或停止的原因，会带进派生命令。')
                    }"
                  ></textarea>
                  <div class="workspace-inline-actions" data-home-inline-action-list="comment">
                    ${
                      item.replyCapable
                        ? `
                          <button
                            type="button"
                            class="governance-action-button"
                            data-home-comment-action="comment"
                            data-home-inline-action-button="comment"
                            data-home-comment-target="reply"
                            data-thread-key="${escapeHtml(item.threadKey)}"
                            data-command-id="${escapeHtml(item.commandId)}"
                            data-owner-agent="${escapeHtml(item.ownerAgent || '')}"
                            data-comment-title="${escapeHtml(item.title || '')}"
                            data-comment-summary="${escapeHtml(item.summary || '')}"
                          >
                            发送回复
                          </button>
                        `
                        : ''
                    }
                    ${
                      item.actionMode === 'triage'
                        ? `
                          <button
                            type="button"
                            class="governance-action-button"
                            data-home-comment-action="continue"
                            data-home-inline-action-button="continue"
                            data-home-comment-target="derive"
                            data-thread-key="${escapeHtml(item.threadKey)}"
                            data-command-id="${escapeHtml(item.commandId)}"
                            data-owner-agent="${escapeHtml(item.ownerAgent)}"
                            data-default-instruction="${escapeHtml(`请根据线程「${item.title || '当前评论线程'}」继续执行，并在当前线程回报结果。`)}"
                            data-reason="workspace_home_comment_promote:continue"
                          >
                            继续执行
                          </button>
                          <button
                            type="button"
                            class="governance-action-button"
                            data-home-comment-action="yellow"
                            data-home-inline-action-button="yellow"
                            data-home-comment-target="comment"
                            data-thread-key="${escapeHtml(item.threadKey)}"
                            data-command-id="${escapeHtml(item.commandId)}"
                            data-owner-agent="${escapeHtml(item.ownerAgent)}"
                            data-default-instruction="${escapeHtml(`这条 triage 评论需要升级成黄灯 review：${item.title || '当前评论线程'}`)}"
                            data-context-quote="${escapeHtml(item.summary || '')}"
                          >
                            升黄灯
                          </button>
                          <button
                            type="button"
                            class="governance-action-button"
                            data-home-comment-action="red"
                            data-home-inline-action-button="red"
                            data-home-comment-target="comment"
                            data-thread-key="${escapeHtml(item.threadKey)}"
                            data-command-id="${escapeHtml(item.commandId)}"
                            data-owner-agent="${escapeHtml(item.ownerAgent)}"
                            data-default-instruction="${escapeHtml(`这条 triage 评论需要人工拍板后再继续：${item.title || '当前评论线程'}`)}"
                            data-context-quote="${escapeHtml(item.summary || '')}"
                          >
                            升红灯
                          </button>
                        `
                        : `
                          <button
                            type="button"
                            class="governance-action-button"
                            data-home-comment-action="continue"
                            data-home-inline-action-button="continue"
                            data-home-comment-target="derive"
                            data-thread-key="${escapeHtml(item.threadKey)}"
                            data-command-id="${escapeHtml(item.commandId)}"
                            data-owner-agent="${escapeHtml(item.ownerAgent)}"
                            data-default-instruction="${escapeHtml(`请继续推进线程「${item.title || '当前评论线程'}」，并同步最新结果。`)}"
                            data-reason="workspace_home_comment_action:continue"
                          >
                            继续执行
                          </button>
                          <button
                            type="button"
                            class="governance-action-button"
                            data-home-comment-action="improve"
                            data-home-inline-action-button="improve"
                            data-home-comment-target="derive"
                            data-thread-key="${escapeHtml(item.threadKey)}"
                            data-command-id="${escapeHtml(item.commandId)}"
                            data-owner-agent="${escapeHtml(item.ownerAgent)}"
                            data-default-instruction="${escapeHtml(`请先修改线程「${item.title || '当前评论线程'}」的实现，再重新汇报。`)}"
                            data-reason="workspace_home_comment_action:improve"
                          >
                            要求修改
                          </button>
                          <button
                            type="button"
                            class="governance-action-button"
                            data-home-comment-action="retry"
                            data-home-inline-action-button="retry"
                            data-home-comment-target="derive"
                            data-thread-key="${escapeHtml(item.threadKey)}"
                            data-command-id="${escapeHtml(item.commandId)}"
                            data-owner-agent="${escapeHtml(item.ownerAgent)}"
                            data-default-instruction="${escapeHtml(`请重跑线程「${item.title || '当前评论线程'}」最近一次执行，并补回结果。`)}"
                            data-reason="workspace_home_comment_action:retry"
                          >
                            重新执行
                          </button>
                          <button
                            type="button"
                            class="governance-action-button"
                            data-home-comment-action="stop"
                            data-home-inline-action-button="stop"
                            data-home-comment-target="derive"
                            data-thread-key="${escapeHtml(item.threadKey)}"
                            data-command-id="${escapeHtml(item.commandId)}"
                            data-owner-agent="${escapeHtml(item.ownerAgent)}"
                            data-default-instruction="${escapeHtml(`请停止线程「${item.title || '当前评论线程'}」当前任务，并说明停止原因。`)}"
                            data-reason="workspace_home_comment_action:stop"
                          >
                            停止任务
                          </button>
                        `
                    }
                  </div>
                </div>
              `
              : ''
          }
          <div class="workspace-links">
            ${
              item.href && item.hrefLabel
                ? `<a class="task-link" href="${escapeHtml(item.href)}">${escapeHtml(item.hrefLabel)}</a>`
                : ''
            }
            ${
              item.sourceHref
                ? `<a class="task-link" href="${escapeHtml(item.sourceHref)}" target="_blank" rel="noreferrer">打开源位置</a>`
                : ''
            }
          </div>
        </article>
      `,
    )
    .join('');
}

function renderWorkspaceCommentAuditList(items = [], title = '协同审计') {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  const normalizedItems = items.map((item) => normalizeCommentWorkflowAuditItem(item));
  return `
    <div class="decision-focus-callout">
      <strong>${escapeHtml(title)}</strong>
      <div class="home-comment-audit-list">
        ${normalizedItems
          .map(
            (item) => `
              <article
                class="home-comment-audit-item tone-${escapeHtml(item.tone || 'green')}"
                data-home-comment-audit-item="${escapeHtml(item.kind || 'collaboration')}"
              >
                <div class="home-comment-audit-top">
                  <span class="home-comment-audit-badge">${escapeHtml(item.kindLabel || '协同记录')}</span>
                  <span class="checklist-context-progress">${escapeHtml(item.timeLabel || '未记录')}</span>
                </div>
                <strong>${escapeHtml(item.title || item.kindLabel || '未命名协同记录')}</strong>
                <span>${escapeHtml(item.summary || '最近一条协同事件已记录。')}</span>
                ${
                  item.detail
                    ? `<span class="checklist-context-progress">${escapeHtml(item.detail)}</span>`
                    : ''
                }
              </article>
            `,
          )
          .join('')}
      </div>
    </div>
  `;
}

export function buildWorkspaceHeroActionQueue(executionChecklist = {}, decisionFocus = {}, commentWorkflow = {}, memoryGovernance = {}) {
  memoryGovernance = normalizeHomeMemoryGovernancePayload(memoryGovernance);
  const items = [];
  const seenHrefs = new Set();

  const pushItem = (item) => {
    const href = compact(item?.href);
    if (!href || seenHrefs.has(href)) {
      return;
    }
    seenHrefs.add(href);
    items.push({
      tone: compact(item.tone) || 'neutral',
      badge: compact(item.badge) || '执行引导',
      title: compact(item.title) || '继续处理',
      detail: compact(item.detail) || '',
      href,
      hrefLabel: compact(item.hrefLabel) || '继续处理',
    });
  };

  (executionChecklist.focusContextLinks || []).slice(0, 2).forEach((item) => {
    pushItem({
      tone: 'blue',
      badge: executionChecklist.focusContextTitle || '优先清理',
      title: item.label || '打开当前治理批次',
      detail: executionChecklist.focusEvidenceLabel || executionChecklist.focusSummary || '',
      href: item.href,
      hrefLabel: '打开治理现场',
    });
  });

  const topDecisionFocus = pickHomeDecisionFocusItem(decisionFocus);
  if (topDecisionFocus) {
    const decisionTone = compact(topDecisionFocus.tone) || 'red';
    const decisionBadge =
      compact(topDecisionFocus.badge) ||
      (compact(topDecisionFocus.type).toLowerCase() === 'memory'
        ? '记忆候选'
        : decisionTone === 'yellow'
          ? '黄灯绕行'
          : '红灯拍板');
    pushItem({
      tone: decisionTone,
      badge: decisionBadge,
      title: topDecisionFocus.title,
      detail:
        compact(topDecisionFocus.focusNote) ||
        compact(topDecisionFocus.checklistProgressSummary) ||
        compact(topDecisionFocus.blockerReason) ||
        compact(topDecisionFocus.actionValue) ||
        compact(topDecisionFocus.summary),
      href: topDecisionFocus.href,
      hrefLabel:
        compact(topDecisionFocus.hrefLabel) ||
        (decisionTone === 'yellow' ? '进入执行现场' : '进入拍板现场'),
    });
  }

  const topCommentFocus = pickHomeCommentWorkflowFocusItem(commentWorkflow);
  if (topCommentFocus) {
    pushItem({
      tone: compact(topCommentFocus.tone) || 'yellow',
      badge:
        compact(topCommentFocus.badge) ||
        (compact(topCommentFocus.actionMode).toLowerCase() === 'ready' ? '执行回流' : '评论分流'),
      title: topCommentFocus.title,
      detail:
        compact(topCommentFocus.focusNote) ||
        compact(topCommentFocus.checklistProgressSummary) ||
        compact(topCommentFocus.blockerReason) ||
        compact(topCommentFocus.actionValue) ||
        compact(topCommentFocus.summary),
      href: topCommentFocus.href,
      hrefLabel: compact(topCommentFocus.hrefLabel) || '进入评论现场',
    });
  }

  const topMemoryReview = pickHomeMemoryGovernanceFocusCard(memoryGovernance);
  if (topMemoryReview) {
    pushItem({
      tone: compact(topMemoryReview.tone) || 'yellow',
      badge: '记忆治理',
      title: topMemoryReview.title,
      detail:
        compact(topMemoryReview.focusNote) ||
        compact(topMemoryReview.checklistProgressSummary) ||
        compact(topMemoryReview.homeGovernanceHint) ||
        compact(topMemoryReview.summary) ||
        '进入 reviewer 现场继续处理这条候选或 review 队列事项。',
      href: compact(topMemoryReview.link) || compact(memoryGovernance.memoryDocHref),
      hrefLabel: '打开协作记忆',
    });
  }

  (executionChecklist.revisitContextLinks || []).slice(0, 2).forEach((item) => {
    pushItem({
      tone: 'yellow',
      badge: executionChecklist.revisitContextTitle || '优先回看',
      title: item.label || '打开待回看线程',
      detail: '先确认它为什么从自动推进降成待回看，再决定继续执行还是调整主闭环。',
      href: item.href,
      hrefLabel: '进入线程现场',
    });
  });

  return items.slice(0, 6);
}

function buildWorkspaceCommentWorkflowFocus(projectId, threadGroups = [], dashboard = {}, workspaceContext = {}) {
  const triageGroups = threadGroups
    .filter((group) => Number(group.comment_triage_count || group.commentTriageCount || 0) > 0)
    .sort(
      (left, right) =>
        toEpochMs(right.latest_comment_at || right.latestCommentAt || right.latest_updated_at) -
        toEpochMs(left.latest_comment_at || left.latestCommentAt || left.latest_updated_at),
    );
  const readyGroups = threadGroups
    .filter((group) => Number(group.comment_ready_count || group.commentReadyCount || 0) > 0)
    .sort(
      (left, right) =>
        toEpochMs(right.latest_comment_at || right.latestCommentAt || right.latest_updated_at) -
        toEpochMs(left.latest_comment_at || left.latestCommentAt || left.latest_updated_at),
    );
  const recentCommentCards = threadGroups
    .map((group) => buildWorkspaceRecentCommentThreadItem(group, projectId, workspaceContext))
    .filter(Boolean)
    .sort((left, right) => compareCommentTimelineEntriesDesc(left, right));
  const recentCommentTotal = recentCommentCards.reduce(
    (sum, item) => sum + Number(item.recentEventCount || 0),
    0,
  );
  const triageCommentTotal = triageGroups.reduce(
    (sum, group) => sum + Number(group.comment_triage_count || group.commentTriageCount || 0),
    0,
  );
  const readyCommentTotal = readyGroups.reduce(
    (sum, group) => sum + Number(group.comment_ready_count || group.commentReadyCount || 0),
    0,
  );
  let summary = '当前没有新的评论流转压力，首页只保留最近评论事件作为审计入口。';
  if (triageCommentTotal > 0) {
    summary = `当前有 ${triageCommentTotal} 条评论仍停在 triage，优先判断哪些该继续执行、哪些该升级成黄灯或红灯。`;
  } else if (readyCommentTotal > 0) {
    summary = `当前没有待分流评论，但已有 ${readyCommentTotal} 条评论接回执行；首页会继续告诉你它们有没有真的往命令、Run 和回执流动。`;
  } else if (recentCommentTotal > 0) {
    summary = `当前评论链没有卡住，但最近仍有 ${recentCommentTotal} 条评论事件，已收口到 ${recentCommentCards.length} 条线程卡里直接回看，不必再先跳进线程猜它属于哪条闭环。`;
  }

  const triageItems = triageGroups.slice(0, 4).map((group) =>
    buildWorkspaceCommentWorkflowThreadItem(group, projectId, workspaceContext, 'triage'),
  );
  const readyItems = readyGroups.slice(0, 4).map((group) =>
    buildWorkspaceCommentWorkflowThreadItem(group, projectId, workspaceContext, 'ready'),
  );
  const recentItems = recentCommentCards.slice(0, 4);
  const checklistSummary = buildCenterChecklistSummary([...triageItems, ...readyItems, ...recentItems], dashboard.executionChecklist || null);
  const focusGuidance = buildHomeCommentCenterGuidance({
    triageItems,
    readyItems,
    recentCommentCards: recentItems,
  });

  return normalizeCommentWorkflowPayload({
    title: '评论回流中枢',
    summary,
    ...checklistSummary,
    focusGuidance,
    counts: {
      triageThreads: triageGroups.length,
      triageComments: triageCommentTotal,
      readyThreads: readyGroups.length,
      readyComments: readyCommentTotal,
      recentComments: recentCommentTotal,
      recentThreads: recentCommentCards.length,
    },
    triageItems,
    readyItems,
    recentCommentCards: recentItems,
  });
}

function buildWorkspaceMemoryGovernanceFocus(projectId, dashboard = {}, inboxItems = [], suggestions = [], workspaceContext = {}) {
  const memoryDocHref = `/workspace/docs/memory${buildWorkspaceContextQuery(projectId, workspaceContext)}`;
  const candidateMemories = Array.isArray(dashboard.candidateMemories) ? dashboard.candidateMemories : [];
  const memorySourcesById = dashboard.memorySourcesById instanceof Map ? dashboard.memorySourcesById : new Map();
  const memoryDetailsById = dashboard.memoryDetailsById instanceof Map ? dashboard.memoryDetailsById : new Map();
  const executionChecklist = dashboard.executionChecklist || null;
  const checklistOptions = dashboard.checklistOptions || {};
  const generatedAt = compact(dashboard.generated_at || dashboard.generatedAt);
  const candidateCards = candidateMemories.slice(0, 4).map((memory) =>
    annotateCardWithChecklistFocus(
      {
        ...buildMemoryCard(memory),
        ...buildHomeMemoryGovernanceInsights(memoryDetailsById.get(memory.memoryId), generatedAt),
        link: memoryDocHref,
        showGovernanceActions: true,
        homeGovernanceHint: '接受后会升成 durable memory；如果还缺证据，也可以直接留在 candidate / reviewer 队列继续补证据。',
      },
      memorySourcesById.get(memory.memoryId) || [],
      projectId,
      workspaceContext,
      executionChecklist,
      checklistOptions,
    ),
  );
  const openMemoryReviewItems = inboxItems
    .filter((item) => compact(item.objectType).toLowerCase() === 'memory')
    .filter((item) => !TERMINAL_INBOX_STATUSES.has(compact(item.status).toLowerCase()));
  const openMemoryReviews = openMemoryReviewItems.slice(0, 4).map((item) =>
    annotateCardWithChecklistFocus(
      {
        ...buildInboxCard(item),
        ...buildHomeMemoryGovernanceInsights(
          memoryDetailsById.get(compact(item.payload?.memory_id || item.payload?.memoryId)),
          generatedAt,
        ),
        link: item.sourceUrl || memoryDocHref,
        showGovernanceActions: Boolean(item.payload?.memory_id || item.payload?.memoryId),
        homeGovernanceHint: '这条 memory 已进入 review 队列；首页提交后会直接写回 reviewer 判断，不需要先跳回 memory 文档。',
      },
      [item],
      projectId,
      workspaceContext,
      executionChecklist,
      checklistOptions,
    ),
  );
  const openSuggestionItems = suggestions
    .filter((suggestion) => !['accepted', 'rejected'].includes(compact(suggestion.status).toLowerCase()))
    .slice(0, 4);
  const openSuggestionCards = openSuggestionItems.map((suggestion) =>
    annotateCardWithChecklistFocus(
      {
        ...buildSuggestionCard(suggestion),
        link: suggestion.documentRef || memoryDocHref,
        showGovernanceActions: true,
        homeGovernanceHint: '接受后会直接走现有 projector 生成 candidate memory，并把这里补的理由一起带回 source。',
      },
      [suggestion],
      projectId,
      workspaceContext,
      executionChecklist,
      checklistOptions,
    ),
  );

  let summary = '当前没有待处理的记忆治理事项，checkpoint 后如果有新的 candidate 会优先出现在这里。';
  if (candidateMemories.length > 0) {
    summary = `当前有 ${candidateMemories.length} 条记忆候选待确认；先判断哪些能升 durable，哪些还要补证据。`;
  } else if (openMemoryReviews.length > 0) {
    summary = `当前没有新的 candidate，但 review 队列里还有 ${openMemoryReviews.length} 条记忆事项待处理。`;
  } else if (openSuggestionCards.length > 0) {
    summary = `当前没有 candidate 或 review 队列压力，但还有 ${openSuggestionCards.length} 条 suggestion 可以继续沉淀成 memory。`;
  }

  const checklistSummary = buildCenterChecklistSummary([...candidateCards, ...openMemoryReviews, ...openSuggestionCards], executionChecklist);
  const focusGuidance = buildHomeMemoryCenterGuidance({
    candidateCards,
    reviewCards: openMemoryReviews,
    suggestionCards: openSuggestionCards,
  });

  return normalizeHomeMemoryGovernancePayload({
    title: '记忆治理中枢',
    summary,
    ...checklistSummary,
    focusGuidance,
    memoryDocHref,
    counts: {
      candidates: candidateMemories.length,
      reviews: openMemoryReviewItems.length,
      suggestions: suggestions.filter((suggestion) => !['accepted', 'rejected'].includes(compact(suggestion.status).toLowerCase())).length,
    },
    candidateCards,
    reviewCards: openMemoryReviews,
    suggestionCards: openSuggestionCards,
  });
}

function isLowSpecificityThreadKey(threadKey) {
  return threadSpecificity(threadKey) <= 20;
}

function countUniqueThreadKeys(tasks = []) {
  return new Set(tasks.map((task) => compact(task.thread_key || task.threadKey)).filter(Boolean)).size;
}

function classifyLowSpecificityThreadKey(threadKey) {
  const raw = compact(threadKey).toLowerCase();
  if (raw.startsWith('brief:')) return 'brief';
  if (raw.startsWith('command:')) return 'command';
  if (raw.startsWith('run:')) return 'run';
  if (raw.startsWith('decision:')) return 'decision';
  if (raw.startsWith('project:')) return 'project';
  return 'generic';
}

function humanLowSpecificityKind(kind) {
  const raw = compact(kind).toLowerCase();
  if (raw === 'brief') return 'Brief 线程';
  if (raw === 'command') return 'Command 线程';
  if (raw === 'run') return 'Run 线程';
  if (raw === 'decision') return 'Decision 线程';
  if (raw === 'project') return 'Project 线程';
  return '泛化线程';
}

function explainLowSpecificityThread(group, visibility) {
  const task = group?.tasks?.[0] || {};
  const executionStatus = compact(task.execution_status || task.executionStatus).toLowerCase();

  if (visibility === 'attention') {
    if (executionStatus === 'completed') {
      return '最近刚完成，但还没有回收到更稳定的来源线程，所以暂时保留在主视图。';
    }
    if (executionStatus === 'stalled') {
      return '当前仍处于待回看状态，还没有被回填到真实评论线程或会话来源。';
    }
    return '这条线程仍在默认视图里，说明它还没有完全回收到稳定来源。';
  }

  if (executionStatus === 'completed') {
    return '已进入历史层，不再占用默认注意力位，只保留给后续审计或线程清洗。';
  }
  if (executionStatus === 'stalled') {
    return '已从默认首页折叠，后续如果需要清洗 thread identity，可以再回到现场处理。';
  }
  return '这条泛化线程已从默认工作台折叠，只在治理视图和历史层中保留。';
}

function classifyLowSpecificityResidualPattern(group) {
  const task = group?.tasks?.[0] || group || {};
  const executionStatus = compact(task.execution_status || task.executionStatus).toLowerCase();
  const commandCount = Number(task.command_count || task.commandCount || 0);
  const runCount = Number(task.run_count || task.runCount || 0);
  const receiptCount = Number(task.receipt_count || task.receiptCount || 0);
  const checkpointCount = Number(task.checkpoint_ids?.length || task.checkpointIds?.length || 0);
  const decisionCount = Number(task.decision_ids?.length || task.decisionIds?.length || 0);
  const inboxCount = Number(task.inbox_item_ids?.length || task.inboxItemIds?.length || 0);
  const hasBrief = Boolean(compact(task.brief_id || task.briefId));

  if (
    executionStatus === 'completed' &&
    !hasBrief &&
    commandCount === 0 &&
    runCount > 0 &&
    receiptCount === 0 &&
    checkpointCount === 0 &&
    decisionCount === 0 &&
    inboxCount === 0
  ) {
    return 'run_only_completed';
  }

  if (decisionCount > 0 && commandCount === 0 && runCount === 0 && checkpointCount === 0) {
    return executionStatus === 'completed' ? 'archived_decision' : 'orphan_decision';
  }

  if (hasBrief && commandCount === 0 && runCount === 0 && checkpointCount === 0 && decisionCount === 0) {
    return executionStatus === 'stalled' ? 'brief_only_dormant' : 'brief_only';
  }

  if (hasBrief && checkpointCount > 0 && commandCount === 0 && decisionCount === 0) {
    return 'checkpoint_backed_brief';
  }

  return 'mixed_residual';
}

function buildGovernanceAction(task, residualPattern, projectId, workspaceContext = {}) {
  const pattern = compact(residualPattern).toLowerCase();
  const refreshHref = `${buildWorkspacePath(projectId, workspaceContext)}#thread-governance`;
  const briefId = compact(task?.brief_id || task?.briefId);
  const briefStatus = compact(task?.brief?.status || task?.brief_status || task?.briefStatus).toLowerCase();
  const threadKey = compact(task?.thread_key || task?.threadKey);

  if (briefId && pattern === 'checkpoint_backed_brief' && threadKey) {
    return {
      kind: 'recover_source_gap',
      label: '回到线程补来源',
      href: buildWorkspaceThreadHref(projectId, threadKey, {
        ...workspaceContext,
        includeResidual: true,
      }),
      successMessage: '请回到线程现场补充更真实的来源证据，再决定是否继续归档。',
    };
  }

  if (briefId && briefStatus !== 'archived' && GOVERNANCE_DIRECT_ARCHIVE_BRIEF_PATTERNS.has(pattern)) {
    return {
      kind: 'archive_brief',
      label: '归档为历史草稿',
      resourceIdKey: 'brief_id',
      resourceIdValue: briefId,
      briefId,
      nextStatus: 'archived',
      endpoint: '/task-briefs/update-status',
      confirmMessage: '确认将这条仅剩 brief 的残留线程归档为历史草稿吗？',
      pendingLabel: '正在归档...',
      successMessage: '已归档为历史草稿，默认工作台会收起这条残留线程。',
      refreshHref,
    };
  }

  const decisionIds = []
    .concat(task?.decision_ids || [])
    .concat(task?.decisionIds || [])
    .map((value) => compact(value))
    .filter(Boolean);
  const uniqueDecisionIds = [...new Set(decisionIds)];

  if (pattern === 'orphan_decision' && uniqueDecisionIds.length === 1) {
    return {
      kind: 'archive_decision',
      label: '归档历史决策',
      resourceIdKey: 'decision_id',
      resourceIdValue: uniqueDecisionIds[0],
      nextStatus: 'archived',
      endpoint: '/decisions/update-status',
      confirmMessage: '确认将这条孤立决策归档为历史决策吗？',
      pendingLabel: '正在归档决策...',
      successMessage: '已归档历史决策，默认工作台会把这条残留折入历史层。',
      refreshHref,
    };
  }

  return null;
}

function humanLowSpecificityResidualPattern(pattern) {
  const raw = compact(pattern).toLowerCase();
  if (raw === 'run_only_completed') return 'Run-only 残留';
  if (raw === 'archived_decision') return '已归档决策残留';
  if (raw === 'orphan_decision') return '孤立决策残留';
  if (raw === 'brief_only_dormant') return '陈旧 Brief 残留';
  if (raw === 'brief_only') return 'Brief 残留';
  if (raw === 'checkpoint_backed_brief') return 'Checkpoint 驱动 Brief';
  return '混合残留';
}

function recommendLowSpecificityCleanup(pattern, visibility) {
  const raw = compact(pattern).toLowerCase();
  if (raw === 'run_only_completed') {
    return visibility === 'history'
      ? '保留审计证据即可；如果确认只是 smoke / 验证残留，可后续批量归档或清理。'
      : '补回上游 command / comment 证据，或确认它只是历史 smoke 后移入历史层。';
  }
  if (raw === 'archived_decision') {
    return '这类已归档红灯通常只需保留审计记录；后续可以按批次迁到更明确的验收/复盘线程。';
  }
  if (raw === 'orphan_decision') {
    return '如果这条决策已经收口，建议归档；如果仍有效，应补充真实 source / discussion，让它回到具体线程。';
  }
  if (raw === 'brief_only_dormant' || raw === 'brief_only') {
    return '这类只有 brief 的旧线程通常还缺下游 command / run；建议补一条真实执行链，或明确归档为历史草稿。';
  }
  if (raw === 'checkpoint_backed_brief') {
    return '已有 checkpoint 证据，但还没回到更具体线程；后续可优先补 source / discussion，把它并回真实协作线程。';
  }
  return '先打开线程现场确认最后一条有效证据，再决定是补 source 信号还是直接归档。';
}

function describeLowSpecificityEvidence(task = {}, residualPattern) {
  const raw = compact(residualPattern).toLowerCase();
  const title = compact(task.title);
  const threadLabel = compact(task.thread_label || task.threadLabel);
  const commandCount = Number(task.command_count || task.commandCount || 0);
  const runCount = Number(task.run_count || task.runCount || 0);
  const receiptCount = Number(task.receipt_count || task.receiptCount || 0);
  const checkpointCount = Number(task.checkpoint_ids?.length || task.checkpointIds?.length || 0);
  const decisionCount = Number(task.decision_ids?.length || task.decisionIds?.length || 0);
  const primaryLink = compact(task.primary_link || task.primaryLink);

  if (raw === 'run_only_completed') {
    if (runCount > 0 && commandCount === 0 && receiptCount === 0 && checkpointCount === 0) {
      const genericRunLabel = /^继续$/.test(title) || /^继续$/.test(threadLabel);
      return {
        label: '仅剩 Run 记录',
        detail: genericRunLabel
          ? '当前只剩一条已完成 Run，标题也过于泛化，已经无法回溯上游命令或评论。'
          : '当前只剩已完成 Run，没有 command / receipt / checkpoint，可保留审计后再决定是否归档。',
      };
    }
  }

  if (raw === 'checkpoint_backed_brief') {
    if (checkpointCount > 0 && commandCount === 0) {
      return {
        label: 'Checkpoint 引用缺口',
        detail: '这条 Brief 已有 checkpoint 证据，但上游 command 记录没有保留下来，更像一次手工同步残留。',
      };
    }
  }

  if (raw === 'orphan_decision') {
    return {
      label: primaryLink ? '仅剩决策对象' : '缺少来源证据',
      detail: primaryLink
        ? '当前只剩 decision 对象，还没有重新挂回真实执行线程。'
        : '当前只剩 decision 对象，而且没有 source / discussion，可视作历史判断残留。',
    };
  }

  if (raw === 'archived_decision') {
    return {
      label: '历史拍板记录',
      detail: primaryLink
        ? '这条红灯已经归档，当前主要价值是保留审计与复盘证据。'
        : '这条红灯已经归档，而且没有更多来源线索，建议仅保留审计意义。',
    };
  }

  if (raw === 'brief_only_dormant' || raw === 'brief_only') {
    return {
      label: '仅剩 Brief 草稿',
      detail: decisionCount > 0
        ? '当前只剩 brief / decision 草稿，还没有进入真实执行链。'
        : '当前只剩 brief，没有下游 command / run；如果不是继续拆解，建议归档成历史草稿。',
    };
  }

  return null;
}

function buildThreadIdentityGovernance({
  projectId,
  concreteThreadTotal = 0,
  visibleThreadGroups = [],
  rawThreadGroups = [],
  residualTasks = [],
  workspaceContext = {},
} = {}) {
  const visibleLowSpecificityGroups = visibleThreadGroups.filter((group) =>
    isLowSpecificityThreadKey(group.thread_key || group.threadKey),
  );
  const visibleLowSpecificityKeys = new Set(
    visibleLowSpecificityGroups.map((group) => compact(group.thread_key || group.threadKey)).filter(Boolean),
  );
  const historyLowSpecificityGroups = rawThreadGroups.filter((group) => {
    const threadKey = compact(group.thread_key || group.threadKey);
    return isLowSpecificityThreadKey(threadKey) && !visibleLowSpecificityKeys.has(threadKey);
  });
  const residualThreadKeys = new Set(
    residualTasks.map((task) => compact(task.thread_key || task.threadKey)).filter(Boolean),
  );

  const allItems = [
    ...visibleLowSpecificityGroups.map((group) => {
      const task = group.tasks?.[0] || {};
      const kind = classifyLowSpecificityThreadKey(group.thread_key);
      const residualPattern = classifyLowSpecificityResidualPattern(group);
      const evidenceStatus = describeLowSpecificityEvidence(task, residualPattern);
      return {
        threadKey: group.thread_key,
        threadLabel: group.thread_label || group.thread_key,
        sourceLabel: task.thread_source_label || humanThreadIdentitySource(group.thread_key),
        sourceHref: compact(task.primary_link || task.primaryLink || task.brief?.sourceUrl || task.brief?.source_url),
        kind,
        kindLabel: humanLowSpecificityKind(kind),
        residualPattern,
        residualPatternLabel: humanLowSpecificityResidualPattern(residualPattern),
        visibility: 'attention',
        visibilityLabel: '主视图',
        statusLabel: humanTaskExecutionStatus(task.execution_status || task.executionStatus || 'in_progress'),
        reason: explainLowSpecificityThread(group, 'attention'),
        cleanupHint: recommendLowSpecificityCleanup(residualPattern, 'attention'),
        evidence_status_label: evidenceStatus?.label || null,
        evidenceStatusLabel: evidenceStatus?.label || null,
        evidence_detail: evidenceStatus?.detail || null,
        evidenceDetail: evidenceStatus?.detail || null,
        href: buildWorkspaceThreadHref(projectId, group.thread_key, workspaceContext),
        latestUpdatedAt: group.latest_updated_at,
        action: buildGovernanceAction(task, residualPattern, projectId, workspaceContext),
      };
    }),
    ...historyLowSpecificityGroups.map((group) => {
      const task = group.tasks?.[0] || {};
      const kind = classifyLowSpecificityThreadKey(group.thread_key);
      const residualPattern = classifyLowSpecificityResidualPattern(group);
      const evidenceStatus = describeLowSpecificityEvidence(task, residualPattern);
      return {
        threadKey: group.thread_key,
        threadLabel: group.thread_label || group.thread_key,
        sourceLabel: task.thread_source_label || humanThreadIdentitySource(group.thread_key),
        sourceHref: compact(task.primary_link || task.primaryLink || task.brief?.sourceUrl || task.brief?.source_url),
        kind,
        kindLabel: humanLowSpecificityKind(kind),
        residualPattern,
        residualPatternLabel: humanLowSpecificityResidualPattern(residualPattern),
        visibility: 'history',
        visibilityLabel: residualThreadKeys.has(compact(group.thread_key)) ? '历史层' : '治理层',
        statusLabel: humanTaskExecutionStatus(task.execution_status || task.executionStatus || 'completed'),
        reason: explainLowSpecificityThread(group, 'history'),
        cleanupHint: recommendLowSpecificityCleanup(residualPattern, 'history'),
        evidence_status_label: evidenceStatus?.label || null,
        evidenceStatusLabel: evidenceStatus?.label || null,
        evidence_detail: evidenceStatus?.detail || null,
        evidenceDetail: evidenceStatus?.detail || null,
        href: buildWorkspaceThreadHref(projectId, group.thread_key, {
          ...workspaceContext,
          includeResidual: true,
        }),
        latestUpdatedAt: group.latest_updated_at,
        action: buildGovernanceAction(task, residualPattern, projectId, {
          ...workspaceContext,
          includeResidual: true,
        }),
      };
    }),
  ];
  const patternGroups = Array.from(
    allItems.reduce((groups, item) => {
      const key = compact(item.residualPattern || 'mixed_residual');
      const current = groups.get(key) || {
        residualPattern: key,
        residualPatternLabel: item.residualPatternLabel || humanLowSpecificityResidualPattern(key),
        totalCount: 0,
        attentionCount: 0,
        historyCount: 0,
        latestUpdatedAt: null,
        cleanupHint: item.cleanupHint || '',
        focusHref: '',
        sourceHref: '',
      };

      current.totalCount += 1;
      if (item.visibility === 'attention') {
        current.attentionCount += 1;
      } else {
        current.historyCount += 1;
      }
      if (toEpochMs(item.latestUpdatedAt) >= toEpochMs(current.latestUpdatedAt)) {
        current.latestUpdatedAt = item.latestUpdatedAt;
        current.focusHref = item.href || current.focusHref;
        current.sourceHref = item.sourceHref || current.sourceHref;
      }
      if (!current.cleanupHint && item.cleanupHint) {
        current.cleanupHint = item.cleanupHint;
      }
      if (!current.focusHref && item.href) {
        current.focusHref = item.href;
      }
      if (!current.sourceHref && item.sourceHref) {
        current.sourceHref = item.sourceHref;
      }

      groups.set(key, current);
      return groups;
    }, new Map()).values(),
  ).sort((left, right) => {
    if (right.attentionCount !== left.attentionCount) {
      return right.attentionCount - left.attentionCount;
    }
    if (right.totalCount !== left.totalCount) {
      return right.totalCount - left.totalCount;
    }
    return toEpochMs(right.latestUpdatedAt) - toEpochMs(left.latestUpdatedAt);
  });
  const items = [
    ...allItems.filter((item) => item.visibility === 'attention'),
    ...allItems.filter((item) => item.visibility !== 'attention').slice(0, 6),
  ];

  const attentionThreadTotal = visibleLowSpecificityGroups.length;
  const historyThreadTotal = historyLowSpecificityGroups.length;

  return {
    title: '线程治理',
    summary:
      attentionThreadTotal === 0 && historyThreadTotal === 0
        ? '当前主视图和历史层都已经收口到稳定线程来源。'
        : `当前已有 ${concreteThreadTotal} 条稳定线程，主视图还剩 ${attentionThreadTotal} 条泛化线程，历史层另有 ${historyThreadTotal} 条待治理记录。`,
    concreteThreadTotal,
    attentionThreadTotal,
    historyThreadTotal,
    totalThreadTotal: attentionThreadTotal + historyThreadTotal,
    patternGroups,
    items,
  };
}

function isResidualWorkspaceTask(task, nowIso) {
  if (!task || !isLowSpecificityThreadKey(task.thread_key || task.threadKey)) {
    return false;
  }

  const status = compact(task.execution_status || task.executionStatus).toLowerCase();
  if (!['completed', 'stalled'].includes(status)) {
    return false;
  }

  const isRunOnlyCompletedResidual =
    status === 'completed' &&
    !compact(task.brief_id || task.briefId) &&
    Number(task.command_count || task.commandCount || 0) === 0 &&
    Number(task.run_count || task.runCount || 0) > 0 &&
    Number(task.receipt_count || task.receiptCount || 0) === 0 &&
    Number(task.decision_ids?.length || task.decisionIds?.length || 0) === 0 &&
    Number(task.checkpoint_ids?.length || task.checkpointIds?.length || 0) === 0 &&
    Number(task.inbox_item_ids?.length || task.inboxItemIds?.length || 0) === 0 &&
    Number(task.suggestion_ids?.length || task.suggestionIds?.length || 0) === 0;
  if (isRunOnlyCompletedResidual) {
    return true;
  }

  const isArchivedBriefResidual =
    status === 'completed' &&
    compact(task.brief?.status || task.brief_status || task.briefStatus).toLowerCase() === 'archived' &&
    GOVERNANCE_FOLDABLE_ARCHIVED_BRIEF_PATTERNS.has(classifyLowSpecificityResidualPattern(task));
  if (isArchivedBriefResidual) {
    return true;
  }

  const isArchivedDecisionResidual =
    status === 'completed' && compact(classifyLowSpecificityResidualPattern(task)).toLowerCase() === 'archived_decision';
  if (isArchivedDecisionResidual) {
    return true;
  }

  const updatedAt = task.latest_updated_at || task.latestUpdatedAt;
  const ageMs = toEpochMs(nowIso) - toEpochMs(updatedAt);
  if (ageMs <= 0) {
    return false;
  }

  if (status === 'completed') {
    return ageMs >= RESIDUAL_COMPLETED_TIMEOUT_MS;
  }

  return ageMs >= RESIDUAL_STALLED_TIMEOUT_MS;
}

function isBriefOnlyAttentionTask(task) {
  return Boolean(task?.brief_id) &&
    Number(task.command_count || 0) === 0 &&
    Number(task.run_count || 0) === 0 &&
    Number(task.receipt_count || 0) === 0 &&
    Number(task.decision_count || 0) === 0 &&
    Number(task.checkpoint_ids?.length || 0) === 0 &&
    Number(task.inbox_item_ids?.length || 0) === 0 &&
    Number(task.suggestion_ids?.length || 0) === 0;
}

function buildAttentionMergeKey(task) {
  if (!isBriefOnlyAttentionTask(task)) {
    return null;
  }

  return [
    compact(task.thread_key),
    compact(task.attention_bucket),
    compact(task.execution_status),
    compact(task.current_node),
    compact(task.title),
    compact(task.summary),
    compact(task.next_step),
    compact(task.status_note),
  ].join('::');
}

function mergeAttentionTasks(tasks = []) {
  const visible = [];
  const mergeIndex = new Map();
  let mergedDuplicates = 0;

  for (const task of tasks) {
    const mergeKey = buildAttentionMergeKey(task);
    if (!mergeKey) {
      visible.push({
        ...task,
        merged_task_count: task.merged_task_count || 1,
        mergedTaskCount: task.mergedTaskCount || 1,
        merged_duplicate_count: task.merged_duplicate_count || 0,
        mergedDuplicateCount: task.mergedDuplicateCount || 0,
      });
      continue;
    }

    const existingIndex = mergeIndex.get(mergeKey);
    if (existingIndex === undefined) {
      visible.push({
        ...task,
        merged_task_count: 1,
        mergedTaskCount: 1,
        merged_duplicate_count: 0,
        mergedDuplicateCount: 0,
      });
      mergeIndex.set(mergeKey, visible.length - 1);
      continue;
    }

    mergedDuplicates += 1;
    const existing = visible[existingIndex];
    const mergedTaskCount = Number(existing.merged_task_count || existing.mergedTaskCount || 1) + 1;
    const preferred = toEpochMs(task.latest_updated_at) >= toEpochMs(existing.latest_updated_at) ? task : existing;

    visible[existingIndex] = {
      ...preferred,
      merged_task_count: mergedTaskCount,
      mergedTaskCount: mergedTaskCount,
      merged_duplicate_count: mergedTaskCount - 1,
      mergedDuplicateCount: mergedTaskCount - 1,
    };
  }

  return {
    visible,
    mergedDuplicates,
  };
}

export function buildWorkspacePayload(engine, projectId, options = {}) {
  const includeSynthetic = Boolean(options.includeSynthetic);
  const residualPatternFilter = compact(options.residualPattern).toLowerCase() || null;
  const includeResidual = Boolean(options.includeResidual) || Boolean(residualPatternFilter);
  const view = normalizeWorkspaceView(options.view);
  const threadFilter = normalizeWorkspaceThreadFilter(options.threadFilter || options.thread_filter);
  const commentFilter = normalizeWorkspaceCommentFilter(options.commentFilter || options.comment_filter);
  const actionFeedback = compact(options.actionFeedback || options.action_feedback);
  const actionFeedbackTone = normalizeWorkspaceFeedbackTone(
    options.actionFeedbackTone || options.action_feedback_tone,
  );
  const workspaceContext = {
    includeSynthetic,
    includeResidual,
    residualPattern: residualPatternFilter,
    view,
    threadFilter,
    commentFilter,
  };
  const dashboard = buildTaskDashboardPayload(engine, projectId, { includeSynthetic });
  const resolvedProjectId = dashboard.project.projectId;
  const project = {
    ...dashboard.project,
    projectName: dashboard.project.name || dashboard.project.projectId,
  };

  const review = engine.buildProjectReview(resolvedProjectId);
  const briefs = splitSynthetic(sortByUpdatedDesc(engine.listTaskBriefs({ projectId: resolvedProjectId }).briefs || []), includeSynthetic).visible;
  const commands = splitSynthetic(sortByUpdatedDesc(engine.listCommands({ projectId: resolvedProjectId }).commands || []), includeSynthetic).visible;
  const decisions = splitSynthetic(sortByUpdatedDesc(engine.listDecisionRequests({ projectId: resolvedProjectId }).decisions || []), includeSynthetic).visible;
  const runs = splitSynthetic(sortByUpdatedDesc(engine.listRuns({ projectId: resolvedProjectId, limit: 64 }).runs || []), includeSynthetic).visible;
  const checkpoints = splitSynthetic(sortByUpdatedDesc(engine.listCheckpoints({ projectId: resolvedProjectId, limit: 64 }).checkpoints || []), includeSynthetic).visible;
  const memories = splitSynthetic(sortByUpdatedDesc(engine.listMemory({ projectId: resolvedProjectId, limit: 64 }).memories || []), includeSynthetic).visible;
  const inboxItems = splitSynthetic(sortByUpdatedDesc(engine.listInbox({ projectId: resolvedProjectId, limit: 64 }).items || []), includeSynthetic).visible;
  const suggestions = splitSynthetic(sortByUpdatedDesc(engine.listSuggestions({ projectId: resolvedProjectId, limit: 64 }).suggestions || []), includeSynthetic).visible;
  const receipts = splitSynthetic(sortByUpdatedDesc(engine.getReceiptsByProject(resolvedProjectId, { limit: 64 }).receipts || []), includeSynthetic).visible;
  const candidateMemories = memories.filter((memory) => compact(memory.status).toLowerCase() === 'candidate');
  const memoryIdsForGovernance = new Set([
    ...candidateMemories.map((memory) => compact(memory.memoryId)),
    ...inboxItems
      .filter((item) => compact(item.objectType).toLowerCase() === 'memory')
      .filter((item) => !TERMINAL_INBOX_STATUSES.has(compact(item.status).toLowerCase()))
      .map((item) => compact(item.payload?.memory_id || item.payload?.memoryId))
      .filter(Boolean),
  ]);
  const memoryDetailsById = new Map(
    [...memoryIdsForGovernance].map((memoryId) => [
      memoryId,
      engine.getMemory(memoryId),
    ]),
  );
  const memorySourcesById = new Map(
    candidateMemories.map((memory) => [
      memory.memoryId,
      memoryDetailsById.get(memory.memoryId)?.sources || [],
    ]),
  );
  const commentOverviewByThreadKey = buildThreadCommentOverviewIndex(commands, inboxItems, project);

  const tasks = briefs.map((brief) => createTaskSeedFromBrief(brief, project));
  const briefIndexById = new Map(tasks.map((task, index) => [task.brief?.briefId, index]).filter(([briefId]) => Boolean(briefId)));
  const commandIndexById = new Map();
  const runIndexById = new Map();

  function ensureTaskIndex(kind, artifact, matchers = []) {
    const explicitIndex = findTaskIndexByReference(tasks, matchers);
    const fallbackIndex = explicitIndex >= 0 ? explicitIndex : pickBestTaskIndex(tasks, artifact, project);
    if (fallbackIndex >= 0) {
      return fallbackIndex;
    }

    tasks.push(createSyntheticTaskSeed(kind, artifact, project));
    return tasks.length - 1;
  }

  const taskAttachmentCommands = sortCommandsForTaskAttachment(commands);

  for (const command of taskAttachmentCommands) {
    const taskIndex = ensureTaskIndex('command', command, [
      () => briefIndexById.get(command.briefId) ?? -1,
      () =>
        tasks.findIndex((task) => {
          return Boolean(task.brief?.targetType && task.brief.targetType === command.targetType && task.brief.targetId === command.targetId);
        }),
    ]);
    attachArtifact(tasks[taskIndex], 'commands', command, project);
    commandIndexById.set(command.commandId, taskIndex);
  }

  for (const run of runs) {
    const taskIndex = ensureTaskIndex('run', run, [
      () => (run.commandId ? commandIndexById.get(run.commandId) ?? -1 : -1),
      () => (run.briefId ? briefIndexById.get(run.briefId) ?? -1 : -1),
    ]);
    attachArtifact(tasks[taskIndex], 'runs', run, project);
    runIndexById.set(run.runId, taskIndex);
  }

  for (const decision of decisions) {
    const thread = deriveThreadIdentity(decision, project);
    const taskIndex = ensureTaskIndex('decision', decision, [
      () => tasks.findIndex((task) => task.threadKey === thread.key),
      () =>
        tasks.findIndex((task) => {
          return Boolean(task.brief?.sourceUrl && decision.sourceUrl && task.brief.sourceUrl === decision.sourceUrl);
        }),
      () => (!thread.concrete ? pickFallbackTaskIndex(tasks) : -1),
    ]);
    attachArtifact(tasks[taskIndex], 'decisions', decision, project);
  }

  for (const checkpoint of checkpoints) {
    const taskIndex = ensureTaskIndex('checkpoint', checkpoint, [
      () => (checkpoint.commandId ? commandIndexById.get(checkpoint.commandId) ?? -1 : -1),
      () => (checkpoint.runId ? runIndexById.get(checkpoint.runId) ?? -1 : -1),
      () => (checkpoint.briefId ? briefIndexById.get(checkpoint.briefId) ?? -1 : -1),
    ]);
    attachArtifact(tasks[taskIndex], 'checkpoints', checkpoint, project);
  }

  for (const inboxItem of inboxItems) {
    if (TERMINAL_INBOX_STATUSES.has(compact(inboxItem.status).toLowerCase())) {
      continue;
    }

    if (['comment', 'memory'].includes(compact(inboxItem.objectType).toLowerCase())) {
      continue;
    }

    const taskIndex = findTaskIndexByReference(tasks, [
      () => {
        const thread = deriveThreadIdentity(inboxItem, project);
        return tasks.findIndex((task) => task.threadKey === thread.key);
      },
      () =>
        tasks.findIndex((task) => {
          return Boolean(
            inboxItem.payload?.decision_id &&
              task.decisions.some((decision) => decision.decisionId === inboxItem.payload.decision_id),
          );
        }),
      () =>
        tasks.findIndex((task) => {
          return Boolean(
            inboxItem.payload?.memory_id &&
              task.checkpoints.some((checkpoint) => checkpoint.checkpointId && inboxItem.sourceRef === `checkpoint:${checkpoint.checkpointId}`),
          );
        }),
    ]);

    if (taskIndex >= 0) {
      attachArtifact(tasks[taskIndex], 'inboxItems', inboxItem, project);
    }
  }

  for (const suggestion of suggestions) {
    const taskIndex = findTaskIndexByReference(tasks, [
      () =>
        tasks.findIndex((task) => {
          return Boolean(task.threadKey && deriveThreadIdentity(suggestion, project).key === task.threadKey);
        }),
    ]);

    if (taskIndex >= 0) {
      attachArtifact(tasks[taskIndex], 'suggestions', suggestion, project);
    }
  }

  for (const receipt of receipts) {
    const taskIndex = ensureTaskIndex('receipt', receipt, [
      () => (receipt.commandId ? commandIndexById.get(receipt.commandId) ?? -1 : -1),
    ]);
    attachArtifact(tasks[taskIndex], 'receipts', receipt, project);
  }

  const rawTaskViews = tasks
    .map((task) => summarizeTaskState(task, project, dashboard.generated_at))
    .sort((left, right) => toEpochMs(right.latest_updated_at) - toEpochMs(left.latest_updated_at));

  const threadGroupMap = new Map();
  for (const task of rawTaskViews) {
    const existing = threadGroupMap.get(task.thread_key) || {
      thread_key: task.thread_key,
      threadKey: task.thread_key,
      thread_label: task.thread_label,
      threadLabel: task.thread_label,
      task_count: 0,
      taskCount: 0,
      in_progress_count: 0,
      inProgressCount: 0,
      completed_count: 0,
      completedCount: 0,
      red_count: 0,
      redCount: 0,
      latest_updated_at: task.latest_updated_at,
      latestUpdatedAt: task.latest_updated_at,
      comment_count: 0,
      commentCount: 0,
      comment_triage_count: 0,
      commentTriageCount: 0,
      comment_ready_count: 0,
      commentReadyCount: 0,
      comment_rejected_count: 0,
      commentRejectedCount: 0,
      comment_resolved_count: 0,
      commentResolvedCount: 0,
      latest_comment_at: null,
      latestCommentAt: null,
      comment_status_summary: '',
      commentStatusSummary: '',
      overview_summary: '',
      overviewSummary: '',
      tasks: [],
    };

    existing.tasks.push(task);
    existing.task_count += 1;
    existing.taskCount += 1;
    if (task.execution_status === 'in_progress' || task.execution_status === 'stalled') {
      existing.in_progress_count += 1;
      existing.inProgressCount += 1;
    }
    if (task.execution_status === 'completed') {
      existing.completed_count += 1;
      existing.completedCount += 1;
    }
    if (task.decision_signal === 'red') {
      existing.red_count += 1;
      existing.redCount += 1;
    }
    if (toEpochMs(task.latest_updated_at) > toEpochMs(existing.latest_updated_at)) {
      existing.latest_updated_at = task.latest_updated_at;
      existing.latestUpdatedAt = task.latest_updated_at;
    }

    threadGroupMap.set(task.thread_key, existing);
  }

  for (const [threadKey, group] of threadGroupMap.entries()) {
    const commentOverview = commentOverviewByThreadKey.get(threadKey);
    if (commentOverview) {
      Object.assign(group, commentOverview);
    }
    group.overview_summary = buildThreadOverviewSummary(group);
    group.overviewSummary = group.overview_summary;
  }

  const threadGroups = [...threadGroupMap.values()].sort((left, right) => {
    return right.red_count - left.red_count || toEpochMs(right.latest_updated_at) - toEpochMs(left.latest_updated_at);
  });

  const taskViews = rawTaskViews.map((task) => {
    const threadGroup = threadGroupMap.get(task.thread_key);
    const threadHref = buildWorkspaceThreadHref(project.projectId, task.thread_key, workspaceContext);
    return {
      ...task,
      thread_task_count: threadGroup?.task_count || 1,
      threadTaskCount: threadGroup?.task_count || 1,
      thread_in_progress_count: threadGroup?.in_progress_count || 0,
      threadInProgressCount: threadGroup?.in_progress_count || 0,
      thread_red_count: threadGroup?.red_count || 0,
      threadRedCount: threadGroup?.red_count || 0,
      merged_task_count: 1,
      mergedTaskCount: 1,
      merged_duplicate_count: 0,
      mergedDuplicateCount: 0,
      thread_href: threadHref,
      threadHref,
    };
  });

  const mergedAttentionTasks = mergeAttentionTasks(taskViews);
  const nowIso = dashboard.generated_at;
  const residualTasks = mergedAttentionTasks.visible.filter((task) => isResidualWorkspaceTask(task, nowIso));
  const residualPatternByThreadKey = new Map(
    threadGroups
      .filter((group) => isLowSpecificityThreadKey(group.thread_key || group.threadKey))
      .map((group) => [compact(group.thread_key || group.threadKey), classifyLowSpecificityResidualPattern(group)]),
  );
  const matchesResidualPatternFilter = (task) => {
    if (!residualPatternFilter) {
      return true;
    }
    return residualPatternByThreadKey.get(compact(task.thread_key || task.threadKey)) === residualPatternFilter;
  };
  const visibleTaskViews = (includeResidual
    ? mergedAttentionTasks.visible
    : mergedAttentionTasks.visible.filter((task) => !isResidualWorkspaceTask(task, nowIso))).filter(matchesResidualPatternFilter);
  const visibleLowSpecificityTasks = visibleTaskViews.filter((task) => isLowSpecificityThreadKey(task.thread_key));
  const visibleConcreteTasks = visibleTaskViews.filter((task) => !isLowSpecificityThreadKey(task.thread_key));
  const rawLowSpecificityTasks = mergedAttentionTasks.visible.filter((task) => isLowSpecificityThreadKey(task.thread_key));
  const visibleThreadGroupKeys = new Set(visibleTaskViews.map((task) => task.thread_key));
  const visibleThreadGroups = threadGroups
    .filter((group) => visibleThreadGroupKeys.has(group.thread_key))
    .map((group) => ({
      ...group,
      tasks: visibleTaskViews.filter((task) => task.thread_key === group.thread_key),
    }));

  const attentionView = {
    waiting_human: visibleTaskViews.filter((task) => task.attention_bucket === 'waiting_human'),
    waitingHuman: visibleTaskViews.filter((task) => task.attention_bucket === 'waiting_human'),
    in_progress: visibleTaskViews.filter((task) => task.attention_bucket === 'in_progress'),
    inProgress: visibleTaskViews.filter((task) => task.attention_bucket === 'in_progress'),
    completed: visibleTaskViews.filter((task) => task.attention_bucket === 'completed'),
  };
  const visibleRecoverableTasks = visibleTaskViews.filter((task) =>
    ['waiting_human', 'stalled'].includes(compact(task.execution_status || task.executionStatus).toLowerCase()),
  );
  const hiddenResidualCompletedTotal = residualTasks.filter(
    (task) => compact(task.execution_status || task.executionStatus).toLowerCase() === 'completed',
  ).length;
  const hiddenResidualStalledTotal = residualTasks.filter(
    (task) => compact(task.execution_status || task.executionStatus).toLowerCase() === 'stalled',
  ).length;

  const counts = {
    active_projects: review.project ? 1 : 0,
    activeProjects: review.project ? 1 : 0,
    active_threads: includeResidual ? threadGroups.length : visibleThreadGroups.length,
    activeThreads: includeResidual ? threadGroups.length : visibleThreadGroups.length,
    raw_active_threads: threadGroups.length,
    rawActiveThreads: threadGroups.length,
    total_tasks: visibleTaskViews.length,
    totalTasks: visibleTaskViews.length,
    raw_total_tasks: taskViews.length,
    rawTotalTasks: taskViews.length,
    in_progress_tasks: attentionView.in_progress.length,
    inProgressTasks: attentionView.in_progress.length,
    waiting_human_tasks: attentionView.waiting_human.length,
    waitingHumanTasks: attentionView.waiting_human.length,
    stalled_tasks: visibleTaskViews.filter((task) => task.execution_status === 'stalled').length,
    stalledTasks: visibleTaskViews.filter((task) => task.execution_status === 'stalled').length,
    completed_tasks: attentionView.completed.length,
    completedTasks: attentionView.completed.length,
    red_signal_tasks: visibleTaskViews.filter((task) => task.decision_signal === 'red').length,
    redSignalTasks: visibleTaskViews.filter((task) => task.decision_signal === 'red').length,
    yellow_signal_tasks: visibleTaskViews.filter((task) => task.decision_signal === 'yellow').length,
    yellowSignalTasks: visibleTaskViews.filter((task) => task.decision_signal === 'yellow').length,
    green_signal_tasks: visibleTaskViews.filter((task) => task.decision_signal === 'green').length,
    greenSignalTasks: visibleTaskViews.filter((task) => task.decision_signal === 'green').length,
  };
  const dataHygiene = {
    ...dashboard.data_hygiene,
    include_residual: includeResidual,
    includeResidual,
    hidden_low_specificity_total: includeResidual ? 0 : residualTasks.length,
    hiddenLowSpecificityTotal: includeResidual ? 0 : residualTasks.length,
    hidden_low_specificity_completed_total: includeResidual ? 0 : hiddenResidualCompletedTotal,
    hiddenLowSpecificityCompletedTotal: includeResidual ? 0 : hiddenResidualCompletedTotal,
    hidden_low_specificity_stalled_total: includeResidual ? 0 : hiddenResidualStalledTotal,
    hiddenLowSpecificityStalledTotal: includeResidual ? 0 : hiddenResidualStalledTotal,
    residual_pattern_filter: residualPatternFilter,
    residualPatternFilter,
    residual_pattern_filter_label: residualPatternFilter ? humanLowSpecificityResidualPattern(residualPatternFilter) : '',
    residualPatternFilterLabel: residualPatternFilter ? humanLowSpecificityResidualPattern(residualPatternFilter) : '',
    visible_low_specificity_total: visibleLowSpecificityTasks.length,
    visibleLowSpecificityTotal: visibleLowSpecificityTasks.length,
    visible_low_specificity_thread_total: countUniqueThreadKeys(visibleLowSpecificityTasks),
    visibleLowSpecificityThreadTotal: countUniqueThreadKeys(visibleLowSpecificityTasks),
    visible_low_specificity_preview: visibleLowSpecificityTasks
      .slice(0, 2)
      .map((task) => task.title)
      .filter(Boolean)
      .join('；'),
    visibleLowSpecificityPreview: visibleLowSpecificityTasks
      .slice(0, 2)
      .map((task) => task.title)
      .filter(Boolean)
      .join('；'),
    concrete_thread_total: countUniqueThreadKeys(visibleConcreteTasks),
    concreteThreadTotal: countUniqueThreadKeys(visibleConcreteTasks),
    raw_low_specificity_total: rawLowSpecificityTasks.length,
    rawLowSpecificityTotal: rawLowSpecificityTasks.length,
    raw_low_specificity_thread_total: countUniqueThreadKeys(rawLowSpecificityTasks),
    rawLowSpecificityThreadTotal: countUniqueThreadKeys(rawLowSpecificityTasks),
    visible_recoverable_total: visibleRecoverableTasks.length,
    visibleRecoverableTotal: visibleRecoverableTasks.length,
    visible_recoverable_preview: visibleRecoverableTasks
      .slice(0, 2)
      .map((task) => task.title)
      .filter(Boolean)
      .join('；'),
    visibleRecoverablePreview: visibleRecoverableTasks
      .slice(0, 2)
      .map((task) => task.title)
      .filter(Boolean)
      .join('；'),
    merged_attention_duplicates: mergedAttentionTasks.mergedDuplicates,
    mergedAttentionDuplicates: mergedAttentionTasks.mergedDuplicates,
  };
  const baseThreadIdentityGovernance = buildThreadIdentityGovernance({
    projectId: resolvedProjectId,
    concreteThreadTotal: dataHygiene.concrete_thread_total,
    visibleThreadGroups,
    rawThreadGroups: threadGroups,
    residualTasks,
    workspaceContext,
  });
  const focusedResidualPattern = dataHygiene.residual_pattern_filter
    ? baseThreadIdentityGovernance.patternGroups.find(
        (group) => compact(group.residualPattern) === compact(dataHygiene.residual_pattern_filter),
      ) || null
    : null;
  const threadIdentityGovernance = {
    ...baseThreadIdentityGovernance,
    residualPatternFilter: dataHygiene.residual_pattern_filter || null,
    residualPatternFilterLabel:
      dataHygiene.residual_pattern_filter_label || humanLowSpecificityResidualPattern(dataHygiene.residual_pattern_filter || ''),
    focusedPattern: focusedResidualPattern
      ? {
          ...focusedResidualPattern,
          scopeSummary: `当前聚焦 ${focusedResidualPattern.residualPatternLabel || focusedResidualPattern.residualPattern}：共 ${focusedResidualPattern.totalCount || 0} 条，其中主视图 ${focusedResidualPattern.attentionCount || 0} 条，历史层 ${focusedResidualPattern.historyCount || 0} 条。`,
        }
      : null,
  };
  const executionChecklist = buildWorkspaceExecutionChecklist(
    resolvedProjectId,
    counts,
    threadIdentityGovernance,
    attentionView,
    workspaceContext,
  );
  const threadIdentityChecklistItem = Array.isArray(executionChecklist?.items)
    ? executionChecklist.items.find((item) => compact(item.id) === 'thread-identity') || null
    : null;
  const threadGovernanceFocusPattern = threadIdentityGovernance.focusedPattern || threadIdentityGovernance.patternGroups?.[0] || null;
  const threadGovernanceFocusPatternHref = threadGovernanceFocusPattern?.residualPattern
    ? buildWorkspacePath(resolvedProjectId, {
        ...workspaceContext,
        includeSynthetic: dataHygiene.include_synthetic,
        includeResidual: true,
        residualPattern: threadGovernanceFocusPattern.residualPattern,
      })
    : '';
  const threadGovernanceResidualToggleHref = buildWorkspacePath(resolvedProjectId, {
    ...workspaceContext,
    includeSynthetic: dataHygiene.include_synthetic,
    includeResidual: !includeResidual,
  });
  const threadGovernanceClearResidualPatternHref = buildWorkspacePath(resolvedProjectId, {
    ...workspaceContext,
    includeSynthetic: dataHygiene.include_synthetic,
    includeResidual,
  });
  const threadGovernanceActionLinks = [];
  const seenThreadGovernanceHrefs = new Set();
  const pushThreadGovernanceLink = (label, href) => {
    const normalizedLabel = compact(label);
    const normalizedHref = compact(href);
    if (!normalizedLabel || !normalizedHref || seenThreadGovernanceHrefs.has(normalizedHref)) {
      return;
    }
    seenThreadGovernanceHrefs.add(normalizedHref);
    threadGovernanceActionLinks.push({
      label: normalizedLabel,
      href: normalizedHref,
    });
  };
  if (threadGovernanceFocusPattern?.residualPattern && threadGovernanceFocusPatternHref) {
    pushThreadGovernanceLink(
      `查看${threadGovernanceFocusPattern.residualPatternLabel || threadGovernanceFocusPattern.residualPattern}`,
      threadGovernanceFocusPatternHref,
    );
  }
  if (dataHygiene.hidden_low_specificity_total > 0 || includeResidual) {
    pushThreadGovernanceLink(includeResidual ? '切回聚焦视图' : '查看全部历史线程', threadGovernanceResidualToggleHref);
  }
  if (dataHygiene.residual_pattern_filter) {
    pushThreadGovernanceLink('清除残留筛选', threadGovernanceClearResidualPatternHref);
  }
  threadIdentityGovernance.focusGuidance = {
    ...buildThreadGovernanceGuidance(threadIdentityGovernance, executionChecklist),
    proofLabel:
      threadIdentityChecklistItem?.evidenceLabel ||
      threadIdentityChecklistItem?.evidence_label ||
      '',
    proofHref:
      threadIdentityChecklistItem?.evidenceHref ||
      threadIdentityChecklistItem?.evidence_href ||
      '',
    proofUpdatedAt:
      threadIdentityChecklistItem?.evidenceUpdatedAt ||
      threadIdentityChecklistItem?.evidence_updated_at ||
      null,
    proofContextLabel:
      threadIdentityChecklistItem?.evidenceContextLabel ||
      threadIdentityChecklistItem?.evidence_context_label ||
      '',
    proofSourceHref:
      threadIdentityChecklistItem?.sourceHref ||
      threadIdentityChecklistItem?.source_href ||
      '',
    proofSourceLabel:
      threadIdentityChecklistItem?.sourceLinkLabel ||
      threadIdentityChecklistItem?.source_link_label ||
      '',
    actionLinks: threadGovernanceActionLinks,
  };
  const heroGuidancePattern = threadIdentityGovernance.focusedPattern || threadIdentityGovernance.patternGroups?.[0] || null;
  const heroFocusPatternHref = heroGuidancePattern?.residualPattern
    ? buildWorkspacePath(resolvedProjectId, {
        ...workspaceContext,
        includeSynthetic: dataHygiene.include_synthetic,
        includeResidual: true,
        residualPattern: heroGuidancePattern.residualPattern,
      })
    : '';
  const heroResidualToggleHref = buildWorkspacePath(resolvedProjectId, {
    ...workspaceContext,
    includeSynthetic: dataHygiene.include_synthetic,
    includeResidual: !dataHygiene.include_residual,
  });
  const heroClearResidualPatternHref = buildWorkspacePath(resolvedProjectId, {
    ...workspaceContext,
    includeSynthetic: dataHygiene.include_synthetic,
    includeResidual: dataHygiene.include_residual,
  });
  const heroThreadGovernanceHref = `${buildWorkspacePath(resolvedProjectId, {
    ...workspaceContext,
    includeSynthetic: dataHygiene.include_synthetic,
    includeResidual: dataHygiene.include_residual,
    residualPattern: dataHygiene.residual_pattern_filter,
  })}#thread-governance`;
  dataHygiene.focusGuidance = buildHeroDataHygieneGuidance(dataHygiene, threadIdentityGovernance, {
    focusStepNumber: executionChecklist.focusStepNumber,
    focusProgressLabel: executionChecklist.progressLabel,
    focusContextTitle: executionChecklist.focusContextTitle,
    acceptance: executionChecklist.nextAcceptance,
    checkpointRule: executionChecklist.checkpointRule,
    focusEvidenceLabel: executionChecklist.focusEvidenceLabel,
    focusEvidenceHref: executionChecklist.focusEvidenceHref,
    focusEvidenceUpdatedAt: executionChecklist.focusEvidenceUpdatedAt,
    focusEvidenceContextLabel: executionChecklist.focusEvidenceContextLabel,
    focusEvidenceSourceHref: executionChecklist.focusEvidenceSourceHref,
    focusEvidenceSourceLabel: executionChecklist.focusEvidenceSourceLabel,
    focusPatternHref: heroFocusPatternHref,
    residualToggleHref: heroResidualToggleHref,
    residualToggleLabel: dataHygiene.include_residual ? '切回聚焦视图' : '查看全部历史线程',
    clearResidualPatternHref: heroClearResidualPatternHref,
    clearResidualPatternLabel: '清除残留筛选',
    threadGovernanceHref: heroThreadGovernanceHref,
    threadGovernanceLabel: '打开线程治理',
  });
  const focusResidualPattern =
    executionChecklist.items?.find((item) => item.isFocus)?.id === 'thread-identity'
      ? compact(threadIdentityGovernance.patternGroups?.[0]?.residualPattern)
      : '';
  const checklistAnnotationOptions = {
    residualPatternByThreadKey,
    focusResidualPattern,
    threadIdentityDefaultViewClosed:
      Number(threadIdentityGovernance.attentionThreadTotal || 0) === 0 &&
      Number(threadIdentityGovernance.historyThreadTotal || 0) > 0,
  };
  const annotatedVisibleTaskViews = annotateTasksWithChecklistFocus(visibleTaskViews, executionChecklist, {
    ...checklistAnnotationOptions,
  });
  const annotatedVisibleThreadGroupKeys = new Set(annotatedVisibleTaskViews.map((task) => task.thread_key));
  const annotatedVisibleThreadGroups = annotateThreadGroupsWithChecklistFocus(
    (includeResidual ? threadGroups : visibleThreadGroups)
      .filter((group) => annotatedVisibleThreadGroupKeys.has(group.thread_key))
      .map((group) => ({
        ...group,
        tasks: annotatedVisibleTaskViews.filter((task) => task.thread_key === group.thread_key),
      })),
    executionChecklist,
  );
  const annotatedAttentionView = {
    waiting_human: annotatedVisibleTaskViews.filter((task) => task.attention_bucket === 'waiting_human'),
    waitingHuman: annotatedVisibleTaskViews.filter((task) => task.attention_bucket === 'waiting_human'),
    in_progress: annotatedVisibleTaskViews.filter((task) => task.attention_bucket === 'in_progress'),
    inProgress: annotatedVisibleTaskViews.filter((task) => task.attention_bucket === 'in_progress'),
    completed: annotatedVisibleTaskViews.filter((task) => task.attention_bucket === 'completed'),
  };
  annotatedAttentionView.focusGuidance = buildAttentionViewGuidance(annotatedAttentionView, executionChecklist);
  const notionCollaboration = buildWorkspaceNotionCollaboration(project);
  notionCollaboration.focusGuidance = buildNotionCollaborationGuidance(notionCollaboration);
  const dashboardWithChecklist = {
    ...dashboard,
    executionChecklist,
  };
  const decisionFocus = buildWorkspaceDecisionFocus(
    resolvedProjectId,
    annotatedAttentionView,
    dashboardWithChecklist,
    workspaceContext,
  );
  const commentWorkflow = buildWorkspaceCommentWorkflowFocus(
    resolvedProjectId,
    annotatedVisibleThreadGroups,
    dashboardWithChecklist,
    workspaceContext,
  );
  const memoryGovernance = buildWorkspaceMemoryGovernanceFocus(
    resolvedProjectId,
    {
      ...dashboard,
      candidateMemories,
      memoryDetailsById,
      memorySourcesById,
      executionChecklist,
      checklistOptions: checklistAnnotationOptions,
    },
    inboxItems,
    suggestions,
    workspaceContext,
  );

  return {
    ok: true,
    generated_at: dashboard.generated_at,
    generatedAt: dashboard.generatedAt,
    view,
    thread_filter: threadFilter,
    threadFilter,
    comment_filter: commentFilter,
    commentFilter,
    action_feedback: actionFeedback,
    actionFeedback,
    action_feedback_tone: actionFeedbackTone,
    actionFeedbackTone,
    project,
    hero: {
      ...dashboard.hero,
      current_focus:
        attentionView.waiting_human[0]?.title ||
        attentionView.in_progress[0]?.title ||
        attentionView.completed[0]?.title ||
        dashboard.hero.current_task,
      currentFocus:
        attentionView.waiting_human[0]?.title ||
        attentionView.in_progress[0]?.title ||
        attentionView.completed[0]?.title ||
        dashboard.hero.current_task,
    },
    counts,
    execution_checklist: executionChecklist,
    executionChecklist,
    notion_collaboration: notionCollaboration,
    notionCollaboration,
    decision_focus: decisionFocus,
    decisionFocus,
    comment_workflow: commentWorkflow,
    commentWorkflow,
    memory_governance: memoryGovernance,
    memoryGovernance,
    thread_identity_governance: threadIdentityGovernance,
    threadIdentityGovernance,
    data_hygiene: dataHygiene,
    dataHygiene,
    attention_view: annotatedAttentionView,
    attentionView: annotatedAttentionView,
    thread_groups: annotatedVisibleThreadGroups,
    threadGroups: annotatedVisibleThreadGroups,
    thread_view_guidance_by_filter: buildThreadViewGuidanceByFilter(annotatedVisibleThreadGroups, executionChecklist),
    threadViewGuidanceByFilter: buildThreadViewGuidanceByFilter(annotatedVisibleThreadGroups, executionChecklist),
    tasks: annotatedVisibleTaskViews,
  };
}

export function renderWorkspacePage(payload) {
  const project = payload.project;
  const hero = payload.hero;
  const counts = payload.counts;
  const executionChecklist = payload.execution_checklist;
  const threadIdentityChecklistItem = Array.isArray(executionChecklist?.items)
    ? executionChecklist.items.find((item) => compact(item.id) === 'thread-identity') || null
    : null;
  const notionCollaboration = payload.notion_collaboration;
  const decisionFocus = payload.decision_focus;
  const commentWorkflow = normalizeCommentWorkflowPayload(payload.comment_workflow || payload.commentWorkflow || {});
  const memoryGovernance = normalizeHomeMemoryGovernancePayload(
    payload.memory_governance || payload.memoryGovernance || {},
  );
  const threadIdentityGovernance = payload.thread_identity_governance;
  const attentionView = payload.attention_view;
  const threadGroups = payload.thread_groups;
  const dataHygiene = payload.data_hygiene;
  const attentionViewGuidance = attentionView.focusGuidance || buildAttentionViewGuidance(attentionView, executionChecklist);
  const notionCollaborationGuidance =
    notionCollaboration.focusGuidance || buildNotionCollaborationGuidance(notionCollaboration);
  const initialActionFeedback = compact(payload.action_feedback || payload.actionFeedback);
  const initialActionFeedbackTone = normalizeWorkspaceFeedbackTone(
    payload.action_feedback_tone || payload.actionFeedbackTone,
  );
  const projectId = project.projectId;
  const residualPatternParam = dataHygiene.residual_pattern_filter
    ? `&residual_pattern=${encodeURIComponent(dataHygiene.residual_pattern_filter)}`
    : '';
  const jsonUrl = `/workspace/data?project_id=${encodeURIComponent(projectId)}${dataHygiene.include_synthetic ? '&include_synthetic=1' : ''}${dataHygiene.include_residual ? '&include_residual=1' : ''}${residualPatternParam}`;
  const runtimeStatusUrl = `/workspace/runtime-status?project_id=${encodeURIComponent(projectId)}`;
  const initialView = normalizeWorkspaceView(payload.view);
  const initialThreadFilter = normalizeWorkspaceThreadFilter(payload.thread_filter || payload.threadFilter);
  const syntheticToggleUrl = buildWorkspacePath(projectId, {
    includeSynthetic: !dataHygiene.include_synthetic,
    includeResidual: dataHygiene.include_residual,
    residualPattern: dataHygiene.residual_pattern_filter,
    view: initialView,
    threadFilter: initialThreadFilter,
  });
  const residualToggleUrl = buildWorkspacePath(projectId, {
    includeSynthetic: dataHygiene.include_synthetic,
    includeResidual: !dataHygiene.include_residual,
    view: initialView,
    threadFilter: initialThreadFilter,
  });
  const clearResidualPatternUrl = buildWorkspacePath(projectId, {
    includeSynthetic: dataHygiene.include_synthetic,
    includeResidual: dataHygiene.include_residual,
    view: initialView,
    threadFilter: initialThreadFilter,
  });
  const runtimeHealthViewModel = buildRuntimeHealthViewModel(null, { runtimeStatusUrl });
  const heroThreadGovernanceUrl = `${buildWorkspacePath(projectId, {
    includeSynthetic: dataHygiene.include_synthetic,
    includeResidual: dataHygiene.include_residual,
    residualPattern: dataHygiene.residual_pattern_filter,
    view: initialView,
    threadFilter: initialThreadFilter,
  })}#thread-governance`;
  const heroGuidancePattern = threadIdentityGovernance.focusedPattern || threadIdentityGovernance.patternGroups?.[0] || null;
  const heroFocusPatternUrl = heroGuidancePattern?.residualPattern
    ? buildWorkspacePath(projectId, {
        includeSynthetic: dataHygiene.include_synthetic,
        includeResidual: true,
        residualPattern: heroGuidancePattern.residualPattern,
        view: initialView,
        threadFilter: initialThreadFilter,
      })
    : '';
  const heroDataHygieneGuidance = dataHygiene.focusGuidance || buildHeroDataHygieneGuidance(dataHygiene, threadIdentityGovernance, {
    focusStepNumber: executionChecklist.focusStepNumber,
    focusProgressLabel: executionChecklist.progressLabel,
    focusContextTitle: executionChecklist.focusContextTitle,
    acceptance: executionChecklist.nextAcceptance,
    checkpointRule: executionChecklist.checkpointRule,
    focusEvidenceLabel: executionChecklist.focusEvidenceLabel,
    focusEvidenceHref: executionChecklist.focusEvidenceHref,
    focusEvidenceUpdatedAt: executionChecklist.focusEvidenceUpdatedAt,
    focusEvidenceContextLabel: executionChecklist.focusEvidenceContextLabel,
    focusEvidenceSourceHref: executionChecklist.focusEvidenceSourceHref,
    focusEvidenceSourceLabel: executionChecklist.focusEvidenceSourceLabel,
    focusPatternHref: heroFocusPatternUrl,
    residualToggleHref: residualToggleUrl,
    residualToggleLabel: dataHygiene.include_residual ? '切回聚焦视图' : '查看全部历史线程',
    clearResidualPatternHref: clearResidualPatternUrl,
    clearResidualPatternLabel: '清除残留筛选',
    threadGovernanceHref: heroThreadGovernanceUrl,
    threadGovernanceLabel: '打开线程治理',
  });
  const decisionCenterGuidance = decisionFocus.focusGuidance || buildHomeDecisionCenterGuidance(decisionFocus);
  const threadGovernanceGuidanceBase =
    threadIdentityGovernance.focusGuidance || buildThreadGovernanceGuidance(threadIdentityGovernance, executionChecklist);
  const threadGovernanceActionLinks = [];
  const seenThreadGovernanceHrefs = new Set();
  const pushThreadGovernanceLink = (label, href) => {
    const normalizedLabel = compact(label);
    const normalizedHref = compact(href);
    if (!normalizedLabel || !normalizedHref || seenThreadGovernanceHrefs.has(normalizedHref)) {
      return;
    }
    seenThreadGovernanceHrefs.add(normalizedHref);
    threadGovernanceActionLinks.push({
      label: normalizedLabel,
      href: normalizedHref,
    });
  };
  if (heroGuidancePattern?.residualPattern && heroFocusPatternUrl) {
    pushThreadGovernanceLink(
      `查看${heroGuidancePattern.residualPatternLabel || heroGuidancePattern.residualPattern}`,
      heroFocusPatternUrl,
    );
  }
  if (dataHygiene.hidden_low_specificity_total > 0 || dataHygiene.include_residual) {
    pushThreadGovernanceLink(dataHygiene.include_residual ? '切回聚焦视图' : '查看全部历史线程', residualToggleUrl);
  }
  if (dataHygiene.residual_pattern_filter) {
    pushThreadGovernanceLink('清除残留筛选', clearResidualPatternUrl);
  }
  const threadGovernanceGuidance = threadGovernanceGuidanceBase
    ? {
        ...threadGovernanceGuidanceBase,
        proofLabel:
          threadGovernanceGuidanceBase.proofLabel ||
          threadIdentityChecklistItem?.evidenceLabel ||
          threadIdentityChecklistItem?.evidence_label ||
          '',
        proofHref:
          threadGovernanceGuidanceBase.proofHref ||
          threadIdentityChecklistItem?.evidenceHref ||
          threadIdentityChecklistItem?.evidence_href ||
          '',
        proofUpdatedAt:
          threadGovernanceGuidanceBase.proofUpdatedAt ||
          threadIdentityChecklistItem?.evidenceUpdatedAt ||
          threadIdentityChecklistItem?.evidence_updated_at ||
          null,
        proofContextLabel:
          threadGovernanceGuidanceBase.proofContextLabel ||
          threadIdentityChecklistItem?.evidenceContextLabel ||
          threadIdentityChecklistItem?.evidence_context_label ||
          '',
        proofSourceHref:
          threadGovernanceGuidanceBase.proofSourceHref ||
          threadIdentityChecklistItem?.sourceHref ||
          threadIdentityChecklistItem?.source_href ||
          '',
        proofSourceLabel:
          threadGovernanceGuidanceBase.proofSourceLabel ||
          threadIdentityChecklistItem?.sourceLinkLabel ||
          threadIdentityChecklistItem?.source_link_label ||
          '',
        actionLinks:
          Array.isArray(threadGovernanceGuidanceBase.actionLinks) && threadGovernanceGuidanceBase.actionLinks.length > 0
            ? threadGovernanceGuidanceBase.actionLinks
            : threadGovernanceActionLinks,
      }
    : null;
  const commentCenterGuidance =
    commentWorkflow.focusGuidance || commentWorkflow.focus_guidance || buildHomeCommentCenterGuidance(commentWorkflow);
  const memoryCenterGuidance =
    memoryGovernance.focusGuidance ||
    memoryGovernance.focus_guidance ||
    buildHomeMemoryCenterGuidance(memoryGovernance);
  const threadViewGuidanceByFilter = buildThreadViewGuidanceByFilter(threadGroups, executionChecklist);
  const initialThreadViewGuidance =
    threadViewGuidanceByFilter[initialThreadFilter] || threadViewGuidanceByFilter.all || null;
  const threadFilters = [
    { key: 'all', label: '全部', count: threadGroups.length },
    {
      key: 'triage',
      label: '待分流评论',
      count: threadGroups.filter((group) => Number(group.comment_triage_count || 0) > 0).length,
    },
    {
      key: 'ready',
      label: '已接回执行',
      count: threadGroups.filter((group) => Number(group.comment_ready_count || 0) > 0).length,
    },
    {
      key: 'red',
      label: '红灯',
      count: threadGroups.filter((group) => Number(group.red_count || 0) > 0).length,
    },
    {
      key: 'active',
      label: '进行中',
      count: threadGroups.filter((group) => Number(group.in_progress_count || 0) > 0).length,
    },
    {
      key: 'completed',
      label: '已完成',
      count: threadGroups.filter((group) => Number(group.completed_count || 0) > 0).length,
    },
  ];
  const threadFilterLabelByKey = buildThreadFilterLabelMap(threadFilters);
  const initialVisibleThreadGroups = filterThreadGroupsForView(threadGroups, initialThreadFilter);
  const initialThreadFilterState = buildThreadFilterState(
    threadFilters,
    initialThreadFilter,
    initialVisibleThreadGroups.length,
  );

  const workspaceBaseContext = {
    includeSynthetic: dataHygiene.include_synthetic,
    includeResidual: dataHygiene.include_residual,
    residualPattern: dataHygiene.residual_pattern_filter,
  };
  const summaryCounts = [
    renderCount('活跃线程', counts.active_threads, counts.active_threads > 0 ? 'blue' : 'neutral', {
      href: `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'thread' })}#thread-view`,
      helper: '按线程查看',
    }),
    renderCount('任务总数', counts.total_tasks, counts.total_tasks > 0 ? 'green' : 'neutral', {
      href: `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'attention' })}#attention-view`,
      helper: '回到总览',
    }),
    renderCount('系统处理中', counts.in_progress_tasks, counts.in_progress_tasks > 0 ? 'blue' : 'neutral', {
      href: `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'attention' })}#lane-in-progress`,
      helper: '打开处理中',
    }),
    renderCount('等待许可', counts.waiting_human_tasks, counts.waiting_human_tasks > 0 ? 'red' : 'neutral', {
      href: `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'attention' })}#lane-waiting-human`,
      helper: '打开待拍板',
    }),
    renderCount('疑似停滞', counts.stalled_tasks, counts.stalled_tasks > 0 ? 'yellow' : 'neutral', {
      href: `${
        executionChecklist.revisitContextLinks?.length
          ? `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'attention' })}#revisit-context`
          : `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'attention' })}#execution-checklist`
      }`,
      helper: executionChecklist.revisitContextLinks?.length ? '优先回看' : '查看 Checklist',
    }),
    renderCount('已完成', counts.completed_tasks, counts.completed_tasks > 0 ? 'green' : 'neutral', {
      href: `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'attention' })}#lane-completed`,
      helper: '打开已完成',
    }),
  ].join('');
  const heroActionQueue = buildWorkspaceHeroActionQueue(
    executionChecklist,
    decisionFocus,
    commentWorkflow,
    memoryGovernance,
  );
  const renderHeroBoardLane = (title, note, tasks = [], emptyText, href) => {
    const visibleTasks = Array.isArray(tasks) ? tasks.slice(0, 2) : [];
    const overflowCount = Array.isArray(tasks) ? Math.max(0, tasks.length - visibleTasks.length) : 0;
    return `
      <section class="hero-board-lane">
        <div class="hero-board-lane-head">
          <h3>${escapeHtml(title)}</h3>
          <span>${escapeHtml(String(Array.isArray(tasks) ? tasks.length : 0))}</span>
        </div>
        <p>${escapeHtml(note)}</p>
        <div class="lane-list">${renderWorkspaceTaskList(visibleTasks, emptyText)}</div>
        ${
          overflowCount > 0
            ? `<a class="hero-board-more" href="${escapeHtml(href)}">还有 ${escapeHtml(String(overflowCount))} 条，打开完整列</a>`
            : ''
        }
      </section>
    `;
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(projectId)} Workspace</title>
    <style>
      :root {
        --bg: #fff8d7;
        --paper: #fffef8;
        --bg-panel: #fffdf3;
        --bg-panel-strong: #ffffff;
        --ink: #111111;
        --muted: #5f5f57;
        --line: #111111;
        --shadow: 8px 8px 0 #111111;
        --shadow-sm: 4px 4px 0 #111111;
        --red: #e85050;
        --yellow: #ffdc36;
        --green: #42ba6f;
        --blue: #5fb8ff;
        --neutral: #8d8d84;
        --cream: #fff3b8;
        --rose: #ffe8ea;
        --sky: #e7f7ff;
        --mint: #e7ffe9;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: "Arial Rounded MT Bold", "Avenir Next", "PingFang SC", "Hiragino Sans GB", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(255, 220, 54, 0.42), transparent 24rem),
          radial-gradient(circle at bottom right, rgba(95, 184, 255, 0.24), transparent 26rem),
          linear-gradient(180deg, #fffef8 0%, #fff8d7 100%);
        min-height: 100vh;
      }

      .shell {
        max-width: 1380px;
        margin: 0 auto;
        padding: 28px 20px 40px;
      }

      .hero {
        border: 2px solid var(--line);
        border-radius: 16px;
        background: var(--paper);
        box-shadow: var(--shadow);
        padding: 26px;
      }

      .hero-top {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .eyebrow .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--green);
        box-shadow: 0 0 0 8px rgba(47, 118, 88, 0.08);
      }

      h1 {
        margin: 16px 0 12px;
        font-size: clamp(34px, 4vw, 54px);
        line-height: 0.98;
        letter-spacing: -0.04em;
      }

      .hero-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
        gap: 16px;
      }

      .hero-copy p {
        margin: 0 0 10px;
        color: var(--muted);
        line-height: 1.65;
        font-size: 15px;
      }

      .hero-status-strip {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .hero-status-item {
        border: 2px solid var(--line);
        border-radius: 12px;
        background: #ffffff;
        box-shadow: var(--shadow-sm);
        padding: 12px 14px;
      }

      .hero-status-item strong {
        display: block;
        margin-bottom: 6px;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .hero-status-item span {
        display: block;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.45;
      }

      .hero-callout,
      .workspace-panel {
        border: 2px solid var(--line);
        border-radius: 14px;
        background: var(--bg-panel);
      }

      .hero-callout {
        box-shadow: var(--shadow-sm);
        padding: 18px;
      }

      .hero-callout strong {
        display: block;
        font-size: 13px;
        color: var(--muted);
        margin-bottom: 8px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .hero-callout div {
        font-size: 18px;
        line-height: 1.45;
      }

      .hero-actions,
      .hero-links,
      .view-switch {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }

      .hero-actions {
        margin-top: 18px;
      }

      .hero-links {
        margin-top: 14px;
      }

      .hero-links a,
      .refresh-note {
        font-size: 13px;
        color: var(--muted);
      }

      .hero-links a {
        color: var(--blue);
        text-decoration: none;
        border-bottom: 1px solid rgba(52, 95, 135, 0.28);
      }

      .hero-governance-strip {
        margin-top: 14px;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.66);
        padding: 12px;
      }

      .hero-governance-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .hero-checklist-strip {
        margin-top: 18px;
        border: 1px solid var(--line);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.74);
        padding: 16px 18px;
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(240px, 0.85fr);
        gap: 14px;
      }

      .hero-checklist-main strong,
      .hero-checklist-kpis strong {
        display: block;
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }

      .hero-checklist-main h2 {
        margin: 0 0 8px;
        font-size: 22px;
        line-height: 1.2;
        letter-spacing: -0.02em;
      }

      .hero-checklist-main p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
        font-size: 14px;
      }

      .hero-checklist-proof,
      .hero-checklist-meta,
      .hero-checklist-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
      }

      .hero-checklist-proof,
      .hero-checklist-actions {
        margin-top: 12px;
      }

      .hero-checklist-proof span,
      .hero-checklist-meta span,
      .hero-checklist-actions span {
        font-size: 13px;
        color: var(--muted);
      }

      .hero-checklist-kpis {
        display: grid;
        gap: 12px;
        align-content: start;
      }

      .hero-action-queue {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-top: 18px;
      }

      .hero-action-card {
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(246, 239, 230, 0.88);
        padding: 14px 16px;
        display: grid;
        gap: 10px;
      }

      .hero-action-card.tone-red {
        border-color: rgba(179, 61, 62, 0.28);
        background: rgba(255, 232, 233, 0.88);
      }

      .hero-action-card.tone-yellow {
        border-color: rgba(184, 129, 44, 0.24);
        background: rgba(255, 245, 224, 0.9);
      }

      .hero-action-card.tone-blue {
        border-color: rgba(76, 120, 129, 0.24);
        background: rgba(233, 242, 244, 0.9);
      }

      .hero-action-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .hero-action-badge {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .hero-action-card h3 {
        margin: 0;
        font-size: 16px;
        line-height: 1.4;
      }

      .hero-action-card p {
        margin: 0;
        font-size: 13px;
        color: var(--muted);
        line-height: 1.5;
      }

      .hero-action-card a {
        justify-self: start;
      }

      .hero-board-preview {
        display: grid;
        grid-template-columns: repeat(3, minmax(260px, 1fr));
        gap: 18px;
        margin-top: 22px;
      }

      .hero-board-lane {
        min-height: 360px;
        border: 2px solid var(--line);
        border-radius: 12px;
        background: var(--cream);
        box-shadow: var(--shadow-sm);
        padding: 14px;
      }

      .hero-board-lane:nth-child(1) {
        background: #ffe6e6;
      }

      .hero-board-lane:nth-child(2) {
        background: #fff4bc;
      }

      .hero-board-lane:nth-child(3) {
        background: #eaffd7;
      }

      .hero-board-lane-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 2px solid var(--line);
        padding-bottom: 10px;
      }

      .hero-board-lane h3 {
        margin: 0;
        font-size: 18px;
        line-height: 1.2;
      }

      .hero-board-lane-head span {
        display: inline-grid;
        min-width: 28px;
        height: 28px;
        place-items: center;
        border: 2px solid var(--line);
        border-radius: 8px;
        background: #ffffff;
        font-weight: 900;
      }

      .hero-board-lane p {
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      .hero-board-more {
        display: inline-flex;
        margin-top: 12px;
        color: var(--ink);
        font-size: 13px;
        font-weight: 900;
      }

      .hero-checklist-metric {
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(246, 239, 230, 0.82);
        padding: 12px 14px;
      }

      .hero-checklist-metric div {
        font-size: 18px;
        line-height: 1.3;
        margin-bottom: 4px;
      }

      .hero-checklist-metric span {
        font-size: 13px;
        color: var(--muted);
        line-height: 1.5;
      }

      .button,
      .button-secondary,
      .switch-button {
        appearance: none;
        border: 2px solid var(--line);
        border-radius: 8px;
        padding: 11px 16px;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        text-decoration: none;
        box-shadow: 3px 3px 0 #111111;
      }

      .button {
        background: var(--yellow);
        color: var(--ink);
      }

      .button-secondary,
      .switch-button {
        background: #ffffff;
        color: var(--ink);
      }

      .switch-button.is-active {
        background: var(--ink);
        color: #ffffff;
      }

      .counts {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px;
        margin-top: 20px;
      }

      .count-card {
        display: block;
        min-height: 112px;
        border: 2px solid var(--line);
        border-radius: 12px;
        background: #ffffff;
        box-shadow: var(--shadow-sm);
        color: inherit;
        padding: 14px 16px;
        text-decoration: none;
      }

      .count-card.tone-red { background: var(--rose); }
      .count-card.tone-yellow { background: #fff4bc; }
      .count-card.tone-green { background: var(--mint); }
      .count-card.tone-blue { background: var(--sky); }

      .count-card-link {
        transition: transform 120ms ease, box-shadow 120ms ease;
      }

      .count-card-link:hover {
        transform: translate(-1px, -1px);
        box-shadow: 6px 6px 0 #111111;
      }

      .count-label {
        margin-bottom: 10px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 800;
      }

      .count-value {
        font-size: 34px;
        line-height: 1;
        font-weight: 900;
      }

      .count-helper {
        margin-top: 10px;
        color: var(--muted);
        font-size: 12px;
      }

      .view-switch {
        margin: 22px 0 14px;
      }

      .workspace-panel {
        box-shadow: var(--shadow);
        padding: 18px;
      }

      .checklist-panel {
        margin-top: 16px;
      }

      .checklist-summary {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(260px, 0.85fr);
        gap: 14px;
        margin-bottom: 16px;
      }

      .checklist-callout,
      .checklist-rule,
      .checklist-card {
        border-radius: 20px;
        border: 1px solid var(--line);
        background: var(--bg-panel-strong);
        padding: 16px;
      }

      .checklist-callout strong,
      .checklist-rule strong,
      .checklist-acceptance strong {
        display: block;
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 6px;
      }

      .checklist-callout div,
      .checklist-rule div,
      .checklist-acceptance span {
        font-size: 14px;
        line-height: 1.6;
      }

      .checklist-progress {
        margin: 0 0 14px;
      }

      .checklist-progress-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }

      .checklist-progress-top strong,
      .checklist-progress-top span {
        font-size: 13px;
      }

      .checklist-progress-top span {
        color: var(--muted);
      }

      .checklist-progress-bar {
        height: 10px;
        border-radius: 999px;
        background: rgba(29, 34, 32, 0.08);
        overflow: hidden;
      }

      .checklist-progress-bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(52, 95, 135, 0.92), rgba(47, 118, 88, 0.92));
      }

      .checklist-meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }

      .checklist-meta span {
        font-size: 12px;
        color: var(--muted);
        background: rgba(29, 34, 32, 0.06);
        border-radius: 999px;
        padding: 6px 10px;
      }

      .checklist-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .checklist-card-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
      }

      .checklist-priority,
      .checklist-status {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }

      .checklist-priority {
        background: rgba(29, 34, 32, 0.08);
        color: var(--ink);
      }

      .checklist-status.status-completed {
        background: rgba(47, 118, 88, 0.12);
        color: var(--green);
      }

      .checklist-status.status-in_progress {
        background: rgba(52, 95, 135, 0.12);
        color: var(--blue);
      }

      .checklist-status.status-pending {
        background: rgba(177, 132, 50, 0.12);
        color: var(--yellow);
      }

      .checklist-card h3 {
        margin: 0 0 8px;
        font-size: 18px;
        line-height: 1.3;
      }

      .checklist-card p {
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.65;
      }

      .checklist-progress-note {
        margin: -2px 0 10px;
        color: var(--blue);
        font-size: 13px;
      }

      .checklist-evidence {
        margin: 2px 0 10px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(52, 95, 135, 0.08);
        border: 1px solid rgba(52, 95, 135, 0.12);
      }

      .checklist-evidence strong {
        display: block;
        font-size: 12px;
        color: var(--blue);
        margin-bottom: 4px;
      }

      .checklist-evidence span {
        display: block;
        font-size: 13px;
        line-height: 1.55;
        color: var(--ink);
      }

      .checklist-acceptance {
        border-top: 1px solid rgba(49, 60, 51, 0.08);
        padding-top: 12px;
        margin-top: 12px;
      }

      .checklist-remaining {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }

      .checklist-remaining span {
        font-size: 12px;
        color: var(--ink);
        background: rgba(52, 95, 135, 0.10);
        border-radius: 999px;
        padding: 6px 10px;
      }

      .checklist-remaining a {
        font-size: 12px;
        color: var(--blue);
        background: rgba(52, 95, 135, 0.10);
        border-radius: 999px;
        padding: 6px 10px;
        text-decoration: none;
      }

      .checklist-link {
        display: inline-flex;
        margin-top: 12px;
        color: var(--blue);
        text-decoration: none;
        font-size: 13px;
      }

      .governance-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 12px;
      }

      .governance-action-button,
      .governance-action-link {
        appearance: none;
        border: 1px solid rgba(52, 95, 135, 0.18);
        background: rgba(52, 95, 135, 0.08);
        color: var(--blue);
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      }

      .governance-action-button:hover:not(:disabled),
      .governance-action-link:hover {
        transform: translateY(-1px);
        background: rgba(52, 95, 135, 0.12);
        border-color: rgba(52, 95, 135, 0.28);
      }

      .governance-action-button:disabled {
        opacity: 0.55;
        cursor: progress;
      }

      .workspace-action-feedback {
        margin: 16px 0 0;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(52, 95, 135, 0.16);
        background: rgba(236, 244, 252, 0.94);
        color: var(--blue);
        font-size: 13px;
        line-height: 1.5;
      }

      .workspace-action-feedback[hidden] {
        display: none;
      }

      .workspace-action-feedback[data-tone="error"] {
        border-color: rgba(178, 78, 65, 0.22);
        background: rgba(255, 242, 239, 0.96);
        color: var(--red);
      }

      .workspace-action-feedback[data-tone="success"] {
        border-color: rgba(47, 118, 88, 0.22);
        background: rgba(239, 249, 244, 0.96);
        color: var(--green);
      }

      .workspace-inline-action-box {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(49, 60, 51, 0.08);
      }

      .workspace-inline-action-box strong {
        display: block;
        margin-bottom: 8px;
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .workspace-inline-hint {
        margin: 0 0 10px;
        font-size: 13px;
        line-height: 1.5;
        color: var(--muted);
      }

      .workspace-inline-note {
        width: 100%;
        min-height: 88px;
        resize: vertical;
        border-radius: 14px;
        border: 1px solid rgba(49, 60, 51, 0.14);
        background: rgba(255, 255, 255, 0.96);
        color: var(--ink);
        padding: 12px 14px;
        font: inherit;
        line-height: 1.55;
      }

      .workspace-inline-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 10px;
      }

      .checklist-step {
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 6px;
      }

      .governance-panel {
        margin-top: 16px;
      }

      .decision-focus-panel {
        margin-top: 16px;
      }

      .decision-focus-summary {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        border-radius: 18px;
        border: 1px solid rgba(178, 132, 50, 0.18);
        background: linear-gradient(180deg, rgba(255, 248, 235, 0.96), rgba(255, 252, 246, 0.98));
        padding: 14px 16px;
      }

      .decision-focus-summary strong {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
      }

      .decision-focus-summary p {
        margin: 0;
        font-size: 13px;
        color: var(--muted);
      }

      .decision-focus-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .decision-focus-lane {
        border-radius: 20px;
        border: 1px solid var(--line);
        background: var(--bg-panel-strong);
        padding: 16px;
      }

      .decision-focus-lane h3 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      .decision-focus-lane p {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 14px;
      }

      .decision-focus-list {
        display: grid;
        gap: 12px;
        margin-top: 14px;
      }

      .decision-focus-card {
        border-radius: 18px;
        border: 1px solid rgba(49, 60, 51, 0.1);
        background: rgba(255,255,255,0.92);
        padding: 14px;
      }

      .decision-focus-callout {
        display: grid;
        gap: 4px;
        border-radius: 14px;
        border: 1px solid rgba(49, 60, 51, 0.08);
        background: rgba(249, 246, 239, 0.88);
        padding: 10px 12px;
        margin-top: 12px;
      }

      .decision-focus-callout strong {
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .decision-focus-callout span {
        font-size: 13px;
        line-height: 1.5;
        color: var(--ink);
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }

      .meta-grid-row {
        border-radius: 14px;
        border: 1px solid rgba(49, 60, 51, 0.08);
        background: rgba(250, 247, 242, 0.92);
        padding: 10px 12px;
      }

      .meta-grid-row dt {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
      }

      .meta-grid-row dd {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
      }

      .workflow-next {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(49, 60, 51, 0.08);
      }

      .workflow-next strong {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        text-transform: uppercase;
        color: var(--muted);
      }

      .home-comment-audit-list {
        display: grid;
        gap: 10px;
        margin-top: 8px;
      }

      .home-comment-audit-item {
        border-radius: 14px;
        border: 1px solid rgba(49, 60, 51, 0.08);
        background: rgba(255,255,255,0.74);
        padding: 10px 12px;
        display: grid;
        gap: 4px;
      }

      .home-comment-audit-top {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 8px;
      }

      .home-comment-audit-badge {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(52, 95, 135, 0.12);
        color: var(--ink);
        font-size: 12px;
        font-weight: 600;
      }

      .home-comment-audit-item.tone-red .home-comment-audit-badge {
        background: rgba(178, 78, 65, 0.12);
      }

      .home-comment-audit-item.tone-yellow .home-comment-audit-badge {
        background: rgba(177, 132, 50, 0.14);
      }

      .home-comment-audit-item strong {
        font-size: 13px;
        color: var(--ink);
      }

      .checklist-context-progress {
        display: block;
        color: var(--muted) !important;
      }

      .governance-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .governance-kpi {
        border-radius: 18px;
        border: 1px solid var(--line);
        background: var(--bg-panel-strong);
        padding: 14px 16px;
      }

      .governance-kpi strong {
        display: block;
        font-size: 26px;
        line-height: 1;
        margin-bottom: 6px;
      }

      .governance-kpi span {
        font-size: 13px;
        color: var(--muted);
      }

      .governance-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .governance-guidance-grid {
        margin-bottom: 14px;
      }

      .governance-pattern-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 14px;
      }

      .governance-pattern-card {
        border-radius: 20px;
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(246, 242, 233, 0.92), rgba(255, 250, 244, 0.98));
        padding: 16px;
      }

      .governance-pattern-card.is-active {
        border-color: rgba(52, 95, 135, 0.34);
        box-shadow: 0 18px 44px rgba(52, 95, 135, 0.12);
        background: linear-gradient(180deg, rgba(231, 241, 251, 0.96), rgba(247, 251, 255, 0.98));
      }

      .governance-pattern-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 10px;
      }

      .governance-pattern-top strong {
        font-size: 15px;
        letter-spacing: -0.01em;
      }

      .governance-pattern-top span {
        font-size: 12px;
        color: var(--muted);
      }

      .governance-pattern-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid rgba(52, 95, 135, 0.18);
        background: rgba(52, 95, 135, 0.10);
        color: var(--blue);
        padding: 4px 10px;
        font-size: 12px;
      }

      .governance-pattern-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .governance-pattern-meta span {
        border-radius: 999px;
        border: 1px solid rgba(49, 60, 51, 0.12);
        padding: 4px 10px;
        font-size: 12px;
        color: var(--ink);
        background: rgba(255, 255, 255, 0.72);
      }

      .governance-focus-summary {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
        border-radius: 18px;
        border: 1px solid rgba(52, 95, 135, 0.16);
        background: linear-gradient(180deg, rgba(236, 244, 252, 0.94), rgba(248, 252, 255, 0.98));
        padding: 14px 16px;
      }

      .governance-focus-summary strong {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
      }

      .governance-focus-summary p {
        margin: 0;
        font-size: 13px;
        color: var(--muted);
      }

      .governance-card {
        border-radius: 20px;
        border: 1px solid var(--line);
        background: var(--bg-panel-strong);
        padding: 16px;
      }

      .governance-card.tone-neutral {
        border-color: rgba(49, 60, 51, 0.12);
      }

      .panel-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: baseline;
        margin-bottom: 16px;
      }

      .panel-head h2,
      .lane h3,
      .thread-group h3 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      .panel-head p,
      .lane p,
      .thread-group-head p {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 14px;
      }

      .view-panel[hidden] {
        display: none !important;
      }

      .attention-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(280px, 1fr));
        gap: 18px;
        align-items: stretch;
      }

      .lane,
      .thread-group {
        border-radius: 12px;
        border: 2px solid var(--line);
        background: var(--bg-panel-strong);
        padding: 16px;
      }

      .lane {
        min-height: 520px;
        background: var(--cream);
        box-shadow: var(--shadow-sm);
      }

      .lane:nth-child(1) {
        background: #ffe6e6;
      }

      .lane:nth-child(2) {
        background: #fff4bc;
      }

      .lane:nth-child(3) {
        background: #eaffd7;
      }

      .lane h3 {
        border-bottom: 2px solid var(--line);
        padding-bottom: 10px;
      }

      .lane-list,
      .thread-task-list {
        display: grid;
        gap: 12px;
        margin-top: 14px;
      }

      .workspace-task-card {
        border-radius: 10px;
        padding: 12px;
        background: #ffffff;
        border: 2px solid var(--line);
        box-shadow: 3px 3px 0 #111111;
      }

      .workspace-task-card.tone-red { background: #fff4f4; }
      .workspace-task-card.tone-yellow { background: #fffdf0; }
      .workspace-task-card.tone-green { background: #f6fff3; }
      .workspace-task-card.tone-blue { background: #f3fbff; }

      .workspace-task-top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        margin-bottom: 12px;
      }

      .workspace-badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .workspace-badge,
      .workspace-status {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 10px;
        border: 2px solid var(--line);
        border-radius: 6px;
        font-size: 12px;
        font-weight: 900;
      }

      .workspace-badge {
        color: var(--ink);
        background: var(--neutral);
      }

      .signal-red { background: var(--red); }
      .signal-yellow { background: var(--yellow); }
      .signal-green { background: var(--green); }

      .workspace-status {
        color: var(--ink);
        background: #ffffff;
      }

      .workspace-status-focus {
        background: rgba(52, 95, 135, 0.12);
        color: var(--blue);
      }

      .workspace-status-step {
        background: rgba(47, 118, 88, 0.12);
        color: var(--green);
      }

      .workspace-thread-id {
        font-size: 11px;
        color: var(--muted);
        letter-spacing: 0.06em;
        text-transform: uppercase;
        max-width: 92px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .workspace-task-card h3 {
        margin: 0 0 8px;
        font-size: 17px;
        line-height: 1.28;
      }

      .workspace-task-summary,
      .workspace-task-note {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
      }

      .workspace-next-step {
        display: grid;
        gap: 4px;
        border-top: 1px solid rgba(49, 60, 51, 0.08);
        margin-top: 12px;
        padding-top: 12px;
      }

      .workspace-next-step-primary {
        border: 2px solid var(--line);
        border-radius: 8px;
        background: #fff7c7;
        margin-top: 10px;
        padding: 10px 12px;
      }

      .workspace-focus-callout {
        border-radius: 8px;
        border: 2px solid var(--line);
        background: var(--sky);
        padding: 10px 12px;
      }

      .workspace-next-step strong {
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .workspace-proof-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        margin-top: 12px;
      }

      .workspace-proof-item {
        border-radius: 8px;
        border: 2px solid var(--line);
        background: #ffffff;
        padding: 10px 12px;
      }

      .workspace-compact-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
      }

      .workspace-compact-meta span {
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.72);
        color: var(--muted);
        padding: 4px 8px;
        font-size: 12px;
      }

      .workspace-task-details {
        margin-top: 10px;
      }

      .workspace-task-details summary {
        cursor: pointer;
        color: var(--muted);
        font-size: 13px;
        font-weight: 800;
      }

      .workspace-task-details[open] summary {
        margin-bottom: 10px;
      }

      .workspace-proof-item strong {
        display: block;
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 4px;
      }

      .workspace-proof-item span {
        font-size: 13px;
        line-height: 1.5;
        color: var(--ink);
      }

      .task-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        list-style: none;
        margin: 10px 0 0;
        padding: 0;
      }

      .task-meta li {
        border-radius: 999px;
        background: rgba(17, 17, 17, 0.06);
        color: var(--muted);
        padding: 5px 9px;
        font-size: 12px;
      }

      .workspace-links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .task-link {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        border: 2px solid var(--line);
        border-radius: 8px;
        background: var(--yellow);
        box-shadow: 2px 2px 0 #111111;
        color: var(--ink);
        padding: 0 10px;
        font-size: 13px;
        font-weight: 900;
        text-decoration: none;
      }

      .task-link:hover {
        transform: translate(-1px, -1px);
        box-shadow: 3px 3px 0 #111111;
      }

      .empty-state {
        border: 2px dashed var(--line);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.62);
        color: var(--muted);
        padding: 14px;
      }

      .thread-groups {
        display: grid;
        gap: 14px;
      }

      .thread-group-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }

      .thread-group-stats {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .thread-focus-callout {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(52, 95, 135, 0.12);
        background: rgba(52, 95, 135, 0.08);
      }

      .thread-focus-callout strong {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: var(--blue);
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .thread-focus-callout span {
        display: block;
        font-size: 13px;
        line-height: 1.55;
        color: var(--ink);
      }

      .thread-filter-bar {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }

      .thread-filter-summary {
        display: grid;
        gap: 4px;
        justify-items: end;
        text-align: right;
      }

      .thread-filter-summary strong {
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .thread-filter-summary span {
        font-size: 14px;
        color: var(--ink);
      }

      .thread-filter-button {
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255,255,255,0.82);
        color: var(--ink);
        padding: 9px 14px;
        font: inherit;
        cursor: pointer;
      }

      .thread-filter-button.is-active {
        background: rgba(29, 34, 32, 0.92);
        color: white;
      }

      .empty-state strong,
      .empty-state span {
        display: block;
      }

      .empty-state strong {
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 6px;
      }

      .empty-state span,
      .empty-state p {
        font-size: 14px;
        line-height: 1.6;
      }

      .empty-state p {
        margin: 8px 0 0;
        color: var(--muted);
      }

      .thread-stat {
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(29, 34, 32, 0.06);
      }

      .tone-red { border-color: rgba(178, 78, 65, 0.22); }
      .tone-yellow { border-color: rgba(177, 132, 50, 0.24); }
      .tone-green { border-color: rgba(47, 118, 88, 0.22); }
      .tone-blue { border-color: rgba(52, 95, 135, 0.22); }

      @media (max-width: 1200px) {
        .counts {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .checklist-summary,
        .checklist-grid,
        .governance-kpis,
        .governance-pattern-grid,
        .hero-governance-grid,
        .governance-grid,
        .attention-grid,
        .hero-board-preview,
        .hero-grid,
        .hero-status-strip,
        .workspace-proof-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 760px) {
        .shell {
          padding: 18px 14px 28px;
        }

        .hero-checklist-strip,
        .hero,
        .workspace-panel {
          border-radius: 22px;
        }

        .hero-checklist-strip,
        .counts {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="hero-top">
          <div>
            <div class="eyebrow">
              <span class="dot"></span>
              <span>${escapeHtml(project.projectId)} workspace</span>
            </div>
            <h1>Cortex 协作工作台 · 任务看板</h1>
          </div>
          <div class="view-switch" role="tablist" aria-label="工作台视图切换">
            <button class="switch-button${initialView === 'attention' ? ' is-active' : ''}" type="button" data-view-target="attention">按注意力</button>
            <button class="switch-button${initialView === 'thread' ? ' is-active' : ''}" type="button" data-view-target="thread">按线程</button>
          </div>
        </div>

        <div class="hero-grid">
          <div class="hero-copy">
            <div class="hero-status-strip">
              <div class="hero-status-item">
                <strong>当前焦点</strong>
                <span>${escapeHtml(summarize(hero.current_focus, 64))}</span>
              </div>
              <div class="hero-status-item">
                <strong>红黄绿</strong>
                <span>红 ${escapeHtml(String(counts.red_signal_tasks))} / 黄 ${escapeHtml(String(counts.yellow_signal_tasks))} / 绿 ${escapeHtml(String(counts.green_signal_tasks))}</span>
              </div>
              <div class="hero-status-item">
                <strong>轨迹</strong>
                <span>${escapeHtml(summarize(hero.trajectory_status || hero.trajectory_reason, 64))}</span>
              </div>
            </div>
          </div>
          <div class="hero-callout">
            <strong>下一步</strong>
            <div>${escapeHtml(summarize(hero.next_step, 110))}</div>
          </div>
        </div>

        <div class="hero-actions">
          <button class="button" type="button" onclick="window.location.reload()">立即刷新</button>
          <a class="button-secondary" href="${escapeHtml(jsonUrl)}" target="_blank" rel="noreferrer">查看 JSON</a>
          <a class="button-secondary" href="/dashboard?project_id=${escapeHtml(projectId)}">旧版 Dashboard</a>
          <span class="refresh-note">最近刷新：${escapeHtml(formatIso(payload.generated_at))}</span>
          <span class="refresh-note" data-refresh-label>15s 后自动刷新</span>
        </div>
        <div
          class="workspace-action-feedback"
          data-workspace-action-feedback
          ${initialActionFeedback ? `data-tone="${escapeHtml(initialActionFeedbackTone)}"` : 'hidden'}
        >${escapeHtml(initialActionFeedback)}</div>

        ${
          hero.entry_links.length > 0 || hero.review_window_note
            ? `<div class="hero-links">
                ${hero.entry_links
                  .map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`)
                  .join('')}
                ${hero.review_window_note ? `<span class="refresh-note">Review 窗口：${escapeHtml(hero.review_window_note)}</span>` : ''}
              </div>`
            : ''
        }

        ${
          dataHygiene.hidden_synthetic_total > 0 || dataHygiene.include_synthetic
            ? `<div class="hero-links">
                <span class="refresh-note">${
                  dataHygiene.include_synthetic
                    ? `当前已显示 smoke / 验收残留数据。`
                    : `已默认隐藏 ${dataHygiene.hidden_synthetic_total} 条 smoke / 验收残留数据。`
                }</span>
                <a href="${escapeHtml(syntheticToggleUrl)}">${dataHygiene.include_synthetic ? '切回净化视图' : '查看完整原始视图'}</a>
              </div>`
            : ''
        }

        ${
          dataHygiene.hidden_low_specificity_total > 0 || dataHygiene.include_residual
            ? `<div class="hero-links">
                <span class="refresh-note">${
                  dataHygiene.include_residual
                    ? `当前已显示低特异度历史线程。`
                    : `已默认隐藏 ${dataHygiene.hidden_low_specificity_total} 条低特异度历史线程（含陈旧已完成 / 待回看）。`
                }</span>
                <a href="${escapeHtml(residualToggleUrl)}">${dataHygiene.include_residual ? '切回聚焦视图' : '查看全部历史线程'}</a>
              </div>`
            : ''
        }

        ${
          dataHygiene.residual_pattern_filter
            ? `<div class="hero-links">
                <span class="refresh-note">当前只看：${escapeHtml(dataHygiene.residual_pattern_filter_label || dataHygiene.residual_pattern_filter)}</span>
                <a href="${escapeHtml(clearResidualPatternUrl)}">清除残留筛选</a>
              </div>`
            : ''
        }

        <div class="hero-board-preview" aria-label="任务状态预览">
          ${renderHeroBoardLane(
            '红灯待拍板',
            '只放需要你明确拍板的阻塞项。',
            attentionView.waiting_human,
            '当前没有等待许可的任务。',
            `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'attention' })}#lane-waiting-human`,
          )}
          ${renderHeroBoardLane(
            '系统处理中',
            'Agent 已接单、执行中，或黄灯先绕行后回看。',
            attentionView.in_progress,
            '当前没有正在处理中的任务。',
            `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'attention' })}#lane-in-progress`,
          )}
          ${renderHeroBoardLane(
            '已完成',
            '已经收口，可回看、审计或沉淀 memory。',
            attentionView.completed,
            '当前还没有完成的任务。',
            `${buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'attention' })}#lane-completed`,
          )}
        </div>

        ${
          heroDataHygieneGuidance
            ? `<div class="hero-governance-strip" id="hero-data-hygiene-guidance" data-hero-data-hygiene-guidance>
                ${renderCenterFocusGuidanceStrip(heroDataHygieneGuidance, {
                  nodeTitle: '当前治理焦点',
                  summaryTitle: '当前判断',
                  actionTitle: '这一步处理',
                })}
                ${renderGuidanceProofRow(heroDataHygieneGuidance, {
                  className: 'hero-checklist-proof hero-governance-proof',
                })}
                ${renderGuidanceActionLinks(heroDataHygieneGuidance, {
                  className: 'hero-checklist-actions hero-governance-actions',
                })}
              </div>`
            : ''
        }

        <div class="hero-checklist-strip">
          <div class="hero-checklist-main">
            <strong>主闭环速览</strong>
            <h2>${escapeHtml(executionChecklist.focusTitle || executionChecklist.title || '当前没有主闭环')}</h2>
            <p>${escapeHtml(executionChecklist.focusSummary || executionChecklist.summary || '当新的闭环进入时，这里会优先告诉你当前系统正在推进哪一步。')}</p>
            <div class="hero-checklist-meta">
              <span>${
                executionChecklist.focusStepNumber
                  ? `第 ${escapeHtml(String(executionChecklist.focusStepNumber))} 步 · ${escapeHtml(executionChecklist.focusStatusLabel || '未记录')}`
                  : `当前焦点状态：${escapeHtml(executionChecklist.focusStatusLabel || '未记录')}`
              }</span>
              <span>${escapeHtml(String(executionChecklist.progressPercent || 0))}% · ${escapeHtml(executionChecklist.progressLabel || '')}</span>
              <span>${escapeHtml(executionChecklist.remainingHeadline || '')}</span>
            </div>
            ${
              executionChecklist.focusEvidenceLabel
                ? `<div class="hero-checklist-proof">
                    <span>最近证据：${escapeHtml(executionChecklist.focusEvidenceLabel)}</span>
                    ${
                      executionChecklist.focusEvidenceUpdatedAt
                        ? `<span>更新于 ${escapeHtml(formatIso(executionChecklist.focusEvidenceUpdatedAt))}</span>`
                        : ''
                    }
                    ${
                      executionChecklist.focusEvidenceContextLabel
                        ? `<span>证据现场：${escapeHtml(executionChecklist.focusEvidenceContextLabel)}</span>`
                        : ''
                    }
                  </div>`
                : ''
            }
            <div class="hero-checklist-actions">
              ${
                executionChecklist.focusHref
                  ? `<a class="checklist-link" href="${escapeHtml(executionChecklist.focusHref)}">${escapeHtml(executionChecklist.focusLinkLabel || '打开当前主闭环')}</a>`
                  : ''
              }
              ${
                executionChecklist.focusEvidenceHref
                  ? `<a class="checklist-link" href="${escapeHtml(executionChecklist.focusEvidenceHref)}">打开证据现场</a>`
                  : ''
              }
              ${
                executionChecklist.focusEvidenceSourceHref
                  ? `<a class="checklist-link" href="${escapeHtml(executionChecklist.focusEvidenceSourceHref)}" target="_blank" rel="noreferrer">${escapeHtml(executionChecklist.focusEvidenceSourceLabel || '打开源位置')}</a>`
                  : ''
              }
            </div>
          </div>
          <div class="hero-checklist-kpis">
            <div class="hero-checklist-metric">
              <strong>闭环进度</strong>
              <div>${escapeHtml(String(executionChecklist.completedCount || 0))} / ${escapeHtml(String((executionChecklist.items || []).length || 0))} 已收口</div>
              <span>${escapeHtml(executionChecklist.nextAcceptance || '当前没有额外验收说明。')}</span>
            </div>
            <div class="hero-checklist-metric">
              <strong>状态分布</strong>
              <div>${escapeHtml(String(executionChecklist.inProgressCount || 0))} 进行中 · ${escapeHtml(String(executionChecklist.pendingCount || 0))} 待执行</div>
              <span>${escapeHtml(executionChecklist.checkpointRule || '关键 checkpoint 落定后再沉淀记忆。')}</span>
            </div>
          </div>
        </div>
        ${
          heroActionQueue.length > 0
            ? `<div class="hero-action-queue">
                ${heroActionQueue
                  .map(
                    (item) => `
                      <article class="hero-action-card tone-${escapeHtml(item.tone || 'neutral')}">
                        <div class="hero-action-top">
                          <span class="hero-action-badge">${escapeHtml(item.badge)}</span>
                          <span class="checklist-context-progress">当前执行引导</span>
                        </div>
                        <h3>${escapeHtml(item.title)}</h3>
                        <p>${escapeHtml(item.detail || '打开对应现场继续处理。')}</p>
                        <a class="checklist-link" href="${escapeHtml(item.href)}">${escapeHtml(item.hrefLabel || '继续处理')}</a>
                      </article>
                    `,
                  )
                  .join('')}
              </div>`
            : ''
        }

        <div class="counts">${summaryCounts}</div>
      </section>

      <section id="execution-checklist" class="workspace-panel checklist-panel">
        <div class="panel-head">
          <div>
            <h2>${escapeHtml(executionChecklist.title)}</h2>
            <p>${escapeHtml(executionChecklist.summary)}</p>
          </div>
        </div>
        <div class="checklist-summary">
          <div class="checklist-callout">
            <div class="checklist-progress">
              <div class="checklist-progress-top">
                <strong>闭环进度</strong>
                <span>${escapeHtml(String(executionChecklist.progressPercent || 0))}% · ${escapeHtml(executionChecklist.progressLabel || '')}</span>
              </div>
              <div class="checklist-progress-bar">
                <span style="width:${escapeHtml(String(executionChecklist.progressPercent || 0))}%"></span>
              </div>
            </div>
            <strong>当前主闭环</strong>
            <div>${escapeHtml(executionChecklist.focusTitle)}</div>
            <p>${escapeHtml(executionChecklist.focusSummary)}</p>
            ${
              executionChecklist.focusEvidenceLabel
                ? `<div class="checklist-evidence">
                    <strong>最近证据</strong>
                    <span>${escapeHtml(executionChecklist.focusEvidenceLabel)}</span>
                    ${
                      executionChecklist.focusEvidenceUpdatedAt
                        ? `<span>更新于 ${escapeHtml(formatIso(executionChecklist.focusEvidenceUpdatedAt))}</span>`
                        : ''
                    }
                    ${
                      executionChecklist.focusEvidenceContextLabel
                        ? `<span>证据现场：${escapeHtml(executionChecklist.focusEvidenceContextLabel)}</span>`
                        : ''
                    }
                    ${
                      executionChecklist.focusEvidenceHref
                        ? `<a class="checklist-link" href="${escapeHtml(executionChecklist.focusEvidenceHref)}">打开证据现场</a>`
                        : ''
                    }
                    ${
                      executionChecklist.focusEvidenceSourceHref
                        ? `<a class="checklist-link" href="${escapeHtml(executionChecklist.focusEvidenceSourceHref)}" target="_blank" rel="noreferrer">${escapeHtml(executionChecklist.focusEvidenceSourceLabel || '打开源位置')}</a>`
                        : ''
                    }
                  </div>`
                : ''
            }
            <div class="checklist-acceptance">
              <strong>下一条验收</strong>
              <span>${escapeHtml(executionChecklist.nextAcceptance)}</span>
            </div>
            <div class="checklist-meta">
              <span>当前焦点：第 ${escapeHtml(String(executionChecklist.focusStepNumber || 0))} 步 · ${escapeHtml(executionChecklist.focusStatusLabel || '未记录')}</span>
              <span>${escapeHtml(executionChecklist.remainingHeadline || '')}</span>
            </div>
            ${
              executionChecklist.focusContextLinks?.length
                ? `<div class="checklist-remaining">
                    <span>${escapeHtml(executionChecklist.focusContextTitle || '优先清理')}</span>
                    ${executionChecklist.focusContextLinks
                      .map(
                        (item) =>
                          `<a href="${escapeHtml(item.href || '#')}">${escapeHtml(item.label || '')}</a>`,
                      )
                      .join('')}
                  </div>`
                : ''
            }
            ${
              executionChecklist.revisitContextLinks?.length
                ? `<div id="revisit-context" class="checklist-remaining">
                    <span>${escapeHtml(executionChecklist.revisitContextTitle || '优先回看')}</span>
                    ${executionChecklist.revisitContextLinks
                      .map(
                        (item) =>
                          `<a href="${escapeHtml(item.href || '#')}">${escapeHtml(item.label || '')}</a>`,
                      )
                      .join('')}
                  </div>`
                : ''
            }
            ${
              executionChecklist.focusHref
                ? `<a class="checklist-link" href="${escapeHtml(executionChecklist.focusHref)}">${escapeHtml(executionChecklist.focusLinkLabel || '打开当前主闭环')}</a>`
                : ''
            }
            <div class="checklist-meta">
              <span>${escapeHtml(String(executionChecklist.completedCount))} 已完成</span>
              <span>${escapeHtml(String(executionChecklist.inProgressCount))} 进行中</span>
              <span>${escapeHtml(String(executionChecklist.pendingCount))} 待执行</span>
            </div>
          </div>
          <div class="checklist-rule">
            <strong>推进规则</strong>
            <div>${escapeHtml(executionChecklist.checkpointRule)}</div>
            <div class="checklist-meta">
              <span>${escapeHtml(executionChecklist.heartbeatNote)}</span>
            </div>
            ${
              executionChecklist.remainingItems?.length
                ? `<div class="checklist-remaining">
                    ${executionChecklist.remainingItems
                      .map((item) => `<span>${escapeHtml(item.statusLabel || '')} · ${escapeHtml(item.title || '')}</span>`)
                      .join('')}
                  </div>`
                : ''
            }
          </div>
        </div>
        <div class="checklist-grid">
          ${executionChecklist.items
            .map(
              (item) => `
                <article class="checklist-card tone-${escapeHtml(item.status === 'completed' ? 'green' : item.status === 'in_progress' ? 'blue' : 'yellow')}">
                  <div class="checklist-card-top">
                    <span class="checklist-priority">${escapeHtml(item.priority)}</span>
                    <span class="checklist-status status-${escapeHtml(item.status)}">${escapeHtml(item.statusLabel || '')}</span>
                  </div>
                  <div class="checklist-step">闭环 ${escapeHtml(String(item.stepNumber || ''))}${item.isFocus ? ' · 当前焦点' : ''}</div>
                  <h3>${escapeHtml(item.title)}</h3>
                  <p>${escapeHtml(item.summary)}</p>
                  ${item.progressNote ? `<p class="checklist-progress-note">${escapeHtml(item.progressNote)}</p>` : ''}
                  ${
                    item.evidenceLabel
                      ? `<div class="checklist-evidence">
                          <strong>最近证据</strong>
                          <span>${escapeHtml(item.evidenceLabel)}</span>
                          ${item.evidenceUpdatedAt ? `<span>更新于 ${escapeHtml(formatIso(item.evidenceUpdatedAt))}</span>` : ''}
                          ${item.evidenceContextLabel ? `<span>证据现场：${escapeHtml(item.evidenceContextLabel)}</span>` : ''}
                          ${item.evidenceHref ? `<a class="checklist-link" href="${escapeHtml(item.evidenceHref)}">打开证据现场</a>` : ''}
                          ${
                            item.sourceHref
                              ? `<a class="checklist-link" href="${escapeHtml(item.sourceHref)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceLinkLabel || '打开源位置')}</a>`
                              : ''
                          }
                        </div>`
                      : ''
                  }
                  <div class="checklist-acceptance">
                    <strong>验收条件</strong>
                    <span>${escapeHtml(item.acceptance)}</span>
                  </div>
                  ${item.href ? `<a class="checklist-link" href="${escapeHtml(item.href)}">${escapeHtml(item.linkLabel || '继续查看')}</a>` : ''}
                </article>
              `,
            )
            .join('')}
        </div>
      </section>

      <section id="decision-center" class="workspace-panel decision-focus-panel">
        <div class="panel-head">
          <div>
            <h2>${escapeHtml(decisionFocus.title)}</h2>
            <p>${escapeHtml(decisionFocus.summary)}</p>
          </div>
          <a class="checklist-link" href="${escapeHtml(decisionFocus.focusHref)}">${escapeHtml(decisionFocus.focusLinkLabel)}</a>
        </div>
        <div class="governance-kpis">
          <div class="governance-kpi">
            <strong>${escapeHtml(String(decisionFocus.counts.red || 0))}</strong>
            <span>红灯待拍板</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(String(decisionFocus.counts.yellow || 0))}</strong>
            <span>黄灯绕行中</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(String(decisionFocus.counts.memory || 0))}</strong>
            <span>记忆候选</span>
          </div>
        </div>
        <div class="decision-focus-summary">
          <div>
            <strong>${escapeHtml(decisionFocus.focusHeadline)}</strong>
            <p>${escapeHtml(decisionFocus.focusReason || '当前没有需要额外解释的阻塞点，先按 Checklist 和线程现场继续推进。')}</p>
          </div>
          ${renderCenterChecklistSummaryCallout(decisionFocus)}
        </div>
        ${renderCenterFocusGuidanceStrip(decisionCenterGuidance, {
          nodeTitle: '当前决策节点',
          actionTitle: '这一步拍板',
          dataAttribute: 'data-home-decision-center-guidance',
        })}
        <div class="decision-focus-grid">
          <section class="decision-focus-lane">
            <h3>红灯待拍板</h3>
            <p>需要你明确拍板，才会继续影响后续路径的事项。</p>
            <div class="decision-focus-list">${renderWorkspaceDecisionFocusList(decisionFocus.redItems, '当前没有红灯待拍板事项。')}</div>
          </section>
          <section class="decision-focus-lane">
            <h3>黄灯绕行中</h3>
            <p>系统仍在继续推进，只把绕行原因和回流动作显式挂出来。</p>
            <div class="decision-focus-list">${renderWorkspaceDecisionFocusList(decisionFocus.yellowItems, '当前没有黄灯绕行事项。')}</div>
          </section>
          <section class="decision-focus-lane">
            <h3>记忆候选</h3>
            <p>checkpoint 之后值得 review 的经验、偏好或规则候选。</p>
            <div class="decision-focus-list">${renderWorkspaceDecisionFocusList(decisionFocus.memoryCandidates, '当前没有待 review 的记忆候选。')}</div>
          </section>
        </div>
      </section>

      <section id="comment-workflow-center" class="workspace-panel decision-focus-panel">
        <div class="panel-head">
          <div>
            <h2>${escapeHtml(commentWorkflow.title)}</h2>
            <p>${escapeHtml(commentWorkflow.summary)}</p>
          </div>
          <a class="checklist-link" href="${escapeHtml(buildWorkspacePath(projectId, { ...workspaceBaseContext, view: 'thread', threadFilter: 'triage' }))}#thread-view">按线程查看评论</a>
        </div>
        <div class="governance-kpis">
          <div class="governance-kpi">
            <strong>${escapeHtml(String(commentWorkflow.counts.triageComments || 0))}</strong>
            <span>${escapeHtml(String(commentWorkflow.counts.triageThreads || 0))} 条线程待分流</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(String(commentWorkflow.counts.readyComments || 0))}</strong>
            <span>${escapeHtml(String(commentWorkflow.counts.readyThreads || 0))} 条线程已接回执行</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(String(commentWorkflow.counts.recentComments || 0))}</strong>
            <span>最近评论事件</span>
          </div>
        </div>
        ${
          renderCenterChecklistSummaryCallout(commentWorkflow)
            ? `<div class="decision-focus-summary">${renderCenterChecklistSummaryCallout(commentWorkflow)}</div>`
            : ''
        }
        ${renderCenterFocusGuidanceStrip(commentCenterGuidance, {
          nodeTitle: '当前评论节点',
          actionTitle: '下一步',
          dataAttribute: 'data-home-comment-center-guidance',
        })}
        <div class="decision-focus-grid">
          <section class="decision-focus-lane">
            <h3>待分流评论</h3>
            <p>这些评论还没真正变成下一步任务，最容易造成“以为在跑，其实停住了”。</p>
            <div class="decision-focus-list">${renderWorkspaceCommentWorkflowList(commentWorkflow.triageItems, '当前没有待分流评论。')}</div>
          </section>
          <section class="decision-focus-lane">
            <h3>已接回执行</h3>
            <p>这些评论已经回到执行链，接下来主要观察有没有继续产生命令、Run 和回执。</p>
            <div class="decision-focus-list">${renderWorkspaceCommentWorkflowList(commentWorkflow.readyItems, '当前没有已接回执行的评论线程。')}</div>
          </section>
          <section class="decision-focus-lane">
            <h3>最近评论事件</h3>
            <p>这里保留 thread-aware 的最近评论回看卡，方便首页先看清它属于哪条闭环、现在落在哪个协同状态。</p>
            <div class="decision-focus-list">${renderWorkspaceCommentWorkflowList(commentWorkflow.recentCommentCards, '最近没有新的评论事件。')}</div>
          </section>
        </div>
      </section>

      <section id="memory-governance-center" class="workspace-panel decision-focus-panel">
        <div class="panel-head">
          <div>
            <h2>${escapeHtml(memoryGovernance.title)}</h2>
            <p>${escapeHtml(memoryGovernance.summary)}</p>
          </div>
          <a class="checklist-link" href="${escapeHtml(memoryGovernance.memoryDocHref || `/workspace/docs/memory?project_id=${encodeURIComponent(projectId)}`)}">打开协作记忆</a>
        </div>
        <div class="governance-kpis">
          <div class="governance-kpi">
            <strong>${escapeHtml(String(memoryGovernance.counts.candidates || 0))}</strong>
            <span>记忆候选</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(String(memoryGovernance.counts.reviews || 0))}</strong>
            <span>review 队列</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(String(memoryGovernance.counts.suggestions || 0))}</strong>
            <span>相关 suggestions</span>
          </div>
        </div>
        ${
          renderCenterChecklistSummaryCallout(memoryGovernance)
            ? `<div class="decision-focus-summary">${renderCenterChecklistSummaryCallout(memoryGovernance)}</div>`
            : ''
        }
        ${renderCenterFocusGuidanceStrip(memoryCenterGuidance, {
          nodeTitle: '当前治理节点',
          actionTitle: '这一步判断',
          dataAttribute: 'data-home-memory-center-guidance',
        })}
        <div class="decision-focus-grid">
          <section class="decision-focus-lane">
            <h3>记忆候选</h3>
            <p>checkpoint 后被提炼出来、等待决定是否升为 durable memory 的候选。</p>
            <div class="task-grid">${renderCards(memoryGovernance.candidateCards, '当前没有待确认的记忆候选。')}</div>
          </section>
          <section class="decision-focus-lane">
            <h3>Review 队列</h3>
            <p>已经进入 memory review，但还需要继续补证据、确认或驳回的事项。</p>
            <div class="task-grid">${renderCards(memoryGovernance.reviewCards, '当前没有待处理的 memory review 事项。')}</div>
          </section>
          <section class="decision-focus-lane">
            <h3>相关 Suggestions</h3>
            <p>还没最终收口，但已经值得继续沉淀、评估是否转成 memory 的修改建议。</p>
            <div class="task-grid">${renderCards(memoryGovernance.suggestionCards, '当前没有需要继续跟进的 suggestions。')}</div>
          </section>
        </div>
      </section>

      <section class="workspace-panel governance-panel" id="runtime-health">
        <div class="panel-head">
          <div>
            <h2>Runtime 健康</h2>
            <p data-runtime-headline>${escapeHtml(runtimeHealthViewModel.headline)}</p>
          </div>
        </div>
        <div class="governance-kpis">
          <div class="governance-kpi">
            <strong data-runtime-severity>${escapeHtml(runtimeHealthViewModel.severityLabel)}</strong>
            <span>当前状态</span>
          </div>
          <div class="governance-kpi">
            <strong data-runtime-running>${escapeHtml(runtimeHealthViewModel.runningLabel)}</strong>
            <span>Managed 进程</span>
          </div>
          <div class="governance-kpi">
            <strong data-runtime-listener>${escapeHtml(runtimeHealthViewModel.listenerLabel)}</strong>
            <span>Live 端口监听</span>
          </div>
        </div>
        ${renderCenterFocusGuidanceStrip(runtimeHealthViewModel.guidance, {
          nodeTitle: '当前 runtime 节点',
          actionTitle: '这一步恢复',
          dataAttribute: 'data-runtime-health-guidance',
          bindingPrefix: 'runtime-health-guidance',
        })}
        <div class="governance-grid">
          <article class="governance-card tone-blue">
            <div class="checklist-card-top">
              <span class="checklist-priority">实时说明</span>
              <span class="checklist-status" data-runtime-healthprobe>${escapeHtml(runtimeHealthViewModel.healthProbeLabel)}</span>
            </div>
            <h3>当前前台吃到的是谁</h3>
            <p data-runtime-summary>${escapeHtml(runtimeHealthViewModel.summary)}</p>
            <div class="checklist-meta" data-runtime-meta>
              ${runtimeHealthViewModel.metaItems
                .map((item) => `<span>${escapeHtml(item)}</span>`)
                .join('')}
            </div>
          </article>
          <article class="governance-card tone-neutral">
            <div class="checklist-card-top">
              <span class="checklist-priority">恢复动作</span>
              <span class="checklist-status" data-runtime-action-label>${escapeHtml(runtimeHealthViewModel.actionLabel)}</span>
            </div>
            <h3>建议命令</h3>
            <p data-runtime-action>${escapeHtml(runtimeHealthViewModel.actionText)}</p>
            <div class="checklist-acceptance">
              <strong>状态接口</strong>
              <span>${escapeHtml(runtimeStatusUrl)}</span>
            </div>
          </article>
        </div>
      </section>

      <section class="workspace-panel governance-panel" id="notion-collaboration">
        <div class="panel-head">
          <div>
            <h2>${escapeHtml(notionCollaboration.title)}</h2>
            <p>${escapeHtml(notionCollaboration.summary)}</p>
          </div>
        </div>
        <div class="governance-kpis">
          <div class="governance-kpi">
            <strong>${escapeHtml(notionCollaboration.customAgentStatusLabel)}</strong>
            <span>Custom Agent 主路径</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(notionCollaboration.publicMcpConfigured ? '已配置' : '未配置')}</strong>
            <span>公网 MCP</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(notionCollaboration.projectScopeReady ? '已纳入' : '未纳入')}</strong>
            <span>项目 Page Scope</span>
          </div>
        </div>
        ${renderCenterFocusGuidanceStrip(notionCollaborationGuidance, {
          nodeTitle: '当前协作节点',
          actionTitle: '下一步',
          dataAttribute: 'data-notion-collaboration-guidance',
        })}
        <div class="governance-grid">
          <article class="governance-card tone-${escapeHtml(notionCollaboration.customAgentStatus === 'ready_for_notion_setup' ? 'green' : 'yellow')}">
            <div class="checklist-card-top">
              <span class="checklist-priority">本地准备态</span>
              <span class="checklist-status">${escapeHtml(notionCollaboration.agentName)}</span>
            </div>
            <h3>直接在 Notion 里 @${escapeHtml(notionCollaboration.agentName)}</h3>
            <p>${escapeHtml(notionCollaboration.summary)}</p>
            <div class="checklist-acceptance">
              <strong>目标页</strong>
              <span>${escapeHtml(notionCollaboration.targetPageUrl || '未配置')}</span>
            </div>
            <div class="checklist-meta">
              <span>Bearer 鉴权：${escapeHtml(notionCollaboration.bearerConfigured ? '已配置' : '未配置')}</span>
              <span>Scope 页面：${escapeHtml(String(notionCollaboration.configuredPageIds.length || 0))} 个</span>
            </div>
            ${
              notionCollaboration.liveVerificationNotes?.length
                ? `<div class="checklist-meta">
                    ${notionCollaboration.liveVerificationNotes.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
                  </div>`
                : ''
            }
          </article>
          <article class="governance-card tone-${escapeHtml(
            notionCollaboration.syncProbe?.state === 'success'
              ? 'green'
              : notionCollaboration.syncProbe
                ? 'yellow'
                : 'neutral',
          )}">
            <div class="checklist-card-top">
              <span class="checklist-priority">最近同步落点</span>
              <span class="checklist-status">${escapeHtml(
                notionCollaboration.syncProbe?.state === 'success'
                  ? '已验证'
                  : notionCollaboration.syncProbe
                    ? '待复核'
                    : '未记录',
              )}</span>
            </div>
            <h3>${escapeHtml(notionCollaboration.syncProbe?.pageTitle || '尚未记录最近一次 Notion 写入')}</h3>
            <p>${escapeHtml(
              notionCollaboration.syncProbe?.summary || '当前只知道配置 ready，还没有把最近一次真实同步落点显式挂到工作台上。',
            )}</p>
            <div class="checklist-acceptance">
              <strong>最近验证</strong>
              <span>${escapeHtml(
                notionCollaboration.syncProbe?.verifiedAt
                  ? `${notionCollaboration.syncProbe.verifiedAt}${notionCollaboration.syncProbe.verifiedBy ? ` · ${notionCollaboration.syncProbe.verifiedBy}` : ''}`
                  : '尚未记录',
              )}</span>
            </div>
            ${
              notionCollaboration.syncProbe?.notes?.length
                ? `<div class="checklist-meta">
                    ${notionCollaboration.syncProbe.notes.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
                  </div>`
                : ''
            }
            ${
              notionCollaboration.syncProbe?.pageUrl
                ? `<a class="checklist-link" href="${escapeHtml(notionCollaboration.syncProbe.pageUrl)}">打开最近同步页</a>`
                : ''
            }
          </article>
          <article class="governance-card tone-${escapeHtml(notionCollaboration.publicMcpConfigured ? 'green' : 'yellow')}">
            <div class="checklist-card-top">
              <span class="checklist-priority">执行连接</span>
              <span class="checklist-status">${escapeHtml(notionCollaboration.publicMcpConfigured ? '已配置' : '待补齐')}</span>
            </div>
            <h3>公网 MCP URL</h3>
            <p>${escapeHtml(notionCollaboration.publicMcpUrl || '当前还没有配置公网 HTTPS MCP 地址。')}</p>
            ${
              notionCollaboration.blockers.length > 0
                ? `<div class="checklist-meta">
                    ${notionCollaboration.blockers.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
                  </div>`
                : ''
            }
          </article>
          <article class="governance-card tone-${escapeHtml(notionCollaboration.tokenMirrorStatus === 'not_configured' ? 'neutral' : 'yellow')}">
            <div class="checklist-card-top">
              <span class="checklist-priority">可选镜像</span>
              <span class="checklist-status">${escapeHtml(notionCollaboration.tokenMirrorStatusLabel)}</span>
            </div>
            <h3>token-based mirror</h3>
            <p>${escapeHtml(notionCollaboration.tokenMirrorSummary)}</p>
            <div class="checklist-acceptance">
              <strong>诊断命令</strong>
              <span>${escapeHtml(notionCollaboration.tokenMirrorCheckCommand)}</span>
            </div>
          </article>
          <article class="governance-card tone-${escapeHtml(notionCollaboration.customAgentStatus === 'ready_for_notion_setup' ? 'blue' : 'yellow')}">
            <div class="checklist-card-top">
              <span class="checklist-priority">下一步</span>
              <span class="checklist-status">${escapeHtml(String(notionCollaboration.nextActions.length || 0))} 项</span>
            </div>
            <h3>剩余人工动作</h3>
            <p>${escapeHtml(notionCollaboration.nextActions[0] || '当前没有额外动作。')}</p>
            ${
              notionCollaboration.nextActions.length > 1
                ? `<div class="checklist-meta">
                    ${notionCollaboration.nextActions.slice(1).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
                  </div>`
                : ''
            }
          </article>
        </div>
      </section>

      <section class="workspace-panel governance-panel" id="thread-governance">
        <div class="panel-head">
          <div>
            <h2>${escapeHtml(threadIdentityGovernance.title)}</h2>
            <p>${escapeHtml(threadIdentityGovernance.summary)}</p>
          </div>
        </div>
        <div class="governance-kpis">
          <div class="governance-kpi">
            <strong>${escapeHtml(String(threadIdentityGovernance.concreteThreadTotal || 0))}</strong>
            <span>稳定线程</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(String(threadIdentityGovernance.attentionThreadTotal || 0))}</strong>
            <span>主视图泛化线程</span>
          </div>
          <div class="governance-kpi">
            <strong>${escapeHtml(String(threadIdentityGovernance.historyThreadTotal || 0))}</strong>
            <span>历史层待治理</span>
          </div>
        </div>
        ${renderCenterFocusGuidanceStrip(threadGovernanceGuidance, {
          nodeTitle: '当前治理节点',
          actionTitle: '这一步处理',
          dataAttribute: 'data-thread-governance-guidance',
          checkpointLabel: '治理规则',
        })}
        ${renderGuidanceProofRow(threadGovernanceGuidance, {
          className: 'hero-checklist-proof',
        })}
        ${renderGuidanceActionLinks(threadGovernanceGuidance, {
          className: 'hero-checklist-actions governance-actions',
        })}
        ${
          threadIdentityGovernance.focusedPattern
            ? `<div class="governance-focus-summary">
                <div>
                  <strong>治理焦点：${escapeHtml(
                    threadIdentityGovernance.focusedPattern.residualPatternLabel ||
                      threadIdentityGovernance.residualPatternFilterLabel ||
                      threadIdentityGovernance.residualPatternFilter ||
                      '未分类',
                  )}</strong>
                  <p>${escapeHtml(threadIdentityGovernance.focusedPattern.scopeSummary || '')}</p>
                </div>
                <a class="checklist-link" href="${escapeHtml(clearResidualPatternUrl)}">查看全部残留模式</a>
              </div>`
            : ''
        }
        ${
          threadIdentityGovernance.patternGroups?.length > 0
            ? `<div class="governance-pattern-grid">
                ${threadIdentityGovernance.patternGroups
                  .map(
                    (group) => `
                      <article class="governance-pattern-card${
                        compact(threadIdentityGovernance.residualPatternFilter) === compact(group.residualPattern) ? ' is-active' : ''
                      }">
                        <div class="governance-pattern-top">
                          <div>
                            <strong>${escapeHtml(group.residualPatternLabel || '未分类')}</strong>
                            ${
                              compact(threadIdentityGovernance.residualPatternFilter) === compact(group.residualPattern)
                                ? `<div style="margin-top:8px;"><span class="governance-pattern-pill">当前筛选</span></div>`
                                : ''
                            }
                          </div>
                          <span>${escapeHtml(String(group.totalCount || 0))} 条</span>
                        </div>
                        <p>${escapeHtml(group.cleanupHint || '先回看最后一条有效证据，再决定是补 source 还是归档。')}</p>
                        <div class="governance-pattern-meta">
                          <span>主视图 ${escapeHtml(String(group.attentionCount || 0))}</span>
                          <span>历史层 ${escapeHtml(String(group.historyCount || 0))}</span>
                          ${
                            group.latestUpdatedAt
                              ? `<span>最近更新 ${escapeHtml(formatIso(group.latestUpdatedAt))}</span>`
                              : ''
                          }
                        </div>
                        <a class="checklist-link" href="/workspace?project_id=${encodeURIComponent(projectId)}${dataHygiene.include_synthetic ? '&include_synthetic=1' : ''}&include_residual=1&residual_pattern=${encodeURIComponent(group.residualPattern)}">只看这类线程</a>
                      </article>
                    `,
                  )
                  .join('')}
              </div>`
            : ''
        }
        ${
          threadIdentityGovernance.items.length > 0
            ? `<div class="governance-grid">
                ${threadIdentityGovernance.items
                  .map(
                    (item) => `
                      <article class="governance-card tone-${escapeHtml(item.visibility === 'attention' ? 'yellow' : 'neutral')}">
                        <div class="checklist-card-top">
                          <span class="checklist-priority">${escapeHtml(item.visibilityLabel)}</span>
                          <span class="checklist-status">${escapeHtml(item.kindLabel)}</span>
                        </div>
                        <h3>${escapeHtml(item.threadLabel)}</h3>
                        <p>${escapeHtml(item.reason)}</p>
                        <div class="checklist-acceptance">
                          <strong>当前状态</strong>
                          <span>${escapeHtml(item.statusLabel)}</span>
                        </div>
                        <div class="checklist-acceptance">
                          <strong>残留类型</strong>
                          <span>${escapeHtml(item.residualPatternLabel || '未分类')}</span>
                        </div>
                        ${
                          item.evidenceStatusLabel
                            ? `
                              <div class="checklist-acceptance">
                                <strong>证据状态</strong>
                                <span>${escapeHtml(item.evidenceStatusLabel)}</span>
                              </div>
                            `
                            : ''
                        }
                        ${
                          item.evidenceDetail
                            ? `
                              <div class="checklist-meta">
                                <span>证据说明：${escapeHtml(item.evidenceDetail)}</span>
                              </div>
                            `
                            : ''
                        }
                        <div class="checklist-meta">
                          <span>建议处理：${escapeHtml(item.cleanupHint || '打开线程现场确认最后一条有效证据。')}</span>
                        </div>
                        <div class="checklist-meta">
                          <span>线程来源：${escapeHtml(item.sourceLabel || '未记录')}</span>
                        </div>
                        <div class="checklist-meta">
                          <span>${escapeHtml(item.threadKey)}</span>
                          ${item.latestUpdatedAt ? `<span>最近更新：${escapeHtml(formatIso(item.latestUpdatedAt))}</span>` : ''}
                        </div>
                        ${
                          item.action
                            ? `
                              <div class="governance-actions">
                                ${
                                  item.action.href
                                    ? `
                                      <a
                                        class="governance-action-link"
                                        href="${escapeHtml(item.action.href)}"
                                      >${escapeHtml(item.action.label || '继续处理')}</a>
                                    `
                                    : `
                                      <button
                                        type="button"
                                        class="governance-action-button"
                                        data-governance-action="${escapeHtml(item.action.kind || 'archive_brief')}"
                                        data-endpoint="${escapeHtml(item.action.endpoint || '/task-briefs/update-status')}"
                                        data-resource-id-key="${escapeHtml(item.action.resourceIdKey || 'brief_id')}"
                                        data-resource-id-value="${escapeHtml(item.action.resourceIdValue || item.action.briefId || '')}"
                                        data-brief-id="${escapeHtml(item.action.briefId || '')}"
                                        data-next-status="${escapeHtml(item.action.nextStatus || 'archived')}"
                                        data-confirm-message="${escapeHtml(item.action.confirmMessage || '')}"
                                        data-pending-label="${escapeHtml(item.action.pendingLabel || '处理中...')}"
                                        data-refresh-href="${escapeHtml(item.action.refreshHref || '')}"
                                      >${escapeHtml(item.action.label || '执行治理动作')}</button>
                                    `
                                }
                              </div>
                            `
                            : ''
                        }
                        <a class="checklist-link" href="${escapeHtml(item.href)}">打开线程现场</a>
                      </article>
                    `,
                  )
                  .join('')}
              </div>`
            : `<div class="empty-state">当前没有残留的泛化线程，thread identity 已经收口到稳定来源。</div>`
        }
      </section>

      <section id="attention-view" class="workspace-panel view-panel" data-view-panel="attention"${initialView === 'attention' ? '' : ' hidden'}>
        <div class="panel-head">
          <div>
            <h2>任务看板 · 按注意力</h2>
            <p>先看红灯是否需要你拍板，再看系统处理中和已经完成的任务。</p>
          </div>
        </div>
        ${renderCenterFocusGuidanceStrip(attentionViewGuidance, {
          nodeTitle: '当前注意力焦点',
          actionTitle: '下一步',
          dataAttribute: 'data-attention-view-guidance',
        })}
        ${renderGuidanceProofRow(attentionViewGuidance, {
          className: 'hero-checklist-proof',
        })}
        ${renderGuidanceActionLinks(attentionViewGuidance, {
          className: 'hero-checklist-actions governance-actions',
        })}
        <div class="attention-grid">
          <section id="lane-waiting-human" class="lane">
            <h3>红灯待拍板</h3>
            <p>等我拍板。只放不可逆、会污染下游或需要方向判断的任务。</p>
            <div class="lane-list">${renderWorkspaceTaskList(attentionView.waiting_human, '当前没有等待许可的任务。')}</div>
          </section>
          <section id="lane-in-progress" class="lane">
            <h3>系统处理中</h3>
            <p>Agent 已接单、执行中，或黄灯先绕行后回看的任务。</p>
            <div class="lane-list">${renderWorkspaceTaskList(attentionView.in_progress, '当前没有正在处理中的任务。')}</div>
          </section>
          <section id="lane-completed" class="lane">
            <h3>已完成</h3>
            <p>已经收口，可用于回看、审计和后续 memory 提炼。</p>
            <div class="lane-list">${renderWorkspaceTaskList(attentionView.completed, '当前还没有完成的任务。')}</div>
          </section>
        </div>
      </section>

      <section id="thread-view" class="workspace-panel view-panel" data-view-panel="thread"${initialView === 'thread' ? '' : ' hidden'}>
        ${renderThreadPanelHead(initialThreadFilterState)}
        ${renderCenterFocusGuidanceStrip(initialThreadViewGuidance, {
          nodeTitle: '当前线程焦点',
          actionTitle: '下一步',
          dataAttribute: 'data-thread-view-guidance',
          bindingPrefix: 'thread-view-guidance',
        })}
        ${renderGuidanceProofRow(initialThreadViewGuidance, {
          className: 'hero-checklist-proof',
          bindingPrefix: 'thread-view-guidance-proof',
          proofLinkLabel: '打开焦点线程',
        })}
        ${renderGuidanceActionLinks(initialThreadViewGuidance, {
          className: 'hero-checklist-actions governance-actions',
          bindingPrefix: 'thread-view-guidance-actions',
        })}
        ${renderThreadFilterBar(threadFilters, initialThreadFilter)}
        <div class="thread-groups">
          ${
            threadGroups.length === 0
              ? `<div class="empty-state">当前还没有可展示的线程分组。</div>`
              : threadGroups
                  .map(
                    (group) => {
                      const groupVisibility = buildThreadGroupVisibilityState(group, initialThreadFilter);
                      const groupFilters = groupVisibility.filterKeys.join(' ');
                      const groupFilterMembership = buildThreadGroupFilterNote(groupVisibility.filterKeys, threadFilterLabelByKey);
                      const groupVisibilityReason = buildThreadGroupVisibilityReason(
                        groupVisibility,
                        threadFilterLabelByKey,
                      );
                      return `
                      <section class="thread-group" data-thread-group data-thread-filters="${escapeHtml(
                        groupFilters,
                      )}" data-thread-group-filter-membership="${escapeHtml(
                        groupFilterMembership,
                      )}" data-thread-group-active-filter="${escapeHtml(
                        groupVisibility.filter,
                      )}" data-thread-group-visibility="${escapeHtml(
                        groupVisibility.visibility,
                      )}" data-thread-group-visibility-reason="${escapeHtml(
                        groupVisibilityReason,
                      )}"${groupVisibility.visible ? '' : ' hidden'}>
                        <div class="thread-group-head">
                          ${renderThreadGroupHeadline(group, threadFilterLabelByKey)}
                          ${renderThreadGroupStats(group)}
                        </div>
                        ${renderWorkspaceCardBodyBlocks({
                          context: 'thread-group',
                          record: group,
                          relationOptions: { className: 'thread-focus-callout' },
                          guidanceOptions: { className: 'thread-focus-callout' },
                          middleHtml: renderThreadGroupDetails(group),
                          middleAttributes: { 'data-workspace-card-body-middle': 'thread-group-details' },
                        })}
                      </section>
                    `;
                    },
                  )
                  .join('')
          }
        </div>
        ${
          threadGroups.length > 0
            ? renderThreadFilterEmptyState(initialThreadFilterState, initialVisibleThreadGroups.length > 0)
            : renderThreadFilterEmptyState(initialThreadFilterState, false)
        }
      </section>
    </div>

    <script>
      (() => {
        const buttons = [...document.querySelectorAll('[data-view-target]')];
        const panels = [...document.querySelectorAll('[data-view-panel]')];
        const threadFilterButtons = [...document.querySelectorAll('[data-thread-filter]')];
        const threadFilterGroups = [...document.querySelectorAll('[data-thread-group]')];
        const threadFilterSummaryLabel = document.querySelector('[data-thread-filter-summary-label]');
        const threadFilterSummaryCount = document.querySelector('[data-thread-filter-summary-count]');
        const governanceActionButtons = [...document.querySelectorAll('[data-governance-action]')];
        const homeDecisionButtons = [...document.querySelectorAll('[data-home-decision-action]')];
        const homeCommentButtons = [...document.querySelectorAll('[data-home-comment-action]')];
        const homeMemoryReviewButtons = [...document.querySelectorAll('[data-home-memory-review-action]')];
        const homeMemoryReviewerRefreshButtons = [...document.querySelectorAll('[data-home-memory-reviewer-refresh]')];
        const homeSuggestionReviewButtons = [...document.querySelectorAll('[data-home-suggestion-review-action]')];
        const threadFilterEmpty = document.querySelector('[data-thread-filter-empty]');
        const threadFilterEmptyLabel = document.querySelector('[data-thread-filter-empty-label]');
        const threadFilterEmptyCount = document.querySelector('[data-thread-filter-empty-count]');
        const threadFilterEmptyCopy = document.querySelector('[data-thread-filter-empty-copy]');
        const label = document.querySelector('[data-refresh-label]');
        const workspaceActionFeedback = document.querySelector('[data-workspace-action-feedback]');
        const runtimeStatusUrl = ${JSON.stringify(runtimeStatusUrl)};
        const projectId = ${JSON.stringify(projectId)};
        const workspaceDocumentId = 'execution';
        const runtimeHeadline = document.querySelector('[data-runtime-headline]');
        const runtimeSeverity = document.querySelector('[data-runtime-severity]');
        const runtimeRunning = document.querySelector('[data-runtime-running]');
        const runtimeListener = document.querySelector('[data-runtime-listener]');
        const runtimeHealthProbe = document.querySelector('[data-runtime-healthprobe]');
        const runtimeSummary = document.querySelector('[data-runtime-summary]');
        const runtimeMeta = document.querySelector('[data-runtime-meta]');
        const runtimeAction = document.querySelector('[data-runtime-action]');
        const runtimeActionLabel = document.querySelector('[data-runtime-action-label]');
        const runtimeGuidanceNodeLabel = document.querySelector('[data-runtime-health-guidance-node-label]');
        const runtimeGuidanceNodeEvidence = document.querySelector('[data-runtime-health-guidance-node-evidence]');
        const runtimeGuidanceNodeSummary = document.querySelector('[data-runtime-health-guidance-node-summary]');
        const runtimeGuidanceProgressLabel = document.querySelector('[data-runtime-health-guidance-progress-label]');
        const runtimeGuidanceJudgmentDetail = document.querySelector('[data-runtime-health-guidance-judgment-detail]');
        const runtimeGuidanceNodeAction = document.querySelector('[data-runtime-health-guidance-node-action]');
        const runtimeGuidanceActionDetail = document.querySelector('[data-runtime-health-guidance-action-detail]');
        const threadViewGuidanceModels = ${JSON.stringify(threadViewGuidanceByFilter)};
        const threadViewGuidanceNodeLabel = document.querySelector('[data-thread-view-guidance-node-label]');
        const threadViewGuidanceNodeEvidence = document.querySelector('[data-thread-view-guidance-node-evidence]');
        const threadViewGuidanceNodeSummary = document.querySelector('[data-thread-view-guidance-node-summary]');
        const threadViewGuidanceProgressLabel = document.querySelector('[data-thread-view-guidance-progress-label]');
        const threadViewGuidanceJudgmentDetail = document.querySelector('[data-thread-view-guidance-judgment-detail]');
        const threadViewGuidanceNodeAction = document.querySelector('[data-thread-view-guidance-node-action]');
        const threadViewGuidanceActionDetail = document.querySelector('[data-thread-view-guidance-action-detail]');
        const threadViewGuidanceAcceptanceBlock = document.querySelector('[data-thread-view-guidance-acceptance-block]');
        const threadViewGuidanceAcceptance = document.querySelector('[data-thread-view-guidance-acceptance]');
        const threadViewGuidanceCheckpointBlock = document.querySelector('[data-thread-view-guidance-checkpoint-block]');
        const threadViewGuidanceCheckpoint = document.querySelector('[data-thread-view-guidance-checkpoint]');
        const threadViewGuidanceProofRow = document.querySelector('[data-thread-view-guidance-proof-row]');
        const threadViewGuidanceProofLabel = document.querySelector('[data-thread-view-guidance-proof-label]');
        const threadViewGuidanceProofUpdatedAt = document.querySelector('[data-thread-view-guidance-proof-updated-at]');
        const threadViewGuidanceProofContext = document.querySelector('[data-thread-view-guidance-proof-context]');
        const threadViewGuidanceProofLink = document.querySelector('[data-thread-view-guidance-proof-link]');
        const threadViewGuidanceProofSourceLink = document.querySelector('[data-thread-view-guidance-proof-source-link]');
        const threadViewGuidanceActionLinks = document.querySelector('[data-thread-view-guidance-actions-links]');
        const threadFilterLabelByKey = ${JSON.stringify(threadFilterLabelByKey)};
        const threadFilterStateByKey = ${JSON.stringify(
          Object.fromEntries(
            threadFilters.map((filter) => [
              filter.key,
              {
                label: filter.label,
                count: filter.count,
              },
            ]),
          ),
        )};
        let currentView = ${JSON.stringify(initialView)};
        let currentThreadFilter = ${JSON.stringify(initialThreadFilter)};
        const currentCommentFilter = ${JSON.stringify(normalizeWorkspaceCommentFilter(payload.comment_filter || payload.commentFilter))};
        const initialActionFeedback = {
          message: ${JSON.stringify(initialActionFeedback)},
          tone: ${JSON.stringify(initialActionFeedbackTone)},
        };
        ${compact.toString()}
        ${appendWorkspaceFeedbackDetail.toString()}
        ${buildWorkspaceFeedbackBase.toString()}
        ${buildWorkspaceHomeDecisionFeedback.toString()}
        ${buildWorkspaceHomeCommentFeedback.toString()}
        ${buildWorkspaceHomeMemoryReviewFeedback.toString()}
        ${buildWorkspaceHomeSuggestionFeedback.toString()}
        ${normalizeWorkspaceThreadFilter.toString()}
        ${buildThreadFilterLabelMap.toString()}
        ${resolveThreadGroupFilterLabels.toString()}
        ${normalizeThreadGroupFilterKeys.toString()}
        ${buildThreadGroupVisibilityState.toString()}
        ${buildThreadGroupVisibilityReason.toString()}
        ${buildThreadFilterEmptyCopy.toString()}
        ${formatIso.toString()}
        ${buildRuntimeHealthViewModel.toString()}

        function persistUiState() {
          try {
            const nextUrl = new URL(window.location.href);
            if (currentView && currentView !== 'attention') {
              nextUrl.searchParams.set('view', currentView);
            } else {
              nextUrl.searchParams.delete('view');
            }
            if (currentThreadFilter && currentThreadFilter !== 'all') {
              nextUrl.searchParams.set('thread_filter', currentThreadFilter);
            } else {
              nextUrl.searchParams.delete('thread_filter');
            }
            if (currentCommentFilter && currentCommentFilter !== 'all') {
              nextUrl.searchParams.set('comment_filter', currentCommentFilter);
            } else {
              nextUrl.searchParams.delete('comment_filter');
            }
            window.history.replaceState({}, '', nextUrl.toString());
          } catch {}
        }

        function setWorkspaceActionFeedback(message, tone = 'info') {
          if (!workspaceActionFeedback) {
            return;
          }

          if (!message) {
            workspaceActionFeedback.hidden = true;
            workspaceActionFeedback.textContent = '';
            workspaceActionFeedback.removeAttribute('data-tone');
            return;
          }

          workspaceActionFeedback.hidden = false;
          workspaceActionFeedback.textContent = message;
          workspaceActionFeedback.setAttribute('data-tone', tone);
        }

        function clearWorkspaceActionFeedbackParams() {
          try {
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.delete('action_feedback');
            nextUrl.searchParams.delete('action_feedback_tone');
            window.history.replaceState({}, '', nextUrl.toString());
          } catch {}
        }

        function reloadWorkspaceWithFeedback(message, tone = 'success') {
          try {
            const nextUrl = new URL(window.location.href);
            if (message) {
              nextUrl.searchParams.set('action_feedback', message);
              nextUrl.searchParams.set('action_feedback_tone', tone || 'info');
            } else {
              nextUrl.searchParams.delete('action_feedback');
              nextUrl.searchParams.delete('action_feedback_tone');
            }
            window.location.assign(nextUrl.toString());
            return;
          } catch {}

          window.location.reload();
        }

        async function postJson(url, payload) {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(payload),
          });

          const data = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
          }
          return data;
        }

        function renderRuntimeStatus(payload) {
          const viewModel = buildRuntimeHealthViewModel(payload, { runtimeStatusUrl });

          if (runtimeHeadline) runtimeHeadline.textContent = viewModel.headline;
          if (runtimeSeverity) runtimeSeverity.textContent = viewModel.severityLabel;
          if (runtimeRunning) runtimeRunning.textContent = viewModel.runningLabel;
          if (runtimeListener) runtimeListener.textContent = viewModel.listenerLabel;
          if (runtimeHealthProbe) runtimeHealthProbe.textContent = viewModel.healthProbeLabel;
          if (runtimeSummary) runtimeSummary.textContent = viewModel.summary;
          if (runtimeAction) runtimeAction.textContent = viewModel.actionText;
          if (runtimeActionLabel) runtimeActionLabel.textContent = viewModel.actionLabel;

          if (runtimeMeta) {
            runtimeMeta.innerHTML = '';
            viewModel.metaItems.forEach((item) => {
              const span = document.createElement('span');
              span.textContent = item;
              runtimeMeta.appendChild(span);
            });
          }

          if (runtimeGuidanceNodeLabel) runtimeGuidanceNodeLabel.textContent = viewModel.guidance.nodeLabel || '当前没有额外节点说明。';
          if (runtimeGuidanceNodeSummary) runtimeGuidanceNodeSummary.textContent = viewModel.guidance.nodeSummary || '当前没有额外判断。';
          if (runtimeGuidanceNodeAction) runtimeGuidanceNodeAction.textContent = viewModel.guidance.nodeAction || '打开当前现场继续处理。';

          [
            [runtimeGuidanceNodeEvidence, viewModel.guidance.nodeEvidence, '最近依据：'],
            [runtimeGuidanceProgressLabel, viewModel.guidance.progressLabel, ''],
            [runtimeGuidanceJudgmentDetail, viewModel.guidance.judgmentDetail, ''],
            [runtimeGuidanceActionDetail, viewModel.guidance.actionDetail, ''],
          ].forEach(([element, value, prefix]) => {
            if (!element) {
              return;
            }

            if (value) {
              element.hidden = false;
              element.textContent = prefix ? prefix + value : value;
              return;
            }

            element.hidden = true;
            element.textContent = '';
          });
        }

        function renderThreadViewGuidance(filter) {
          const viewModel = threadViewGuidanceModels[filter] || threadViewGuidanceModels.all || null;
          if (!viewModel) {
            return;
          }

          if (threadViewGuidanceNodeLabel) {
            threadViewGuidanceNodeLabel.textContent = viewModel.nodeLabel || '当前没有额外节点说明。';
          }
          if (threadViewGuidanceNodeSummary) {
            threadViewGuidanceNodeSummary.textContent = viewModel.nodeSummary || '当前没有额外判断。';
          }
          if (threadViewGuidanceNodeAction) {
            threadViewGuidanceNodeAction.textContent = viewModel.nodeAction || '打开当前现场继续处理。';
          }

          [
            [threadViewGuidanceNodeEvidence, viewModel.nodeEvidence, '最近依据：'],
            [threadViewGuidanceProgressLabel, viewModel.progressLabel, ''],
            [threadViewGuidanceJudgmentDetail, viewModel.judgmentDetail, ''],
            [threadViewGuidanceActionDetail, viewModel.actionDetail, ''],
          ].forEach(([element, value, prefix]) => {
            if (!element) {
              return;
            }
            const normalized = compact(value);
            if (!normalized) {
              element.textContent = '';
              element.hidden = true;
              return;
            }
            element.textContent = prefix ? prefix + normalized : normalized;
            element.hidden = false;
          });

          [
            [threadViewGuidanceAcceptanceBlock, threadViewGuidanceAcceptance, viewModel.checklistAcceptance],
            [threadViewGuidanceCheckpointBlock, threadViewGuidanceCheckpoint, viewModel.checklistCheckpointRule],
          ].forEach(([block, valueElement, value]) => {
            if (!block || !valueElement) {
              return;
            }
            const normalized = compact(value);
            if (!normalized) {
              valueElement.textContent = '';
              block.hidden = true;
              return;
            }
            valueElement.textContent = normalized;
            block.hidden = false;
          });

          const proofLabel = compact(viewModel.proofLabel);
          const proofUpdatedAt = compact(viewModel.proofUpdatedAt);
          const proofContextLabel = compact(viewModel.proofContextLabel);
          const proofHref = compact(viewModel.proofHref);
          const proofSourceHref = compact(viewModel.proofSourceHref);
          const proofSourceLabel = compact(viewModel.proofSourceLabel) || '打开源位置';
          const hasProofContent = Boolean(proofLabel || proofUpdatedAt || proofContextLabel || proofHref || proofSourceHref);

          if (threadViewGuidanceProofRow) {
            threadViewGuidanceProofRow.hidden = !hasProofContent;
          }
          if (threadViewGuidanceProofLabel) {
            threadViewGuidanceProofLabel.textContent = proofLabel ? '最近证据：' + proofLabel : '';
            threadViewGuidanceProofLabel.hidden = !proofLabel;
          }
          if (threadViewGuidanceProofUpdatedAt) {
            threadViewGuidanceProofUpdatedAt.textContent = proofUpdatedAt ? '更新于 ' + formatIso(proofUpdatedAt) : '';
            threadViewGuidanceProofUpdatedAt.hidden = !proofUpdatedAt;
          }
          if (threadViewGuidanceProofContext) {
            threadViewGuidanceProofContext.textContent = proofContextLabel ? '证据现场：' + proofContextLabel : '';
            threadViewGuidanceProofContext.hidden = !proofContextLabel;
          }
          if (threadViewGuidanceProofLink) {
            threadViewGuidanceProofLink.textContent = '打开焦点线程';
            threadViewGuidanceProofLink.hidden = !proofHref;
            threadViewGuidanceProofLink.setAttribute('href', proofHref || '#');
          }
          if (threadViewGuidanceProofSourceLink) {
            threadViewGuidanceProofSourceLink.textContent = proofSourceLabel;
            threadViewGuidanceProofSourceLink.hidden = !proofSourceHref;
            threadViewGuidanceProofSourceLink.setAttribute('href', proofSourceHref || '#');
          }
          if (threadViewGuidanceActionLinks) {
            const links = Array.isArray(viewModel.actionLinks)
              ? viewModel.actionLinks.filter((item) => compact(item?.label) && compact(item?.href))
              : [];
            threadViewGuidanceActionLinks.replaceChildren();
            threadViewGuidanceActionLinks.hidden = links.length === 0;
            links.forEach((item) => {
              const link = document.createElement('a');
              link.className = 'checklist-link';
              link.href = item.href;
              link.textContent = item.label;
              threadViewGuidanceActionLinks.append(link);
            });
          }
        }

        async function fetchRuntimeStatus() {
          try {
            const response = await fetch(runtimeStatusUrl, { headers: { Accept: 'application/json' } });
            if (!response.ok) {
              throw new Error('HTTP ' + response.status);
            }
            const payload = await response.json();
            renderRuntimeStatus(payload);
          } catch (error) {
            renderRuntimeStatus({
              ok: false,
              error: error && error.message ? error.message : String(error || 'unknown error'),
            });
          }
        }

        function setView(view) {
          currentView = view;
          buttons.forEach((button) => {
            button.classList.toggle('is-active', button.dataset.viewTarget === view);
          });
          panels.forEach((panel) => {
            panel.hidden = panel.dataset.viewPanel !== view;
          });
          persistUiState();
        }

        function setThreadFilter(filter) {
          const resolvedFilter = normalizeWorkspaceThreadFilter(filter);
          currentThreadFilter = resolvedFilter;
          let visibleCount = 0;
          const filterState =
            threadFilterStateByKey[resolvedFilter] || threadFilterStateByKey.all || { label: '全部', count: 0 };
          threadFilterButtons.forEach((button) => {
            const isActive = button.dataset.threadFilter === resolvedFilter;
            button.classList.toggle('is-active', isActive);
            button.dataset.threadFilterState = isActive ? 'active' : 'inactive';
          });
          threadFilterGroups.forEach((group) => {
            const visibilityState = buildThreadGroupVisibilityState(String(group.dataset.threadFilters || ''), resolvedFilter);
            group.hidden = !visibilityState.visible;
            group.dataset.threadGroupFilterMembership = '当前归类：' + resolveThreadGroupFilterLabels(
              visibilityState.filterKeys,
              threadFilterLabelByKey,
            ).join(' / ');
            group.dataset.threadGroupVisibility = visibilityState.visibility;
            group.dataset.threadGroupActiveFilter = visibilityState.filter;
            group.dataset.threadGroupVisibilityReason = buildThreadGroupVisibilityReason(
              visibilityState,
              threadFilterLabelByKey,
            );
            if (visibilityState.visible) {
              visibleCount += 1;
            }
          });
          if (threadFilterSummaryLabel) {
            threadFilterSummaryLabel.textContent = '当前筛选：' + String(filterState.label || '全部');
          }
          if (threadFilterSummaryCount) {
            threadFilterSummaryCount.textContent = String(visibleCount) + ' 条线程';
          }
          if (threadFilterEmpty) {
            threadFilterEmpty.hidden = visibleCount > 0;
          }
          if (threadFilterEmptyLabel) {
            threadFilterEmptyLabel.textContent = '当前筛选：' + String(filterState.label || '全部');
          }
          if (threadFilterEmptyCount) {
            threadFilterEmptyCount.textContent = String(visibleCount) + ' 条线程';
          }
          if (threadFilterEmptyCopy) {
            threadFilterEmptyCopy.textContent = buildThreadFilterEmptyCopy({
              label: filterState.label || '全部',
              count: visibleCount,
            });
          }
          renderThreadViewGuidance(filter);
          persistUiState();
        }

        async function handleGovernanceAction(button) {
          if (!button || button.disabled) {
            return;
          }

          const endpoint = button.dataset.endpoint || '/task-briefs/update-status';
          const resourceIdKey = button.dataset.resourceIdKey || 'brief_id';
          const resourceIdValue = button.dataset.resourceIdValue || button.dataset.briefId || '';
          const nextStatus = button.dataset.nextStatus || 'archived';
          const confirmMessage = button.dataset.confirmMessage || '';
          const pendingLabel = button.dataset.pendingLabel || '处理中...';
          const refreshHref = button.dataset.refreshHref || '';
          const originalLabel = button.textContent || '执行治理动作';

          if (!resourceIdValue) {
            window.alert('缺少资源标识，暂时无法执行治理动作。');
            return;
          }

          if (confirmMessage && window.confirm(confirmMessage) !== true) {
            return;
          }

          button.disabled = true;
          button.textContent = pendingLabel;

          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({
                [resourceIdKey]: resourceIdValue,
                status: nextStatus,
              }),
            });

            if (!response.ok) {
              throw new Error('HTTP ' + response.status);
            }

            if (refreshHref) {
              window.location.assign(refreshHref);
              return;
            }

            window.location.reload();
          } catch (error) {
            button.disabled = false;
            button.textContent = originalLabel;
            window.alert('治理动作执行失败：' + (error && error.message ? error.message : String(error || 'unknown error')));
          }
        }

        async function handleHomeDecisionAction(button) {
          if (!button || button.disabled) {
            return;
          }

          const decisionId = button.dataset.decisionId || '';
          const threadKey = button.dataset.threadKey || '';
          const status = button.dataset.homeDecisionAction || '';
          const actionBox = button.closest('[data-home-decision-box]');
          const noteField = actionBox ? actionBox.querySelector('[data-home-decision-note]') : null;
          const decisionNote = noteField && noteField.value ? noteField.value.trim() : '';
          const originalLabel = button.textContent || '提交决策';

          if (!decisionId || !threadKey || !status) {
            setWorkspaceActionFeedback('缺少决策上下文，先进入线程现场再继续处理。', 'error');
            return;
          }

          button.disabled = true;
          button.textContent = '提交中...';
          setWorkspaceActionFeedback('正在把这条首页拍板写回线程现场...', 'info');

          try {
            await postJson('/workspace/threads/' + encodeURIComponent(threadKey) + '/decision', {
              project_id: projectId,
              document_id: workspaceDocumentId,
              decision_id: decisionId,
              status,
              decision_note: decisionNote || null,
            });
            const feedbackMessage = buildWorkspaceHomeDecisionFeedback(decisionNote);
            setWorkspaceActionFeedback(feedbackMessage + '，正在刷新最新工作台状态...', 'success');
            window.setTimeout(
              () => reloadWorkspaceWithFeedback(feedbackMessage, 'success'),
              180,
            );
          } catch (error) {
            button.disabled = false;
            button.textContent = originalLabel;
            setWorkspaceActionFeedback('首页拍板失败：' + (error && error.message ? error.message : String(error || 'unknown error')), 'error');
          }
        }

        async function handleHomeCommentAction(button) {
          if (!button || button.disabled) {
            return;
          }

          const threadKey = button.dataset.threadKey || '';
          const commandId = button.dataset.commandId || '';
          const ownerAgent = button.dataset.ownerAgent || '';
          const action = button.dataset.homeCommentAction || '';
          const target = button.dataset.homeCommentTarget || 'derive';
          const defaultInstruction = button.dataset.defaultInstruction || button.textContent.trim();
          const contextQuote = button.dataset.contextQuote || '';
          const reason = button.dataset.reason || ('workspace_home_comment_action:' + action);
          const commentTitle = button.dataset.commentTitle || '';
          const commentSummary = button.dataset.commentSummary || '';
          const actionBox = button.closest('[data-home-comment-box]');
          const noteField = actionBox ? actionBox.querySelector('[data-home-comment-note]') : null;
          const note = noteField && noteField.value ? noteField.value.trim() : '';
          const originalLabel = button.textContent || '提交动作';

          if (!threadKey || !commandId || !action) {
            setWorkspaceActionFeedback('缺少评论动作上下文，先进入线程现场再继续处理。', 'error');
            return;
          }

          button.disabled = true;
          button.textContent = '提交中...';

          try {
            if (target === 'reply') {
              if (!note) {
                throw new Error('先写一句明确回复，再从首页发送。');
              }

              setWorkspaceActionFeedback('正在把这条线程回复直接写回当前评论现场...', 'info');
              await postJson('/workspace/threads/' + encodeURIComponent(threadKey) + '/comment', {
                project_id: projectId,
                document_id: workspaceDocumentId,
                body: note,
                mode: 'comment',
                reply_only: true,
                owner_agent: ownerAgent || null,
                reply_to_command_id: commandId,
                reply_to_comment_title: commentTitle || null,
                reply_to_comment_summary: commentSummary || null,
              });
              const feedbackMessage = buildWorkspaceHomeCommentFeedback({
                target,
                action,
                note,
              });
              setWorkspaceActionFeedback(feedbackMessage + '，正在刷新首页...', 'success');
              window.setTimeout(
                () => reloadWorkspaceWithFeedback(feedbackMessage, 'success'),
                180,
              );
            } else if (target === 'comment') {
              setWorkspaceActionFeedback(action === 'red' ? '正在把这条评论升级成红灯...' : '正在把这条评论升级成黄灯...', 'info');
              await postJson('/workspace/threads/' + encodeURIComponent(threadKey) + '/comment', {
                project_id: projectId,
                document_id: workspaceDocumentId,
                body: note || defaultInstruction,
                mode: action,
                owner_agent: ownerAgent,
                context_quote: contextQuote || null,
              });
              const feedbackMessage = buildWorkspaceHomeCommentFeedback({
                target,
                action,
                note,
              });
              setWorkspaceActionFeedback(feedbackMessage + '，正在刷新首页...', 'success');
              window.setTimeout(
                () => reloadWorkspaceWithFeedback(feedbackMessage, 'success'),
                180,
              );
            } else {
              setWorkspaceActionFeedback('正在把这条评论重新接回执行链路...', 'info');
              await postJson('/commands/derive', {
                parent_command_id: commandId,
                owner_agent: ownerAgent,
                parsed_action: action,
                instruction: note || defaultInstruction,
                reason,
              });
              const feedbackMessage = buildWorkspaceHomeCommentFeedback({
                target,
                action,
                note,
              });
              setWorkspaceActionFeedback(feedbackMessage + '，正在刷新首页...', 'success');
              window.setTimeout(
                () => reloadWorkspaceWithFeedback(feedbackMessage, 'success'),
                180,
              );
            }
          } catch (error) {
            button.disabled = false;
            button.textContent = originalLabel;
            setWorkspaceActionFeedback('评论动作失败：' + (error && error.message ? error.message : String(error || 'unknown error')), 'error');
          }
        }

        async function handleHomeMemoryReviewAction(button) {
          if (!button || button.disabled) {
            return;
          }

          const memoryId = button.dataset.memoryId || '';
          const action = button.dataset.homeMemoryReviewAction || '';
          const actionBox = button.closest('[data-home-memory-review-box]');
          const noteField = actionBox ? actionBox.querySelector('[data-home-memory-review-note]') : null;
          const reviewNote = noteField && noteField.value ? noteField.value.trim() : '';
          const originalLabel = button.textContent || '提交治理动作';

          if (!memoryId || !action) {
            setWorkspaceActionFeedback('缺少 memory reviewer 上下文，先进入协作记忆再继续处理。', 'error');
            return;
          }

          const statusByAction = {
            accepted: 'durable',
            rejected: 'rejected',
            needs_followup: 'candidate',
          };
          const pendingLabel =
            action === 'accepted'
              ? '接受中...'
              : action === 'rejected'
                ? '拒绝中...'
                : '提交中...';

          button.disabled = true;
          button.textContent = pendingLabel;
          setWorkspaceActionFeedback('正在把这条 memory reviewer 判断写回协作记忆...', 'info');

          try {
            await postJson('/memory/' + encodeURIComponent(memoryId) + '/review', {
              review_state: action,
              status: statusByAction[action] || undefined,
              next_step: reviewNote || null,
              review_actor: 'workspace_memory_reviewer',
              review_note: reviewNote || null,
            });
            const feedbackMessage = buildWorkspaceHomeMemoryReviewFeedback(action, reviewNote);
            setWorkspaceActionFeedback(feedbackMessage + '，正在刷新首页记忆治理状态...', 'success');
            window.setTimeout(
              () => reloadWorkspaceWithFeedback(feedbackMessage, 'success'),
              180,
            );
          } catch (error) {
            button.disabled = false;
            button.textContent = originalLabel;
            setWorkspaceActionFeedback('首页 memory reviewer 提交失败：' + (error && error.message ? error.message : String(error || 'unknown error')), 'error');
          }
        }

        async function handleHomeMemoryReviewerRefresh(button) {
          if (!button || button.disabled) {
            return;
          }

          const memoryId = button.dataset.memoryId || '';
          const originalLabel = button.textContent || '重跑 reviewer';

          if (!memoryId) {
            setWorkspaceActionFeedback('缺少 memory 标识，暂时无法重跑 reviewer。', 'error');
            return;
          }

          button.disabled = true;
          button.textContent = '重跑中...';
          setWorkspaceActionFeedback('正在重跑 reviewer 评估，首页稍后会刷新到最新治理现场...', 'info');

          try {
            await postJson('/memory/' + encodeURIComponent(memoryId) + '/reviewer-review', {
              force: true,
            });
            setWorkspaceActionFeedback('Reviewer 已重跑完成，正在刷新首页记忆治理状态...', 'success');
            window.setTimeout(() => reloadWorkspaceWithFeedback('Reviewer 已重跑完成', 'success'), 180);
          } catch (error) {
            button.disabled = false;
            button.textContent = originalLabel;
            setWorkspaceActionFeedback('首页重跑 reviewer 失败：' + (error && error.message ? error.message : String(error || 'unknown error')), 'error');
          }
        }

        async function handleHomeSuggestionReviewAction(button) {
          if (!button || button.disabled) {
            return;
          }

          const suggestionId = button.dataset.suggestionId || '';
          const action = button.dataset.homeSuggestionReviewAction || '';
          const actionBox = button.closest('[data-home-suggestion-review-box]');
          const noteField = actionBox ? actionBox.querySelector('[data-home-suggestion-review-note]') : null;
          const reviewNote = noteField && noteField.value ? noteField.value.trim() : '';
          const originalLabel = button.textContent || '提交治理动作';

          if (!suggestionId || !action) {
            setWorkspaceActionFeedback('缺少 suggestion 上下文，先进入协作记忆再继续处理。', 'error');
            return;
          }

          button.disabled = true;
          button.textContent = action === 'accept' ? '转化中...' : '提交中...';
          setWorkspaceActionFeedback(
            action === 'accept'
              ? '正在把这条 suggestion 转成 candidate memory...'
              : '正在把这条 suggestion 标记为暂不沉淀...',
            'info',
          );

          try {
            if (action === 'accept') {
              await postJson('/suggestions/' + encodeURIComponent(suggestionId) + '/accept', {
                applied_at: new Date().toISOString(),
                review_note: reviewNote || null,
                review_actor: 'workspace_memory_reviewer',
              });
              const feedbackMessage = buildWorkspaceHomeSuggestionFeedback(action, reviewNote);
              setWorkspaceActionFeedback(feedbackMessage + '，正在刷新首页...', 'success');
              window.setTimeout(
                () => reloadWorkspaceWithFeedback(feedbackMessage, 'success'),
                180,
              );
            } else {
              await postJson('/suggestions/' + encodeURIComponent(suggestionId) + '/reject', {
                rejected_reason: reviewNote || '当前先不沉淀为 memory',
                review_note: reviewNote || null,
                review_actor: 'workspace_memory_reviewer',
                skip_memory_projection: true,
              });
              const feedbackMessage = buildWorkspaceHomeSuggestionFeedback(action, reviewNote);
              setWorkspaceActionFeedback(feedbackMessage + '，正在刷新首页...', 'success');
              window.setTimeout(
                () => reloadWorkspaceWithFeedback(feedbackMessage, 'success'),
                180,
              );
            }
          } catch (error) {
            button.disabled = false;
            button.textContent = originalLabel;
            setWorkspaceActionFeedback('首页 suggestion 治理失败：' + (error && error.message ? error.message : String(error || 'unknown error')), 'error');
          }
        }

        if (initialActionFeedback.message) {
          setWorkspaceActionFeedback(initialActionFeedback.message, initialActionFeedback.tone || 'info');
          clearWorkspaceActionFeedbackParams();
        }

        buttons.forEach((button) => {
          button.addEventListener('click', () => setView(button.dataset.viewTarget));
        });
        threadFilterButtons.forEach((button) => {
          button.addEventListener('click', () => setThreadFilter(button.dataset.threadFilter || 'all'));
        });
        governanceActionButtons.forEach((button) => {
          button.addEventListener('click', () => {
            handleGovernanceAction(button);
          });
        });
        homeDecisionButtons.forEach((button) => {
          button.addEventListener('click', () => {
            handleHomeDecisionAction(button);
          });
        });
        homeCommentButtons.forEach((button) => {
          button.addEventListener('click', () => {
            handleHomeCommentAction(button);
          });
        });
        homeMemoryReviewButtons.forEach((button) => {
          button.addEventListener('click', () => {
            handleHomeMemoryReviewAction(button);
          });
        });
        homeMemoryReviewerRefreshButtons.forEach((button) => {
          button.addEventListener('click', () => {
            handleHomeMemoryReviewerRefresh(button);
          });
        });
        homeSuggestionReviewButtons.forEach((button) => {
          button.addEventListener('click', () => {
            handleHomeSuggestionReviewAction(button);
          });
        });

        fetchRuntimeStatus();
        setThreadFilter(currentThreadFilter || 'all');
        setView(currentView || 'attention');

        let remaining = 15;
        const timer = setInterval(() => {
          remaining -= 1;
          if (label) {
            label.textContent = remaining > 0 ? remaining + 's 后自动刷新' : '正在刷新...';
          }
          if (remaining <= 0) {
            clearInterval(timer);
            window.location.reload();
          }
        }, 1000);
      })();
    </script>
  </body>
</html>`;
}
