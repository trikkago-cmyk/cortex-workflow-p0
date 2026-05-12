import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ensureProjectWorkspace, resolveProjectWorkspacePaths } from './project-workspace.js';
import {
  buildThreadGuidanceDescriptor,
  buildWorkspaceContextQuery,
  buildWorkspaceHeroActionQueue,
  buildWorkspacePayload,
  buildWorkspaceThreadHref,
  normalizeCommentWorkflowAuditItem,
  normalizeCommentWorkflowItem,
  pickTopChecklistFocus,
} from './task-dashboard.js';
import { deriveThreadIdentity } from './thread-identity.js';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(text, maxLength = 120) {
  const normalized = compact(text);
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function readChecklistFocusLabel(record = {}) {
  const source = record || {};
  return compact(source.checklist_focus_label || source.checklistFocusLabel || source.focus_label || source.focusLabel);
}

function readChecklistFocusNote(record = {}) {
  const source = record || {};
  return compact(source.checklist_focus_note || source.checklistFocusNote || source.focus_note || source.focusNote);
}

function readChecklistStepLabel(record = {}) {
  const source = record || {};
  return compact(source.checklist_step_label || source.checklistStepLabel || source.focus_step_label || source.focusStepLabel);
}

function readChecklistStepTitle(record = {}) {
  const source = record || {};
  return compact(source.checklist_step_title || source.checklistStepTitle || source.focus_step_title || source.focusStepTitle);
}

function readChecklistProgressLabel(record = {}) {
  const source = record || {};
  return compact(source.checklist_progress_label || source.checklistProgressLabel || source.progress_label || source.progressLabel);
}

function readChecklistProgressSummary(record = {}) {
  const source = record || {};
  return compact(source.checklist_progress_summary || source.checklistProgressSummary || source.progress_summary || source.progressSummary);
}

function readChecklistAcceptance(record = {}) {
  const source = record || {};
  return compact(source.checklist_acceptance || source.checklistAcceptance || source.acceptance);
}

function readChecklistCheckpointRule(record = {}) {
  const source = record || {};
  return compact(source.checklist_checkpoint_rule || source.checklistCheckpointRule || source.checkpoint_rule || source.checkpointRule);
}

function readChecklistFocusTitle(record = {}) {
  const source = record || {};
  return compact(source.checklist_focus_title || source.checklistFocusTitle || source.focus_title || source.focusTitle);
}

function readChecklistFocusSummary(record = {}) {
  const source = record || {};
  return compact(source.checklist_focus_summary || source.checklistFocusSummary || source.focus_summary || source.focusSummary);
}

export function pickWorkspaceDocumentThreadGroup(threadGroups = [], requestedThreadKey = '') {
  const groups = Array.isArray(threadGroups) ? threadGroups.filter(Boolean) : [];
  const normalizedRequestedThreadKey = compact(requestedThreadKey);
  if (groups.length === 0) {
    return null;
  }

  const exactSelectedThread = normalizedRequestedThreadKey
    ? groups.find((group) => compact(group.thread_key || group.threadKey) === normalizedRequestedThreadKey) || null
    : null;
  const aliasSelectedThread =
    !exactSelectedThread && normalizedRequestedThreadKey.startsWith('brief:')
      ? groups.find((group) =>
          (Array.isArray(group.tasks) ? group.tasks : []).some(
            (task) =>
              compact(task.brief_id || task.briefId) === normalizedRequestedThreadKey.slice('brief:'.length),
          ),
        ) || null
      : null;

  return (
    exactSelectedThread ||
    aliasSelectedThread ||
    pickTopChecklistFocus(groups) ||
    groups.find((group) => Number(group.red_count || group.redCount || 0) > 0) ||
    groups[0] ||
    null
  );
}

function buildChecklistRelationTitle(record = {}, title = '与当前闭环关系') {
  return [
    title,
    readChecklistFocusLabel(record),
    readChecklistStepLabel(record),
  ].filter(Boolean).join(' · ');
}

function buildChecklistInlineMeta(record = {}, options = {}) {
  const includeStep = options.includeStep !== false;
  const includeProgress = options.includeProgress !== false;
  const stepLabel = readChecklistStepLabel(record);
  const stepTitle = readChecklistStepTitle(record);
  const progressLabel = readChecklistProgressLabel(record);
  const meta = [];

  if (includeStep && stepLabel) {
    meta.push({
      label: '关联闭环',
      value: `${stepLabel}${stepTitle ? ` · ${stepTitle}` : ''}`,
    });
  }
  if (includeProgress && progressLabel) {
    meta.push({
      label: '执行清单',
      value: progressLabel,
    });
  }

  return meta;
}

function renderChecklistRelationCallout(record = {}, options = {}) {
  const focusLabel = readChecklistFocusLabel(record);
  const focusNote = readChecklistFocusNote(record);
  const stepLabel = readChecklistStepLabel(record);
  const progressLabel = readChecklistProgressLabel(record);
  const title = buildChecklistRelationTitle(record, options.title || '与当前闭环关系');
  const progressSummary = readChecklistProgressSummary(record);
  const progressDetail = progressSummary || (progressLabel ? `执行清单：${progressLabel}` : '');
  if ((!focusLabel && !focusNote && !stepLabel) || (!focusNote && !progressDetail)) {
    return '';
  }

  const attributeString = renderHtmlAttributeString({
    ...(options.context ? { 'data-checklist-relation-context': options.context } : {}),
    ...(options.attributes || {}),
  });
  return `
    <div class="${escapeHtml(options.className || 'thread-focus-callout')}"${attributeString}>
      <strong>${escapeHtml(title)}</strong>
      ${focusNote ? `<span>${escapeHtml(focusNote)}</span>` : ''}
      ${progressDetail ? `<span class="checklist-context-progress">${escapeHtml(progressDetail)}</span>` : ''}
    </div>
  `;
}

function buildExecutionChecklistRelationRecord(executionChecklist = null, focusLabel = '当前主闭环') {
  return {
    checklistFocusLabel: executionChecklist?.focusTitle ? focusLabel : '',
    checklistFocusNote: executionChecklist?.focusSummary || '',
    checklistStepLabel: executionChecklist?.focusStepNumber ? `第 ${executionChecklist.focusStepNumber} 步` : '',
    checklistStepTitle: executionChecklist?.focusStatusLabel || '',
    checklistProgressLabel: executionChecklist?.progressLabel || '',
    checklistProgressSummary: executionChecklist?.progressLabel ? `执行清单：${executionChecklist.progressLabel}` : '',
  };
}

function renderChecklistRelationWithExecutionFallback(record = {}, executionChecklist = null, options = {}) {
  return (
    renderChecklistRelationCallout(record, options) ||
    renderChecklistRelationCallout(
      buildExecutionChecklistRelationRecord(executionChecklist, options.fallbackFocusLabel || '当前主闭环'),
      options,
    )
  );
}

function renderSceneCardContextBlocks({
  threadPanel = null,
  relationRecord = {},
  executionChecklist = null,
  context = '',
  relationTitle = '与当前闭环关系',
  relationOptions = {},
  threadStateOptions = {},
} = {}) {
  const normalizedThreadStateOptions = threadStateOptions && typeof threadStateOptions === 'object' ? threadStateOptions : {};
  const stateHtml = renderThreadStateGuidanceSections(threadPanel, {
    context,
    ...normalizedThreadStateOptions,
    attributes: {
      'data-scene-card-context-block': 'thread-state',
      ...((normalizedThreadStateOptions && normalizedThreadStateOptions.attributes) || {}),
    },
  });
  const relationHtml = renderChecklistRelationWithExecutionFallback(relationRecord, executionChecklist, {
    title: relationTitle,
    context,
    ...(relationOptions || {}),
    attributes: {
      'data-scene-card-context-block': 'checklist-relation',
      ...((relationOptions && relationOptions.attributes) || {}),
    },
  });

  return `${stateHtml}${relationHtml}`;
}

function renderThreadStateSceneBlock(threadPanel = {}, context = 'thread', options = {}) {
  const normalizedOptions = options && typeof options === 'object' ? options : {};
  return renderThreadStateGuidanceSections(threadPanel, {
    ...normalizedOptions,
    context,
    attributes: {
      'data-scene-card-context-block': 'thread-state',
      ...((normalizedOptions && normalizedOptions.attributes) || {}),
    },
  });
}

function renderChecklistRelationSceneBlock(record = {}, executionChecklist = null, context = '', options = {}) {
  const normalizedOptions = options && typeof options === 'object' ? options : {};
  return renderChecklistRelationWithExecutionFallback(record, executionChecklist, {
    ...normalizedOptions,
    context,
    attributes: {
      'data-scene-card-context-block': 'checklist-relation',
      ...((normalizedOptions && normalizedOptions.attributes) || {}),
    },
  });
}

function renderHtmlAttributeString(attributes = {}) {
  const entries = Object.entries(attributes || {}).filter(([, value]) => value !== undefined && value !== null && value !== false && value !== '');
  if (entries.length === 0) {
    return '';
  }

  return entries
    .map(([key, value]) => {
      if (value === true) {
        return ` ${escapeHtml(key)}`;
      }
      return ` ${escapeHtml(key)}="${escapeHtml(String(value))}"`;
    })
    .join('');
}

function renderChecklistFocusLinks(links = []) {
  const items = Array.isArray(links)
    ? links.map((item) => normalizeChecklistFocusLink(item)).filter(Boolean)
    : [];
  if (items.length === 0) {
    return '';
  }

  return `
    <div class="checklist-focus-links">
      ${items
        .map(
          (item) => `<a class="thread-event-link" href="${escapeHtml(item.href)}"${
            item.target ? ` target="${escapeHtml(item.target)}"` : ''
          }${item.rel ? ` rel="${escapeHtml(item.rel)}"` : ''}>${escapeHtml(item.label)}</a>`,
        )
        .join('')}
    </div>
  `;
}

function renderChecklistFocusProofCard({
  title = '',
  body = '',
  progressItems = [],
  links = [],
  className = 'checklist-focus-proof',
  attributes = {},
} = {}) {
  const normalizedTitle = compact(title);
  const normalizedBody = compact(body);
  const normalizedProgressItems = Array.isArray(progressItems) ? progressItems.map((item) => compact(item)).filter(Boolean) : [];
  const normalizedLinks = Array.isArray(links)
    ? links.filter((item) => compact(item?.href) && compact(item?.label))
    : [];

  if (!normalizedTitle && !normalizedBody && normalizedProgressItems.length === 0 && normalizedLinks.length === 0) {
    return '';
  }

  return `
    <div class="${escapeHtml(className)}"${renderHtmlAttributeString(attributes)}>
      ${normalizedTitle ? `<strong>${escapeHtml(normalizedTitle)}</strong>` : ''}
      ${normalizedBody ? `<span>${escapeHtml(normalizedBody)}</span>` : ''}
      ${normalizedProgressItems.map((item) => `<span class="checklist-context-progress">${escapeHtml(item)}</span>`).join('')}
      ${renderChecklistFocusLinks(normalizedLinks)}
    </div>
  `;
}

function normalizeChecklistFocusLink(link = {}) {
  if (!link || typeof link !== 'object') {
    return null;
  }

  const href = compact(link.href);
  const label = compact(link.label);
  if (!href || !label) {
    return null;
  }

  const targetBlank = Boolean(link.targetBlank) || compact(link.target).toLowerCase() === '_blank';
  return {
    href,
    label,
    target: targetBlank ? '_blank' : '',
    rel: targetBlank ? compact(link.rel) || 'noreferrer' : '',
  };
}

function normalizeChecklistFocusProofCard(card = {}) {
  const normalizedTitle = compact(card.title);
  const normalizedBody = compact(card.body);
  const normalizedProgressItems = Array.isArray(card.progressItems)
    ? card.progressItems.map((item) => compact(item)).filter(Boolean)
    : [];
  const normalizedLinks = Array.isArray(card.links)
    ? card.links.map((item) => normalizeChecklistFocusLink(item)).filter(Boolean)
    : [];
  const kind = compact(card.kind);

  if (!normalizedTitle && !normalizedBody && normalizedProgressItems.length === 0 && normalizedLinks.length === 0) {
    return null;
  }

  return {
    kind,
    title: normalizedTitle,
    body: normalizedBody,
    progressItems: normalizedProgressItems,
    links: normalizedLinks,
  };
}

function buildChecklistFocusGuidanceModel(base = {}) {
  const pills = Array.isArray(base.pills) ? base.pills.map((item) => compact(item)).filter(Boolean) : [];
  const actions = Array.isArray(base.actions)
    ? base.actions.map((item) => normalizeChecklistFocusLink(item)).filter(Boolean)
    : [];
  const proofCards = Array.isArray(base.proofCards)
    ? base.proofCards.map((card) => normalizeChecklistFocusProofCard(card)).filter(Boolean)
    : [];

  return {
    eyebrow: compact(base.eyebrow),
    title: compact(base.title),
    summary: compact(base.summary),
    pills,
    actions,
    proofCards,
    actionQueue: Array.isArray(base.actionQueue) ? base.actionQueue.filter(Boolean) : [],
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

  return String(iso).trim().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

function toEpochMs(value) {
  if (!value) {
    return 0;
  }

  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? 0 : epoch;
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

function markdownToHtml(markdown = '') {
  return renderMarkdownDocument(markdown).html;
}

function renderMarkdownDocument(markdown = '') {
  const lines = String(markdown || '').split(/\r?\n/);
  const html = [];
  const outline = [];
  let inList = false;
  let headingIndex = 0;

  const pushHeading = (title, level) => {
    const safeTitle = compact(title);
    if (!safeTitle) {
      return;
    }

    headingIndex += 1;
    const anchorId = `doc-heading-${headingIndex}`;
    outline.push({
      level,
      title: safeTitle,
      anchorId,
    });
    html.push(`<h${Math.min(level + 1, 4)} id="${anchorId}">${escapeHtml(safeTitle)}</h${Math.min(level + 1, 4)}>`);
  };

  for (const line of lines) {
    const raw = line.trimEnd();
    const trimmed = raw.trim();

    if (!trimmed) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      html.push('<div class="doc-spacer"></div>');
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      pushHeading(headingMatch[2], Math.min(headingMatch[1].length, 3));
      continue;
    }

    const boldHeadingMatch = trimmed.match(/^\*\*(.+)\*\*$/);
    if (boldHeadingMatch) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      pushHeading(boldHeadingMatch[1], 2);
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${escapeHtml(trimmed.slice(2))}</li>`);
      continue;
    }

    if (inList) {
      html.push('</ul>');
      inList = false;
    }

    html.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  if (inList) {
    html.push('</ul>');
  }

  return {
    html: html.join('\n'),
    outline,
  };
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

function parseCommentIntentEventKey(value) {
  const raw = compact(value);
  const prefix = 'comment_intent:';
  if (!raw.startsWith(prefix)) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.slice(prefix.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function humanCommentIntent(intent) {
  const raw = compact(intent).toLowerCase();
  if (raw === 'continue_task') return '继续执行';
  if (raw === 'thread_reply') return '线程回复';
  if (raw === 'structured_directive') return '结构化指令';
  if (raw === 'revise_task') return '修改执行';
  if (raw === 'restart_task') return '重做任务';
  if (raw === 'control_task') return '控制任务';
  if (raw === 'question') return '提问';
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

function humanCommentConfidence(value) {
  const raw = compact(value).toLowerCase();
  if (raw === 'high') return '高';
  if (raw === 'medium') return '中';
  if (raw === 'low') return '低';
  return humanizeToken(value) || '未记录';
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

function classifyCommentThreadBucketFromSignals({
  executionPolicy = '',
  inboxStatus = '',
  taskState = '',
  commandStatus = '',
} = {}) {
  const normalizedExecutionPolicy = compact(executionPolicy).toLowerCase();
  const normalizedInboxStatus = compact(inboxStatus).toLowerCase();
  const normalizedTaskState = compact(taskState).toLowerCase();
  const normalizedCommandStatus = compact(commandStatus).toLowerCase();

  if (normalizedExecutionPolicy === 'reject' || normalizedTaskState.includes('拒绝')) {
    return 'rejected';
  }
  if (
    normalizedInboxStatus === 'open' ||
    normalizedInboxStatus === 'snoozed' ||
    normalizedInboxStatus.includes('待处理') ||
    normalizedInboxStatus.includes('稍后处理') ||
    (!normalizedInboxStatus && normalizedTaskState.includes('等待人工分流'))
  ) {
    return 'triage';
  }
  if (
    normalizedExecutionPolicy === 'enqueue' &&
    !normalizedCommandStatus.includes('已归档') &&
    !normalizedCommandStatus.includes('已完成')
  ) {
    return 'ready';
  }
  if (
    normalizedInboxStatus === 'resolved' ||
    normalizedInboxStatus === 'archived' ||
    normalizedInboxStatus.includes('已处理') ||
    normalizedInboxStatus.includes('已归档')
  ) {
    return 'resolved';
  }
  return 'resolved';
}

function humanCommentBucketLabel(bucket) {
  const raw = compact(bucket).toLowerCase();
  if (raw === 'triage') return '待分流';
  if (raw === 'ready') return '已接回执行';
  if (raw === 'rejected') return '已拦截';
  if (raw === 'resolved') return '历史层';
  if (raw === 'all') return '全部评论';
  return humanizeToken(bucket) || '未分类';
}

function normalizeCommentFilterValue(value) {
  const raw = compact(value).toLowerCase();
  return ['all', 'triage', 'ready', 'rejected', 'resolved'].includes(raw) ? raw : 'all';
}

function buildCommentFilterDescriptor(filterValue, summary = {}) {
  const normalized = compact(filterValue).toLowerCase() || 'all';
  const countByBucket = {
    all: Number(summary.total ?? summary.total_count ?? 0),
    triage: Number(summary.triageCount ?? summary.triage_count ?? 0),
    ready: Number(summary.readyCount ?? summary.ready_count ?? 0),
    rejected: Number(summary.rejectedCount ?? summary.rejected_count ?? 0),
    resolved: Number(summary.resolvedCount ?? summary.resolved_count ?? 0),
  };
  const label = humanCommentBucketLabel(normalized);
  const count = countByBucket[normalized] ?? countByBucket.all;
  const headline = `当前聚焦：${label} · ${count} 条`;

  let detail = '这里展示当前线程下的全部评论层，适合整体回看评论、triage 和执行回流是否一致。';
  if (normalized === 'triage') {
    detail = '先补一句明确指令，或决定是否升级成黄灯 / 红灯，让这批评论安全地接回执行链。';
  } else if (normalized === 'ready') {
    detail = '这批评论已经接回执行链，适合继续盯回执、checkpoint 和下一步派生动作。';
  } else if (normalized === 'rejected') {
    detail = '这批评论已被规则拦截，适合回看表述是否需要重写，或改成显式决策请求。';
  } else if (normalized === 'resolved') {
    detail = '这批评论主要用于历史审计和复盘，不应该继续占住当前线程的处理注意力。';
  }

  return {
    value: normalized,
    filter_value: normalized,
    filterValue: normalized,
    label,
    count,
    count_label: `${count} 条`,
    headline,
    detail,
  };
}

function normalizeCommentSummary(summary = {}) {
  const source = summary && typeof summary === 'object' ? summary : {};
  const total = Number(source.total ?? source.total_count ?? 0);
  const triageCount = Number(source.triageCount ?? source.triage_count ?? 0);
  const readyCount = Number(source.readyCount ?? source.ready_count ?? 0);
  const rejectedCount = Number(source.rejectedCount ?? source.rejected_count ?? 0);
  const resolvedCount = Number(source.resolvedCount ?? source.resolved_count ?? 0);
  const activeCount = Number(source.activeCount ?? source.active_count ?? 0);
  const normalizedBase = {
    ...source,
    total,
    triageCount,
    readyCount,
    rejectedCount,
    resolvedCount,
    activeCount,
  };
  const defaultFilter = normalizeCommentFilterValue(source.defaultFilter ?? source.default_filter ?? 'all');
  const selectedFilter = normalizeCommentFilterValue(
    source.selectedFilter ?? source.selected_filter ?? defaultFilter,
  );
  const normalizedFilters = Array.isArray(source.filters)
    ? source.filters.map((filter) => {
        const normalizedDescriptor = buildCommentFilterDescriptor(
          filter?.value || filter?.filter_value || filter?.filterValue || filter,
          normalizedBase,
        );
        const count = Number(filter?.count ?? normalizedDescriptor.count ?? 0);
        return {
          ...normalizedDescriptor,
          ...(filter && typeof filter === 'object' ? filter : {}),
          value: normalizedDescriptor.value,
          filter_value: normalizedDescriptor.value,
          filterValue: normalizedDescriptor.value,
          label: filter?.label || normalizedDescriptor.label,
          count,
          count_label: filter?.count_label || `${count} 条`,
          headline: filter?.headline || normalizedDescriptor.headline,
          detail: filter?.detail || normalizedDescriptor.detail,
        };
      })
    : [];
  const defaultFocus = {
    ...buildCommentFilterDescriptor(defaultFilter, normalizedBase),
    ...(source.defaultFocus || source.default_focus || {}),
  };
  const selectedFocus = {
    ...buildCommentFilterDescriptor(selectedFilter, normalizedBase),
    ...(source.selectedFocus || source.selected_focus || {}),
  };

  return {
    ...source,
    total,
    total_count: total,
    triageCount,
    triage_count: triageCount,
    readyCount,
    ready_count: readyCount,
    rejectedCount,
    rejected_count: rejectedCount,
    resolvedCount,
    resolved_count: resolvedCount,
    activeCount,
    active_count: activeCount,
    defaultFilter,
    default_filter: defaultFilter,
    selectedFilter,
    selected_filter: selectedFilter,
    filters: normalizedFilters,
    defaultFocus,
    default_focus: defaultFocus,
    selectedFocus,
    selected_focus: selectedFocus,
  };
}

function normalizeThreadCommentAuditItem(item = {}) {
  const source = normalizeCommentWorkflowAuditItem(item);
  const statusLabel = compact(source.statusLabel || source.status_label);
  const ownerAgent = compact(source.ownerAgent || source.owner_agent);
  const sourceUrl = compact(
    source.sourceUrl || source.source_url || source.sourceHref || source.source_href,
  );

  return {
    ...source,
    statusLabel,
    status_label: statusLabel,
    ownerAgent,
    owner_agent: ownerAgent,
    sourceUrl,
    source_url: sourceUrl,
  };
}

function normalizeThreadCommentItem(comment = {}) {
  const source = normalizeCommentWorkflowItem(comment);
  const commandId = compact(source.commandId || source.command_id);
  const ownerAgent = compact(source.ownerAgent || source.owner_agent);
  const queueBucket = compact(source.queueBucket || source.queue_bucket).toLowerCase();
  const queueBucketLabel =
    compact(source.queueBucketLabel || source.queue_bucket_label) ||
    (queueBucket ? humanCommentBucketLabel(queueBucket) : '');
  const executionPolicy = compact(source.executionPolicy || source.execution_policy);
  const replyCapable = source.replyCapable ?? source.reply_capable ?? Boolean(commandId);
  const actionMode =
    compact(source.actionMode || source.action_mode) ||
    (['triage', 'ready'].includes(queueBucket) ? queueBucket : '');
  const sourceUrl = compact(
    source.sourceUrl || source.source_url || source.sourceHref || source.source_href,
  );
  const collaborationAuditItems = (
    Array.isArray(source.collaborationAuditItems)
      ? source.collaborationAuditItems
      : Array.isArray(source.collaboration_audit_items)
        ? source.collaboration_audit_items
        : []
  ).map((item) => normalizeThreadCommentAuditItem(item));
  const collaborationAuditSummary = compact(
    source.collaborationAuditSummary || source.collaboration_audit_summary,
  );
  const nodeLabel = compact(source.nodeLabel || source.node_label);
  const nodeSummary = compact(source.nodeSummary || source.node_summary);
  const nodeAcceptance = compact(source.nodeAcceptance || source.node_acceptance);
  const nodeCheckpointRule = compact(
    source.nodeCheckpointRule || source.node_checkpoint_rule,
  );
  const nodeEvidence = compact(source.nodeEvidence || source.node_evidence);
  const nodeAnchorLabel = compact(source.nodeAnchorLabel || source.node_anchor_label);
  const nextAction = compact(source.nextAction || source.next_action);
  const flowCountsLabel = compact(source.flowCountsLabel || source.flow_counts_label);
  const latestRunStatusLabel = compact(
    source.latestRunStatusLabel || source.latest_run_status_label,
  );
  const latestReceiptLabel = compact(
    source.latestReceiptLabel || source.latest_receipt_label,
  );
  const latestCheckpointSummary = compact(
    source.latestCheckpointSummary || source.latest_checkpoint_summary,
  );
  const latestDerivedCommandLabel = compact(
    source.latestDerivedCommandLabel || source.latest_derived_command_label,
  );
  const intentLabel = compact(source.intentLabel || source.intent_label);
  const executionPolicyLabel = compact(
    source.executionPolicyLabel || source.execution_policy_label,
  );
  const taskStateLabel = compact(source.taskStateLabel || source.task_state_label);
  const confidenceLabel = compact(source.confidenceLabel || source.confidence_label);
  const reasonLabel = compact(source.reasonLabel || source.reason_label);
  const commandStatusLabel = compact(
    source.commandStatusLabel || source.command_status_label,
  );
  const inboxStatusLabel = compact(source.inboxStatusLabel || source.inbox_status_label);
  const relatedTaskLabel = compact(source.relatedTaskLabel || source.related_task_label);
  const relatedTaskHref = compact(source.relatedTaskHref || source.related_task_href);
  const latestCollaborationKindLabel = compact(
    source.latestCollaborationKindLabel || source.latest_collaboration_kind_label,
  );
  const latestCollaborationTaskStateLabel = compact(
    source.latestCollaborationTaskStateLabel ||
      source.latest_collaboration_task_state_label,
  );
  const latestCollaborationCommandStatusLabel = compact(
    source.latestCollaborationCommandStatusLabel ||
      source.latest_collaboration_command_status_label,
  );

  return {
    ...source,
    commandId,
    command_id: commandId,
    ownerAgent,
    owner_agent: ownerAgent,
    queueBucket,
    queue_bucket: queueBucket,
    queueBucketLabel,
    queue_bucket_label: queueBucketLabel,
    executionPolicy,
    execution_policy: executionPolicy,
    replyCapable: replyCapable,
    reply_capable: replyCapable,
    actionMode,
    action_mode: actionMode,
    sourceUrl,
    source_url: sourceUrl,
    collaborationAuditItems,
    collaboration_audit_items: collaborationAuditItems,
    collaborationAuditSummary,
    collaboration_audit_summary: collaborationAuditSummary,
    nodeLabel,
    node_label: nodeLabel,
    nodeSummary,
    node_summary: nodeSummary,
    nodeAcceptance,
    node_acceptance: nodeAcceptance,
    nodeCheckpointRule,
    node_checkpoint_rule: nodeCheckpointRule,
    nodeEvidence,
    node_evidence: nodeEvidence,
    nodeAnchorLabel,
    node_anchor_label: nodeAnchorLabel,
    nextAction,
    next_action: nextAction,
    flowCountsLabel,
    flow_counts_label: flowCountsLabel,
    latestRunStatusLabel,
    latest_run_status_label: latestRunStatusLabel,
    latestReceiptLabel,
    latest_receipt_label: latestReceiptLabel,
    latestCheckpointSummary,
    latest_checkpoint_summary: latestCheckpointSummary,
    latestDerivedCommandLabel,
    latest_derived_command_label: latestDerivedCommandLabel,
    intentLabel,
    intent_label: intentLabel,
    executionPolicyLabel,
    execution_policy_label: executionPolicyLabel,
    taskStateLabel,
    task_state_label: taskStateLabel,
    confidenceLabel,
    confidence_label: confidenceLabel,
    reasonLabel,
    reason_label: reasonLabel,
    commandStatusLabel,
    command_status_label: commandStatusLabel,
    inboxStatusLabel,
    inbox_status_label: inboxStatusLabel,
    relatedTaskLabel,
    related_task_label: relatedTaskLabel,
    relatedTaskHref,
    related_task_href: relatedTaskHref,
    latestCollaborationKindLabel,
    latest_collaboration_kind_label: latestCollaborationKindLabel,
    latestCollaborationTaskStateLabel,
    latest_collaboration_task_state_label: latestCollaborationTaskStateLabel,
    latestCollaborationCommandStatusLabel,
    latest_collaboration_command_status_label:
      latestCollaborationCommandStatusLabel,
  };
}

function normalizeCommentFocusMap(commentFocusMap = {}, commentSummary = {}) {
  const source =
    commentFocusMap && typeof commentFocusMap === 'object' ? commentFocusMap : {};

  return Object.fromEntries(
    Object.entries(source).map(([filterKey, entry]) => {
      const normalizedFilter = normalizeCommentFilterValue(
        entry?.filter || entry?.filter_value || entry?.filterValue || filterKey,
      );
      const selectedFocus = {
        ...buildCommentFilterDescriptor(normalizedFilter, commentSummary || {}),
        ...((entry && typeof entry === 'object'
          ? entry.selectedFocus || entry.selected_focus || {}
          : {}) || {}),
      };

      return [
        normalizedFilter,
        {
          ...(entry && typeof entry === 'object' ? entry : {}),
          filter: normalizedFilter,
          filter_value: normalizedFilter,
          filterValue: normalizedFilter,
          selected_focus: selectedFocus,
          selectedFocus: selectedFocus,
          comment: entry?.comment ? normalizeThreadCommentItem(entry.comment) : null,
        },
      ];
    }),
  );
}

function buildMemorySourceAnchor(sources = []) {
  const latestSource = pickLatestMemorySource(sources);
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
    label: [sourceTypeLabel, sourceRef ? `ref=${sourceRef}` : sourceUrl ? '已记录 URL' : '未记录 ref']
      .filter(Boolean)
      .join(' · '),
    detail: [
      latestSourceAt ? `最近记录：${formatIso(latestSourceAt)}` : '',
      sourceUrl ? '可直接打开原始 source' : '当前 source 还没有 URL，可继续回到 memory 文档追踪',
    ]
      .filter(Boolean)
      .join('；'),
    href: sourceUrl,
    hrefLabel: sourceUrl ? '打开最近 source' : '',
  };
}

function normalizeMemoryGovernanceCard(card = {}) {
  const source = card && typeof card === 'object' ? card : {};
  const memoryId = compact(source.memoryId || source.memory_id || resolveMemoryCardId(source));
  const suggestionId = compact(
    source.suggestionId ||
      source.suggestion_id ||
      (compact(source?.type) === 'suggestion' ? source?.id : ''),
  );
  const memoryStatus = compact(source.memoryStatus || source.memory_status);
  const memoryStatusLabel = compact(
    source.memoryStatusLabel || source.memory_status_label,
  );
  const reviewState = compact(source.reviewState || source.review_state);
  const reviewStateLabel = compact(
    source.reviewStateLabel || source.review_state_label,
  );
  const nextStep = compact(source.nextStep || source.next_step);
  const freshness = compact(source.freshness);
  const ownerAgent = compact(source.ownerAgent || source.owner_agent);
  const sourceCount = Number(source.sourceCount ?? source.source_count ?? 0);
  const reviewerRecommendation =
    source.reviewerRecommendation || source.reviewer_recommendation || null;
  const reviewerRecommendationSummary = compact(
    source.reviewerRecommendationSummary || source.reviewer_recommendation_summary,
  );
  const reviewerRationale = compact(
    source.reviewerRationale || source.reviewer_rationale,
  );
  const reviewerPrompt = compact(source.reviewerPrompt || source.reviewer_prompt);
  const evidenceSummary = compact(source.evidenceSummary || source.evidence_summary);
  const freshnessLabel = compact(source.freshnessLabel || source.freshness_label);
  const freshnessDetail = compact(
    source.freshnessDetail || source.freshness_detail,
  );
  const evidenceDeltaLabel = compact(
    source.evidenceDeltaLabel || source.evidence_delta_label,
  );
  const evidenceDeltaDetail = compact(
    source.evidenceDeltaDetail || source.evidence_delta_detail,
  );
  const revalidationLabel = compact(
    source.revalidationLabel || source.revalidation_label,
  );
  const revalidationDetail = compact(
    source.revalidationDetail || source.revalidation_detail,
  );
  const humanReviewSummary = compact(
    source.humanReviewSummary || source.human_review_summary,
  );
  const evidenceUpdatedAt =
    source.evidenceUpdatedAt || source.evidence_updated_at || null;
  const sourceAnchorLabel = compact(
    source.sourceAnchorLabel || source.source_anchor_label,
  );
  const sourceAnchorDetail = compact(
    source.sourceAnchorDetail || source.source_anchor_detail,
  );
  const sourceAnchorHref = compact(
    source.sourceAnchorHref || source.source_anchor_href,
  );
  const sourceAnchorHrefLabel = compact(
    source.sourceAnchorHrefLabel || source.source_anchor_href_label,
  );
  const homeGovernanceHint = compact(
    source.homeGovernanceHint || source.home_governance_hint,
  );
  const showGovernanceActions =
    source.showGovernanceActions ?? source.show_governance_actions ?? false;
  const focusLabel = compact(source.focusLabel || source.focus_label);
  const focusNote = compact(source.focusNote || source.focus_note);
  const sectionKey = compact(source.sectionKey || source.section_key);
  const sectionTitle = compact(source.sectionTitle || source.section_title);
  const sectionAnchorId = compact(
    source.sectionAnchorId || source.section_anchor_id,
  );
  const sectionNextAction = compact(
    source.sectionNextAction || source.section_next_action,
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
    homeGovernanceHint,
    home_governance_hint: homeGovernanceHint,
    showGovernanceActions,
    show_governance_actions: showGovernanceActions,
    focusLabel,
    focus_label: focusLabel,
    focusNote,
    focus_note: focusNote,
    sectionKey,
    section_key: sectionKey,
    sectionTitle,
    section_title: sectionTitle,
    sectionAnchorId,
    section_anchor_id: sectionAnchorId,
    sectionNextAction,
    section_next_action: sectionNextAction,
  };
}

function normalizeMemoryGovernanceSection(section = {}) {
  const source = section && typeof section === 'object' ? section : {};
  const key = compact(source.key || source.section_key);
  const title = compact(source.title || source.section_title);
  const anchorId = compact(source.anchorId || source.anchor_id);
  const summary = compact(source.summary);
  const emptySummary = compact(source.emptySummary || source.empty_summary);
  const nextAction = compact(source.nextAction || source.next_action);
  const cards = Array.isArray(source.cards)
    ? source.cards
    : Array.isArray(source.card_items)
      ? source.card_items
      : [];
  const normalizedCards = cards.map((card) => normalizeMemoryGovernanceCard(card));

  return {
    ...source,
    key,
    section_key: key,
    title,
    section_title: title,
    anchorId,
    anchor_id: anchorId,
    summary,
    emptySummary,
    empty_summary: emptySummary,
    nextAction,
    next_action: nextAction,
    cards: normalizedCards,
    card_items: normalizedCards,
  };
}

function normalizeMemoryGovernance(memoryGovernance = {}) {
  const source =
    memoryGovernance && typeof memoryGovernance === 'object' ? memoryGovernance : {};
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

  return {
    ...source,
    memoryDocHref: compact(source.memoryDocHref || source.memory_doc_href),
    memory_doc_href: compact(source.memoryDocHref || source.memory_doc_href),
    counts: {
      ...countsSource,
      candidates: Number(countsSource.candidates ?? countsSource.candidate_count ?? 0),
      reviews: Number(countsSource.reviews ?? countsSource.review_count ?? 0),
      suggestions: Number(countsSource.suggestions ?? countsSource.suggestion_count ?? 0),
    },
    candidateCards: candidateCards.map((card) => normalizeMemoryGovernanceCard(card)),
    candidate_cards: candidateCards.map((card) => normalizeMemoryGovernanceCard(card)),
    reviewCards: reviewCards.map((card) => normalizeMemoryGovernanceCard(card)),
    review_cards: reviewCards.map((card) => normalizeMemoryGovernanceCard(card)),
    suggestionCards: suggestionCards.map((card) => normalizeMemoryGovernanceCard(card)),
    suggestion_cards: suggestionCards.map((card) => normalizeMemoryGovernanceCard(card)),
  };
}

function normalizeMemoryPanel(memoryPanel = {}) {
  const source = memoryPanel && typeof memoryPanel === 'object' ? memoryPanel : {};
  const countsSource = source.counts && typeof source.counts === 'object' ? source.counts : {};
  const focusItemSource = source.focusItem || source.focus_item || null;
  const focusItem = focusItemSource ? normalizeMemoryGovernanceCard(focusItemSource) : null;
  const sectionsSource = Array.isArray(source.sections) ? source.sections : [];
  const sections = sectionsSource.map((section) => normalizeMemoryGovernanceSection(section));
  const title = compact(source.title);
  const subtitle = compact(source.subtitle);
  const summary = compact(source.summary);
  const focusTitle = compact(source.focusTitle || source.focus_title) || focusItem?.title || '';
  const focusSectionTitle =
    compact(source.focusSectionTitle || source.focus_section_title) ||
    focusItem?.sectionTitle ||
    '';
  const focusLabel = compact(source.focusLabel || source.focus_label) || focusItem?.focusLabel || '';
  const focusNote = compact(source.focusNote || source.focus_note) || focusItem?.focusNote || '';
  const focusEvidence = compact(source.focusEvidence || source.focus_evidence);
  const focusEvidenceUpdatedAt =
    source.focusEvidenceUpdatedAt || source.focus_evidence_updated_at || focusItem?.evidenceUpdatedAt || null;
  const nextAction = compact(source.nextAction || source.next_action);
  const actionableCount = Number(
    source.actionableCount ?? source.actionable_count ?? 0,
  );
  const docHref = compact(source.docHref || source.doc_href);

  return {
    ...source,
    title,
    subtitle,
    summary,
    focusItem,
    focus_item: focusItem,
    focusTitle,
    focus_title: focusTitle,
    focusSectionTitle,
    focus_section_title: focusSectionTitle,
    focusLabel,
    focus_label: focusLabel,
    focusNote,
    focus_note: focusNote,
    focusEvidence,
    focus_evidence: focusEvidence,
    focusEvidenceUpdatedAt,
    focus_evidence_updated_at: focusEvidenceUpdatedAt,
    nextAction,
    next_action: nextAction,
    actionableCount,
    actionable_count: actionableCount,
    counts: {
      ...countsSource,
      candidates: Number(countsSource.candidates ?? countsSource.candidate_count ?? 0),
      reviews: Number(countsSource.reviews ?? countsSource.review_count ?? 0),
      suggestions: Number(countsSource.suggestions ?? countsSource.suggestion_count ?? 0),
    },
    sections,
    docHref,
    doc_href: docHref,
  };
}

function humanSignalLevel(signalLevel) {
  const raw = compact(signalLevel).toLowerCase();
  if (raw === 'red') return '红灯';
  if (raw === 'yellow') return '黄灯';
  if (raw === 'green') return '绿灯';
  return '未标记';
}

function humanThreadExecutionStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'waiting_human') return '等待拍板';
  if (raw === 'stalled') return '黄灯绕行中';
  if (raw === 'completed') return '已完成';
  return '自动推进中';
}

function humanTaskExecutionStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'waiting_human') return '等待拍板';
  if (raw === 'stalled') return '黄灯绕行中';
  if (raw === 'completed') return '已完成';
  if (raw === 'in_progress') return '处理中';
  return humanizeToken(status) || '处理中';
}

function classifyCommentFlowCommandRole(command = {}) {
  const source = compact(command.source || command.sourceType).toLowerCase();
  if (source !== 'notion_comment') {
    return 'execution';
  }

  const intent = parseCommentIntentEventKey(command.eventKey) || {};
  const policy = compact(intent.comment_execution_policy).toLowerCase();
  return policy && policy !== 'enqueue' ? 'collaboration' : 'execution';
}

function classifyCommentFlowCollaborationKind(command = {}) {
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
  return 'collaboration';
}

function labelCommentFlowCollaboration(command = {}) {
  const kind = classifyCommentFlowCollaborationKind(command);
  if (kind === 'thread_reply') {
    return '线程回复';
  }
  if (kind === 'note') {
    return '协同留痕';
  }
  if (kind === 'triage') {
    return '待分流评论';
  }
  if (kind === 'rejected') {
    return '被拦截评论';
  }
  return '协同记录';
}

function collectCommandDescendants(commands = [], rootCommandId) {
  const normalizedRootCommandId = compact(rootCommandId);
  if (!normalizedRootCommandId) {
    return [];
  }

  const childrenByParent = new Map();
  for (const command of commands) {
    const parentCommandId = compact(command?.parentCommandId);
    if (!parentCommandId) {
      continue;
    }

    const siblings = childrenByParent.get(parentCommandId) || [];
    siblings.push(command);
    childrenByParent.set(parentCommandId, siblings);
  }

  const descendants = [];
  const seenCommandIds = new Set();
  const stack = [...(childrenByParent.get(normalizedRootCommandId) || [])];

  while (stack.length > 0) {
    const command = stack.pop();
    const commandId = compact(command?.commandId);
    if (!commandId || seenCommandIds.has(commandId)) {
      continue;
    }

    seenCommandIds.add(commandId);
    descendants.push(command);

    const children = childrenByParent.get(commandId) || [];
    for (const child of children) {
      stack.push(child);
    }
  }

  return descendants.sort((left, right) => toEpochMs(right.updatedAt || right.createdAt) - toEpochMs(left.updatedAt || left.createdAt));
}

function buildCommentCommandTrees(commands = []) {
  const commentCommands = [...commands].filter((command) => compact(command.source).toLowerCase() === 'notion_comment');
  if (commentCommands.length === 0) {
    return [];
  }

  const commentCommandIds = new Set(commentCommands.map((command) => compact(command.commandId)).filter(Boolean));

  return commentCommands
    .filter((command) => !commentCommandIds.has(compact(command.parentCommandId)))
    .map((rootCommand) => {
      const descendants = collectCommandDescendants(commands, rootCommand.commandId);
      const commandIds = new Set(
        [rootCommand, ...descendants]
          .map((command) => compact(command?.commandId))
          .filter(Boolean),
      );
      const latestActivityAt = Math.max(
        toEpochMs(rootCommand.updatedAt || rootCommand.createdAt),
        ...descendants.map((command) => toEpochMs(command.updatedAt || command.createdAt)),
      );

      return {
        rootCommand,
        descendants,
        commandIds,
        latestActivityAt,
      };
    })
    .sort((left, right) => right.latestActivityAt - left.latestActivityAt);
}

function summarizeCommentCollaborationKinds(kindCounts = new Map()) {
  return [...kindCounts.entries()]
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hans-CN'))
    .map(([label, count]) => `${count} 条${label}`)
    .join(' / ');
}

function summarizeCommentFlowDetails(rootCommand, derivedCommands = []) {
  const orderedDerivedCommands = [...derivedCommands].filter(Boolean);
  let executionCommandCount = 0;
  const collaborationKindCounts = new Map();
  let collaborationCount = 0;
  let latestExecutionDerivedCommand = null;
  let latestCollaborationCommand = null;

  if (rootCommand) {
    if (classifyCommentFlowCommandRole(rootCommand) === 'collaboration') {
      const label = labelCommentFlowCollaboration(rootCommand);
      collaborationKindCounts.set(label, Number(collaborationKindCounts.get(label) || 0) + 1);
      collaborationCount += 1;
      latestCollaborationCommand = rootCommand;
    } else {
      executionCommandCount += 1;
    }
  }

  for (const command of orderedDerivedCommands) {
    if (classifyCommentFlowCommandRole(command) === 'collaboration') {
      const label = labelCommentFlowCollaboration(command);
      collaborationKindCounts.set(label, Number(collaborationKindCounts.get(label) || 0) + 1);
      collaborationCount += 1;
      if (!latestCollaborationCommand) {
        latestCollaborationCommand = command;
      }
    } else {
      executionCommandCount += 1;
      if (!latestExecutionDerivedCommand) {
        latestExecutionDerivedCommand = command;
      }
    }
  }

  return {
    executionCommandCount,
    collaborationCount,
    collaborationKindCounts,
    collaborationSummary: summarizeCommentCollaborationKinds(collaborationKindCounts),
    latestExecutionDerivedCommand,
    latestCollaborationCommand,
  };
}

function buildCommentCollaborationAuditItems(rootCommand, derivedCommands = []) {
  return [rootCommand, ...derivedCommands]
    .filter(Boolean)
    .filter((command) => classifyCommentFlowCommandRole(command) === 'collaboration')
    .sort((left, right) => toEpochMs(right.updatedAt || right.createdAt) - toEpochMs(left.updatedAt || left.createdAt))
    .map((command) => {
      const intent = parseCommentIntentEventKey(command.eventKey) || {};
      const kind = classifyCommentFlowCollaborationKind(command);
      const kindLabel = labelCommentFlowCollaboration(command);
      const executionPolicy = compact(intent.comment_execution_policy).toLowerCase();
      const tone = executionPolicy === 'reject' ? 'red' : executionPolicy === 'inbox_only' ? 'yellow' : 'green';
      const body = compact(command.instruction || command.contextQuote || command.resultSummary || command.commandId);
      const detail = [
        humanCommentExecutionPolicy(intent.comment_execution_policy),
        humanCommentReason(intent.comment_reason),
      ]
        .filter(Boolean)
        .join(' · ');
      const statusLabel = [
        humanCommentTaskState(intent.comment_task_state),
        humanCommandStatus(command.status),
      ]
        .filter(Boolean)
        .join(' · ');

      return {
        commandId: command.commandId,
        kind,
        kindLabel,
        tone,
        summary: summarize(body, 140),
        detail,
        statusLabel,
        ownerAgent: command.ownerAgent || '',
        timeLabel: formatIso(command.updatedAt || command.createdAt),
        sourceUrl: command.sourceUrl || '',
      };
    });
}

function summarizeWorkflowCounts(counts = {}) {
  const pieces = [];
  const commandCount = Number(counts.commands || 0);
  const runCount = Number(counts.runs || 0);
  const receiptCount = Number(counts.receipts || 0);
  const checkpointCount = Number(counts.checkpoints || 0);
  const collaborationSummary = compact(counts.collaborationSummary || counts.collaboration_summary);

  if (commandCount > 0) {
    pieces.push(`${commandCount} 条命令`);
  }
  if (collaborationSummary) {
    pieces.push(collaborationSummary);
  }
  if (runCount > 0) {
    pieces.push(`${runCount} 个 Run`);
  }
  if (receiptCount > 0) {
    pieces.push(`${receiptCount} 个回执`);
  }
  if (checkpointCount > 0) {
    pieces.push(`${checkpointCount} 个 Checkpoint`);
  }

  return pieces.join(' / ');
}

function summarizeCommentFlowCounts(rootCommand, derivedCommands = [], runs = [], receipts = [], checkpoints = []) {
  const flowDetails = summarizeCommentFlowDetails(rootCommand, derivedCommands);

  return summarizeWorkflowCounts({
    commands: flowDetails.executionCommandCount,
    collaborationSummary: flowDetails.collaborationSummary,
    runs: runs.length,
    receipts: receipts.length,
    checkpoints: checkpoints.length,
  });
}

function summarizeReceiptDetail(receipt) {
  if (!receipt) {
    return '';
  }

  const summary = compact(receipt.payload?.summary || receipt.payload?.details || receipt.target || '');
  return summary ? summarize(summary, 72) : '已收到 agent 回执。';
}

function summarizeCheckpointDetail(checkpoint) {
  if (!checkpoint) {
    return '';
  }

  const summary = compact(checkpoint.summary || checkpoint.nextStep || checkpoint.title || '');
  return summary ? summarize(summary, 72) : '已记录 checkpoint。';
}

function latestByTimestamp(items = []) {
  const priorityByKind = {
    checkpoint: 5,
    receipt: 4,
    run: 3,
    decision: 2,
    command: 1,
    inbox: 0,
    suggestion: 0,
  };

  return [...items].sort((left, right) => {
    const rightEpoch = toEpochMs(right.updatedAt || right.createdAt || right.startedAt || right.completedAt || right.timestamp);
    const leftEpoch = toEpochMs(left.updatedAt || left.createdAt || left.startedAt || left.completedAt || left.timestamp);
    if (rightEpoch !== leftEpoch) {
      return rightEpoch - leftEpoch;
    }

    const rightPriority = priorityByKind[compact(right.kind).toLowerCase()] ?? 0;
    const leftPriority = priorityByKind[compact(left.kind).toLowerCase()] ?? 0;
    return rightPriority - leftPriority;
  })[0] || null;
}

function summarizeOwners(values = []) {
  const unique = [...new Set(values.map((value) => compact(value)).filter(Boolean))];
  if (unique.length === 0) {
    return '未分配';
  }

  const preview = unique.slice(0, 3).join(' / ');
  return unique.length > 3 ? `${preview} 等 ${unique.length} 个 agent` : preview;
}

function resolveWorkspaceDocuments(projectId, cwd = process.cwd()) {
  ensureProjectWorkspace({ cwd, projectId });
  const paths = resolveProjectWorkspacePaths({ cwd, projectId });

  return [
    {
      documentId: 'execution',
      title: '执行文档',
      description: '任务推进、风险举手、下一步与异步评论约定。',
      path: paths.executionDocPath,
      kind: 'execution',
    },
    {
      documentId: 'memory',
      title: '协作记忆',
      description: 'Base Memory / Timeline / Knowledge 的当前沉淀视图。',
      path: paths.memoryPath,
      kind: 'memory',
    },
  ];
}

function readDocumentBody(document) {
  if (!document || !document.path) {
    return '# 文档不存在\n\n当前没有可读取的文档路径。';
  }

  if (!existsSync(document.path)) {
    return `# ${document.title}\n\n- 本地文档尚未创建\n- 目标路径：${document.path}`;
  }

  return readFileSync(document.path, 'utf8');
}

function findSelectedDocument(documents, documentId) {
  const normalized = compact(documentId).toLowerCase();
  return documents.find((document) => document.documentId === normalized) || documents[0];
}

function isOpenDecisionStatus(status) {
  const raw = compact(status).toLowerCase();
  return raw && !['approved', 'stopped', 'resolved', 'archived'].includes(raw);
}

function toneFromState(...values) {
  const raw = values
    .map((value) => compact(value).toLowerCase())
    .filter(Boolean)
    .join(' ');

  if (raw.includes('red') || raw.includes('failed') || raw.includes('stopped')) {
    return 'red';
  }
  if (raw.includes('yellow') || raw.includes('review') || raw.includes('changes_requested') || raw.includes('retry')) {
    return 'yellow';
  }
  if (raw.includes('running') || raw.includes('executing') || raw.includes('claimed')) {
    return 'blue';
  }
  return 'green';
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
  if (raw === 'failed') return '失败';
  if (raw === 'read') return '已读';
  if (raw === 'acknowledged') return '已确认';
  return status || '未知';
}

function humanInboxStatus(status) {
  const raw = compact(status).toLowerCase();
  if (raw === 'open') return '待处理';
  if (raw === 'resolved') return '已处理';
  if (raw === 'snoozed') return '稍后处理';
  if (raw === 'archived') return '已归档';
  return status || '未知';
}

function collectTaskArtifactIds(selectedThread) {
  const collect = (field) =>
    new Set(
      (selectedThread?.tasks || [])
        .flatMap((task) => task[field] || [])
        .filter(Boolean),
    );

  return {
    commandIds: collect('command_ids'),
    runIds: collect('run_ids'),
    decisionIds: collect('decision_ids'),
    checkpointIds: collect('checkpoint_ids'),
    receiptIds: collect('receipt_ids'),
    inboxItemIds: collect('inbox_item_ids'),
    suggestionIds: collect('suggestion_ids'),
  };
}

function filterRecordsForThread(records, idSet, selectedThread, project) {
  return records.filter((record) => {
    const recordId =
      record.commandId ||
      record.runId ||
      record.decisionId ||
      record.checkpointId ||
      record.receiptId ||
      record.itemId ||
      record.suggestionId;
    const matchesArtifactId = idSet.size > 0 && recordId ? idSet.has(recordId) : false;
    const matchesThreadIdentity = deriveThreadIdentity(record, project).key === selectedThread.thread_key;

    return matchesArtifactId || matchesThreadIdentity;
  });
}

function mapCommandEvent(command) {
  return {
    id: `command:${command.commandId}`,
    kind: 'command',
    tone: toneFromState(command.status),
    timestamp: command.updatedAt || command.createdAt || null,
    badge: `命令 · ${humanCommandStatus(command.status)}`,
    title: summarize(command.instruction || command.commandId, 88),
    summary: summarize(command.resultSummary || command.contextQuote || '等待执行回执。', 180),
    meta: [
      command.ownerAgent ? `负责人：${command.ownerAgent}` : null,
      command.parsedAction ? `动作：${command.parsedAction}` : null,
    ].filter(Boolean),
    link: command.sourceUrl || null,
  };
}

function mapDecisionEvent(decision) {
  return {
    id: `decision:${decision.decisionId}`,
    kind: 'decision',
    tone: toneFromState(decision.signalLevel, decision.status),
    timestamp: decision.updatedAt || decision.createdAt || null,
    badge: `${String(decision.signalLevel || 'green').toUpperCase()} · ${humanDecisionStatus(decision.status)}`,
    title: summarize(decision.question || decision.decisionId, 88),
    summary: summarize(decision.recommendation || decision.context || decision.requestedHumanAction || '等待进一步处理。', 180),
    meta: [
      decision.ownerAgent ? `建议负责人：${decision.ownerAgent}` : null,
      decision.impactScope ? `影响范围：${decision.impactScope}` : null,
    ].filter(Boolean),
    link: decision.sourceUrl || null,
  };
}

function mapRunEvent(run) {
  return {
    id: `run:${run.runId}`,
    kind: 'run',
    tone: toneFromState(run.status),
    timestamp: run.updatedAt || run.startedAt || run.createdAt || null,
    badge: `Run · ${humanRunStatus(run.status)}`,
    title: summarize(run.title || `${run.agentName || 'agent'} run`, 88),
    summary: summarize(run.summary || `${run.agentName || 'agent'} 正在执行 ${run.phase || '当前阶段'}`, 180),
    meta: [
      run.agentName ? `Agent：${run.agentName}` : null,
      run.phase ? `阶段：${run.phase}` : null,
    ].filter(Boolean),
    link: null,
  };
}

function mapCheckpointEvent(checkpoint) {
  return {
    id: `checkpoint:${checkpoint.checkpointId}`,
    kind: 'checkpoint',
    tone: toneFromState(checkpoint.signalLevel, checkpoint.status, checkpoint.qualityGrade),
    timestamp: checkpoint.updatedAt || checkpoint.createdAt || null,
    badge: `Checkpoint · ${compact(checkpoint.status) || '已记录'}`,
    title: summarize(checkpoint.title || checkpoint.checkpointId, 88),
    summary: summarize(checkpoint.summary || checkpoint.nextStep || '已产出新的 checkpoint。', 180),
    meta: [
      checkpoint.stage ? `阶段：${checkpoint.stage}` : null,
      checkpoint.nextStep ? `下一步：${summarize(checkpoint.nextStep, 44)}` : null,
    ].filter(Boolean),
    link: null,
  };
}

function mapReceiptEvent(receipt) {
  return {
    id: `receipt:${receipt.receiptId}`,
    kind: 'receipt',
    tone: toneFromState(receipt.signal, receipt.status, receipt.receiptType),
    timestamp: receipt.createdAt || null,
    badge: `回执 · ${humanReceiptStatus(receipt.status)}`,
    title: summarize(receipt.payload?.summary || receipt.commandId || receipt.receiptId, 88),
    summary: summarize(receipt.payload?.details || receipt.target || '已收到 agent 回执。', 180),
    meta: [
      receipt.channel ? `渠道：${receipt.channel}` : null,
      receipt.receiptType ? `类型：${receipt.receiptType}` : null,
    ].filter(Boolean),
    link: null,
  };
}

function mapInboxEvent(item) {
  return {
    id: `inbox:${item.itemId}`,
    kind: 'inbox',
    tone: toneFromState(item.riskLevel, item.status),
    timestamp: item.updatedAt || item.createdAt || null,
    badge: `Inbox · ${item.status || 'open'}`,
    title: summarize(item.title || item.itemId, 88),
    summary: summarize(item.summary || item.actionType || '等待进一步处理。', 180),
    meta: [
      item.assignedTo ? `分配给：${item.assignedTo}` : null,
      item.queue ? `队列：${item.queue}` : null,
    ].filter(Boolean),
    link: item.sourceUrl || null,
  };
}

function mapSuggestionEvent(suggestion) {
  return {
    id: `suggestion:${suggestion.suggestionId}`,
    kind: 'suggestion',
    tone: toneFromState(suggestion.status),
    timestamp: suggestion.updatedAt || suggestion.createdAt || null,
    badge: `Suggestion · ${suggestion.status || 'proposed'}`,
    title: summarize(suggestion.proposedText || suggestion.selectedText || suggestion.suggestionId, 88),
    summary: summarize(suggestion.reason || suggestion.documentRef || '等待进一步处理。', 180),
    meta: [
      suggestion.ownerAgent ? `负责人：${suggestion.ownerAgent}` : null,
      suggestion.sourceType ? `来源：${suggestion.sourceType}` : null,
    ].filter(Boolean),
    link: suggestion.documentRef || null,
  };
}

function sortThreadTasks(tasks = []) {
  return [...tasks].sort(
    (left, right) =>
      toEpochMs(right.latest_updated_at || right.latestUpdatedAt) - toEpochMs(left.latest_updated_at || left.latestUpdatedAt),
  );
}

function selectPrimaryThreadTask(tasks = []) {
  const sortedTasks = sortThreadTasks(tasks);
  const activeTasks = sortedTasks.filter((task) =>
    ['waiting_human', 'stalled', 'in_progress'].includes(compact(task.execution_status).toLowerCase()),
  );
  const primaryTask = activeTasks[0] || sortedTasks[0] || null;
  return {
    sortedTasks,
    activeTasks,
    primaryTask,
  };
}

function formatThreadTaskLabel(task, parallelCount = 0) {
  if (!task) {
    return '';
  }

  const taskId = task.brief_id || task.briefId || task.task_id || task.taskId || task.title || '未命名任务';
  const currentNode = task.current_node || task.currentNode || '未记录节点';
  const suffix = parallelCount > 0 ? `（另有 ${parallelCount} 个子任务并行）` : '';
  return `${taskId} · ${humanTaskExecutionStatus(task.execution_status)} · ${currentNode}${suffix}`;
}

function buildThreadGroupOverview(group) {
  const tasks = group?.tasks || [];
  const { primaryTask, activeTasks } = selectPrimaryThreadTask(tasks);
  const waitingHumanCount = tasks.filter((task) => compact(task.execution_status).toLowerCase() === 'waiting_human').length;
  const inProgressCount = tasks.filter((task) => compact(task.execution_status).toLowerCase() === 'in_progress').length;
  const stalledCount = tasks.filter((task) => compact(task.execution_status).toLowerCase() === 'stalled').length;
  const completedCount =
    Number(group?.completed_count || group?.completedCount || 0) ||
    tasks.filter((task) => compact(task.execution_status).toLowerCase() === 'completed').length;
  const yellowCount = tasks.filter((task) => compact(task.decision_signal).toLowerCase() === 'yellow').length;
  const commentTriageCount = Number(group?.comment_triage_count || group?.commentTriageCount || 0);
  const commentReadyCount = Number(group?.comment_ready_count || group?.commentReadyCount || 0);

  const statusParts = [];
  if (waitingHumanCount > 0) {
    statusParts.push(`${waitingHumanCount} 个待拍板`);
  }
  if (stalledCount > 0) {
    statusParts.push(`${stalledCount} 个待回看`);
  }
  if (inProgressCount > 0) {
    statusParts.push(`${inProgressCount} 个处理中`);
  }
  if (completedCount > 0) {
    statusParts.push(`${completedCount} 个已完成`);
  }
  if (statusParts.length === 0 && tasks.length > 0) {
    statusParts.push(`${tasks.length} 个任务`);
  }

  const signalParts = [];
  if ((group?.red_count || 0) > 0) {
    signalParts.push(`${group.red_count} 个红灯`);
  }
  if (yellowCount > 0) {
    signalParts.push(`${yellowCount} 个黄灯`);
  }

  const overviewParts = [];
  if (commentTriageCount > 0) {
    overviewParts.push(`${commentTriageCount} 条待分流评论`);
  }
  if (commentReadyCount > 0) {
    overviewParts.push(`${commentReadyCount} 条已接回执行评论`);
  }
  if ((group?.red_count || 0) > 0) {
    overviewParts.push(`${group.red_count} 个红灯`);
  }
  if (completedCount > 0) {
    overviewParts.push(`${completedCount} 个已完成`);
  }

  return {
    focusLabel: formatThreadTaskLabel(primaryTask, Math.max(0, activeTasks.length - 1)),
    statusSummary: statusParts.join(' · '),
    signalSummary: signalParts.join(' · '),
    overviewSummary: overviewParts.join(' · '),
  };
}

function findTaskForCommentCommand(selectedThread, commandId) {
  const tasks = selectedThread?.tasks || [];
  if (!commandId) {
    return null;
  }

  return (
    tasks.find((task) => {
      const commandIds = task.command_ids || task.commandIds || [];
      return commandIds.includes(commandId);
    }) || null
  );
}

function findTaskForThreadArtifact(selectedThread, artifact = {}) {
  const tasks = selectedThread?.tasks || [];
  const commandId = compact(artifact.commandId || artifact.command_id);
  const runId = compact(artifact.runId || artifact.run_id);
  const decisionId = compact(artifact.decisionId || artifact.decision_id);
  const checkpointId = compact(artifact.checkpointId || artifact.checkpoint_id);

  return (
    tasks.find((task) => {
      const commandIds = task.command_ids || task.commandIds || [];
      const runIds = task.run_ids || task.runIds || [];
      const decisionIds = task.decision_ids || task.decisionIds || [];
      const checkpointIds = task.checkpoint_ids || task.checkpointIds || [];
      return (
        (commandId && commandIds.includes(commandId)) ||
        (runId && runIds.includes(runId)) ||
        (decisionId && decisionIds.includes(decisionId)) ||
        (checkpointId && checkpointIds.includes(checkpointId))
      );
    }) || null
  );
}

function summarizeTaskIdentity(task) {
  if (!task) {
    return '';
  }

  const taskId = task.brief_id || task.briefId || task.task_id || task.taskId || task.title || '未命名任务';
  const title = compact(task.title);
  return title && title !== taskId ? `${taskId} · ${title}` : taskId;
}

function taskAnchorId(task) {
  const raw = compact(task?.brief_id || task?.briefId || task?.task_id || task?.taskId || task?.thread_key || task?.threadKey || task?.title);
  if (!raw) {
    return '';
  }

  const sanitized = raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized ? `thread-task-${sanitized}` : '';
}

function commentAnchorId(comment) {
  const raw = compact(comment?.commandId || comment?.sourceUrl || comment?.title);
  if (!raw) {
    return '';
  }

  const sanitized = raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized ? `comment-thread-${sanitized}` : '';
}

function enrichThreadEventWithChecklist(event, task) {
  if (!event || !task) {
    return event;
  }

  const relatedTaskLabel = summarizeTaskIdentity(task);
  const relatedTaskHref = taskAnchorId(task) ? `#${taskAnchorId(task)}` : '';
  return {
    ...event,
    checklistFocusLabel: readChecklistFocusLabel(task),
    checklistFocusNote: readChecklistFocusNote(task) || (relatedTaskLabel ? `关联子任务：${relatedTaskLabel}` : ''),
    checklistStepLabel: readChecklistStepLabel(task),
    checklistStepTitle: readChecklistStepTitle(task),
    checklistProgressLabel: readChecklistProgressLabel(task),
    checklistProgressSummary: readChecklistProgressSummary(task),
    relatedTaskLabel,
    relatedTaskHref,
  };
}

function enrichThreadTasksWithCommentSummary(tasks = [], commentThreads = []) {
  const { primaryTask } = selectPrimaryThreadTask(tasks);
  const primaryTaskId = compact(primaryTask?.brief_id || primaryTask?.briefId || primaryTask?.task_id || primaryTask?.taskId);
  const latestThreadComment = commentThreads[0] || null;

  return tasks.map((task) => {
    const taskId = compact(task?.brief_id || task?.briefId || task?.task_id || task?.taskId);
    const isPrimaryTask = Boolean(taskId && primaryTaskId && taskId === primaryTaskId);
    const directComment =
      taskId
        ? commentThreads.find((comment) => comment.directTaskBinding && compact(comment.relatedTaskId) === taskId) || null
        : null;
    const inferredComment =
      !directComment && taskId
        ? commentThreads.find((comment) => !comment.directTaskBinding && compact(comment.relatedTaskId) === taskId) ||
          (isPrimaryTask ? latestThreadComment : null)
        : null;
    const matchedComment = directComment || inferredComment || null;

    if (!matchedComment) {
      return {
        ...task,
        latest_comment_title: '',
        latestCommentTitle: '',
        latest_comment_summary: '',
        latestCommentSummary: '',
        latest_comment_status: '',
        latestCommentStatus: '',
        latest_comment_relation: '',
        latestCommentRelation: '',
        latest_comment_next_action: '',
        latestCommentNextAction: '',
        latest_comment_href: '',
        latestCommentHref: '',
        latest_comment_source_url: '',
        latestCommentSourceUrl: '',
      };
    }

    const commentStatus = [
      matchedComment.latestCollaborationKindLabel,
      matchedComment.latestCollaborationTaskStateLabel || matchedComment.taskStateLabel,
      matchedComment.latestCollaborationCommandStatusLabel || matchedComment.commandStatusLabel,
    ]
      .filter(Boolean)
      .join(' · ');
    const commentRelation = directComment ? '直接挂载到该子任务' : '基于当前聚焦推断';
    const href = commentAnchorId(matchedComment) ? `#${commentAnchorId(matchedComment)}` : '';
    const commentSummary =
      matchedComment.latestCollaborationSummary ||
      matchedComment.summary ||
      matchedComment.title ||
      '';

    return {
      ...task,
      latest_comment_title: matchedComment.title || '',
      latestCommentTitle: matchedComment.title || '',
      latest_comment_summary: commentSummary,
      latestCommentSummary: commentSummary,
      latest_comment_status: commentStatus || matchedComment.executionPolicyLabel || '',
      latestCommentStatus: commentStatus || matchedComment.executionPolicyLabel || '',
      latest_comment_relation: commentRelation,
      latestCommentRelation: commentRelation,
      latest_comment_next_action: matchedComment.nextAction || '',
      latestCommentNextAction: matchedComment.nextAction || '',
      latest_comment_href: href,
      latestCommentHref: href,
      latest_comment_source_url: matchedComment.sourceUrl || '',
      latestCommentSourceUrl: matchedComment.sourceUrl || '',
    };
  });
}

function buildWorkflowNodeGuidance({
  present = false,
  focusTask = null,
  focusCommentCommand = null,
  latestRun = null,
  latestReceipt = null,
  latestCheckpoint = null,
  latestDerivedCommand = null,
  intent = {},
} = {}) {
  const checklistAcceptance = readChecklistAcceptance(focusTask);
  const checklistCheckpointRule =
    readChecklistCheckpointRule(focusTask) || '每完成一段都要经过：实现 -> 测试 -> live probe -> 更新 checkpoint 文档。';
  const checklistFocusTitle = readChecklistFocusTitle(focusTask);
  const checklistFocusSummary = readChecklistFocusSummary(focusTask);
  const nodeAnchorLabel = [readChecklistStepLabel(focusTask), readChecklistStepTitle(focusTask)].filter(Boolean).join(' · ');
  const fallbackEvidence = [checklistFocusTitle, checklistFocusSummary].filter(Boolean).join(' · ');
  const policy = compact(intent.comment_execution_policy).toLowerCase();
  const commandStatus = compact(focusCommentCommand?.status).toLowerCase();
  const receiptStatus = compact(latestReceipt?.status).toLowerCase();

  const composeAcceptance = (specificRule) =>
    [
      compact(specificRule),
      checklistAcceptance ? `对应闭环验收：${checklistAcceptance}` : '',
    ]
      .filter(Boolean)
      .join(' ');

  const composeCheckpointRule = (specificRule) =>
    [
      compact(specificRule),
      checklistCheckpointRule ? `总规则：${checklistCheckpointRule}` : '',
    ]
      .filter(Boolean)
      .join(' ');

  if (!present) {
    return {
      nodeLabel: '等待评论接入',
      nodeSummary: focusTask
        ? '当前线程还没形成 comment -> command -> run 的可视流转，先把真实执行链挂到这个子任务上。'
        : '当前线程还没有评论驱动链路，先等待新的评论或命令进入。',
      nodeAcceptance: composeAcceptance(
        focusTask
          ? '先让当前活跃子任务产出第一条 comment / command / run 或 checkpoint 证据。'
          : '先生成第一条评论或执行命令，建立线程级流转链路。',
      ),
      nodeCheckpointRule: composeCheckpointRule('链路刚建立时也要留下第一条 checkpoint，避免线程再次回到无上下文状态。'),
      nodeEvidence: fallbackEvidence,
      nodeAnchorLabel,
    };
  }

  let nodeLabel = '';
  let nodeSummary = '';
  let nodeAcceptance = '';
  let nodeCheckpointRule = '';
  let nodeEvidence = '';

  if (latestCheckpoint) {
    nodeLabel = `Checkpoint · ${compact(latestCheckpoint.status) || '已记录'}`;
    nodeSummary = '当前流转已经进入 checkpoint 节点，说明评论派发的执行结果至少留下了一条可追踪结论。';
    nodeAcceptance = composeAcceptance(
      latestCheckpoint.nextStep
        ? `先完成 checkpoint 指向的下一跳：${latestCheckpoint.nextStep}`
        : '补齐 checkpoint 结果、测试和 live probe 证据后，再判断这条流转是否真正收口。',
    );
    nodeCheckpointRule = composeCheckpointRule('checkpoint 至少要写清当前结果、下一跳和证据出处，不把结论只留在 run 或评论里。');
    nodeEvidence = summarizeCheckpointDetail(latestCheckpoint) || compact(latestCheckpoint.title);
  } else if (receiptStatus === 'failed') {
    nodeLabel = `回执 · ${humanReceiptStatus(latestReceipt.status)}`;
    nodeSummary = '当前流转停在失败回执，重点是先解释 why，再决定 retry / improve / stop。';
    nodeAcceptance = composeAcceptance('先解释失败原因，并明确给出重试、修改或停止中的一个动作。');
    nodeCheckpointRule = composeCheckpointRule('失败也要留下 checkpoint，说明 why、影响范围和下一步，避免线程静默卡死。');
    nodeEvidence = summarizeReceiptDetail(latestReceipt) || compact(latestReceipt.summary);
  } else if (latestRun) {
    nodeLabel = `Run · ${humanRunStatus(latestRun.status)}`;
    nodeSummary = '当前节点停在 run，说明 agent 已经接手，但还需要新的回执或 checkpoint 证明它没有静默停住。';
    nodeAcceptance = composeAcceptance('至少产出一条新的回执或 checkpoint，并说明是继续执行、要求修改还是停止。');
    nodeCheckpointRule = composeCheckpointRule('run 跨过关键节点就写 checkpoint，不等整条线程全部结束。');
    nodeEvidence = compact(latestRun.summary || latestRun.title);
  } else if (latestDerivedCommand) {
    nodeLabel = `派生命令 · ${humanCommandStatus(latestDerivedCommand.status)}`;
    nodeSummary = '当前评论已经继续派生出后续动作，下一步重点是确认新命令有没有真正被接住。';
    nodeAcceptance = composeAcceptance('让派生命令被 claim，并留下新的 run、回执或 checkpoint 证据。');
    nodeCheckpointRule = composeCheckpointRule('派生命令一旦跨出线程边界，就要补一条 checkpoint 说明为什么继续派生。');
    nodeEvidence = compact(latestDerivedCommand.instruction || latestDerivedCommand.resultSummary || latestDerivedCommand.commandId);
  } else if (policy === 'inbox_only') {
    nodeLabel = 'Triage · 仅入收件箱';
    nodeSummary = '当前评论只进入 triage，还没有直接下发成执行命令。';
    nodeAcceptance = composeAcceptance('先完成 triage / 快速拍板，再决定是否要继续派发成 command。');
    nodeCheckpointRule = composeCheckpointRule('没有明确执行动作前，不把它算作已推进闭环；至少留下 triage 判断。');
    nodeEvidence = compact(focusCommentCommand?.contextQuote || focusCommentCommand?.instruction);
  } else if (policy === 'reject') {
    nodeLabel = '安全拦截';
    nodeSummary = '当前评论已被安全规则拦截，后续只能走人工复核或补证据链路。';
    nodeAcceptance = composeAcceptance('确认拦截理由成立，并留下可追溯说明，避免后续重复触发同类请求。');
    nodeCheckpointRule = composeCheckpointRule('被规则拦截也要补一条 checkpoint，写清 why 和是否允许人工 override。');
    nodeEvidence = compact(focusCommentCommand?.contextQuote || focusCommentCommand?.instruction);
  } else {
    nodeLabel = `命令 · ${humanCommandStatus(focusCommentCommand?.status) || '未记录'}`;
    nodeSummary =
      commandStatus === 'done'
        ? '当前评论已经转成命令并执行完成，下一步要确认结果有没有沉淀回 checkpoint、文档或回复。'
        : commandStatus === 'claimed' || commandStatus === 'executing'
          ? '命令已被 agent 接手，现场下一步要看 run / checkpoint 是否继续出现。'
          : '评论已经变成命令，但 agent 还没留下第一条执行证据。';
    nodeAcceptance = composeAcceptance(
      commandStatus === 'done'
        ? '确认 done 状态已经沉淀成 checkpoint、文档回写或评论回复，避免只改状态不留证据。'
        : '先让命令被 claim，并产出第一条 run、回执或 checkpoint 证据。',
    );
    nodeCheckpointRule = composeCheckpointRule('命令刚派发出去时就要盯住首条执行证据，避免线程停在“已下发”却无人跟进。');
    nodeEvidence = compact(focusCommentCommand?.instruction || focusCommentCommand?.resultSummary || focusCommentCommand?.contextQuote);
  }

  return {
    nodeLabel,
    nodeSummary,
    nodeAcceptance,
    nodeCheckpointRule,
    nodeEvidence: nodeEvidence || fallbackEvidence,
    nodeAnchorLabel,
  };
}

function buildDecisionNodeGuidance(decision, workflow = null, focusTask = null) {
  const checklistAcceptance =
    readChecklistAcceptance(focusTask) || compact(workflow?.focusChecklistAcceptance);
  const checklistCheckpointRule =
    readChecklistCheckpointRule(focusTask) ||
    compact(workflow?.focusChecklistCheckpointRule) ||
    '每完成一段都要经过：实现 -> 测试 -> live probe -> 更新 checkpoint 文档。';
  const checklistFocusLabel =
    readChecklistFocusLabel(focusTask) || compact(workflow?.focusChecklistLabel);
  const checklistFocusNote =
    readChecklistFocusNote(focusTask) || compact(workflow?.focusChecklistNote);
  const checklistStepLabel =
    readChecklistStepLabel(focusTask) || compact(workflow?.focusChecklistStepLabel);
  const checklistStepTitle =
    readChecklistStepTitle(focusTask) || compact(workflow?.focusChecklistStepTitle);
  const checklistProgressLabel =
    readChecklistProgressLabel(focusTask) || compact(workflow?.focusChecklistProgressLabel);
  const checklistProgressSummary =
    readChecklistProgressSummary(focusTask) || compact(workflow?.focusChecklistProgressSummary);
  const checklistFocusTitle =
    readChecklistFocusTitle(focusTask) || compact(workflow?.focusChecklistFocusTitle);
  const checklistFocusSummary =
    readChecklistFocusSummary(focusTask) || compact(workflow?.focusChecklistFocusSummary);
  const nodeAnchorLabel = [checklistStepLabel, checklistStepTitle].filter(Boolean).join(' · ');
  const evidenceSummary = summarizeEvidenceRefs(decision?.evidenceRefs);
  const fallbackEvidence = [
    evidenceSummary,
    compact(decision?.recommendation || decision?.requestedHumanAction || decision?.context),
    checklistFocusTitle,
    checklistFocusSummary,
  ]
    .filter(Boolean)
    .join(' · ');
  const signal = compact(decision?.signalLevel).toLowerCase();
  const status = compact(decision?.status).toLowerCase();

  const composeAcceptance = (specificRule) =>
    [
      compact(specificRule),
      checklistAcceptance ? `对应闭环验收：${checklistAcceptance}` : '',
    ]
      .filter(Boolean)
      .join(' ');

  const composeCheckpointRule = (specificRule) =>
    [
      compact(specificRule),
      checklistCheckpointRule ? `总规则：${checklistCheckpointRule}` : '',
    ]
      .filter(Boolean)
      .join(' ');

  let nodeLabel = `拍板 · ${humanSignalLevel(decision?.signalLevel)} / ${humanDecisionStatus(decision?.status)}`;
  let nodeSummary = '当前线程停在待拍板节点，先把决定写实，再让 agent 继续推进。';
  let nodeAcceptance = composeAcceptance('明确给出允许继续、要求修改、重跑或停止中的一个结论，并说明 why。');
  let nodeCheckpointRule = composeCheckpointRule('拍板完成后要补一条 checkpoint 或线程回复，把结论、影响范围和下一步写回线程。');

  if (['approved', 'resolved'].includes(status)) {
    nodeLabel = `拍板 · ${humanDecisionStatus(decision?.status)}`;
    nodeSummary = '这条决策已经拍板完成，下一步重点是把结论沉淀回执行链和审计链。';
    nodeAcceptance = composeAcceptance('确认拍板结论已经回写到 checkpoint、评论回复或执行任务，不只停留在状态变更。');
    nodeCheckpointRule = composeCheckpointRule('拍板完成后也要留下 checkpoint，说明决定、责任人和下一跳。');
  } else if (signal === 'red') {
    nodeSummary = '当前线程停在红灯拍板节点，不先拍板就不应该越过这个决策继续执行。';
    nodeAcceptance = composeAcceptance('先给出允许继续、要求修改、重跑或停止中的一个明确结论。');
    nodeCheckpointRule = composeCheckpointRule('红灯拍板后要立刻补 checkpoint 或线程回复，避免 agent 继续停在等待人类判断。');
  } else if (signal === 'yellow') {
    nodeSummary = '当前线程停在黄灯校准节点，系统可以绕行，但最好先把方向和风险边界讲清楚。';
    nodeAcceptance = composeAcceptance('确认是否继续当前方案、先补证据，还是升级成红灯再拍板。');
    nodeCheckpointRule = composeCheckpointRule('黄灯处理完也要补一条 checkpoint 或线程回复，说明为什么继续绕行或为什么升级。');
  } else if (status === 'changes_requested') {
    nodeSummary = '当前决策已经进入待修改节点，重点是把修改要求变成新的可执行动作。';
    nodeAcceptance = composeAcceptance('明确要改什么、改完后由谁复核，以及是否要重新回到拍板节点。');
    nodeCheckpointRule = composeCheckpointRule('修改要求不能只留在决策卡里，至少要补一条 checkpoint 或派生命令。');
  } else if (status === 'retry_requested') {
    nodeSummary = '当前决策已经进入待重试节点，重点是确认重试条件和风险没有被遗漏。';
    nodeAcceptance = composeAcceptance('写清重试前提、成功标准和失败后的兜底动作。');
    nodeCheckpointRule = composeCheckpointRule('重试前后都要补 checkpoint，避免线程只看到“又跑了一次”却不知道为什么。');
  } else if (status === 'stopped') {
    nodeSummary = '当前决策已经明确停止，重点是确认停下来的原因和后续归档方式。';
    nodeAcceptance = composeAcceptance('写清停止原因、影响范围，以及这条线程后面是否还需要人工回看。');
    nodeCheckpointRule = composeCheckpointRule('停止也要补一条 checkpoint，把 why 和归档口径写清楚。');
  }

  return {
    checklistFocusLabel,
    checklistFocusNote,
    checklistStepLabel,
    checklistStepTitle,
    checklistProgressLabel,
    checklistProgressSummary,
    nodeLabel,
    nodeSummary,
    nodeAcceptance,
    nodeCheckpointRule,
    nodeEvidence: fallbackEvidence,
    nodeAnchorLabel,
  };
}

function buildThreadWorkflow(selectedThread, commands, runs, receipts, checkpoints) {
  const commentTrees = buildCommentCommandTrees(commands);
  const latestCommentTree = commentTrees[0] || null;
  const latestCommentCommand = latestCommentTree?.rootCommand || null;
  const { primaryTask, activeTasks } = selectPrimaryThreadTask(selectedThread?.tasks || []);
  const focusTaskFallback = primaryTask || null;
  const latestThreadCheckpoint =
    [...checkpoints].sort((left, right) => toEpochMs(right.updatedAt || right.createdAt) - toEpochMs(left.updatedAt || left.createdAt))[0] ||
    null;

  if (!latestCommentCommand) {
    const idleNodeGuidance = buildWorkflowNodeGuidance({
      present: false,
      focusTask: focusTaskFallback,
    });

    return {
      present: false,
      title: primaryTask ? '当前活跃子任务还没有评论驱动链路。' : '当前线程暂无评论驱动的任务流转。',
      summary: primaryTask
        ? `当前主执行链是 ${formatThreadTaskLabel(primaryTask)}，但还没有形成可展示的 comment -> command -> run -> receipt 路径。`
        : '还没有可展示的 comment -> command -> run -> receipt 路径。',
      steps: [],
      nextAction: '等待新的评论或命令进入这个线程。',
      focusTaskLabel: formatThreadTaskLabel(primaryTask, Math.max(0, activeTasks.length - 1)),
      focusScopeLabel: primaryTask ? '当前线程还在执行，但评论链路尚未挂上这个子任务。' : '',
      parallelSummary: activeTasks.length > 1 ? `当前线程还有 ${activeTasks.length - 1} 个并行子任务。` : '',
      focusChecklistLabel: readChecklistFocusLabel(focusTaskFallback),
      focusChecklistNote: readChecklistFocusNote(focusTaskFallback),
      focusChecklistStepLabel: readChecklistStepLabel(focusTaskFallback),
      focusChecklistStepTitle: readChecklistStepTitle(focusTaskFallback),
      focusChecklistProgressLabel: readChecklistProgressLabel(focusTaskFallback),
      focusChecklistProgressSummary: readChecklistProgressSummary(focusTaskFallback),
      focusChecklistAcceptance: readChecklistAcceptance(focusTaskFallback),
      focusChecklistCheckpointRule: readChecklistCheckpointRule(focusTaskFallback),
      focusChecklistFocusTitle: readChecklistFocusTitle(focusTaskFallback),
      focusChecklistFocusSummary: readChecklistFocusSummary(focusTaskFallback),
      nodeLabel: idleNodeGuidance.nodeLabel,
      nodeSummary: idleNodeGuidance.nodeSummary,
      nodeAcceptance: idleNodeGuidance.nodeAcceptance,
      nodeCheckpointRule: idleNodeGuidance.nodeCheckpointRule,
      nodeEvidence: idleNodeGuidance.nodeEvidence,
      nodeAnchorLabel: idleNodeGuidance.nodeAnchorLabel,
      suggestedSourceRef: latestThreadCheckpoint?.commandId ? `command:${latestThreadCheckpoint.commandId}` : '',
      latestCheckpointLabel: latestThreadCheckpoint
        ? `${compact(latestThreadCheckpoint.status) || '已记录'} · ${formatIso(
            latestThreadCheckpoint.updatedAt || latestThreadCheckpoint.createdAt,
          )}`
        : '',
      latestCheckpointSummary: summarizeCheckpointDetail(latestThreadCheckpoint),
    };
  }

  const primaryTaskCommandIds = new Set(primaryTask?.command_ids || primaryTask?.commandIds || []);
  const primaryTaskCommentTrees = commentTrees.filter((tree) => [...tree.commandIds].some((commandId) => primaryTaskCommandIds.has(commandId)));
  const focusCommentTree = primaryTaskCommentTrees[0] || latestCommentTree;
  const focusCommentCommand = focusCommentTree?.rootCommand || latestCommentCommand;
  const focusOnPrimaryTask = Boolean(primaryTask && primaryTaskCommentTrees.length > 0);
  const focusTask = (focusOnPrimaryTask
    ? primaryTask
    : findTaskForCommentCommand(selectedThread, focusCommentCommand.commandId) || primaryTask) || null;
  const focusTaskLabel = formatThreadTaskLabel(primaryTask, Math.max(0, activeTasks.length - 1));
  const focusScopeLabel = focusOnPrimaryTask
    ? '当前流转已对齐到当前活跃子任务。'
    : primaryTask
      ? '当前活跃子任务还没有评论链路，以下先展示线程里最近一条评论任务。'
      : '以下展示线程里最近一条评论任务。';

  const intent = parseCommentIntentEventKey(focusCommentCommand.eventKey) || {};
  const relatedDerivedCommands = focusCommentTree?.descendants || collectCommandDescendants(commands, focusCommentCommand.commandId);
  const flowDetails = summarizeCommentFlowDetails(focusCommentCommand, relatedDerivedCommands);
  const relatedRuns = runs
    .filter((run) => run.commandId === focusCommentCommand.commandId)
    .sort((left, right) => toEpochMs(right.updatedAt || right.createdAt) - toEpochMs(left.updatedAt || left.createdAt));
  const relatedReceipts = receipts
    .filter((receipt) => receipt.commandId === focusCommentCommand.commandId)
    .sort((left, right) => toEpochMs(right.createdAt) - toEpochMs(left.createdAt));
  const relatedCheckpoints = checkpoints
    .filter((checkpoint) => checkpoint.commandId === focusCommentCommand.commandId || relatedRuns.some((run) => run.runId === checkpoint.runId))
    .sort((left, right) => toEpochMs(right.updatedAt || right.createdAt) - toEpochMs(left.updatedAt || left.createdAt));

  const latestRun = relatedRuns[0] || null;
  const latestReceipt = relatedReceipts[0] || null;
  const latestCheckpoint = relatedCheckpoints[0] || null;
  const latestDerivedCommand = flowDetails.latestExecutionDerivedCommand;

  let nextAction = '等待下一步动作。';
  if (latestCheckpoint?.nextStep) {
    nextAction = latestCheckpoint.nextStep;
  } else if (latestDerivedCommand) {
    nextAction = `已派生后续动作：${latestDerivedCommand.instruction || humanCommandStatus(latestDerivedCommand.status)}`;
  } else if (compact(intent.comment_execution_policy).toLowerCase() === 'inbox_only') {
    nextAction = '当前评论只进入 triage，还没有直接下发为执行任务。';
  } else if (compact(intent.comment_execution_policy).toLowerCase() === 'reject') {
    nextAction = '当前评论已被安全规则拦截，不会继续执行。';
  } else if (compact(focusCommentCommand.status).toLowerCase() === 'new') {
    nextAction = '命令已生成，等待被 agent claim。';
  } else if (compact(focusCommentCommand.status).toLowerCase() === 'claimed' || compact(focusCommentCommand.status).toLowerCase() === 'executing') {
    nextAction = 'Agent 已接手，正在推进当前评论派发出来的任务。';
  } else if (compact(latestReceipt?.status).toLowerCase() === 'failed') {
    nextAction = '最近一次回执失败，建议回看命令与执行结果。';
  } else if (compact(focusCommentCommand.status).toLowerCase() === 'done') {
    nextAction = '当前评论任务已执行完，等待新的评论或后续派发。';
  }

  const nodeGuidance = buildWorkflowNodeGuidance({
    present: true,
    focusTask,
    focusCommentCommand,
    latestRun,
    latestReceipt,
    latestCheckpoint,
    latestDerivedCommand,
    intent,
  });

  return {
    present: true,
    commandId: focusCommentCommand.commandId,
    ownerAgent: focusCommentCommand.ownerAgent || null,
    sourceUrl: focusCommentCommand.sourceUrl || null,
    suggestedSourceRef: focusCommentCommand.commandId ? `command:${focusCommentCommand.commandId}` : '',
    title: summarize(focusCommentCommand.instruction || '最新评论流转', 88),
    summary: summarize(
      focusCommentCommand.contextQuote || focusCommentCommand.resultSummary || '当前线程最近一条评论已进入 Cortex 工作流。',
      180,
    ),
    nextAction,
    focusTaskLabel,
    focusScopeLabel,
    focusChecklistLabel: readChecklistFocusLabel(focusTask),
    focusChecklistNote: readChecklistFocusNote(focusTask),
    focusChecklistStepLabel: readChecklistStepLabel(focusTask),
    focusChecklistStepTitle: readChecklistStepTitle(focusTask),
    focusChecklistProgressLabel: readChecklistProgressLabel(focusTask),
    focusChecklistProgressSummary: readChecklistProgressSummary(focusTask),
    focusChecklistAcceptance: readChecklistAcceptance(focusTask),
    focusChecklistCheckpointRule: readChecklistCheckpointRule(focusTask),
    focusChecklistFocusTitle: readChecklistFocusTitle(focusTask),
    focusChecklistFocusSummary: readChecklistFocusSummary(focusTask),
    nodeLabel: nodeGuidance.nodeLabel,
    nodeSummary: nodeGuidance.nodeSummary,
    nodeAcceptance: nodeGuidance.nodeAcceptance,
    nodeCheckpointRule: nodeGuidance.nodeCheckpointRule,
    nodeEvidence: nodeGuidance.nodeEvidence,
    nodeAnchorLabel: nodeGuidance.nodeAnchorLabel,
    parallelSummary: activeTasks.length > 1 ? `当前线程还有 ${activeTasks.length - 1} 个并行子任务。` : '',
    counts: {
      commands: flowDetails.executionCommandCount,
      collaborationSummary: flowDetails.collaborationSummary,
      collaborationCount: flowDetails.collaborationCount,
      runs: relatedRuns.length,
      receipts: relatedReceipts.length,
      checkpoints: relatedCheckpoints.length,
    },
    latestReceiptLabel: latestReceipt ? `${humanReceiptStatus(latestReceipt.status)} · ${formatIso(latestReceipt.createdAt)}` : '',
    latestReceiptSummary: summarizeReceiptDetail(latestReceipt),
    latestCheckpointLabel: latestCheckpoint
      ? `${compact(latestCheckpoint.status) || '已记录'} · ${formatIso(latestCheckpoint.updatedAt || latestCheckpoint.createdAt)}`
      : '',
    latestCheckpointSummary: summarizeCheckpointDetail(latestCheckpoint),
    steps: [
      focusTaskLabel ? `聚焦子任务：${focusTaskLabel}` : null,
      focusScopeLabel ? `流转视角：${focusScopeLabel}` : null,
      `评论意图：${humanCommentIntent(intent.comment_intent)}`,
      `执行策略：${humanCommentExecutionPolicy(intent.comment_execution_policy)}`,
      `任务状态：${humanCommentTaskState(intent.comment_task_state)}`,
      `命令状态：${humanCommandStatus(focusCommentCommand.status)}`,
      focusCommentCommand.ownerAgent ? `当前负责人：${focusCommentCommand.ownerAgent}` : null,
      latestDerivedCommand ? `后续动作：${humanCommandStatus(latestDerivedCommand.status)} · ${summarize(latestDerivedCommand.instruction || latestDerivedCommand.resultSummary || latestDerivedCommand.commandId, 48)}` : null,
      latestRun ? `运行状态：${humanRunStatus(latestRun.status)}` : null,
      latestReceipt ? `最近回执：${humanReceiptStatus(latestReceipt.status)}` : null,
      latestCheckpoint ? `最近 checkpoint：${compact(latestCheckpoint.status) || '已记录'}` : null,
    ].filter(Boolean),
  };
}

function buildExecutionSnapshot(selectedThread, records, nowIso) {
  const tasks = selectedThread?.tasks || [];
  const openDecisions = records.openDecisions || [];
  const commands = records.commands || [];
  const runs = records.runs || [];
  const checkpoints = records.checkpoints || [];
  const events = records.events || [];
  const workflow = records.workflow || null;

  const hasWaitingHuman = tasks.some((task) => compact(task.execution_status).toLowerCase() === 'waiting_human');
  const hasStalled = tasks.some((task) => compact(task.execution_status).toLowerCase() === 'stalled');
  const hasInProgress = tasks.some((task) => compact(task.execution_status).toLowerCase() === 'in_progress');
  const allCompleted = tasks.length > 0 && tasks.every((task) => compact(task.execution_status).toLowerCase() === 'completed');

  const executionStatus = hasWaitingHuman ? 'waiting_human' : hasStalled ? 'stalled' : allCompleted ? 'completed' : hasInProgress ? 'in_progress' : 'in_progress';
  const signalLevel =
    tasks.some((task) => compact(task.decision_signal).toLowerCase() === 'red') || openDecisions.some((decision) => compact(decision.signalLevel).toLowerCase() === 'red')
      ? 'red'
      : tasks.some((task) => compact(task.decision_signal).toLowerCase() === 'yellow') || openDecisions.some((decision) => compact(decision.signalLevel).toLowerCase() === 'yellow')
        ? 'yellow'
        : 'green';

  const latestRun = latestByTimestamp(runs);
  const latestCheckpoint = latestByTimestamp(checkpoints);
  const latestCommand = latestByTimestamp(commands);
  const latestEvent = latestByTimestamp(events);
  const { sortedTasks, activeTasks, primaryTask } = selectPrimaryThreadTask(tasks);
  const nowMs = toEpochMs(nowIso);
  const latestEventMs = toEpochMs(latestEvent?.timestamp);
  const primaryDecision = openDecisions[0] || null;
  const primaryTaskBlockerReason = primaryTask?.blocker_reason || primaryTask?.blockerReason || '';
  const primaryTaskRecommendedAction = primaryTask?.recommended_action || primaryTask?.recommendedAction || '';
  const ownerSummary = summarizeOwners([
    ...tasks.map((task) => task.owner_agent || task.ownerAgent),
    latestRun?.agentName,
    latestCommand?.ownerAgent,
    primaryDecision?.ownerAgent,
  ]);

  let currentNode = '尚未形成可见执行节点';
  if (primaryDecision) {
    currentNode = `决策 · ${humanSignalLevel(primaryDecision.signalLevel)} / ${humanDecisionStatus(primaryDecision.status)}`;
  } else if (latestRun) {
    currentNode = `Run · ${humanRunStatus(latestRun.status)}${latestRun.phase ? ` / ${humanizeToken(latestRun.phase)}` : ''}`;
  } else if (latestCheckpoint) {
    currentNode = `Checkpoint · ${compact(latestCheckpoint.status) || '已记录'}${latestCheckpoint.stage ? ` / ${humanizeToken(latestCheckpoint.stage)}` : ''}`;
  } else if (latestCommand) {
    currentNode = `命令 · ${humanCommandStatus(latestCommand.status)}${latestCommand.parsedAction ? ` / ${humanizeToken(latestCommand.parsedAction)}` : ''}`;
  }

  const focusSummary =
    executionStatus === 'waiting_human'
      ? primaryDecision?.requestedHumanAction || primaryDecision?.question || workflow?.nextAction || '当前线程等待你拍板后才能继续。'
      : executionStatus === 'stalled'
        ? primaryTaskRecommendedAction || workflow?.nextAction || latestCheckpoint?.nextStep || '当前线程存在黄灯事项，系统已先绕行。'
        : executionStatus === 'completed'
          ? latestCheckpoint?.nextStep || '当前线程主路径已收口，可以进入回看或继续派生新任务。'
          : workflow?.nextAction || latestRun?.summary || latestCommand?.instruction || '当前线程正在继续推进。';

  let activityLabel = '未记录活动';
  if (executionStatus === 'waiting_human') {
    activityLabel = `等待拍板 · ${formatRelativeAge(latestEventMs, nowMs)}`;
  } else if (executionStatus === 'completed') {
    activityLabel = `已收口 · ${formatRelativeAge(latestEventMs, nowMs)}`;
  } else if (executionStatus === 'stalled') {
    activityLabel = `黄灯绕行中 · ${formatRelativeAge(latestEventMs, nowMs)}`;
  } else if (latestEventMs && nowMs && nowMs - latestEventMs <= 5 * 60 * 1000) {
    activityLabel = `刚刚更新 · ${formatRelativeAge(latestEventMs, nowMs)}`;
  } else if (latestEventMs && nowMs && nowMs - latestEventMs <= 30 * 60 * 1000) {
    activityLabel = `近期活跃 · ${formatRelativeAge(latestEventMs, nowMs)}`;
  } else if (latestEventMs) {
    activityLabel = `可能停滞 · ${formatRelativeAge(latestEventMs, nowMs)}`;
  }

  const taskFocus = formatThreadTaskLabel(primaryTask, Math.max(0, activeTasks.length - 1));
  const taskBreakdown =
    sortedTasks.length > 0
      ? `${sortedTasks
          .slice(0, 3)
          .map((task) => {
            const taskId = task.brief_id || task.briefId || task.task_id || task.taskId || task.title || '未命名任务';
            return `${taskId} · ${humanTaskExecutionStatus(task.execution_status)} · ${task.current_node || task.currentNode || '未记录节点'}`;
          })
          .join('；')}${sortedTasks.length > 3 ? `；等 ${sortedTasks.length} 个任务` : ''}`
      : '';
  const blockerReason =
    executionStatus === 'waiting_human'
      ? primaryDecision?.question || primaryDecision?.context || primaryTaskBlockerReason || ''
      : executionStatus === 'stalled'
        ? primaryTaskBlockerReason || workflow?.summary || latestCheckpoint?.summary || latestRun?.summary || latestCommand?.instruction || ''
        : '';
  const recommendedAction =
    executionStatus === 'waiting_human'
      ? primaryDecision?.requestedHumanAction || primaryDecision?.recommendation || workflow?.nextAction || ''
      : executionStatus === 'stalled'
        ? primaryTaskRecommendedAction || workflow?.nextAction || latestCheckpoint?.nextStep || ''
        : '';
  const evidenceSummary = summarizeEvidenceRefs(primaryDecision?.evidenceRefs);

  return {
    signalLevel,
    executionStatus,
    tone: toneFromState(signalLevel, executionStatus),
    statusLabel: humanThreadExecutionStatus(executionStatus),
    ownerSummary,
    currentNode,
    focusSummary,
    activityLabel,
    lastMovement: latestEvent ? `${latestEvent.badge} · ${formatIso(latestEvent.timestamp)}` : '未记录',
    taskSummary: `${tasks.length} 个任务 / ${tasks.filter((task) => compact(task.execution_status).toLowerCase() === 'in_progress').length} 个处理中 / ${tasks.filter((task) => compact(task.execution_status).toLowerCase() === 'completed').length} 个已完成`,
    taskFocus,
    taskBreakdown,
    signalSummary: `红 ${tasks.filter((task) => compact(task.decision_signal).toLowerCase() === 'red').length} / 黄 ${tasks.filter((task) => compact(task.decision_signal).toLowerCase() === 'yellow').length} / 绿 ${tasks.filter((task) => compact(task.decision_signal).toLowerCase() === 'green').length}`,
    blockerReason,
    recommendedAction,
    whyNow: primaryDecision?.whyNow || '',
    impactScope: primaryDecision?.impactScope || '',
    evidenceSummary,
  };
}

function buildEmptyExecutionSnapshot() {
  return {
    signalLevel: 'green',
    executionStatus: 'in_progress',
    tone: 'green',
    statusLabel: '等待线程进入',
    ownerSummary: '未分配',
    currentNode: '当前还没有可见线程',
    focusSummary: '当前文档下还没有进入工作台的线程，等第一条任务或评论进入后，这里会开始显示执行现场。',
    activityLabel: '未开始',
    lastMovement: '未记录',
    taskSummary: '0 个任务 / 0 个处理中 / 0 个已完成',
    taskFocus: '',
    taskBreakdown: '',
    signalSummary: '红 0 / 黄 0 / 绿 0',
    blockerReason: '',
    recommendedAction: '',
    whyNow: '',
    impactScope: '',
    evidenceSummary: '',
  };
}

function deriveThreadSourceRecoveryContext(engine, projectId, threadDetail) {
  const { primaryTask } = selectPrimaryThreadTask(threadDetail?.tasks || []);
  const briefId = compact(primaryTask?.brief_id || primaryTask?.briefId);
  if (!briefId) {
    return {
      briefId: '',
      suggestedSourceRef: '',
      suggestedSourceUrl: '',
      suggestions: [],
      suggestionHint: '',
      latestCheckpointLabel: '',
      latestCheckpointSummary: '',
    };
  }

  const brief = engine.store.getTaskBrief(briefId);
  const briefCheckpoints = (engine.listCheckpoints({ projectId, limit: 256 }).checkpoints || [])
    .filter((checkpoint) => compact(checkpoint.briefId) === briefId)
    .sort((left, right) => toEpochMs(right.updatedAt || right.createdAt) - toEpochMs(left.updatedAt || left.createdAt));
  const latestCheckpoint = briefCheckpoints[0] || null;
  const latestCheckpointWithCommand = briefCheckpoints.find((checkpoint) => compact(checkpoint.commandId)) || null;
  const checkpointCommand = latestCheckpointWithCommand?.commandId
    ? engine.store.getCommand(latestCheckpointWithCommand.commandId)
    : null;

  const directSourceRef = compact(brief?.sourceRef);
  const directSourceUrl = compact(brief?.sourceUrl);
  const commentSourceUrl = compact(threadDetail?.workflow?.sourceUrl || primaryTask?.latest_comment_source_url || primaryTask?.latestCommentSourceUrl);
  const checkpointSourceUrl = compact(checkpointCommand?.sourceUrl);

  const suggestedSourceRef = directSourceRef || (latestCheckpointWithCommand?.commandId ? `command:${latestCheckpointWithCommand.commandId}` : '');
  const suggestedSourceUrl = directSourceUrl || checkpointSourceUrl || commentSourceUrl;
  const suggestions = [];

  if (suggestedSourceUrl) {
    suggestions.push({
      label: '建议 source_url',
      value: suggestedSourceUrl,
      reason: directSourceUrl
        ? '来自当前 brief 已记录来源'
        : checkpointSourceUrl
          ? '来自最近一条可追溯 checkpoint 的上游命令'
          : '来自关联子任务最近评论',
    });
  }

  if (suggestedSourceRef) {
    suggestions.push({
      label: '建议 source_ref',
      value: suggestedSourceRef,
      reason: directSourceRef
        ? '来自当前 brief 已记录来源'
        : '来自当前 brief 最近一条带 command_id 的 checkpoint',
    });
  }

  return {
    briefId,
    suggestedSourceRef,
    suggestedSourceUrl,
    suggestions,
    suggestionHint:
      suggestions.length > 0
        ? '已优先回收当前 primary brief 自己还能确认的来源锚点，避免被线程里后续治理事件误导。'
        : '',
    latestCheckpointLabel: latestCheckpoint
      ? `${compact(latestCheckpoint.status) || '已记录'} · ${formatIso(latestCheckpoint.updatedAt || latestCheckpoint.createdAt)}`
      : '',
    latestCheckpointSummary: summarizeCheckpointDetail(latestCheckpoint),
  };
}

function buildThreadSourceRecovery(governanceItem, threadDetail, projectId, workspaceContext = {}, recoveryContext = {}) {
  const residualPattern = compact(
    governanceItem?.residualPattern || governanceItem?.residual_pattern,
  ).toLowerCase();
  if (residualPattern !== 'checkpoint_backed_brief') {
    return null;
  }

  const { primaryTask } = selectPrimaryThreadTask(threadDetail?.tasks || []);
  const briefId = compact(recoveryContext.briefId || primaryTask?.brief_id || primaryTask?.briefId);

  return {
    title: '来源修补提示',
    summary: '这条线程已经有 checkpoint 证据，但还没有回收到更稳定的来源线程。现在先补来源，再决定是否归档。',
    residualPatternLabel:
      governanceItem?.residualPatternLabel || governanceItem?.residual_pattern_label || 'Checkpoint 驱动 Brief',
    evidenceStatusLabel:
      governanceItem?.evidenceStatusLabel || governanceItem?.evidence_status_label || 'Checkpoint 引用缺口',
    evidenceDetail: governanceItem?.evidenceDetail || governanceItem?.evidence_detail || '',
    cleanupHint:
      governanceItem?.cleanupHint || '先补 source / discussion，再决定是否需要归档到历史层。',
    sourceLabel: governanceItem?.sourceLabel || governanceItem?.source_label || '未记录',
    briefId,
    suggestedSourceUrl: compact(recoveryContext.suggestedSourceUrl),
    suggestedSourceRef: compact(recoveryContext.suggestedSourceRef),
    suggestions: Array.isArray(recoveryContext.suggestions) ? recoveryContext.suggestions : [],
    suggestionHint: recoveryContext.suggestionHint || '',
    latestCheckpointLabel:
      recoveryContext.latestCheckpointLabel ||
      threadDetail?.workflow?.latestCheckpointLabel ||
      threadDetail?.workflow?.latest_checkpoint_label ||
      '',
    latestCheckpointSummary:
      recoveryContext.latestCheckpointSummary ||
      threadDetail?.workflow?.latestCheckpointSummary ||
      threadDetail?.workflow?.latest_checkpoint_summary ||
      '',
    governanceHref: `/workspace${buildWorkspaceContextQuery(projectId, {
      ...workspaceContext,
      includeResidual: true,
      residualPattern: 'checkpoint_backed_brief',
    })}#thread-governance`,
    steps: [
      '先定位最后一次真实评论、会话，或上游命令入口。',
      '把 source_url / source_ref 补回这条子任务，或补到它的上游记录。',
      '如果确认找不到来源，再回治理面板决定是否归档。',
    ],
    submitHint: '至少补一个来源字段；如果已经知道上游命令，优先填写 command:CMD-... 这种 source_ref。',
  };
}

function findInboxItemForCommand(command, inboxItems) {
  return (
    inboxItems.find((item) => compact(item.payload?.command_id) === compact(command.commandId)) ||
    inboxItems.find((item) => compact(item.sourceRef) === `command:${command.commandId}`) ||
    null
  );
}

function buildThreadCommentCards(selectedThread, commands, inboxItems, runs, checkpoints, receipts, options = {}) {
  const limit = Object.prototype.hasOwnProperty.call(options, 'limit') ? options.limit : 6;
  const commentTrees = buildCommentCommandTrees(commands);
  const { primaryTask } = selectPrimaryThreadTask(selectedThread?.tasks || []);
  const normalizedLimit = limit === null ? null : Math.max(0, Number(limit) || 0);
  const visibleCommentTrees = normalizedLimit === null ? commentTrees : commentTrees.slice(0, normalizedLimit);

  return visibleCommentTrees
    .map((tree) => {
    const command = tree.rootCommand;
    const directTask = findTaskForCommentCommand(selectedThread, command.commandId);
    const relatedTask = directTask || primaryTask || null;
    const checklistRelationSource =
      [relatedTask, selectedThread, primaryTask].find(
        (candidate) =>
          readChecklistFocusLabel(candidate) ||
          readChecklistStepLabel(candidate) ||
          readChecklistProgressLabel(candidate) ||
          readChecklistFocusNote(candidate),
      ) || null;
    const relatedTaskId = compact(relatedTask?.brief_id || relatedTask?.briefId || relatedTask?.task_id || relatedTask?.taskId);
    const primaryTaskId = compact(primaryTask?.brief_id || primaryTask?.briefId || primaryTask?.task_id || primaryTask?.taskId);
    const isFocusTask = Boolean(primaryTaskId && relatedTaskId && relatedTaskId === primaryTaskId);
    const focusRelationLabel = directTask
      ? isFocusTask
        ? '当前聚焦子任务'
        : '线程内其他子任务'
      : primaryTask
        ? '推断为当前聚焦子任务'
        : '尚未挂到具体子任务';
    const intent = parseCommentIntentEventKey(command.eventKey) || {};
    const inboxItem = findInboxItemForCommand(command, inboxItems);
    const relatedDerivedCommands = tree.descendants || collectCommandDescendants(commands, command.commandId);
    const flowDetails = summarizeCommentFlowDetails(command, relatedDerivedCommands);
    const collaborationAuditItems = buildCommentCollaborationAuditItems(command, relatedDerivedCommands);
    const relatedRuns = runs
      .filter((run) => run.commandId === command.commandId)
      .sort((left, right) => toEpochMs(right.updatedAt || right.startedAt || right.createdAt) - toEpochMs(left.updatedAt || left.startedAt || left.createdAt));
    const relatedReceipts = receipts
      .filter((receipt) => receipt.commandId === command.commandId)
      .sort((left, right) => toEpochMs(right.createdAt) - toEpochMs(left.createdAt));
    const relatedCheckpoints = checkpoints
      .filter((checkpoint) => checkpoint.commandId === command.commandId || relatedRuns.some((run) => run.runId === checkpoint.runId))
      .sort((left, right) => toEpochMs(right.updatedAt || right.createdAt) - toEpochMs(left.updatedAt || left.createdAt));

    const latestRun = relatedRuns[0] || null;
    const latestReceipt = relatedReceipts[0] || null;
    const latestCheckpoint = relatedCheckpoints[0] || null;
    const latestDerivedCommand = flowDetails.latestExecutionDerivedCommand;
    const latestCollaborationCommand = flowDetails.latestCollaborationCommand;
    const nodeGuidance = buildWorkflowNodeGuidance({
      present: true,
      focusTask: relatedTask,
      focusCommentCommand: command,
      latestRun,
      latestReceipt,
      latestCheckpoint,
      latestDerivedCommand,
      intent,
    });
    const executionPolicy = compact(intent.comment_execution_policy).toLowerCase();
    const inboxStatus = compact(inboxItem?.status).toLowerCase();
    const bucket = classifyCommentThreadBucketFromSignals({
      executionPolicy,
      inboxStatus,
      taskState: humanCommentTaskState(intent.comment_task_state),
      commandStatus: humanCommandStatus(command.status),
    });
    const tone =
      executionPolicy === 'reject'
        ? 'red'
        : executionPolicy === 'log_only'
          ? 'green'
        : inboxStatus === 'open' || inboxStatus === 'snoozed'
          ? 'yellow'
          : latestRun && compact(latestRun.status).toLowerCase() === 'running'
            ? 'blue'
            : latestCheckpoint && compact(latestCheckpoint.status).toLowerCase() === 'failed'
              ? 'red'
              : 'green';

    const availableActions = [];
    if (inboxItem && executionPolicy !== 'log_only') {
      if (['open', 'snoozed'].includes(inboxStatus)) {
        availableActions.push({ action: 'resolve', label: '标记已处理' });
        availableActions.push({ action: 'archive', label: '归档' });
      }
      if (inboxStatus === 'open') {
        availableActions.push({ action: 'snooze', label: '稍后处理' });
      }
      if (['resolved', 'snoozed', 'archived'].includes(inboxStatus) && executionPolicy !== 'enqueue') {
        availableActions.push({ action: 'reopen', label: '重新打开' });
      }
    }

    let nextAction = '等待下一步。';
    if (latestCheckpoint?.nextStep) {
      nextAction = latestCheckpoint.nextStep;
    } else if (executionPolicy === 'log_only') {
      nextAction = '这条回复已记入线程历史，用于异步协作留痕。';
    } else if (executionPolicy === 'enqueue' && compact(command.status).toLowerCase() === 'new') {
      nextAction = '命令已进入队列，等待 agent claim。';
    } else if (executionPolicy === 'enqueue' && ['claimed', 'executing'].includes(compact(command.status).toLowerCase())) {
      nextAction = 'Agent 已接手这条评论对应的任务。';
    } else if (executionPolicy === 'inbox_only') {
      if (inboxStatus === 'resolved') {
        nextAction = '这条评论已人工处理完。';
      } else if (inboxStatus === 'archived') {
        nextAction = '这条评论已归档到历史层；如需重新推进，可直接重新打开。';
      } else if (inboxStatus === 'snoozed') {
        nextAction = '这条评论已稍后处理，仍保留在 triage 队列中等待重新打开或直接处理完。';
      } else {
        nextAction = '这条评论还在 triage，等待人工决定是否要继续转任务。';
      }
    } else if (executionPolicy === 'reject') {
      nextAction = '这条评论被规则拦截，不会直接进入执行。';
    } else if (latestReceipt?.status) {
      nextAction = `最近回执：${humanReceiptStatus(latestReceipt.status)}`;
    }

      return normalizeThreadCommentItem({
      commandId: command.commandId,
      title: summarize(command.instruction || '最新评论', 88),
      summary: summarize(command.contextQuote || command.instruction || '来自评论线程的最新输入。', 160),
      ownerAgent: command.ownerAgent || null,
      sourceUrl: command.sourceUrl || null,
      tone,
      queueBucket: bucket,
      queueBucketLabel: humanCommentBucketLabel(bucket),
      executionPolicy,
      collaborationAuditItems,
      collaborationAuditSummary:
        flowDetails.collaborationSummary ||
        (collaborationAuditItems.length > 0 ? `${collaborationAuditItems.length} 条协同记录` : ''),
      latestCollaborationKindLabel: latestCollaborationCommand ? labelCommentFlowCollaboration(latestCollaborationCommand) : '',
      latestCollaborationTaskStateLabel: latestCollaborationCommand
        ? humanCommentTaskState((parseCommentIntentEventKey(latestCollaborationCommand.eventKey) || {}).comment_task_state)
        : '',
      latestCollaborationCommandStatusLabel: latestCollaborationCommand
        ? humanCommandStatus(latestCollaborationCommand.status)
        : '',
      latestCollaborationSummary: latestCollaborationCommand
        ? summarize(
            compact(
              latestCollaborationCommand.instruction ||
                latestCollaborationCommand.contextQuote ||
                latestCollaborationCommand.resultSummary ||
                latestCollaborationCommand.commandId,
            ),
            140,
          )
        : '',
      flowCountsLabel: summarizeWorkflowCounts({
        commands: flowDetails.executionCommandCount,
        collaborationSummary: flowDetails.collaborationSummary,
        runs: relatedRuns.length,
        receipts: relatedReceipts.length,
        checkpoints: relatedCheckpoints.length,
      }),
      latestDerivedCommandLabel: latestDerivedCommand
        ? `${humanCommandStatus(latestDerivedCommand.status)} · ${summarize(
            latestDerivedCommand.instruction || latestDerivedCommand.resultSummary || latestDerivedCommand.commandId,
            56,
          )}`
        : '',
      directTaskBinding: Boolean(directTask),
      relatedTaskId: relatedTaskId || '',
      relatedTaskLabel: summarizeTaskIdentity(relatedTask) || '尚未挂到具体子任务',
      relatedTaskHref: relatedTask ? `#${taskAnchorId(relatedTask)}` : '',
      focusPriority: isFocusTask ? 0 : directTask ? 1 : relatedTask ? 2 : 3,
      focusRelationLabel,
      intentLabel: humanCommentIntent(intent.comment_intent),
      executionPolicyLabel: humanCommentExecutionPolicy(intent.comment_execution_policy),
      taskStateLabel: humanCommentTaskState(intent.comment_task_state),
      confidenceLabel: humanCommentConfidence(intent.comment_confidence),
      reasonLabel: humanCommentReason(intent.comment_reason),
      commandStatusLabel: humanCommandStatus(command.status),
      inboxStatusLabel: inboxItem ? humanInboxStatus(inboxItem.status) : '未生成 triage',
      latestRunStatusLabel: latestRun ? humanRunStatus(latestRun.status) : '',
      latestReceiptLabel: latestReceipt ? `${humanReceiptStatus(latestReceipt.status)} · ${formatIso(latestReceipt.createdAt)}` : '',
      latestReceiptSummary: summarizeReceiptDetail(latestReceipt),
      latestCheckpointStatusLabel: latestCheckpoint ? compact(latestCheckpoint.status) || '已记录' : '',
      latestCheckpointSummary: summarizeCheckpointDetail(latestCheckpoint),
      checklistAcceptance: readChecklistAcceptance(relatedTask),
      checklistCheckpointRule: readChecklistCheckpointRule(relatedTask),
      checklistFocusLabel: readChecklistFocusLabel(checklistRelationSource),
      checklistFocusNote: readChecklistFocusNote(checklistRelationSource),
      checklistStepLabel: readChecklistStepLabel(checklistRelationSource),
      checklistStepTitle: readChecklistStepTitle(checklistRelationSource),
      checklistProgressLabel: readChecklistProgressLabel(checklistRelationSource),
      checklistProgressSummary: readChecklistProgressSummary(checklistRelationSource),
      checklistFocusTitle: readChecklistFocusTitle(checklistRelationSource),
      checklistFocusSummary: readChecklistFocusSummary(checklistRelationSource),
      nodeLabel: nodeGuidance.nodeLabel,
      nodeSummary: nodeGuidance.nodeSummary,
      nodeAcceptance: nodeGuidance.nodeAcceptance,
      nodeCheckpointRule: nodeGuidance.nodeCheckpointRule,
      nodeEvidence: nodeGuidance.nodeEvidence,
      nodeAnchorLabel: nodeGuidance.nodeAnchorLabel,
      nextAction,
      inboxItemId: inboxItem?.itemId || null,
      availableActions,
    });
    })
    .sort((left, right) => {
      if (left.focusPriority !== right.focusPriority) {
        return left.focusPriority - right.focusPriority;
      }

      const urgencyScore = (comment) => {
        if (comment.queueBucket === 'rejected') {
          return 2;
        }
        if (comment.queueBucket === 'triage') {
          return 0;
        }
        if (comment.queueBucket === 'ready') {
          return 1;
        }
        return 3;
      };

      const leftUrgency = urgencyScore(left);
      const rightUrgency = urgencyScore(right);
      if (leftUrgency !== rightUrgency) {
        return leftUrgency - rightUrgency;
      }

      return 0;
    });
}

function buildCommentThreadSummary(commentThreads = []) {
  const summary = {
    total: commentThreads.length,
    readyCount: 0,
    triageCount: 0,
    rejectedCount: 0,
    resolvedCount: 0,
    activeCount: 0,
    headline: '',
    detail: '',
    defaultFilter: 'all',
    filters: [],
    defaultFocus: null,
  };

  for (const comment of commentThreads) {
    if (comment.queueBucket === 'rejected') {
      summary.rejectedCount += 1;
      continue;
    }
    if (comment.queueBucket === 'triage') {
      summary.triageCount += 1;
      continue;
    }
    if (comment.queueBucket === 'ready') {
      summary.readyCount += 1;
      summary.activeCount += 1;
      continue;
    }

    summary.resolvedCount += 1;
  }

  if (summary.triageCount > 0) {
    summary.headline = `当前最需要处理的是 ${summary.triageCount} 条待分流评论`;
    summary.detail = '这些评论还没有被安全地接回执行链，适合先补一句明确指令，或升级成黄灯 / 红灯。';
  } else if (summary.readyCount > 0) {
    summary.headline = `当前有 ${summary.readyCount} 条评论已经接回执行链`;
    summary.detail = '这部分评论已经形成命令或正在推进，可以继续看回执、checkpoint 和下一步。';
  } else if (summary.rejectedCount > 0) {
    summary.headline = `当前有 ${summary.rejectedCount} 条评论被安全规则拦截`;
    summary.detail = '这类评论暂时不会继续执行，适合回看是否需要重新表述，或显式升级成决策。';
  } else if (summary.total > 0) {
    summary.headline = `当前 ${summary.total} 条评论都已进入历史层`;
    summary.detail = '它们大多已经归档、收口或处理完成，可用于回看审计，不必占住当前注意力。';
  } else {
    summary.headline = '当前线程还没有进入工作台的评论记录';
    summary.detail = '当新的评论进入 Cortex 后，这里会先告诉你哪些评论仍待处理，哪些已经回到执行链。';
  }

  summary.defaultFilter =
    summary.triageCount > 0
      ? 'triage'
      : summary.readyCount > 0
        ? 'ready'
        : summary.rejectedCount > 0
          ? 'rejected'
          : summary.resolvedCount > 0
            ? 'resolved'
            : 'all';
  summary.filters = [
    buildCommentFilterDescriptor('all', summary),
    buildCommentFilterDescriptor('triage', summary),
    buildCommentFilterDescriptor('ready', summary),
    buildCommentFilterDescriptor('rejected', summary),
    buildCommentFilterDescriptor('resolved', summary),
  ];
  summary.defaultFocus = buildCommentFilterDescriptor(summary.defaultFilter, summary);

  return normalizeCommentSummary(summary);
}

function commentMatchesFilter(comment, filterValue) {
  const normalized = normalizeCommentFilterValue(filterValue);
  if (normalized === 'all') {
    return true;
  }
  return compact(comment?.queueBucket).toLowerCase() === normalized;
}

function pickCommentThreadFocus(commentThreads = [], filterValue = 'all', options = {}) {
  const comments = Array.isArray(commentThreads) ? commentThreads.filter(Boolean) : [];
  if (comments.length === 0) {
    return null;
  }

  const normalized = normalizeCommentFilterValue(filterValue);
  const matchedComment = comments.find((comment) => commentMatchesFilter(comment, normalized)) || null;
  if (matchedComment) {
    return matchedComment;
  }

  return options.fallbackToFirst === false ? null : comments[0] || null;
}

function buildWorkspaceDocumentCommentFocusMap(threadDetail) {
  const detail = threadDetail && typeof threadDetail === 'object' ? threadDetail : null;
  if (!detail) {
    return {};
  }

  const commentSummary = normalizeCommentSummary(detail.comment_summary || detail.commentSummary || {});
  const comments = Array.isArray(detail.comment_threads || detail.commentThreads)
    ? (detail.comment_threads || detail.commentThreads).filter(Boolean)
    : [];
  const filterDescriptors =
    Array.isArray(commentSummary.filters) && commentSummary.filters.length > 0
      ? commentSummary.filters
      : ['all', 'triage', 'ready', 'rejected', 'resolved'].map((filterValue) =>
          buildCommentFilterDescriptor(filterValue, commentSummary),
        );

  return normalizeCommentFocusMap(
    Object.fromEntries(
    filterDescriptors.map((descriptor) => {
      const normalized = normalizeCommentFilterValue(descriptor?.value || descriptor);
      const selectedFocus =
        descriptor && typeof descriptor === 'object'
          ? descriptor
          : buildCommentFilterDescriptor(normalized, commentSummary);

      return [
        normalized,
        {
          filter: normalized,
          selected_focus: selectedFocus,
          selectedFocus,
          comment: pickCommentThreadFocus(comments, normalized, {
            fallbackToFirst: normalized === 'all',
          }),
        },
      ];
    }),
    ),
    commentSummary,
  );
}

function buildWorkspaceDocumentSelectedCommentFocus(threadDetail, commentFocusMap = null) {
  const detail = threadDetail && typeof threadDetail === 'object' ? threadDetail : null;
  if (!detail) {
    return null;
  }

  const commentSummary = normalizeCommentSummary(detail.comment_summary || detail.commentSummary || {});
  const selectedFilter = normalizeCommentFilterValue(commentSummary?.selectedFilter || commentSummary?.defaultFilter || 'all');
  const focusMap =
    commentFocusMap && typeof commentFocusMap === 'object'
      ? normalizeCommentFocusMap(commentFocusMap, commentSummary)
      : buildWorkspaceDocumentCommentFocusMap(detail);
  return focusMap?.[selectedFilter]?.comment
    ? normalizeThreadCommentItem(focusMap[selectedFilter].comment)
    : null;
}

function buildWorkspaceDocumentTopbarStatus({ documentKind, selectedThread, threadPanel, memoryPanel }) {
  const normalizedKind = compact(documentKind).toLowerCase();
  if (normalizedKind === 'memory') {
    return `当前 reviewer 焦点：${memoryPanel?.focusTitle || '未选中'}${
      memoryPanel?.focusLabel ? ` · ${memoryPanel.focusLabel}` : ''
    }`;
  }

  return `当前线程：${selectedThread?.thread_label || '未选中'}${
    threadPanel?.stateLabel ? ` · 当前状态：${threadPanel.stateLabel}` : ''
  }${threadPanel?.focusLabel ? ` · 当前聚焦：${threadPanel.focusLabel}` : ''}`;
}

function buildWorkspaceDocumentComposeOwnerAgent(threadDetail, selectedThread) {
  return (
    compact(threadDetail?.workflow?.ownerAgent) ||
    compact(selectedThread?.tasks?.find((task) => compact(task.owner_agent || task.ownerAgent))?.owner_agent) ||
    compact(selectedThread?.tasks?.find((task) => compact(task.owner_agent || task.ownerAgent))?.ownerAgent) ||
    ''
  );
}

function buildThreadDetail(engine, projectId, selectedThread, options = {}) {
  if (!selectedThread) {
    return {
      thread_key: null,
      thread_label: '还没有线程',
      open_decisions: [],
      openDecisions: [],
      workflow: {
        present: false,
        title: '还没有线程',
        summary: '当前没有可展示的任务流转。',
        steps: [],
        nextAction: '等待线程进入工作台。',
      },
      execution_snapshot: buildEmptyExecutionSnapshot(),
      executionSnapshot: buildEmptyExecutionSnapshot(),
      tasks: [],
      comment_threads: [],
      commentThreads: [],
      events: [],
      counts: {
        events: 0,
        openDecisions: 0,
        open_decisions: 0,
        commands: 0,
        inbox: 0,
        commentThreads: 0,
        decisions: 0,
        checkpoints: 0,
        receipts: 0,
        runs: 0,
      },
    };
  }

  const includeSynthetic = Boolean(options.includeSynthetic);
  const project = {
    projectId,
    projectName: options.projectName || projectId,
  };
  const artifactIds = collectTaskArtifactIds(selectedThread);

  const commands = filterRecordsForThread(
    engine.listCommands({ projectId }).commands || [],
    artifactIds.commandIds,
    selectedThread,
    project,
  );
  const decisions = filterRecordsForThread(
    engine.listDecisionRequests({ projectId }).decisions || [],
    artifactIds.decisionIds,
    selectedThread,
    project,
  );
  const runs = filterRecordsForThread(
    engine.listRuns({ projectId, limit: 128 }).runs || [],
    artifactIds.runIds,
    selectedThread,
    project,
  );
  const checkpoints = filterRecordsForThread(
    engine.listCheckpoints({ projectId, limit: 128 }).checkpoints || [],
    artifactIds.checkpointIds,
    selectedThread,
    project,
  );
  const receipts = filterRecordsForThread(
    engine.getReceiptsByProject(projectId, { limit: 128 }).receipts || [],
    artifactIds.receiptIds,
    selectedThread,
    project,
  );
  const inboxItems = filterRecordsForThread(
    engine.listInbox({ projectId, limit: 128 }).items || [],
    artifactIds.inboxItemIds,
    selectedThread,
    project,
  );
  const suggestions = filterRecordsForThread(
    engine.listSuggestions({ projectId, limit: 128 }).suggestions || [],
    artifactIds.suggestionIds,
    selectedThread,
    project,
  );

  const openDecisions = decisions
    .filter((decision) => isOpenDecisionStatus(decision.status) && ['red', 'yellow'].includes(compact(decision.signalLevel).toLowerCase()))
    .sort((left, right) => toEpochMs(right.updatedAt || right.createdAt) - toEpochMs(left.updatedAt || left.createdAt));
  const allCommentThreads = buildThreadCommentCards(selectedThread, commands, inboxItems, runs, checkpoints, receipts, { limit: null });
  const commentSummary = buildCommentThreadSummary(allCommentThreads);
  const commentThreads = allCommentThreads.slice(0, 6);
  const threadTasks = enrichThreadTasksWithCommentSummary(selectedThread.tasks || [], allCommentThreads);
  const selectedThreadView = {
    ...selectedThread,
    tasks: threadTasks,
  };
  const workflow = buildThreadWorkflow(selectedThreadView, commands, runs, receipts, checkpoints);

  const events = [
    ...commands.map((command) =>
      enrichThreadEventWithChecklist(
        mapCommandEvent(command),
        findTaskForThreadArtifact(selectedThreadView, { commandId: command.commandId }),
      ),
    ),
    ...decisions.map((decision) =>
      enrichThreadEventWithChecklist(
        mapDecisionEvent(decision),
        findTaskForThreadArtifact(selectedThreadView, { decisionId: decision.decisionId }),
      ),
    ),
    ...runs.map((run) =>
      enrichThreadEventWithChecklist(
        mapRunEvent(run),
        findTaskForThreadArtifact(selectedThreadView, {
          runId: run.runId,
          commandId: run.commandId,
        }),
      ),
    ),
    ...checkpoints.map((checkpoint) =>
      enrichThreadEventWithChecklist(
        mapCheckpointEvent(checkpoint),
        findTaskForThreadArtifact(selectedThreadView, {
          checkpointId: checkpoint.checkpointId,
          runId: checkpoint.runId,
          commandId: checkpoint.commandId,
          decisionId: checkpoint.decisionId,
        }),
      ),
    ),
    ...receipts.map((receipt) =>
      enrichThreadEventWithChecklist(
        mapReceiptEvent(receipt),
        findTaskForThreadArtifact(selectedThreadView, { commandId: receipt.commandId }),
      ),
    ),
    ...inboxItems.map(mapInboxEvent),
    ...suggestions.map(mapSuggestionEvent),
  ].sort((left, right) => toEpochMs(right.timestamp) - toEpochMs(left.timestamp));
  const executionSnapshot = buildExecutionSnapshot(
    selectedThreadView,
    {
      openDecisions,
      commands,
      runs,
      checkpoints,
      events,
      workflow,
    },
    engine.store.clock().toISOString(),
  );

  return {
    thread_key: selectedThread.thread_key,
    threadKey: selectedThread.thread_key,
    thread_label: selectedThread.thread_label,
    threadLabel: selectedThread.thread_label,
    open_decisions: openDecisions,
    openDecisions,
    workflow,
    execution_snapshot: executionSnapshot,
    executionSnapshot,
    tasks: threadTasks,
    comment_threads: commentThreads,
    commentThreads,
    comment_summary: commentSummary,
    commentSummary,
    events,
    counts: {
      events: events.length,
      open_decisions: openDecisions.length,
      openDecisions: openDecisions.length,
      commands: commands.length,
      inbox: inboxItems.length,
      commentThreads: commentThreads.length,
      decisions: decisions.length,
      checkpoints: checkpoints.length,
      receipts: receipts.length,
      runs: runs.length,
    },
    include_synthetic: includeSynthetic,
    includeSynthetic,
  };
}

export function saveWorkspaceDocument({ projectId, documentId = 'execution', body, cwd = process.cwd() } = {}) {
  const documents = resolveWorkspaceDocuments(projectId, cwd);
  const selectedDocument = findSelectedDocument(documents, documentId);
  const nextBody = String(body || '');
  const rendered = renderMarkdownDocument(nextBody);
  writeFileSync(selectedDocument.path, nextBody, 'utf8');

  return {
    ok: true,
    document: {
      ...selectedDocument,
      body: nextBody,
      html: rendered.html,
      outline: rendered.outline,
      summary: summarize(nextBody, 220),
      updated_at: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function buildWorkspaceDocumentPayload(engine, projectId, documentId = 'execution', options = {}) {
  const cwd = options.cwd || process.cwd();
  const workspaceContext = {
    includeSynthetic: options.workspaceContext?.includeSynthetic ?? Boolean(options.includeSynthetic),
    includeResidual: options.workspaceContext?.includeResidual ?? Boolean(options.includeResidual),
    residualPattern: options.workspaceContext?.residualPattern ?? options.residualPattern ?? '',
    view: options.workspaceContext?.view ?? options.view ?? '',
    threadFilter: options.workspaceContext?.threadFilter ?? options.threadFilter ?? options.thread_filter ?? '',
    commentFilter:
      options.workspaceContext?.commentFilter ??
      options.workspaceContext?.comment_filter ??
      options.commentFilter ??
      options.comment_filter ??
      '',
  };
  const workspace = buildWorkspacePayload(engine, projectId, options);
  const documents = resolveWorkspaceDocuments(workspace.project.projectId, cwd);
  const selectedDocument = findSelectedDocument(documents, documentId);
  const requestedThreadKey = compact(options.threadKey);
  const threadGroups = workspace.thread_groups.map((group) => ({
    ...group,
    ...buildThreadGroupOverview(group),
  }));
  const selectedThread = pickWorkspaceDocumentThreadGroup(threadGroups, requestedThreadKey);
  const documentBody = readDocumentBody(selectedDocument);
  const renderedDocument = renderMarkdownDocument(documentBody);
  const threadDetail = buildThreadDetail(engine, workspace.project.projectId, selectedThread, {
    includeSynthetic: options.includeSynthetic,
    projectName: workspace.project.projectName,
  });
  const selectedThreadGroup = selectedThread ? threadGroups.find((group) => group.thread_key === selectedThread.thread_key) || null : null;
  const workspaceHref = `/workspace${buildWorkspaceContextQuery(workspace.project.projectId, workspaceContext)}`;
  const documentContext = {
    ...workspaceContext,
    documentId: selectedDocument.documentId,
  };
  const resolvedThreadHref =
    selectedThread && requestedThreadKey && compact(selectedThread.thread_key) !== requestedThreadKey
      ? buildWorkspaceThreadHref(workspace.project.projectId, selectedThread.thread_key, documentContext)
      : '';
  const requestedCommentFilter = normalizeCommentFilterValue(workspaceContext.commentFilter);
  threadDetail.comment_summary = normalizeCommentSummary(threadDetail.comment_summary || threadDetail.commentSummary || {});
  threadDetail.commentSummary = threadDetail.comment_summary;
  const defaultCommentFilter = normalizeCommentFilterValue(threadDetail.comment_summary?.defaultFilter || 'all');
  const selectedCommentFilter = requestedCommentFilter === 'all' ? defaultCommentFilter : requestedCommentFilter;
  const selectedGovernanceItem = selectedThread
    ? (workspace.thread_identity_governance?.items || []).find((item) => item.threadKey === selectedThread.thread_key) || null
    : null;
  threadDetail.comment_summary = normalizeCommentSummary({
    ...(threadDetail.comment_summary || {}),
    requestedFilter: requestedCommentFilter,
    requested_filter: requestedCommentFilter,
    selectedFilter: selectedCommentFilter,
    selected_filter: selectedCommentFilter,
    selectedFocus: buildCommentFilterDescriptor(selectedCommentFilter, threadDetail.comment_summary || {}),
    selected_focus: buildCommentFilterDescriptor(selectedCommentFilter, threadDetail.comment_summary || {}),
  });
  threadDetail.commentSummary = threadDetail.comment_summary;
  const commentFocusMap = buildWorkspaceDocumentCommentFocusMap(threadDetail);
  const sourceRecoveryContext = deriveThreadSourceRecoveryContext(
    engine,
    workspace.project.projectId,
    threadDetail,
  );
  const rawExecutionChecklist = workspace.execution_checklist;
  const rawMemoryGovernance = normalizeMemoryGovernance(
    workspace.memory_governance ||
      workspace.memoryGovernance || {
        counts: {
          candidates: 0,
          reviews: 0,
          suggestions: 0,
        },
        candidateCards: [],
        reviewCards: [],
        suggestionCards: [],
      },
  );
  const memoryGovernance =
    compact(selectedDocument.kind).toLowerCase() === 'memory'
      ? hydrateMemoryGovernance(rawMemoryGovernance, engine, { generatedAt: workspace.generated_at })
      : rawMemoryGovernance;
  const memoryPanelBase = buildMemoryDocumentPanel(memoryGovernance, rawExecutionChecklist);
  const executionGuideQueue = buildWorkspaceHeroActionQueue(
    rawExecutionChecklist,
    workspace.decision_focus || workspace.decisionFocus || {},
    workspace.comment_workflow || workspace.commentWorkflow || {},
    memoryGovernance,
  );
  const threadStateGuidance = selectedThreadGroup ? buildThreadGuidanceDescriptor(selectedThreadGroup, 'all') : null;
  const focusStripWorkflowGuidance =
    compact(selectedDocument.kind).toLowerCase() === 'memory'
      ? null
      : buildFocusStripWorkflowGuidance(threadDetail, selectedThread, selectedThreadGroup);
  const executionFocusGuidance = buildExecutionFocusGuidanceModel(rawExecutionChecklist, {
    commentThreadCount: threadDetail.counts.commentThreads,
    openDecisionCount: threadDetail.counts.openDecisions,
    threadEventCount: threadDetail.counts.events,
    workflowGuidance: focusStripWorkflowGuidance,
    actionQueue: executionGuideQueue,
  });
  const executionChecklist = {
    ...rawExecutionChecklist,
    focus_guidance: executionFocusGuidance,
    focusGuidance: executionFocusGuidance,
  };
  const memoryFocusGuidance = buildMemoryFocusGuidanceModel(memoryPanelBase, executionChecklist, executionGuideQueue);
  const memoryPanel = normalizeMemoryPanel({
    ...memoryPanelBase,
    focus_guidance: memoryFocusGuidance,
    focusGuidance: memoryFocusGuidance,
  });
  const threadPanel = {
    title: selectedThread?.thread_label || '还没有线程',
    subtitle: selectedThread
      ? `${selectedThread.task_count} 个任务 · ${selectedThread.in_progress_count} 个处理中 · ${selectedThread.red_count} 个红灯`
      : '当前文档下没有可供进入的执行线程。',
    state_label: threadStateGuidance?.nodeLabel || '',
    stateLabel: threadStateGuidance?.nodeLabel || '',
    state_summary: threadStateGuidance?.nodeSummary || '',
    stateSummary: threadStateGuidance?.nodeSummary || '',
    state_action: threadStateGuidance?.nodeAction || '',
    stateAction: threadStateGuidance?.nodeAction || '',
    focus_label: selectedThreadGroup?.focusLabel || '',
    focusLabel: selectedThreadGroup?.focusLabel || '',
    checklist_focus_label: selectedThreadGroup?.checklist_focus_label || '',
    checklistFocusLabel: selectedThreadGroup?.checklist_focus_label || '',
    checklist_focus_note: selectedThreadGroup?.checklist_focus_note || '',
    checklistFocusNote: selectedThreadGroup?.checklist_focus_note || '',
    checklist_step_label: selectedThreadGroup?.checklist_step_label || '',
    checklistStepLabel: selectedThreadGroup?.checklist_step_label || '',
    checklist_step_title: selectedThreadGroup?.checklist_step_title || '',
    checklistStepTitle: selectedThreadGroup?.checklist_step_title || '',
    checklist_progress_label: selectedThreadGroup?.checklist_progress_label || '',
    checklistProgressLabel: selectedThreadGroup?.checklist_progress_label || '',
    checklist_progress_summary: selectedThreadGroup?.checklist_progress_summary || '',
    checklistProgressSummary: selectedThreadGroup?.checklist_progress_summary || '',
    queue_summary: selectedThreadGroup?.statusSummary || '',
    queueSummary: selectedThreadGroup?.statusSummary || '',
    signal_summary: selectedThreadGroup?.signalSummary || '',
    signalSummary: selectedThreadGroup?.signalSummary || '',
    tasks: threadDetail.tasks || selectedThread?.tasks || [],
  };
  const threadEventSummary = buildThreadEventSummary(threadDetail);
  const selectedCommentFocus = buildWorkspaceDocumentSelectedCommentFocus(threadDetail, commentFocusMap);
  threadDetail.comment_focus_map = commentFocusMap;
  threadDetail.commentFocusMap = commentFocusMap;
  threadDetail.selected_comment_focus = selectedCommentFocus;
  threadDetail.selectedCommentFocus = selectedCommentFocus;
  const topbarStatus = buildWorkspaceDocumentTopbarStatus({
    documentKind: selectedDocument.kind,
    selectedThread,
    threadPanel,
    memoryPanel,
  });
  const composeOwnerAgent = buildWorkspaceDocumentComposeOwnerAgent(threadDetail, selectedThread);
  threadDetail.source_recovery = buildThreadSourceRecovery(
    selectedGovernanceItem,
    threadDetail,
    workspace.project.projectId,
    {
      ...workspaceContext,
      documentId: selectedDocument.documentId,
    },
    sourceRecoveryContext,
  );
  threadDetail.sourceRecovery = threadDetail.source_recovery;

  return {
    ok: true,
    generated_at: workspace.generated_at,
    generatedAt: workspace.generatedAt,
    project: workspace.project,
    hero: workspace.hero,
    counts: workspace.counts,
    execution_checklist: executionChecklist,
    executionChecklist,
    execution_focus_guidance: executionFocusGuidance,
    executionFocusGuidance,
    decision_focus: workspace.decision_focus,
    decisionFocus: workspace.decisionFocus,
    comment_workflow: workspace.comment_workflow,
    commentWorkflow: workspace.commentWorkflow,
    memory_governance: memoryGovernance,
    memoryGovernance,
    memory_panel: memoryPanel,
    memoryPanel,
    memory_focus_guidance: memoryFocusGuidance,
    memoryFocusGuidance,
    execution_guide_queue: executionGuideQueue,
    executionGuideQueue: executionGuideQueue,
    focus_strip_workflow_guidance: focusStripWorkflowGuidance,
    focusStripWorkflowGuidance,
    workspace_context: workspaceContext,
    workspaceContext,
    workspace_href: workspaceHref,
    workspaceHref,
    requested_thread_key: requestedThreadKey || null,
    requestedThreadKey: requestedThreadKey || null,
    resolved_thread_href: resolvedThreadHref || null,
    resolvedThreadHref: resolvedThreadHref || null,
    documents: documents.map((document) => ({
      ...document,
      isSelected: document.documentId === selectedDocument.documentId,
      href: `/workspace/docs/${encodeURIComponent(document.documentId)}${buildWorkspaceContextQuery(
        workspace.project.projectId,
        workspaceContext,
      )}`,
    })),
    document: {
      ...selectedDocument,
      body: documentBody,
      html: renderedDocument.html,
      outline: renderedDocument.outline,
      summary: summarize(documentBody, 220),
    },
    thread_groups: threadGroups,
    threadGroups,
    selected_thread: selectedThread,
    selectedThread,
    comment_focus_map: commentFocusMap,
    commentFocusMap,
    selected_comment_focus: selectedCommentFocus,
    selectedCommentFocus: selectedCommentFocus,
    topbar_status: topbarStatus,
    topbarStatus,
    compose_owner_agent: composeOwnerAgent,
    composeOwnerAgent,
    thread_detail: threadDetail,
    threadDetail,
    thread_event_summary: threadEventSummary,
    threadEventSummary,
    thread_panel: threadPanel,
    threadPanel,
    document_context: documentContext,
    documentContext,
  };
}

function renderThreadTask(task, projectId, documentId, workspaceContext = {}, executionChecklist = null, threadPanel = null) {
  const detailGrid = renderMetaGrid([
    ...buildChecklistInlineMeta(task),
    { label: '当前节点', value: task.current_node || task.currentNode },
    { label: '执行链', value: task.execution_proof || task.executionProof },
    { label: '协同记录', value: task.collaboration_history_summary || task.collaborationHistorySummary },
    { label: '最近回执', value: task.latest_receipt_label || task.latestReceiptLabel },
    { label: '最近 Checkpoint', value: task.last_checkpoint_at ? formatIso(task.last_checkpoint_at) : '' },
    { label: '最近更新', value: task.latest_updated_at ? formatIso(task.latest_updated_at) : '' },
    { label: '任务标识', value: task.brief_id || task.task_id || task.thread_key },
  ]);
  const commentGrid = renderMetaGrid([
    { label: '评论状态', value: task.latest_comment_status || task.latestCommentStatus },
    { label: '挂载关系', value: task.latest_comment_relation || task.latestCommentRelation },
    { label: '评论下一步', value: task.latest_comment_next_action || task.latestCommentNextAction },
  ]);
  const checklistRelationCallout = renderChecklistRelationSceneBlock(task, executionChecklist, 'thread-task-card');

  return `
    <article id="${escapeHtml(taskAnchorId(task))}" class="thread-task-card tone-${escapeHtml(task.tone || 'neutral')}" data-thread-task-card>
      <div class="thread-task-top">
        <span class="thread-task-badge">${escapeHtml(humanSignalLevel(task.decision_signal || 'green'))}</span>
        <span class="thread-task-status">${escapeHtml(humanTaskExecutionStatus(task.execution_status || 'in_progress'))}</span>
        ${readChecklistStepLabel(task) ? `<span class="thread-task-step">${escapeHtml(readChecklistStepLabel(task))}</span>` : ''}
      </div>
      <h4>${escapeHtml(task.title)}</h4>
      <p>${escapeHtml(task.summary || task.status_note || '暂无摘要')}</p>
      ${renderThreadStateSceneBlock(threadPanel, 'thread-task-card', { compact: true })}
      ${checklistRelationCallout}
      ${detailGrid}
      <div class="thread-task-next">
        <strong>下一步</strong>
        <span>${escapeHtml(task.next_step || '等待下一步')}</span>
      </div>
      ${
        task.latest_comment_summary || task.latestCommentSummary
          ? `
            <div class="workflow-next">
              <strong>最近评论</strong>
              <span>${escapeHtml(task.latest_comment_summary || task.latestCommentSummary)}</span>
            </div>
            ${commentGrid}
            <div class="thread-task-links">
              ${
                task.latest_comment_href || task.latestCommentHref
                  ? `<a href="${escapeHtml(task.latest_comment_href || task.latestCommentHref)}">打开关联评论</a>`
                  : ''
              }
              ${
                task.latest_comment_source_url || task.latestCommentSourceUrl
                  ? `<a href="${escapeHtml(task.latest_comment_source_url || task.latestCommentSourceUrl)}" target="_blank" rel="noreferrer">打开原始评论</a>`
                  : ''
              }
            </div>
          `
          : `
            <div class="workflow-next">
              <strong>评论链路</strong>
              <span>当前还没有直接挂到这条子任务的评论。</span>
            </div>
          `
      }
      <div class="thread-task-links">
        <a href="${escapeHtml(buildWorkspaceThreadHref(projectId, task.thread_key, {
          ...workspaceContext,
          documentId,
        }))}">打开线程详情</a>
        ${
          task.primary_link
            ? `<a href="${escapeHtml(task.primary_link)}" target="_blank" rel="noreferrer">打开源位置</a>`
            : ''
        }
      </div>
    </article>
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

function renderThreadStatsGrid(items = [], options = {}) {
  const stats = Array.isArray(items)
    ? items.filter((item) => compact(item?.label) && item?.value !== undefined && item?.value !== null)
    : [];
  if (stats.length === 0) {
    return '';
  }

  return `
    <div class="thread-stats"${renderHtmlAttributeString({
      ...(options.context ? { 'data-thread-stats-context': options.context } : {}),
      ...((options && options.attributes) || {}),
    })}>
      ${stats
        .map(
          (item) => `
            <div class="thread-stat"${renderHtmlAttributeString({
              ...(item?.key ? { 'data-thread-stat': item.key } : {}),
              ...((item && item.attributes) || {}),
            })}>
              <strong data-thread-stat-value>${escapeHtml(String(item.value))}</strong>
              <span class="muted" data-thread-stat-label>${escapeHtml(item.label)}</span>
            </div>
          `,
        )
        .join('')}
    </div>
  `;
}

function summarizeEvidenceRefs(evidenceRefs = []) {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    return '';
  }

  const preview = evidenceRefs
    .slice(0, 2)
    .map((entry) => {
      if (typeof entry === 'string') {
        const raw = entry.trim();
        if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              return summarize(parsed.title || parsed.label || parsed.url || parsed.ref || raw, 36);
            }
          } catch {
            // Fall through to raw string summary.
          }
        }
        return summarize(raw, 36);
      }
      if (entry && typeof entry === 'object') {
        return summarize(entry.title || entry.label || entry.url || entry.ref || JSON.stringify(entry), 36);
      }
      return '';
    })
    .filter(Boolean);

  return preview.length > 0 ? `${evidenceRefs.length} 条证据 · ${preview.join('；')}` : `${evidenceRefs.length} 条证据`;
}

function buildThreadStateGuidance(threadPanel = {}) {
  return {
    stateLabel: compact(threadPanel?.stateLabel || threadPanel?.state_label || threadPanel?.nodeStateLabel || threadPanel?.node_state_label),
    stateSummary: compact(
      threadPanel?.stateSummary ||
        threadPanel?.state_summary ||
        threadPanel?.nodeStateSummary ||
        threadPanel?.node_state_summary,
    ),
    stateAction: compact(
      threadPanel?.stateAction || threadPanel?.state_action || threadPanel?.nodeStateAction || threadPanel?.node_state_action,
    ),
  };
}

function buildThreadStateGuidanceProgressItems(threadPanel = {}) {
  const guidance = buildThreadStateGuidance(threadPanel);
  return [
    guidance.stateLabel ? `线程状态：${guidance.stateLabel}` : '',
    guidance.stateSummary ? `状态说明：${guidance.stateSummary}` : '',
    guidance.stateAction ? `这一步处理：${guidance.stateAction}` : '',
  ].filter(Boolean);
}

function buildWorkflowNodePresenter(nodeGuidance = null, options = {}) {
  const normalizedNodeGuidance = nodeGuidance && typeof nodeGuidance === 'object' ? nodeGuidance : {};
  const nodeLabel = compact(normalizedNodeGuidance.nodeLabel || normalizedNodeGuidance.node_label);
  const nodeSummary = compact(normalizedNodeGuidance.nodeSummary || normalizedNodeGuidance.node_summary);
  const nodeEvidence = compact(normalizedNodeGuidance.nodeEvidence || normalizedNodeGuidance.node_evidence);
  const nodeAnchorLabel = compact(normalizedNodeGuidance.nodeAnchorLabel || normalizedNodeGuidance.node_anchor_label);
  const fallbackLabel = compact(options.fallbackLabel);
  const fallbackSummary = compact(options.fallbackSummary);
  const fallbackTitlePrefix = compact(options.fallbackTitlePrefix) || '当前状态';
  const hasContent = nodeLabel || nodeSummary || nodeEvidence || nodeAnchorLabel || fallbackLabel || fallbackSummary;

  return {
    title: hasContent ? (nodeLabel ? `当前节点 · ${nodeLabel}` : fallbackLabel ? `${fallbackTitlePrefix} · ${fallbackLabel}` : '当前节点') : '',
    body: nodeSummary || fallbackSummary,
    progressItems: [
      nodeAnchorLabel ? `挂载闭环：${nodeAnchorLabel}` : '',
      nodeEvidence ? `最近节点证据：${nodeEvidence}` : '',
    ].filter(Boolean),
  };
}

function buildWorkflowNodeGuidanceCards(nodeGuidance = null, options = {}) {
  const normalizedNodeGuidance = nodeGuidance && typeof nodeGuidance === 'object' ? nodeGuidance : {};
  const nodePresenter = buildWorkflowNodePresenter(normalizedNodeGuidance, options);
  const nodeAcceptance = compact(normalizedNodeGuidance.nodeAcceptance || normalizedNodeGuidance.node_acceptance);
  const nodeCheckpointRule = compact(
    normalizedNodeGuidance.nodeCheckpointRule || normalizedNodeGuidance.node_checkpoint_rule,
  );
  const leadingProgressItems = Array.isArray(options.leadingProgressItems)
    ? options.leadingProgressItems.filter(Boolean)
    : [];
  const displayCard =
    nodePresenter.title || nodePresenter.body || nodePresenter.progressItems.length > 0
      ? {
          kind: compact(options.displayKind) || 'workflow-node',
          title: nodePresenter.title,
          body: nodePresenter.body,
          progressItems: [...leadingProgressItems, ...nodePresenter.progressItems].filter(Boolean),
        }
      : null;
  const acceptanceCard = nodeAcceptance
    ? {
        kind: compact(options.acceptanceKind) || 'node-acceptance',
        title: compact(options.acceptanceTitle) || '这一步验收',
        body: nodeAcceptance,
      }
    : null;
  const checkpointCard = nodeCheckpointRule
    ? {
        kind: compact(options.checkpointKind) || 'node-checkpoint-rule',
        title: compact(options.checkpointTitle) || 'Checkpoint 规则',
        body: nodeCheckpointRule,
      }
    : null;

  return {
    displayCard,
    acceptanceCard,
    checkpointCard,
    cards: [displayCard, acceptanceCard, checkpointCard].filter(Boolean),
  };
}

function renderWorkflowGuidanceCallout(card = null, options = {}) {
  const normalizedCard = card && typeof card === 'object' ? card : {};
  const title = compact(normalizedCard.title);
  const body = compact(normalizedCard.body);
  const progressItems = Array.isArray(normalizedCard.progressItems) ? normalizedCard.progressItems.filter(Boolean) : [];
  if (!title && !body && progressItems.length === 0) {
    return '';
  }

  return `
    <div class="${escapeHtml(options.className || 'thread-focus-callout')}"${renderHtmlAttributeString({
      ...(options.context ? { 'data-workflow-node-guidance-context': options.context } : {}),
      ...(options.block ? { 'data-workflow-node-guidance-block': options.block } : {}),
      ...(options.attributes || {}),
    })}>
      ${title ? `<strong>${escapeHtml(title)}</strong>` : ''}
      ${body ? `<span>${escapeHtml(body)}</span>` : ''}
      ${progressItems
        .map((item) => `<span class="checklist-context-progress">${escapeHtml(item)}</span>`)
        .join('')}
    </div>
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

function renderWorkflowNodeGuidanceSections(nodeGuidance = {}, options = {}) {
  const { displayCard, acceptanceCard, checkpointCard } = buildWorkflowNodeGuidanceCards(nodeGuidance, options);

  return `
    ${renderWorkflowGuidanceCallout(displayCard, { context: options.context, block: 'display' })}
    ${acceptanceCard ? renderWorkflowNextSection(acceptanceCard.title, acceptanceCard.body, { context: options.context, block: 'acceptance' }) : ''}
    ${checkpointCard ? renderWorkflowNextSection(checkpointCard.title, checkpointCard.body, { context: options.context, block: 'checkpoint-rule' }) : ''}
  `;
}

function pickWorkflowNodeGuidance(record = {}) {
  const normalizedRecord = record && typeof record === 'object' ? record : {};
  return {
    nodeLabel: normalizedRecord.nodeLabel,
    nodeSummary: normalizedRecord.nodeSummary,
    nodeAcceptance: normalizedRecord.nodeAcceptance,
    nodeCheckpointRule: normalizedRecord.nodeCheckpointRule,
    nodeEvidence: normalizedRecord.nodeEvidence,
    nodeAnchorLabel: normalizedRecord.nodeAnchorLabel,
  };
}

function renderSceneCardWorkflowBlocks({
  context = '',
  assessment = '',
  assessmentTitle = '当前判断',
  evidenceTitle = '执行证据',
  evidenceBody = '',
  nodeGuidance = null,
  extraBlocks = [],
  attributes = {},
} = {}) {
  const workflowBlocks = [
    compact(assessment)
      ? renderWorkflowNextSection(assessmentTitle, assessment, { context, block: 'assessment' })
      : '',
    compact(evidenceBody)
      ? renderWorkflowNextSection(evidenceTitle, evidenceBody, { context, block: 'evidence' })
      : '',
    nodeGuidance ? renderWorkflowNodeGuidanceSections(nodeGuidance, { context }) : '',
    ...(Array.isArray(extraBlocks) ? extraBlocks.filter(Boolean) : []),
  ]
    .filter(Boolean)
    .join('');

  if (!workflowBlocks) {
    return '';
  }

  return `
    <div class="scene-card-workflow-blocks"${renderHtmlAttributeString({
      'data-scene-card-workflow-context': context || 'scene-card',
      ...(attributes || {}),
    })}>
      ${workflowBlocks}
    </div>
  `;
}

function renderSceneCardBodyBlocks({
  context = '',
  threadPanel = null,
  relationRecord = {},
  executionChecklist = null,
  relationTitle = '与当前闭环关系',
  relationOptions = {},
  threadStateOptions = {},
  assessment = '',
  assessmentTitle = '当前判断',
  evidenceTitle = '执行证据',
  evidenceBody = '',
  nodeGuidance = null,
  middleHtml = '',
  middleAttributes = {},
  extraWorkflowBlocks = [],
  workflowAttributes = {},
  attributes = {},
} = {}) {
  const contextHtml = renderSceneCardContextBlocks({
    threadPanel,
    relationRecord,
    executionChecklist,
    context,
    relationTitle,
    relationOptions,
    threadStateOptions,
  });
  const workflowHtml = renderSceneCardWorkflowBlocks({
    context,
    assessment,
    assessmentTitle,
    evidenceTitle,
    evidenceBody,
    nodeGuidance,
    extraBlocks: extraWorkflowBlocks,
    attributes: workflowAttributes,
  });
  const normalizedMiddleHtml = typeof middleHtml === 'string' ? middleHtml : '';
  const middleBlockHtml = normalizedMiddleHtml
    ? `
      <div class="scene-card-body-middle"${renderHtmlAttributeString({
        'data-scene-card-body-middle-context': context || 'scene-card',
        ...(middleAttributes || {}),
      })}>
        ${normalizedMiddleHtml}
      </div>
    `
    : '';

  if (!contextHtml && !middleBlockHtml && !workflowHtml) {
    return '';
  }

  return `
    <div class="scene-card-body-blocks"${renderHtmlAttributeString({
      'data-scene-card-body-context': context || 'scene-card',
      ...(attributes || {}),
    })}>
      ${contextHtml}
      ${middleBlockHtml}
      ${workflowHtml}
    </div>
  `;
}

function buildExecutionWorkflowNodeProofCards(workflowGuidance = null) {
  const normalizedWorkflowGuidance =
    workflowGuidance && typeof workflowGuidance === 'object' ? workflowGuidance : null;
  const stateGuidance = buildThreadStateGuidance(normalizedWorkflowGuidance);

  return buildWorkflowNodeGuidanceCards(normalizedWorkflowGuidance, {
    fallbackLabel: stateGuidance.stateLabel,
    fallbackSummary: stateGuidance.stateSummary,
    fallbackTitlePrefix: '当前状态',
    leadingProgressItems: buildThreadStateGuidanceProgressItems(normalizedWorkflowGuidance),
    displayKind: 'execution-workflow-node',
    acceptanceKind: 'execution-node-acceptance',
    checkpointKind: 'execution-node-checkpoint-rule',
  }).cards;
}

function buildExecutionWorkflowNodeProofCard(workflowGuidance = null) {
  return buildExecutionWorkflowNodeProofCards(workflowGuidance).find(
    (card) => card.kind === 'execution-workflow-node',
  ) || { title: '', body: '', progressItems: [] };
}

function renderThreadStateGuidanceSections(threadPanel = {}, options = {}) {
  const guidance = buildThreadStateGuidance(threadPanel);
  if (!guidance.stateLabel && !guidance.stateSummary && !guidance.stateAction) {
    return '';
  }

  if (options.compact) {
    return `
      <div class="thread-focus-callout"${renderHtmlAttributeString({
        'data-thread-state-guidance': options.context || 'thread',
        ...(options.attributes || {}),
      })}>
        ${guidance.stateLabel ? `<strong>线程状态 · ${escapeHtml(guidance.stateLabel)}</strong>` : ''}
        ${guidance.stateSummary ? `<span>${escapeHtml(guidance.stateSummary)}</span>` : ''}
        ${guidance.stateAction ? `<span class="checklist-context-progress">这一步处理：${escapeHtml(guidance.stateAction)}</span>` : ''}
      </div>
    `;
  }

  const sectionAttributes = {
    'data-thread-state-guidance-context': options.context || 'thread',
  };

  const renderGuidanceBlock = (title, body, block) =>
    renderWorkflowNextSection(title, body, {
      attributes: {
        ...sectionAttributes,
        'data-thread-state-guidance-block': block,
      },
    });

  return `
    <div class="thread-state-guidance"${renderHtmlAttributeString({
      'data-thread-state-guidance': options.context || 'thread',
      ...(options.attributes || {}),
    })}>
      ${guidance.stateLabel ? renderGuidanceBlock('当前状态', guidance.stateLabel, 'state') : ''}
      ${guidance.stateSummary ? renderGuidanceBlock('状态说明', guidance.stateSummary, 'summary') : ''}
      ${guidance.stateAction ? renderGuidanceBlock('这一步处理', guidance.stateAction, 'action') : ''}
    </div>
  `;
}

function decisionAssessment(decision) {
  const signal = compact(decision?.signalLevel).toLowerCase();
  const status = compact(decision?.status).toLowerCase();
  if (['approved', 'resolved'].includes(status)) {
    return '这条决策已经完成拍板，当前主要用于回看审计。';
  }
  if (signal === 'red') {
    return '这条红灯决策会阻塞当前线程继续推进，先拍板再继续。';
  }
  if (signal === 'yellow') {
    return '这条黄灯决策已被显式挂起，系统会先绕行其他安全步骤。';
  }
  return '这条决策当前不会阻塞主链路，但仍需要明确收口。';
}

function renderDocumentOutline(outline = []) {
  if (!Array.isArray(outline) || outline.length === 0) {
    return `<div class="muted">当前文档还没有可导航的标题结构。</div>`;
  }

  return `
    <div class="doc-outline-list">
      ${outline
        .map(
          (entry) => `
            <a class="doc-outline-link level-${escapeHtml(String(entry.level || 1))}" href="#${escapeHtml(entry.anchorId)}">
              ${escapeHtml(entry.title)}
            </a>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderDecisionActionCard(decision, workflow = null, executionChecklist = null, threadPanel = null) {
  const actions = [
    { status: 'approved', label: '允许继续' },
    { status: 'changes_requested', label: '要求修改' },
    { status: 'retry_requested', label: '要求重跑' },
    { status: 'stopped', label: '停止任务' },
  ];
  const evidenceSummary = summarizeEvidenceRefs(decision.evidenceRefs);
  const nodeGuidance = buildDecisionNodeGuidance(decision, workflow);
  const detailGrid = renderMetaGrid([
    { label: '为什么现在处理', value: decision.whyNow },
    { label: '需要你做什么', value: decision.requestedHumanAction },
    { label: '影响范围', value: decision.impactScope },
    { label: '建议方案', value: decision.recommendedOption || decision.recommendation },
    { label: '证据', value: evidenceSummary },
    { label: '截止时间', value: decision.dueAt ? formatIso(decision.dueAt) : '' },
  ]);
  const sceneBodyBlocks = renderSceneCardBodyBlocks({
    context: 'decision-card',
    threadPanel,
    relationRecord: nodeGuidance,
    executionChecklist,
    assessment: decisionAssessment(decision),
    evidenceTitle: '决策证据',
    evidenceBody: evidenceSummary,
    nodeGuidance,
  });

  return `
    <article class="decision-action-card tone-${escapeHtml(toneFromState(decision.signalLevel, decision.status))}" data-decision-card>
      <div class="decision-action-top">
        <span class="decision-action-badge">${escapeHtml(String(decision.signalLevel || 'green').toUpperCase())}</span>
        <span class="decision-action-status">${escapeHtml(humanDecisionStatus(decision.status))}</span>
      </div>
      <h4>${escapeHtml(decision.question || '待处理决策')}</h4>
      <p>${escapeHtml(decision.recommendation || decision.context || decision.requestedHumanAction || '等待拍板。')}</p>
      ${sceneBodyBlocks}
      ${detailGrid}
      <div class="thread-task-links">
        ${
          decision.sourceUrl
            ? `<a class="thread-event-link" href="${escapeHtml(decision.sourceUrl)}" target="_blank" rel="noreferrer">打开原始上下文</a>`
            : ''
        }
        <a class="thread-event-link" href="#task-flow">查看任务流转</a>
      </div>
      <div data-thread-inline-action-box="decision">
        <textarea class="decision-note" data-decision-note="${escapeHtml(decision.decisionId)}" data-thread-inline-action-note="decision" placeholder="补充处理说明（可选）">${escapeHtml(decision.decisionNote || '')}</textarea>
        <div class="decision-action-buttons" data-thread-inline-action-list="decision">
          ${actions
            .map(
              (action) => `
                <button type="button" data-decision-action="${escapeHtml(action.status)}" data-decision-id="${escapeHtml(decision.decisionId)}" data-thread-inline-action-button="${escapeHtml(action.status)}">
                  ${escapeHtml(action.label)}
                </button>
              `,
            )
            .join('')}
        </div>
      </div>
    </article>
  `;
}

function replyPlaceholderForComment(comment) {
  const bucket = compact(comment?.queueBucket).toLowerCase();
  if (bucket === 'triage') {
    return '先回复这条评论，再决定是仅记录、继续执行，还是升级成黄灯 / 红灯。';
  }
  if (bucket === 'ready') {
    return '补一句线程回复，说明接下来继续执行、修改或暂停的原因。';
  }
  if (bucket === 'rejected') {
    return '如果要改写这条被拦截的评论，可以先在这里补一句新的回复。';
  }
  return '补一句线程回复或审计备注（可选）。';
}

function commentAssessmentForBucket(comment) {
  const bucket = compact(comment?.queueBucket).toLowerCase();
  const inboxStatus = compact(comment?.inboxStatusLabel).toLowerCase();
  if (bucket === 'triage') {
    if (inboxStatus.includes('稍后处理')) {
      return '这条评论已暂缓处理，当前仍停在 triage，后续需要重新打开或直接处理完。';
    }
    return '当前评论还停在 triage，还没有安全地接回执行链。';
  }
  if (bucket === 'ready') {
    return '这条评论已经接回执行链，下一步重点是确认 agent 是否继续往前跑。';
  }
  if (bucket === 'rejected') {
    return '这条评论被规则拦截，当前不会直接进入执行。';
  }
  if (bucket === 'resolved') {
    if (inboxStatus.includes('已归档')) {
      return '这条评论已归档到历史层，当前主要用于回看和审计。';
    }
    if (inboxStatus.includes('已处理')) {
      return '这条评论已人工处理完，当前主要用于回看和审计。';
    }
    return '这条评论已经进入历史层，当前主要用于回看和审计。';
  }
  return '当前评论还没有形成更明确的执行判断。';
}

function buildCommentEvidenceSummary(comment) {
  const segments = [
    compact(comment?.flowCountsLabel),
    compact(comment?.latestRunStatusLabel) ? `最近 Run：${compact(comment.latestRunStatusLabel)}` : '',
    compact(comment?.latestReceiptLabel) ? `最近回执：${compact(comment.latestReceiptLabel)}` : '',
    compact(comment?.latestCheckpointSummary) ? `最近 Checkpoint：${summarize(comment.latestCheckpointSummary, 72)}` : '',
  ].filter(Boolean);

  return segments.join('；');
}

function renderCommentAuditTrail(comment) {
  const normalizedComment = normalizeThreadCommentItem(comment || {});
  const items = Array.isArray(normalizedComment.collaborationAuditItems)
    ? normalizedComment.collaborationAuditItems
    : [];
  if (items.length === 0) {
    return renderWorkflowNextSection(
      '协同审计',
      '当前还没有额外协同留痕，这条评论目前主要沿执行链继续推进。',
      { context: 'comment-thread-card', block: 'audit-trail' },
    );
  }

  return renderWorkflowNextSection(
    '协同审计',
    normalizedComment.collaborationAuditSummary || `${items.length} 条协同记录`,
    {
      context: 'comment-thread-card',
      block: 'audit-trail',
      extraHtml: `
        <div class="comment-audit-list" data-comment-audit-list>
          ${items
            .map(
              (item) => `
                <article
                  class="comment-audit-item tone-${escapeHtml(item.tone || 'green')}"
                  data-comment-audit-item="${escapeHtml(item.kind || 'collaboration')}"
                >
                  <div class="comment-audit-top">
                    <span class="comment-audit-badge">${escapeHtml(item.kindLabel || '协同记录')}</span>
                    <span class="thread-event-time">${escapeHtml(item.timeLabel || '未记录')}</span>
                  </div>
                  <strong>${escapeHtml(item.summary || item.kindLabel || '未记录内容')}</strong>
                  ${
                    item.detail
                      ? `<span class="comment-audit-detail">${escapeHtml(item.detail)}</span>`
                      : ''
                  }
                  <div class="comment-audit-meta">
                    ${item.statusLabel ? `<span>${escapeHtml(item.statusLabel)}</span>` : ''}
                    ${item.ownerAgent ? `<span>负责人：${escapeHtml(item.ownerAgent)}</span>` : ''}
                    ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">原始位置</a>` : ''}
                  </div>
                </article>
              `,
            )
            .join('')}
        </div>
      `,
    },
  );
}

function renderCommentThreadCard(comment, executionChecklist = null, threadPanel = null) {
  comment = normalizeThreadCommentItem(comment || {});
  const canDispatchFollowup =
    compact(comment.executionPolicy).toLowerCase() === 'enqueue' && comment.commandId && comment.ownerAgent;
  const canPromoteFromTriage =
    !['enqueue', 'log_only'].includes(compact(comment.executionPolicy).toLowerCase()) && comment.commandId && comment.ownerAgent;
  const canReplyInline = Boolean(comment.commandId);
  const assessment = commentAssessmentForBucket(comment);
  const evidenceSummary = buildCommentEvidenceSummary(comment);
  const sceneBodyBlocks = renderSceneCardBodyBlocks({
    context: 'comment-thread-card',
    threadPanel,
    relationRecord: comment,
    executionChecklist,
    assessment,
    evidenceBody: evidenceSummary,
    nodeGuidance: pickWorkflowNodeGuidance(comment),
    extraWorkflowBlocks: [
      renderCommentAuditTrail(comment),
      renderWorkflowNextSection('下一步', comment.nextAction, { context: 'comment-thread-card', block: 'next-action' }),
    ],
  });

  return `
    <article
      id="${escapeHtml(commentAnchorId(comment))}"
      class="comment-thread-card tone-${escapeHtml(comment.tone || 'green')}"
      data-comment-thread-card
      data-comment-bucket="${escapeHtml(comment.queueBucket || 'resolved')}"
    >
      <div class="thread-event-top">
        <span class="thread-event-badge">评论</span>
        <span class="thread-event-time">${escapeHtml(comment.commandStatusLabel)}</span>
      </div>
      <h4>${escapeHtml(comment.title)}</h4>
      <p>${escapeHtml(comment.summary)}</p>
      ${sceneBodyBlocks}
      ${renderMetaGrid([
        { label: '关联子任务', value: comment.relatedTaskLabel },
        { label: '与当前聚焦关系', value: comment.focusRelationLabel },
        { label: '队列分组', value: comment.queueBucketLabel },
        { label: '语义判定', value: comment.intentLabel },
        { label: '执行策略', value: comment.executionPolicyLabel },
        { label: '任务状态', value: comment.taskStateLabel },
        { label: 'Triage 状态', value: comment.inboxStatusLabel },
        { label: '流转统计', value: comment.flowCountsLabel },
        { label: '后续派生动作', value: comment.latestDerivedCommandLabel },
        { label: '置信度', value: comment.confidenceLabel },
        { label: '判定原因', value: comment.reasonLabel },
        { label: '最近 Run', value: comment.latestRunStatusLabel },
        { label: '最近回执', value: comment.latestReceiptLabel },
        { label: '回执摘要', value: comment.latestReceiptSummary },
        { label: '最近 Checkpoint', value: comment.latestCheckpointStatusLabel },
        { label: 'Checkpoint 摘要', value: comment.latestCheckpointSummary },
      ])}
      <div class="thread-task-links">
        ${comment.sourceUrl ? `<a class="thread-event-link" href="${escapeHtml(comment.sourceUrl)}" target="_blank" rel="noreferrer">打开原始评论</a>` : ''}
        ${comment.relatedTaskHref ? `<a class="thread-event-link" href="${escapeHtml(comment.relatedTaskHref)}">跳到关联子任务</a>` : ''}
        <a class="thread-event-link" href="#task-flow">查看任务流转</a>
        ${comment.ownerAgent ? `<span class="muted">负责人：${escapeHtml(comment.ownerAgent)}</span>` : ''}
      </div>
      ${
        canReplyInline || canDispatchFollowup || canPromoteFromTriage
          ? `
            <div data-thread-inline-action-box="comment">
              ${
                canReplyInline
                  ? `
                    <textarea
                      class="workflow-note"
                      data-comment-reply-note="${escapeHtml(comment.commandId)}"
                      data-comment-note="${escapeHtml(comment.commandId)}"
                      data-comment-promote-note="${escapeHtml(comment.commandId)}"
                      data-thread-inline-action-note="comment"
                      placeholder="${escapeHtml(replyPlaceholderForComment(comment))}"
                    ></textarea>
                    <div class="decision-action-buttons" data-thread-inline-action-list="comment-reply">
                      <button
                        type="button"
                        data-comment-reply-mode="comment"
                        data-command-id="${escapeHtml(comment.commandId)}"
                        data-owner-agent="${escapeHtml(comment.ownerAgent || '')}"
                        data-comment-title="${escapeHtml(comment.title)}"
                        data-comment-summary="${escapeHtml(comment.summary)}"
                        data-thread-inline-action-button="comment"
                      >
                        发送回复
                      </button>
                    </div>
                  `
                  : ''
              }
              ${
                canDispatchFollowup
                  ? `
                    <div class="decision-action-buttons" data-thread-inline-action-list="comment-command">
                      <button type="button" data-comment-command-action="continue" data-command-id="${escapeHtml(comment.commandId)}" data-owner-agent="${escapeHtml(comment.ownerAgent)}" data-thread-inline-action-button="continue">继续执行</button>
                      <button type="button" data-comment-command-action="improve" data-command-id="${escapeHtml(comment.commandId)}" data-owner-agent="${escapeHtml(comment.ownerAgent)}" data-thread-inline-action-button="improve">要求修改</button>
                      <button type="button" data-comment-command-action="retry" data-command-id="${escapeHtml(comment.commandId)}" data-owner-agent="${escapeHtml(comment.ownerAgent)}" data-thread-inline-action-button="retry">重新执行</button>
                      <button type="button" data-comment-command-action="stop" data-command-id="${escapeHtml(comment.commandId)}" data-owner-agent="${escapeHtml(comment.ownerAgent)}" data-thread-inline-action-button="stop">停止任务</button>
                    </div>
                  `
                  : ''
              }
              ${
                canPromoteFromTriage
                  ? `
                    <div class="decision-action-buttons" data-thread-inline-action-list="comment-promote">
                      <button type="button" data-comment-promote-action="continue" data-command-id="${escapeHtml(comment.commandId)}" data-owner-agent="${escapeHtml(comment.ownerAgent)}" data-thread-inline-action-button="continue">补充后继续</button>
                      <button type="button" data-comment-escalate-mode="yellow" data-command-id="${escapeHtml(comment.commandId)}" data-owner-agent="${escapeHtml(comment.ownerAgent)}" data-comment-summary="${escapeHtml(comment.summary)}" data-thread-inline-action-button="yellow">补充后挂黄灯</button>
                      <button type="button" data-comment-escalate-mode="red" data-command-id="${escapeHtml(comment.commandId)}" data-owner-agent="${escapeHtml(comment.ownerAgent)}" data-comment-summary="${escapeHtml(comment.summary)}" data-thread-inline-action-button="red">补充后发红灯</button>
                    </div>
                  `
                  : ''
              }
            </div>
          `
          : ''
      }
      ${
        comment.inboxItemId && comment.availableActions.length > 0
          ? `
            <div data-thread-inline-action-box="inbox">
              <div class="decision-action-buttons" data-thread-inline-action-list="inbox">
              ${comment.availableActions
                .map(
                  (action) => `
                    <button type="button" data-inbox-action="${escapeHtml(action.action)}" data-inbox-id="${escapeHtml(comment.inboxItemId)}" data-thread-inline-action-button="${escapeHtml(action.action)}">
                      ${escapeHtml(action.label)}
                    </button>
                  `,
                )
                .join('')}
              </div>
            </div>
          `
          : ''
      }
    </article>
  `;
}

function renderCommentFocusCard(comment, commentSummary = {}, executionChecklist = null, threadPanel = null, options = {}) {
  const normalizedCommentSummary = normalizeCommentSummary(commentSummary || {});
  const normalizedComment = comment ? normalizeThreadCommentItem(comment) : null;
  const selectedFocus =
    options.selectedFocus ||
    normalizedCommentSummary?.selectedFocus ||
    normalizedCommentSummary?.defaultFocus ||
    {};
  const className = ['workflow-card', 'comment-focus-card', options.className, !normalizedComment ? 'is-empty' : '']
    .filter(Boolean)
    .join(' ');
  const attributeString = renderHtmlAttributeString({
    'data-comment-focus-entry': true,
    ...(options.attributes || {}),
  });

  if (!normalizedComment) {
    const emptyNextAction =
      compact(selectedFocus?.value).toLowerCase() === 'resolved'
        ? '可以继续回看历史层审计，或切回待分流 / 已接回执行查看当前入口。'
        : '可以切回其他评论分组，或等待新的评论进入这一层。';
    const emptySceneBodyBlocks = renderSceneCardBodyBlocks({
      context: 'comment-focus-empty',
      threadPanel,
      relationRecord: {},
      executionChecklist,
      assessment: '当前筛选里暂时没有可展开的评论节点，适合切回其他分组，或等待新的评论进入这一层。',
      extraWorkflowBlocks: [
        renderWorkflowNextSection('下一步', emptyNextAction, { context: 'comment-focus-empty', block: 'next-action' }),
      ],
    });
    return `
      <article class="${escapeHtml(className)}"${attributeString}>
        <div class="thread-event-top">
          <span class="thread-event-badge">${escapeHtml(selectedFocus.label || '评论聚焦')}</span>
          <span class="thread-event-time">暂无匹配评论</span>
        </div>
      <h4>${escapeHtml(selectedFocus.headline || '当前评论节点')}</h4>
      <p>${escapeHtml(selectedFocus.detail || '这里会先解释当前筛选层为什么值得优先看。')}</p>
      ${emptySceneBodyBlocks}
        <div class="thread-task-links">
          <a class="thread-event-link" href="#comment-threads">回到评论线程列表</a>
          <a class="thread-event-link" href="#task-flow">查看任务流转</a>
        </div>
      </article>
    `;
  }

  const sceneBodyBlocks = renderSceneCardBodyBlocks({
    context: 'comment-focus-card',
    threadPanel,
    relationRecord: normalizedComment || {},
    executionChecklist,
    assessment: commentAssessmentForBucket(normalizedComment),
    nodeGuidance: pickWorkflowNodeGuidance(normalizedComment),
    extraWorkflowBlocks: [
      renderWorkflowNextSection('下一步', normalizedComment.nextAction || '等待下一步。', {
        context: 'comment-focus-card',
        block: 'next-action',
      }),
    ],
  });

  return `
    <article class="${escapeHtml(className)}"${attributeString}>
      <div class="thread-event-top">
        <span class="thread-event-badge">${escapeHtml(normalizedComment.queueBucketLabel || '评论聚焦')}</span>
        <span class="thread-event-time">${escapeHtml(normalizedComment.commandStatusLabel || '未记录')}</span>
      </div>
      <h4>${escapeHtml(selectedFocus.headline || '当前评论节点')}</h4>
      <p>${escapeHtml(selectedFocus.detail || normalizedComment.summary || '这里会先解释当前筛选里最值得处理的那条评论为什么在前面。')}</p>
      ${sceneBodyBlocks}
      <div class="thread-task-links">
        ${normalizedComment.sourceUrl ? `<a class="thread-event-link" href="${escapeHtml(normalizedComment.sourceUrl)}" target="_blank" rel="noreferrer">打开原始评论</a>` : ''}
        <a class="thread-event-link" href="#task-flow">查看任务流转</a>
      </div>
    </article>
  `;
}

function renderCommentFocusPanel(commentFocusMap = {}, commentSummary = {}, executionChecklist = null, threadPanel = null) {
  const normalizedCommentSummary = normalizeCommentSummary(commentSummary || {});
  const selectedFilter = normalizeCommentFilterValue(
    normalizedCommentSummary?.selectedFilter || normalizedCommentSummary?.defaultFilter || 'all',
  );
  const orderedFilters = Array.from(
    new Set(
      (Array.isArray(normalizedCommentSummary?.filters) && normalizedCommentSummary.filters.length > 0
        ? normalizedCommentSummary.filters.map((filter) => normalizeCommentFilterValue(filter?.value || filter))
        : Object.keys(commentFocusMap).map((filter) => normalizeCommentFilterValue(filter))).filter(Boolean),
    ),
  );
  const filters = orderedFilters.length > 0 ? orderedFilters : ['all'];

  return `
    <div data-comment-focus-card>
      ${filters
        .map((filterValue) => {
          const focusEntry = commentFocusMap?.[filterValue] || {};
          const selectedFocus =
            focusEntry.selectedFocus ||
            focusEntry.selected_focus ||
            buildCommentFilterDescriptor(filterValue, commentSummary || {});
          return renderCommentFocusCard(
            focusEntry.comment || null,
            {
              ...normalizedCommentSummary,
              selectedFocus,
              selected_focus: selectedFocus,
            },
            executionChecklist,
            threadPanel,
            {
              className: filterValue === selectedFilter ? '' : 'is-hidden',
              selectedFocus,
              attributes: {
                'data-comment-focus-for': filterValue,
              },
            },
          );
        })
        .join('')}
    </div>
  `;
}

function renderThreadEvent(event, threadPanel = null) {
  const checklistRelationCallout = renderChecklistRelationCallout(event, {
    context: 'thread-event-card',
    attributes: {
      'data-scene-card-context-block': 'checklist-relation',
    },
  });
  return `
    <article class="thread-event tone-${escapeHtml(event.tone || 'green')}" data-thread-event-card>
      <div class="thread-event-top">
        <span class="thread-event-badge">${escapeHtml(event.badge || event.kind)}</span>
        <span class="thread-event-time">${escapeHtml(formatIso(event.timestamp))}</span>
      </div>
      <h4>${escapeHtml(event.title || '未命名事件')}</h4>
      <p>${escapeHtml(event.summary || '暂无说明')}</p>
      ${renderThreadStateSceneBlock(threadPanel, 'thread-event-card', { compact: true })}
      ${checklistRelationCallout}
      ${
        event.meta?.length
          ? `<ul class="thread-event-meta">${event.meta.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
          : ''
      }
      ${
        event.link || event.relatedTaskHref
          ? `
              <div class="thread-task-links">
                ${
                  event.link
                    ? `<a class="thread-event-link" href="${escapeHtml(event.link)}" target="_blank" rel="noreferrer">打开关联位置</a>`
                    : ''
                }
                ${
                  event.relatedTaskHref
                    ? `<a class="thread-event-link" href="${escapeHtml(event.relatedTaskHref)}">跳到关联子任务</a>`
                    : ''
                }
              </div>
            `
          : ''
      }
    </article>
  `;
}

function buildThreadEventSummary(threadDetail = {}) {
  const events = Array.isArray(threadDetail.events) ? threadDetail.events : [];
  const counts = threadDetail.counts && typeof threadDetail.counts === 'object' ? threadDetail.counts : {};
  if (events.length === 0) {
    return '当前线程还没有可展示的执行事件，等新的命令、Run、回执或 Checkpoint 进入后，这里会自动形成可审计的时间线。';
  }

  const latestEvent = events[0] || {};
  const latestLabel = compact(latestEvent.badge || latestEvent.kind || latestEvent.title) || '最近事件';
  return `当前线程已投影 ${events.length} 个事件，最近一条是 ${latestLabel}，适合回看命令、Run、回执与 Checkpoint 是否已经串成可审计的执行闭环。`;
}

function renderExecutionChecklistCard(executionChecklist, threadPanel = null) {
  if (!executionChecklist) {
    return '';
  }

  const items = Array.isArray(executionChecklist.items) ? executionChecklist.items : [];

  return `
    <article class="workflow-card checklist-overview-card" data-execution-checklist-card>
      <div class="thread-event-top">
        <span class="thread-event-badge">Checklist</span>
        <span class="thread-event-time">${escapeHtml(executionChecklist.summary || '')}</span>
      </div>
      <h4>${escapeHtml(executionChecklist.title || '执行 Checklist')}</h4>
      <p>${escapeHtml(executionChecklist.focusSummary || '当前工作台会把主闭环、验收条件和推进规则直接显示在这里。')}</p>
      ${renderSceneCardBodyBlocks({
        context: 'execution-checklist-card',
        threadPanel,
        middleHtml: `
          <div class="checklist-progress" data-checklist-progress>
            <div class="checklist-progress-top" data-checklist-progress-top>
              <strong data-checklist-progress-label>闭环进度</strong>
              <span data-checklist-progress-value>${escapeHtml(String(executionChecklist.progressPercent || 0))}% · ${escapeHtml(executionChecklist.progressLabel || '')}</span>
            </div>
            <div class="checklist-progress-bar" data-checklist-progress-bar>
              <span data-checklist-progress-fill style="width:${escapeHtml(String(executionChecklist.progressPercent || 0))}%"></span>
            </div>
          </div>
          ${renderMetaGrid(
            [
              { key: 'focus-title', label: '当前主闭环', value: executionChecklist.focusTitle },
              {
                key: 'focus-status',
                label: '当前焦点状态',
                value: executionChecklist.focusStepNumber
                  ? `第 ${executionChecklist.focusStepNumber} 步 · ${executionChecklist.focusStatusLabel || '未记录'}`
                  : executionChecklist.focusStatusLabel,
              },
              {
                key: 'evidence',
                label: '最近证据',
                value: executionChecklist.focusEvidenceLabel
                  ? executionChecklist.focusEvidenceUpdatedAt
                    ? `${executionChecklist.focusEvidenceLabel} · ${formatIso(executionChecklist.focusEvidenceUpdatedAt)}`
                    : executionChecklist.focusEvidenceLabel
                  : '',
              },
              { key: 'acceptance', label: '验收条件', value: executionChecklist.nextAcceptance },
              { key: 'checkpoint-rule', label: '推进规则', value: executionChecklist.checkpointRule },
              { key: 'heartbeat-note', label: '自动唤醒', value: executionChecklist.heartbeatNote },
            ],
            {
              context: 'execution-checklist-card',
            },
          )}
          ${
            executionChecklist.focusHref
              ? `<a class="thread-event-link" data-checklist-focus-link href="${escapeHtml(executionChecklist.focusHref)}">${escapeHtml(executionChecklist.focusLinkLabel || '打开当前主闭环')}</a>`
              : ''
          }
          ${
            executionChecklist.focusContextLinks?.length
              ? `
                <div class="checklist-remaining" data-checklist-context-links="focus">
                  <span data-checklist-context-title>${escapeHtml(executionChecklist.focusContextTitle || '优先清理')}</span>
                  ${executionChecklist.focusContextLinks
                    .map(
                      (item) => `<a class="thread-event-link" data-checklist-context-link href="${escapeHtml(item.href || '#')}">${escapeHtml(item.label || '')}</a>`,
                    )
                    .join('')}
                </div>
              `
              : ''
          }
          ${
            executionChecklist.revisitContextLinks?.length
              ? `
                <div class="checklist-remaining" data-checklist-context-links="revisit">
                  <span data-checklist-context-title>${escapeHtml(executionChecklist.revisitContextTitle || '优先回看')}</span>
                  ${executionChecklist.revisitContextLinks
                    .map(
                      (item) => `<a class="thread-event-link" data-checklist-context-link href="${escapeHtml(item.href || '#')}">${escapeHtml(item.label || '')}</a>`,
                    )
                    .join('')}
                </div>
              `
              : ''
          }
          <div class="checklist-kpis" data-checklist-kpis>
            <span data-checklist-kpi="completed">${escapeHtml(String(executionChecklist.completedCount || 0))} 已完成</span>
            <span data-checklist-kpi="in-progress">${escapeHtml(String(executionChecklist.inProgressCount || 0))} 进行中</span>
            <span data-checklist-kpi="pending">${escapeHtml(String(executionChecklist.pendingCount || 0))} 待执行</span>
          </div>
          ${
            executionChecklist.remainingItems?.length
              ? `
                <div class="checklist-remaining" data-checklist-context-links="remaining">
                  ${executionChecklist.remainingItems
                    .map(
                      (item) => `<span data-checklist-context-item>${escapeHtml(item.statusLabel || '')} · ${escapeHtml(item.title || '')}</span>`,
                    )
                    .join('')}
                </div>
              `
              : ''
          }
          ${
            items.length > 0
              ? `
                <div class="checklist-mini-grid" data-checklist-mini-grid>
                  ${items
                    .map(
                      (item) => `
                        <a
                          class="checklist-mini-item status-${escapeHtml(item.status || 'pending')}"
                          data-checklist-mini-item
                          data-checklist-mini-status="${escapeHtml(item.status || 'pending')}"
                          href="${escapeHtml(item.href || '#')}"
                        >
                          <div class="checklist-mini-top">
                            <em data-checklist-mini-step>闭环 ${escapeHtml(String(item.stepNumber || ''))}${item.isFocus ? ' · 当前焦点' : ''}</em>
                            <span data-checklist-mini-label>${escapeHtml(item.statusLabel || '')}</span>
                          </div>
                          <strong data-checklist-mini-title>${escapeHtml(item.title || '未命名闭环')}</strong>
                          <span data-checklist-mini-summary>${escapeHtml(item.progressNote || item.summary || '')}</span>
                          ${
                            item.evidenceLabel
                              ? `<span data-checklist-mini-evidence>最近证据：${escapeHtml(item.evidenceLabel)}${item.evidenceUpdatedAt ? ` · ${escapeHtml(formatIso(item.evidenceUpdatedAt))}` : ''}</span>`
                              : ''
                          }
                        </a>
                      `,
                    )
                    .join('')}
                </div>
              `
              : ''
          }
        `,
        middleAttributes: {
          'data-scene-card-body-middle': 'execution-checklist-details',
        },
      })}
    </article>
  `;
}

function renderChecklistFocusStrip(executionChecklist, options = {}) {
  if (!executionChecklist) {
    return '';
  }

  const guidanceModel =
    (options.guidanceModel && typeof options.guidanceModel === 'object'
      ? options.guidanceModel
      : executionChecklist.focus_guidance || executionChecklist.focusGuidance) ||
    buildExecutionFocusGuidanceModel(executionChecklist, options);
  const actionQueueHtml = renderExecutionGuideQueue(guidanceModel.actionQueue || options.actionQueue);
  const focusProofCards = (guidanceModel.proofCards || [])
    .map((card) =>
      renderChecklistFocusProofCard({
        title: card.title,
        body: card.body,
        progressItems: card.progressItems,
        links: card.links,
        attributes: { 'data-focus-proof-kind': card.kind },
      }),
    )
    .filter(Boolean)
    .join('');

  return `
    <section class="panel checklist-focus-strip" id="execution-focus-strip" data-execution-focus-strip>
      <div class="checklist-focus-main">
        <span class="checklist-focus-eyebrow">${escapeHtml(guidanceModel.eyebrow || '当前主闭环')}</span>
        <h2>${escapeHtml(guidanceModel.title || executionChecklist.focusTitle || executionChecklist.title || '当前没有主闭环')}</h2>
        <p>${escapeHtml(guidanceModel.summary || executionChecklist.focusSummary || executionChecklist.summary || '当前还没有新的闭环焦点。')}</p>
        <div class="checklist-focus-pills">
          ${(guidanceModel.pills || []).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="checklist-focus-actions">
          ${(guidanceModel.actions || [])
            .map(
              (item) => `<a class="thread-event-link" href="${escapeHtml(item.href)}"${item.target ? ` target="${escapeHtml(item.target)}"` : ''}${
                item.rel ? ` rel="${escapeHtml(item.rel)}"` : ''
              }>${escapeHtml(item.label)}</a>`,
            )
            .join('')}
        </div>
      </div>
      <div class="checklist-focus-side">
        ${focusProofCards}
      </div>
      ${actionQueueHtml}
    </section>
  `;
}

function renderExecutionGuideQueue(actionQueue = []) {
  const items = Array.isArray(actionQueue) ? actionQueue.filter(Boolean).slice(0, 6) : [];
  if (items.length === 0) {
    return '';
  }

  return `
    <div class="focus-guide-queue" data-execution-guide-queue>
      ${items
        .map(
          (item) => `
            <article class="focus-guide-card tone-${escapeHtml(item.tone || 'neutral')}">
              <div class="focus-guide-top">
                <span class="focus-guide-badge">${escapeHtml(item.badge || '执行引导')}</span>
                <span class="checklist-context-progress">当前执行引导</span>
              </div>
              <h3>${escapeHtml(item.title || '继续处理')}</h3>
              <p>${escapeHtml(item.detail || '打开对应现场继续处理。')}</p>
              <a class="thread-event-link" href="${escapeHtml(item.href || '#')}">${escapeHtml(item.hrefLabel || '继续处理')}</a>
            </article>
          `,
        )
        .join('')}
    </div>
  `;
}

const MEMORY_FOCUS_LABEL_PRIORITY = ['当前主闭环', '优先回看', '历史层治理'];
const MEMORY_SECTION_PRIORITY = ['candidate', 'review', 'suggestion'];

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
    sourceCount,
    evidenceCount,
    sourceDelta,
    evidenceDelta,
    newSourcesAfterHuman,
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
    } else {
      pieces.push(`${sourceType}：已挂 source`);
    }
  }

  if (sources.length > 2) {
    pieces.push(`另有 ${sources.length - 2} 条 source`);
  }

  return pieces.join('；');
}

function resolveMemoryCardId(card) {
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

function hydrateMemoryGovernanceCard(card, engine) {
  if (!card || typeof card !== 'object') {
    return card;
  }

  const normalizedCard = normalizeMemoryGovernanceCard(card);
  const memoryId = resolveMemoryCardId(normalizedCard);
  if (!memoryId) {
    return normalizedCard;
  }

  const detail = engine.getMemory(memoryId);
  if (!detail?.memory) {
    return normalizeMemoryGovernanceCard({
      ...normalizedCard,
      memoryId,
    });
  }

  const memory = detail.memory;
  const sources = Array.isArray(detail.sources) ? detail.sources : [];
  const reviewerRecommendation =
    memory.metadata?.reviewer_recommendation ||
    normalizedCard.reviewerRecommendation ||
    null;
  const humanReview = memory.metadata?.human_review || null;
  const latestSource = pickLatestMemorySource(sources);
  const latestSourceAt = latestSource?.createdAt || latestSource?.created_at || '';
  const evidenceUpdatedAt = latestSourceAt || compact(memory.updatedAt || memory.createdAt);
  const evidenceSummary = buildMemoryEvidenceSummary(sources);
  const freshnessSummary = buildMemoryFreshnessSummary(
    memory,
    sources,
    normalizedCard.generatedAt || normalizedCard.generated_at,
  );
  const evidenceDeltaSummary = buildMemoryEvidenceDeltaSummary(sources, reviewerRecommendation, humanReview);
  const revalidationSummary = buildMemoryRevalidationSummary(
    memory,
    freshnessSummary,
    evidenceDeltaSummary,
    reviewerRecommendation,
    humanReview,
  );
  const nextMeta = [
    `生命周期：${humanMemoryLifecycle(memory.status)}`,
    `Review：${humanMemoryReviewState(memory.reviewState)}`,
    memory.confidence ? `置信度：${memory.confidence}` : null,
    `Freshness：${freshnessSummary.label}`,
    memory.sourceCount ? `Source：${memory.sourceCount} 条` : null,
    memory.ownerAgent ? `负责人：${memory.ownerAgent}` : null,
    memory.updatedAt ? `更新时间：${formatIso(memory.updatedAt)}` : null,
  ].filter(Boolean);
  const sourceAnchor = buildMemorySourceAnchor(sources);

  return normalizeMemoryGovernanceCard({
    ...normalizedCard,
    memoryId,
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
    evidenceSummary,
    freshnessLabel: freshnessSummary.label,
    freshnessDetail: freshnessSummary.detail,
    evidenceDeltaLabel: evidenceDeltaSummary.label,
    evidenceDeltaDetail: evidenceDeltaSummary.detail,
    revalidationLabel: revalidationSummary.label,
    revalidationDetail: revalidationSummary.detail,
    humanReviewSummary: summarizeHumanReview(humanReview),
    evidenceUpdatedAt,
    sourceAnchorLabel: sourceAnchor.label,
    sourceAnchorDetail: sourceAnchor.detail,
    sourceAnchorHref: sourceAnchor.href,
    sourceAnchorHrefLabel: sourceAnchor.hrefLabel,
    link:
      normalizedCard.link ||
      sourceAnchor.href ||
      sources[0]?.sourceUrl ||
      sources[0]?.source_url ||
      '',
    meta: nextMeta,
  });
}

function hydrateMemoryGovernance(memoryGovernance, engine, options = {}) {
  const value = normalizeMemoryGovernance(memoryGovernance);
  const generatedAt = compact(options.generatedAt || options.generated_at);
  return normalizeMemoryGovernance({
    ...value,
    candidateCards: value.candidateCards.map((card) =>
      hydrateMemoryGovernanceCard(
        {
          ...card,
          generatedAt,
          generated_at: generatedAt,
        },
        engine,
      ),
    ),
    reviewCards: value.reviewCards.map((card) =>
      hydrateMemoryGovernanceCard(
        {
          ...card,
          generatedAt,
          generated_at: generatedAt,
        },
        engine,
      ),
    ),
    suggestionCards: value.suggestionCards.map((card) =>
      normalizeMemoryGovernanceCard({
        ...card,
        generatedAt,
        generated_at: generatedAt,
      }),
    ),
  });
}

function buildMemoryGovernanceSections(memoryGovernance = {}) {
  const normalizedGovernance = normalizeMemoryGovernance(memoryGovernance);
  const counts = normalizedGovernance.counts || {};
  const rawSections = [
    {
      key: 'candidate',
      title: '记忆候选',
      anchorId: 'memory-candidates',
      cards: normalizedGovernance.candidateCards,
      count: Number(counts.candidates || 0),
      presentSummary: '先判断哪些 candidate 可以升成 durable memory，哪些还需要补 source / evidence / confidence。',
      emptySummary: '当前没有待确认的记忆候选，新的 checkpoint 提炼会继续回流到这里。',
      nextAction: '先做 candidate 级判断，再决定 accept、reject 或继续补证据。',
    },
    {
      key: 'review',
      title: 'Review 队列',
      anchorId: 'memory-reviews',
      cards: normalizedGovernance.reviewCards,
      count: Number(counts.reviews || 0),
      presentSummary: '这些 memory 已经进入 review，重点是尽快做 accept / reject / needs_followup，避免错误记忆进入 durable 层。',
      emptySummary: '当前没有待处理的 memory review 事项。',
      nextAction: '先清 review 队列，再决定哪些条目真正进入 durable memory。',
    },
    {
      key: 'suggestion',
      title: '相关 Suggestions',
      anchorId: 'memory-suggestions',
      cards: normalizedGovernance.suggestionCards,
      count: Number(counts.suggestions || 0),
      presentSummary: '这些 suggestion 还没有完全沉淀成 memory，可继续转成 candidate 或保留在文档层。',
      emptySummary: '当前没有需要继续跟进的 suggestions。',
      nextAction: '先确认 suggestion 该不该继续沉淀，再决定是否进入 candidate memory。',
    },
  ];

  return rawSections.map((section) =>
    normalizeMemoryGovernanceSection({
      ...section,
      summary: section.count > 0 ? section.presentSummary : section.emptySummary,
    }),
  );
}

function pickMemoryGovernanceFocus(sections = []) {
  const annotated = [];

  for (const section of sections) {
    for (const card of section.cards || []) {
      annotated.push({
        ...card,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionAnchorId: section.anchorId,
        sectionNextAction: section.nextAction,
      });
    }
  }

  if (annotated.length === 0) {
    return null;
  }

  return annotated.sort((left, right) => {
    const leftFocus = MEMORY_FOCUS_LABEL_PRIORITY.indexOf(compact(left.focusLabel));
    const rightFocus = MEMORY_FOCUS_LABEL_PRIORITY.indexOf(compact(right.focusLabel));
    const normalizedLeftFocus = leftFocus === -1 ? 99 : leftFocus;
    const normalizedRightFocus = rightFocus === -1 ? 99 : rightFocus;
    if (normalizedLeftFocus !== normalizedRightFocus) {
      return normalizedLeftFocus - normalizedRightFocus;
    }

    const leftSection = MEMORY_SECTION_PRIORITY.indexOf(compact(left.sectionKey));
    const rightSection = MEMORY_SECTION_PRIORITY.indexOf(compact(right.sectionKey));
    return (leftSection === -1 ? 99 : leftSection) - (rightSection === -1 ? 99 : rightSection);
  })[0];
}

function buildMemoryDocumentPanel(memoryGovernance = {}, executionChecklist = null) {
  const normalizedGovernance = normalizeMemoryGovernance(memoryGovernance);
  const sections = buildMemoryGovernanceSections(normalizedGovernance);
  const focusItem = pickMemoryGovernanceFocus(sections);
  const counts = normalizedGovernance.counts || {};
  const actionableCount = sections.reduce((sum, section) => sum + Number(section.count || 0), 0);
  const focusEvidence =
    focusItem?.evidenceDeltaLabel ||
    focusItem?.revalidationLabel ||
    focusItem?.evidenceSummary ||
    focusItem?.meta?.slice(0, 2).join('；') ||
    '';
  const focusSummary =
    compact(normalizedGovernance.summary) ||
    (actionableCount > 0
      ? '当前 reviewer 现场已经聚合了 candidate、review 与 suggestion 三类记忆治理压力。'
      : '当前没有待处理的记忆治理事项，继续按 checkpoint 规则沉淀即可。');

  return normalizeMemoryPanel({
    title: '记忆 reviewer 现场',
    subtitle:
      actionableCount > 0
        ? `${actionableCount} 条治理事项 · ${Number(counts.candidates || 0)} 条候选 · ${Number(counts.reviews || 0)} 条 review · ${Number(counts.suggestions || 0)} 条 suggestion`
        : '当前没有待处理的记忆治理事项。',
    summary: focusSummary,
    focusItem,
    focusTitle: focusItem?.title || '当前没有聚焦记忆',
    focusSectionTitle: focusItem?.sectionTitle || '',
    focusLabel: focusItem?.focusLabel || '',
    focusNote: focusItem?.focusNote || '',
    focusEvidence,
    focusEvidenceUpdatedAt: focusItem?.evidenceUpdatedAt || null,
    nextAction:
      focusItem?.sectionNextAction ||
      executionChecklist?.checkpointRule ||
      '关键 checkpoint 落定后再沉淀记忆，避免把临时上下文直接写成长记忆。',
    actionableCount,
    counts: {
      candidates: Number(counts.candidates || 0),
      reviews: Number(counts.reviews || 0),
      suggestions: Number(counts.suggestions || 0),
    },
    sections,
    docHref: normalizedGovernance.memoryDocHref || '',
  });
}

function buildMemoryFocusNodeGuidance(memoryPanel, executionChecklist) {
  const normalizedMemoryPanel = normalizeMemoryPanel(memoryPanel);
  const focusItem = normalizedMemoryPanel?.focusItem;
  if (!focusItem) {
    return null;
  }

  const sectionKey = compact(focusItem.sectionKey).toLowerCase();
  let nodeLabel = normalizedMemoryPanel?.focusSectionTitle || focusItem.badge || '记忆治理';
  let nodeSummary = compact(
    focusItem.reviewerRecommendationSummary || focusItem.summary || normalizedMemoryPanel?.summary,
  );
  let nodeDecision = compact(
    focusItem.nextStep || focusItem.sectionNextAction || normalizedMemoryPanel?.nextAction,
  );
  let nodeRule = executionChecklist?.checkpointRule || '关键 checkpoint 落定后再沉淀记忆，不把临时上下文直接写成长记忆。';

  if (sectionKey === 'suggestion') {
    nodeLabel = '当前治理节点 · Suggestion 沉淀';
    nodeSummary =
      compact(focusItem.summary) || '这条 suggestion 还没有真正进入 memory reviewer 判断，先决定是否值得转成 candidate memory。';
    nodeDecision =
      compact(focusItem.nextStep) || '先决定转成 candidate memory，还是明确记成“暂不沉淀”，避免 suggestion 一直停在只读状态。';
    nodeRule = 'Suggestion 只有在值得复用时才继续沉淀成 candidate memory；如果还只是临时讨论，就保留显式拒绝判断。';
  } else if (sectionKey === 'review') {
    nodeLabel = `当前治理节点 · Review${focusItem.reviewStateLabel ? ` · ${focusItem.reviewStateLabel}` : ''}`;
    nodeSummary =
      compact(focusItem.reviewerRecommendationSummary) ||
      '这条 memory 已进入 review，当前重点是做 accept、needs_followup 或 reject 判断。';
    nodeDecision =
      compact(focusItem.nextStep) || '先根据 reviewer 建议和最新 source / evidence 做 accept、继续补证据，或拒绝沉淀。';
    nodeRule = 'Review 阶段优先核对 source、evidence 和 freshness，再决定是否写进 durable 层，避免把旧结论直接固化。';
  } else {
    nodeLabel = `当前治理节点 · ${focusItem.memoryStatusLabel || focusItem.badge || '候选'}`;
    nodeSummary =
      compact(focusItem.reviewerRecommendationSummary || focusItem.summary) ||
      '这条 candidate 还需要判断是否足够稳定，值得继续升到 durable memory。';
    nodeDecision =
      compact(focusItem.nextStep) || '先判断 source / evidence / confidence 是否足够，再决定 accept、补证据或拒绝沉淀。';
    nodeRule = 'Candidate 还不等于 durable memory；至少要先确认来源稳定、证据够用，再继续沉淀。';
  }

  const evidenceSegments = [
    compact(focusItem.evidenceSummary),
    compact(focusItem.freshnessLabel),
    compact(focusItem.evidenceDeltaLabel),
    compact(focusItem.revalidationLabel),
  ].filter(Boolean);

  return {
    nodeLabel,
    nodeSummary,
    nodeDecision,
    nodeRule,
    nodeEvidence: evidenceSegments.join('；'),
  };
}

function resolveMemoryEvidenceContextLabel(memoryPanel) {
  const normalizedMemoryPanel = normalizeMemoryPanel(memoryPanel);
  const sectionKey = compact(normalizedMemoryPanel?.focusItem?.sectionKey).toLowerCase();
  if (sectionKey === 'candidate') {
    return '记忆候选区';
  }
  if (sectionKey === 'review') {
    return 'Review 队列';
  }
  if (sectionKey === 'suggestion') {
    return 'Suggestion 沉淀区';
  }
  return compact(normalizedMemoryPanel?.focusSectionTitle) || '记忆治理现场';
}

function buildExecutionFocusGuidanceModel(executionChecklist, options = {}) {
  if (!executionChecklist) {
    return buildChecklistFocusGuidanceModel();
  }

  const commentThreadCount = Number(options.commentThreadCount || 0);
  const openDecisionCount = Number(options.openDecisionCount || 0);
  const threadEventCount = Number(options.threadEventCount || 0);
  const workflowGuidance = options.workflowGuidance && typeof options.workflowGuidance === 'object' ? options.workflowGuidance : null;
  const focusStatus = executionChecklist.focusStepNumber
    ? `第 ${executionChecklist.focusStepNumber} 步 · ${executionChecklist.focusStatusLabel || '未记录'}`
    : executionChecklist.focusStatusLabel || '未记录';
  const progressLabel = `${String(executionChecklist.progressPercent || 0)}% · ${executionChecklist.progressLabel || ''}`;
  const directLinks = [
    { href: '#task-flow', label: '查看任务流转' },
    ...(commentThreadCount > 0 ? [{ href: '#comment-threads', label: `查看评论线程 · ${commentThreadCount} 条` }] : []),
    ...(openDecisionCount > 0 ? [{ href: '#quick-decisions', label: `查看快速拍板 · ${openDecisionCount} 条` }] : []),
  ];
  const focusEvidenceSummary = executionChecklist.focusEvidenceLabel
    ? executionChecklist.focusEvidenceUpdatedAt
      ? `${executionChecklist.focusEvidenceLabel} · ${formatIso(executionChecklist.focusEvidenceUpdatedAt)}`
      : executionChecklist.focusEvidenceLabel
    : '当前还没有新的焦点证据。';
  const workflowProofCards = buildExecutionWorkflowNodeProofCards(workflowGuidance);
  const workflowProofCard =
    workflowProofCards.find((card) => card.kind === 'execution-workflow-node') || buildExecutionWorkflowNodeProofCard(workflowGuidance);

  return buildChecklistFocusGuidanceModel({
    eyebrow: '当前主闭环',
    title: executionChecklist.focusTitle || executionChecklist.title || '当前没有主闭环',
    summary: executionChecklist.focusSummary || executionChecklist.summary || '当前还没有新的闭环焦点。',
    pills: [focusStatus, progressLabel, executionChecklist.remainingHeadline],
    actions: [
      executionChecklist.focusHref
        ? { href: executionChecklist.focusHref, label: executionChecklist.focusLinkLabel || '打开当前主闭环' }
        : null,
      executionChecklist.focusEvidenceHref
        ? { href: executionChecklist.focusEvidenceHref, label: '打开证据现场' }
        : null,
      executionChecklist.focusEvidenceSourceHref
        ? {
            href: executionChecklist.focusEvidenceSourceHref,
            label: executionChecklist.focusEvidenceSourceLabel || '打开源位置',
            targetBlank: true,
            rel: 'noreferrer',
          }
        : null,
    ],
    proofCards: [
      {
        kind: 'execution-direct-links',
        title: directLinks.length > 0 ? '现场直达' : '',
        body:
          directLinks.length > 0
            ? threadEventCount > 0
              ? `当前线程里已投影 ${threadEventCount} 个事件，可直接跳到最需要处理的现场。`
              : '可以直接从这里跳回当前线程的关键执行现场。'
            : '',
        links: directLinks,
      },
      {
        kind: 'execution-workflow-node',
        title: workflowProofCard.title,
        body: workflowProofCard.body,
        progressItems: workflowProofCard.progressItems,
      },
      ...workflowProofCards.filter((card) => card.kind !== 'execution-workflow-node'),
      {
        kind: 'execution-focus-evidence',
        title: '最近证据',
        body: focusEvidenceSummary,
        progressItems: [executionChecklist.focusEvidenceContextLabel ? `证据现场：${executionChecklist.focusEvidenceContextLabel}` : ''],
      },
      {
        kind: 'execution-next-acceptance',
        title: '下一条验收',
        body: executionChecklist.nextAcceptance || '当前没有额外验收说明。',
      },
      {
        kind: 'execution-checkpoint-rule',
        title: '推进规则',
        body: executionChecklist.checkpointRule || '关键 checkpoint 落定后再沉淀记忆。',
      },
      {
        kind: 'execution-focus-context',
        title: executionChecklist.focusContextLinks?.length ? executionChecklist.focusContextTitle || '优先清理' : '',
        links: executionChecklist.focusContextLinks,
      },
      {
        kind: 'execution-revisit-context',
        title: executionChecklist.revisitContextLinks?.length ? executionChecklist.revisitContextTitle || '优先回看' : '',
        links: executionChecklist.revisitContextLinks,
      },
    ],
    actionQueue: options.actionQueue,
  });
}

function buildMemoryFocusGuidanceModel(memoryPanel, executionChecklist, actionQueue = []) {
  if (!memoryPanel) {
    return buildChecklistFocusGuidanceModel();
  }

  const normalizedMemoryPanel = normalizeMemoryPanel(memoryPanel);
  const nodeGuidance = buildMemoryFocusNodeGuidance(normalizedMemoryPanel, executionChecklist);
  const focusEvidenceContextLabel = resolveMemoryEvidenceContextLabel(normalizedMemoryPanel);
  const focusEvidenceHref = normalizedMemoryPanel.focusItem?.sectionAnchorId
    ? `#${normalizedMemoryPanel.focusItem.sectionAnchorId}`
    : '';
  const focusEvidenceSourceHref = compact(normalizedMemoryPanel.focusItem?.link);
  const focusEvidenceUpdatedAt =
    normalizedMemoryPanel.focusEvidenceUpdatedAt || executionChecklist?.focusEvidenceUpdatedAt || '';

  return buildChecklistFocusGuidanceModel({
    eyebrow: '记忆 reviewer 现场',
    title: normalizedMemoryPanel.focusTitle || normalizedMemoryPanel.title,
    summary:
      normalizedMemoryPanel.summary || '这里会把 candidate / review / suggestion 统一投影到一个 reviewer 现场。',
    pills: [
      `候选 ${String(normalizedMemoryPanel.counts?.candidates || 0)}`,
      `Review ${String(normalizedMemoryPanel.counts?.reviews || 0)}`,
      `Suggestion ${String(normalizedMemoryPanel.counts?.suggestions || 0)}`,
      normalizedMemoryPanel.focusSectionTitle
        ? `当前队列 · ${normalizedMemoryPanel.focusSectionTitle}`
        : '',
      readChecklistStepLabel(normalizedMemoryPanel.focusItem || {}),
    ],
    actions: [
      focusEvidenceHref ? { href: focusEvidenceHref, label: '打开证据现场' } : null,
      focusEvidenceSourceHref ? { href: focusEvidenceSourceHref, label: '打开当前来源', targetBlank: true, rel: 'noreferrer' } : null,
      executionChecklist?.focusHref
        ? { href: executionChecklist.focusHref, label: executionChecklist.focusLinkLabel || '打开当前主闭环' }
        : null,
    ],
    proofCards: [
      {
        kind: 'memory-execution-relation',
        title: buildChecklistRelationTitle(normalizedMemoryPanel.focusItem || normalizedMemoryPanel),
        body: readChecklistFocusNote(normalizedMemoryPanel.focusItem || normalizedMemoryPanel),
        progressItems: [
          readChecklistProgressSummary(normalizedMemoryPanel.focusItem || normalizedMemoryPanel) ||
            (readChecklistProgressLabel(normalizedMemoryPanel.focusItem || normalizedMemoryPanel)
              ? `执行清单：${readChecklistProgressLabel(normalizedMemoryPanel.focusItem || normalizedMemoryPanel)}`
              : ''),
        ],
      },
      {
        kind: 'memory-node-guidance',
        title:
          nodeGuidance && (nodeGuidance.nodeLabel || nodeGuidance.nodeSummary || nodeGuidance.nodeEvidence)
            ? nodeGuidance.nodeLabel || '当前治理节点'
            : '',
        body: nodeGuidance?.nodeSummary,
        progressItems: [nodeGuidance?.nodeEvidence ? `最近治理证据：${nodeGuidance.nodeEvidence}` : ''],
      },
      {
        kind: 'memory-current-decision',
        title: '当前判断',
        body: normalizedMemoryPanel.nextAction,
      },
      {
        kind: 'memory-step-decision',
        title: '这一步判断',
        body: nodeGuidance?.nodeDecision,
      },
      {
        kind: 'memory-governance-rule',
        title: '治理规则',
        body: nodeGuidance?.nodeRule || executionChecklist?.checkpointRule || '关键 checkpoint 落定后再沉淀记忆，不把临时上下文直接写成长记忆。',
      },
      {
        kind: 'memory-focus-evidence',
        title: '最近证据',
        body:
          normalizedMemoryPanel.focusEvidence ||
          executionChecklist?.focusEvidenceLabel ||
          '当前还没有新的 reviewer 证据摘要。',
        progressItems: [
          focusEvidenceUpdatedAt ? `更新于 ${formatIso(focusEvidenceUpdatedAt)}` : '',
          focusEvidenceContextLabel ? `证据现场：${focusEvidenceContextLabel}` : '',
        ],
      },
    ],
    actionQueue,
  });
}

function renderMemoryGovernanceActionPanel(card, options = {}) {
  const normalizedCard = normalizeMemoryGovernanceCard(card || {});
  if (!normalizedCard?.memoryId) {
    return '';
  }

  const variantClass = compact(options.variant) === 'inline' ? ' memory-review-panel-inline' : '';
  return `
    <div
      class="memory-review-panel${escapeHtml(variantClass)}"
      data-memory-review-box
      data-memory-id="${escapeHtml(normalizedCard.memoryId)}"
      data-memory-inline-action-box="memory"
    >
      <div class="workflow-next">
        <strong>原生治理动作</strong>
        <span class="muted">${escapeHtml(normalizedCard.reviewerRecommendationSummary || '直接在这里完成 accept / reject / needs_followup，不必回旧的 dashboard 或评论链路。')}</span>
      </div>
      ${
        normalizedCard.reviewerRationale
          ? `
            <div class="thread-focus-callout">
              <strong>Reviewer 依据</strong>
              <span>${escapeHtml(normalizedCard.reviewerRationale)}</span>
            </div>
          `
          : ''
      }
      ${
        normalizedCard.evidenceSummary
          ? `
            <div class="thread-focus-callout">
              <strong>证据线索</strong>
              <span>${escapeHtml(normalizedCard.evidenceSummary)}</span>
            </div>
          `
          : ''
      }
      ${
        normalizedCard.freshnessLabel
          ? `
            <div class="thread-focus-callout">
              <strong>Freshness 体检</strong>
              <span>${escapeHtml(normalizedCard.freshnessLabel)}${normalizedCard.freshnessDetail ? ` · ${escapeHtml(normalizedCard.freshnessDetail)}` : ''}</span>
            </div>
          `
          : ''
      }
      ${
        normalizedCard.evidenceDeltaLabel
          ? `
            <div class="thread-focus-callout">
              <strong>证据变化</strong>
              <span>${escapeHtml(normalizedCard.evidenceDeltaLabel)}${normalizedCard.evidenceDeltaDetail ? ` · ${escapeHtml(normalizedCard.evidenceDeltaDetail)}` : ''}</span>
            </div>
          `
          : ''
      }
      ${
        normalizedCard.revalidationLabel
          ? `
            <div class="thread-focus-callout">
              <strong>重新校验建议</strong>
              <span>${escapeHtml(normalizedCard.revalidationLabel)}${normalizedCard.revalidationDetail ? ` · ${escapeHtml(normalizedCard.revalidationDetail)}` : ''}</span>
            </div>
          `
          : ''
      }
      ${
        normalizedCard.humanReviewSummary
          ? `
            <div class="thread-focus-callout">
              <strong>最近人工判断</strong>
              <span>${escapeHtml(normalizedCard.humanReviewSummary)}</span>
            </div>
          `
          : ''
      }
      ${
        normalizedCard.sourceAnchorLabel ||
        normalizedCard.sourceAnchorDetail ||
        normalizedCard.sourceAnchorHref
          ? `
            <div class="thread-focus-callout">
              <strong>最近 source 锚点</strong>
              <span>${escapeHtml(normalizedCard.sourceAnchorLabel || '已记录最近 source')}${normalizedCard.sourceAnchorDetail ? ` · ${escapeHtml(normalizedCard.sourceAnchorDetail)}` : ''}</span>
              ${
                normalizedCard.sourceAnchorHref
                  ? `<a class="thread-event-link" href="${escapeHtml(normalizedCard.sourceAnchorHref)}" target="_blank" rel="noreferrer">${escapeHtml(normalizedCard.sourceAnchorHrefLabel || '打开最近 source')}</a>`
                  : ''
              }
            </div>
          `
          : ''
      }
      <textarea
        class="workflow-note"
        data-memory-review-note
        data-memory-inline-action-note="memory"
        placeholder="补充 accept / reject / needs_followup 的理由，或说明还缺什么证据。"
      >${escapeHtml(normalizedCard.nextStep || '')}</textarea>
      <div class="decision-action-buttons" data-memory-inline-action-list="memory">
        <button type="button" data-memory-review-action="accepted" data-memory-id="${escapeHtml(normalizedCard.memoryId)}" data-memory-inline-action-button="accepted">接受为 durable</button>
        <button type="button" data-memory-review-action="needs_followup" data-memory-id="${escapeHtml(normalizedCard.memoryId)}" data-memory-inline-action-button="needs_followup">继续补证据</button>
        <button type="button" data-memory-review-action="rejected" data-memory-id="${escapeHtml(normalizedCard.memoryId)}" data-memory-inline-action-button="rejected">拒绝沉淀</button>
        <button type="button" data-memory-reviewer-refresh data-memory-id="${escapeHtml(normalizedCard.memoryId)}" data-memory-inline-action-button="refresh">重跑 reviewer</button>
      </div>
    </div>
  `;
}

function renderSuggestionGovernanceActionPanel(card, options = {}) {
  const normalizedCard = normalizeMemoryGovernanceCard(card || {});
  const suggestionId = compact(
    normalizedCard.suggestionId ||
      normalizedCard.suggestion_id ||
      (compact(normalizedCard.type) === 'suggestion' ? normalizedCard.id : ''),
  );
  if (!suggestionId) {
    return '';
  }

  const variantClass = compact(options.variant) === 'inline' ? ' memory-review-panel-inline' : '';
  return `
    <div
      class="memory-review-panel${escapeHtml(variantClass)}"
      data-suggestion-review-box
      data-suggestion-id="${escapeHtml(suggestionId)}"
      data-memory-inline-action-box="suggestion"
    >
      <div class="workflow-next">
        <strong>Suggestion 沉淀动作</strong>
        <span class="muted">接受后会直接走现有 projector，自动产出 candidate memory，并把你在这里补的理由一起带进 source；拒绝则只保留“暂不沉淀”的显式判断。</span>
      </div>
      <textarea
        class="workflow-note"
        data-suggestion-review-note
        data-memory-inline-action-note="suggestion"
        placeholder="可选：补充为什么这条 suggestion 值得沉淀，或说明为什么现在先不转 memory。"
      ></textarea>
      <div class="decision-action-buttons" data-memory-inline-action-list="suggestion">
        <button type="button" data-suggestion-review-action="accept" data-suggestion-id="${escapeHtml(suggestionId)}" data-memory-inline-action-button="accept">转成 candidate memory</button>
        <button type="button" data-suggestion-review-action="reject" data-suggestion-id="${escapeHtml(suggestionId)}" data-memory-inline-action-button="reject">暂不沉淀</button>
      </div>
    </div>
  `;
}

function renderGovernanceActionPanel(card, options = {}) {
  if (card?.memoryId) {
    return renderMemoryGovernanceActionPanel(card, options);
  }
  if (compact(card?.type) === 'suggestion') {
    return renderSuggestionGovernanceActionPanel(card, options);
  }
  return '';
}

function renderMemoryGovernanceCard(card, executionChecklist = null) {
  const normalizedCard = normalizeMemoryGovernanceCard(card || {});
  const governanceMetaList =
    Array.isArray(normalizedCard.meta) && normalizedCard.meta.length > 0
      ? `
        <ul class="workflow-steps"${renderHtmlAttributeString({
          'data-memory-governance-meta-list': normalizedCard.type || 'memory',
        })}>
          ${normalizedCard.meta
            .map(
              (item) => `
                <li${renderHtmlAttributeString({
                  'data-memory-governance-meta-item': normalizedCard.type || 'memory',
                })}>${escapeHtml(item)}</li>
              `,
            )
            .join('')}
        </ul>
      `
      : '';
  const governanceBodyBlocks = renderSceneCardBodyBlocks({
    context: 'memory-governance-card',
    relationRecord: normalizedCard,
    executionChecklist,
    relationTitle: '与当前闭环关系',
    middleHtml: `
      ${renderMetaGrid(
        [
          { key: 'lifecycle', label: '生命周期', value: normalizedCard.memoryStatusLabel },
          { key: 'review-state', label: 'Review', value: normalizedCard.reviewStateLabel },
          { key: 'reviewer-summary', label: 'Reviewer 判断', value: normalizedCard.reviewerRecommendationSummary },
          { key: 'evidence', label: '最近证据', value: normalizedCard.evidenceSummary },
          { key: 'freshness', label: 'Freshness 体检', value: normalizedCard.freshnessLabel },
          { key: 'evidence-delta', label: '证据变化', value: normalizedCard.evidenceDeltaLabel },
          { key: 'revalidation', label: '重新校验建议', value: normalizedCard.revalidationLabel },
          { key: 'human-review', label: '最近人工判断', value: normalizedCard.humanReviewSummary },
          {
            key: 'source-anchor',
            label: '最近 source 锚点',
            value: normalizedCard.sourceAnchorLabel
              ? `${normalizedCard.sourceAnchorLabel}${normalizedCard.sourceAnchorDetail ? ` · ${normalizedCard.sourceAnchorDetail}` : ''}`
              : '',
          },
        ],
        {
          context: 'memory-governance-card',
        },
      )}
      ${governanceMetaList}
    `,
    middleAttributes: {
      'data-scene-card-body-middle': 'memory-governance-details',
    },
    extraWorkflowBlocks: [
      normalizedCard.nextStep
        ? renderWorkflowNextSection('下一步', normalizedCard.nextStep, {
            context: 'memory-governance-card',
            block: 'next-step',
          })
        : '',
    ],
  });
  return `
    <article
      class="workflow-card tone-${escapeHtml(normalizedCard.tone || 'yellow')}"
      data-memory-governance-card
      data-memory-kind="${escapeHtml(normalizedCard.type || 'memory')}"
    >
      <div class="thread-event-top">
        <span class="thread-event-badge">${escapeHtml(normalizedCard.badge || normalizedCard.type || 'memory')}</span>
        <span class="thread-event-time">${escapeHtml(normalizedCard.type || 'memory')}</span>
      </div>
      <h4>${escapeHtml(normalizedCard.title || '未命名记忆事项')}</h4>
      <p>${escapeHtml(normalizedCard.summary || '暂无补充说明')}</p>
      ${governanceBodyBlocks}
      ${renderGovernanceActionPanel(normalizedCard, { variant: 'inline' })}
      ${
        normalizedCard.link
          ? `
            <div class="thread-task-links">
              <a class="thread-event-link" href="${escapeHtml(normalizedCard.link)}" target="_blank" rel="noreferrer">打开关联位置</a>
            </div>
          `
          : ''
      }
    </article>
  `;
}

function renderMemoryGovernanceSection(section, executionChecklist = null) {
  const normalizedSection = normalizeMemoryGovernanceSection(section || {});
  return `
    <section id="${escapeHtml(normalizedSection.anchorId)}" style="margin-top:20px;">
      <h3>${escapeHtml(normalizedSection.title)}</h3>
      <p class="muted">${escapeHtml(normalizedSection.summary)}</p>
      <div class="thread-event-list">
        ${
          normalizedSection.cards.length > 0
            ? normalizedSection.cards.map((card) => renderMemoryGovernanceCard(card, executionChecklist)).join('')
            : `<div class="muted">${escapeHtml(normalizedSection.emptySummary)}</div>`
        }
      </div>
    </section>
  `;
}

function renderMemoryFocusStrip(memoryPanel, executionChecklist, options = {}) {
  if (!memoryPanel) {
    return '';
  }

  const normalizedMemoryPanel = normalizeMemoryPanel(memoryPanel);
  const guidanceModel =
    (options.guidanceModel && typeof options.guidanceModel === 'object'
      ? options.guidanceModel
      : normalizedMemoryPanel.focus_guidance || normalizedMemoryPanel.focusGuidance) ||
    buildMemoryFocusGuidanceModel(
      normalizedMemoryPanel,
      executionChecklist,
      options.actionQueue || [],
    );
  const focusProofCards = (guidanceModel.proofCards || [])
    .map((card) =>
      renderChecklistFocusProofCard({
        title: card.title,
        body: card.body,
        progressItems: card.progressItems,
        links: card.links,
        attributes: { 'data-focus-proof-kind': card.kind },
      }),
    )
    .filter(Boolean)
    .join('');

  return `
    <section class="panel checklist-focus-strip" id="memory-focus-strip" data-memory-focus-strip>
      <div class="checklist-focus-main">
        <span class="checklist-focus-eyebrow">${escapeHtml(guidanceModel.eyebrow || '记忆 reviewer 现场')}</span>
        <h2>${escapeHtml(guidanceModel.title || normalizedMemoryPanel.focusTitle || normalizedMemoryPanel.title)}</h2>
        <p>${escapeHtml(guidanceModel.summary || normalizedMemoryPanel.summary || '这里会把 candidate / review / suggestion 统一投影到一个 reviewer 现场。')}</p>
        <div class="checklist-focus-pills">
          ${(guidanceModel.pills || []).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="checklist-focus-actions">
          ${(guidanceModel.actions || [])
            .map(
              (item) => `<a class="thread-event-link" href="${escapeHtml(item.href)}"${item.target ? ` target="${escapeHtml(item.target)}"` : ''}${
                item.rel ? ` rel="${escapeHtml(item.rel)}"` : ''
              }>${escapeHtml(item.label)}</a>`,
            )
            .join('')}
        </div>
      </div>
      <div class="checklist-focus-side">
        ${focusProofCards}
      </div>
      ${renderExecutionGuideQueue(guidanceModel.actionQueue || options.actionQueue || [])}
    </section>
  `;
}

function renderMemoryDirectory(memoryPanel) {
  const normalizedMemoryPanel = normalizeMemoryPanel(memoryPanel);
  const sections = Array.isArray(normalizedMemoryPanel?.sections) ? normalizedMemoryPanel.sections : [];

  return `
    <h3 id="memory-governance-directory" style="margin-top:20px;">记忆治理目录</h3>
    <div class="thread-list">
      ${sections
        .map(
          (section) => `
            <a class="thread-list-item" href="#${escapeHtml(section.anchorId)}">
              <strong>${escapeHtml(section.title)}</strong>
              <span>${escapeHtml(section.count > 0 ? `${section.count} 条待处理` : '当前队列为空')}</span>
              <span>${escapeHtml(section.summary)}</span>
              ${
                readChecklistFocusNote(section.cards[0] || {}) || readChecklistProgressSummary(section.cards[0] || {})
                  ? `
                    <span class="thread-checklist-summary">
                      ${escapeHtml(buildChecklistRelationTitle(section.cards[0] || {}))}
                    </span>
                    ${
                      readChecklistFocusNote(section.cards[0] || {})
                        ? `<span class="thread-checklist-note">${escapeHtml(readChecklistFocusNote(section.cards[0] || {}))}</span>`
                        : ''
                    }
                    ${
                      readChecklistProgressSummary(section.cards[0] || {})
                        ? `<span class="thread-checklist-note checklist-context-progress">${escapeHtml(readChecklistProgressSummary(section.cards[0] || {}))}</span>`
                        : ''
                    }
                  `
                  : ''
              }
            </a>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderMemoryRightRail(memoryPanel, executionChecklist) {
  const normalizedMemoryPanel = normalizeMemoryPanel(memoryPanel);
  const sections = Array.isArray(normalizedMemoryPanel?.sections)
    ? normalizedMemoryPanel.sections
    : [];
  const memoryReviewerRelationRecord = normalizedMemoryPanel?.focusItem || normalizedMemoryPanel;
  const memoryReviewerChecklistStepLabel = readChecklistStepLabel(memoryReviewerRelationRecord);
  const memoryReviewerChecklistStepTitle = readChecklistStepTitle(memoryReviewerRelationRecord);
  const memoryReviewerChecklistProgressLabel = readChecklistProgressLabel(memoryReviewerRelationRecord);
  const memoryReviewerFocusBodyBlocks = renderSceneCardBodyBlocks({
    context: 'memory-reviewer-focus-card',
    relationRecord: memoryReviewerRelationRecord,
    executionChecklist,
    relationTitle: '与当前闭环关系',
    middleHtml: renderMetaGrid(
      [
        { key: 'focus-title', label: '当前焦点', value: normalizedMemoryPanel?.focusTitle },
        { key: 'focus-queue', label: '当前队列', value: normalizedMemoryPanel?.focusSectionTitle },
        { key: 'focus-note', label: '当前说明', value: normalizedMemoryPanel?.focusNote || normalizedMemoryPanel?.subtitle },
        { key: 'next-action', label: '下一步', value: normalizedMemoryPanel?.nextAction },
        { key: 'evidence', label: '最近证据', value: normalizedMemoryPanel?.focusEvidence },
      ],
      {
        context: 'memory-reviewer-focus-card',
      },
    ),
    middleAttributes: {
      'data-scene-card-body-middle': 'memory-reviewer-focus-details',
    },
  });
  const memoryReviewerSummaryBodyBlocks = renderSceneCardBodyBlocks({
    context: 'memory-reviewer-summary-card',
    relationRecord: memoryReviewerRelationRecord,
    executionChecklist,
    relationTitle: '与当前闭环关系',
    middleHtml: renderMetaGrid(
      [
        { key: 'focus-title', label: '当前焦点', value: normalizedMemoryPanel?.focusTitle },
        { key: 'focus-queue', label: '当前队列', value: normalizedMemoryPanel?.focusSectionTitle },
        { key: 'focus-label', label: '与当前聚焦关系', value: normalizedMemoryPanel?.focusLabel },
        {
          key: 'checklist-step',
          label: '关联闭环',
          value: memoryReviewerChecklistStepLabel
            ? `${memoryReviewerChecklistStepLabel}${memoryReviewerChecklistStepTitle ? ` · ${memoryReviewerChecklistStepTitle}` : ''}`
            : '',
        },
        { key: 'checklist-progress', label: '执行清单', value: memoryReviewerChecklistProgressLabel },
        { key: 'evidence', label: '最近证据', value: normalizedMemoryPanel?.focusEvidence },
        { key: 'evidence-delta', label: '证据变化', value: normalizedMemoryPanel?.focusItem?.evidenceDeltaLabel },
        { key: 'revalidation', label: '重新校验', value: normalizedMemoryPanel?.focusItem?.revalidationLabel },
        { key: 'checklist-focus', label: '当前主闭环', value: executionChecklist?.focusTitle },
        { key: 'checkpoint-rule', label: '推进规则', value: executionChecklist?.checkpointRule },
      ],
      {
        context: 'memory-reviewer-summary-card',
      },
    ),
    middleAttributes: {
      'data-scene-card-body-middle': 'memory-reviewer-summary-details',
    },
    extraWorkflowBlocks: [
      renderWorkflowNextSection(
        '当前判断',
        normalizedMemoryPanel?.nextAction || '继续按 checkpoint 规则收集新的 candidate。',
        {
          context: 'memory-reviewer-summary-card',
          block: 'current-decision',
        },
      ),
    ],
  });

  return `
    <div
      class="thread-focus"
      id="memory-reviewer-focus-card"
      data-memory-reviewer-focus-card
    >
      <h2>${escapeHtml(normalizedMemoryPanel?.title || '记忆 reviewer 现场')}</h2>
      <p class="muted">${escapeHtml(normalizedMemoryPanel?.subtitle || '当前没有待处理的记忆治理事项。')}</p>
      ${normalizedMemoryPanel?.focusSectionTitle ? `<p class="muted">当前聚焦：${escapeHtml(normalizedMemoryPanel.focusSectionTitle)}</p>` : ''}
      ${memoryReviewerFocusBodyBlocks}
    </div>

    ${renderThreadStatsGrid(
      [
        { key: 'candidates', label: '记忆候选', value: String(normalizedMemoryPanel?.counts?.candidates || 0) },
        { key: 'reviews', label: 'Review 队列', value: String(normalizedMemoryPanel?.counts?.reviews || 0) },
        { key: 'suggestions', label: '相关 Suggestions', value: String(normalizedMemoryPanel?.counts?.suggestions || 0) },
        { key: 'actionable-total', label: '待治理总数', value: String(normalizedMemoryPanel?.actionableCount || 0) },
      ],
      {
        context: 'memory-reviewer-focus-card',
      },
    )}

    ${renderExecutionChecklistCard(executionChecklist)}

    <h3>Reviewer 摘要</h3>
    <article
      class="workflow-card tone-${escapeHtml(normalizedMemoryPanel?.focusItem?.tone || 'yellow')}"
      id="memory-reviewer-summary-card"
      data-memory-reviewer-summary-card
    >
      <div class="decision-action-top">
        <span class="decision-action-badge">${escapeHtml(normalizedMemoryPanel?.focusItem?.badge || 'memory')}</span>
        <span class="decision-action-status">${escapeHtml(normalizedMemoryPanel?.focusSectionTitle || '当前无聚焦')}</span>
      </div>
      <p>${escapeHtml(normalizedMemoryPanel?.summary || '当前没有待处理的记忆治理事项。')}</p>
      ${memoryReviewerSummaryBodyBlocks}
      ${
        normalizedMemoryPanel?.focusItem?.link
          ? `<a class="thread-event-link" href="${escapeHtml(normalizedMemoryPanel.focusItem.link)}" target="_blank" rel="noreferrer">打开当前来源</a>`
          : ''
      }
      ${renderGovernanceActionPanel(normalizedMemoryPanel?.focusItem)}
    </article>

    ${sections.map((section) => renderMemoryGovernanceSection(section, executionChecklist)).join('')}
    <div class="workspace-feedback" data-thread-feedback>这里展示的是 memory reviewer 现场，重点是先判断哪些内容值得沉淀，哪些仍应停留在临时上下文。</div>
  `;
}

function buildFocusStripWorkflowGuidance(threadDetail, selectedThread, selectedThreadGroup = null) {
  const detail = threadDetail && typeof threadDetail === 'object' ? threadDetail : null;
  const threadStateGuidance = selectedThreadGroup ? buildThreadGuidanceDescriptor(selectedThreadGroup, 'all') : null;
  const workflowGuidanceBase = (() => {
    if (!detail) {
      return null;
    }

    const primaryDecision =
      (Array.isArray(detail.openDecisions) ? detail.openDecisions[0] : null) ||
      (Array.isArray(detail.open_decisions) ? detail.open_decisions[0] : null) ||
      null;
    if (primaryDecision) {
      return buildDecisionNodeGuidance(primaryDecision, detail.workflow, selectedThread?.tasks?.[0] || null);
    }

    return detail.workflow || null;
  })();

  if (!workflowGuidanceBase && !threadStateGuidance) {
    return null;
  }

  return {
    ...(workflowGuidanceBase || {}),
    nodeStateLabel: compact(threadStateGuidance?.nodeLabel),
    nodeStateSummary: compact(threadStateGuidance?.nodeSummary),
    nodeStateAction: compact(threadStateGuidance?.nodeAction),
  };
}

export function renderWorkspaceDocumentPage(payload) {
  const project = payload.project;
  const document = payload.document;
  const isMemoryDocument = compact(document.kind).toLowerCase() === 'memory';
  const selectedThread = payload.selected_thread || payload.selectedThread || null;
  const threadPanel = payload.thread_panel || payload.threadPanel || {};
  const threadDetailBase = payload.thread_detail || payload.threadDetail || {};
  const executionSnapshot =
    threadDetailBase.execution_snapshot || threadDetailBase.executionSnapshot || {};
  const commentSummary = normalizeCommentSummary(
    threadDetailBase.comment_summary || threadDetailBase.commentSummary || {},
  );
  const commentThreads =
    threadDetailBase.comment_threads || threadDetailBase.commentThreads || [];
  const openDecisions =
    threadDetailBase.open_decisions || threadDetailBase.openDecisions || [];
  const sourceRecovery =
    threadDetailBase.source_recovery || threadDetailBase.sourceRecovery || null;
  const threadDetail = {
    ...threadDetailBase,
    execution_snapshot: executionSnapshot,
    executionSnapshot,
    comment_summary: commentSummary,
    commentSummary,
    comment_threads: commentThreads.map((comment) => normalizeThreadCommentItem(comment)),
    commentThreads: commentThreads.map((comment) => normalizeThreadCommentItem(comment)),
    open_decisions: openDecisions,
    openDecisions,
    source_recovery: sourceRecovery,
    sourceRecovery,
  };
  const executionChecklist = payload.execution_checklist || payload.executionChecklist || {};
  const decisionFocus = payload.decision_focus || payload.decisionFocus || {};
  const commentWorkflow = payload.comment_workflow || payload.commentWorkflow || {};
  const memoryGovernance = normalizeMemoryGovernance(
    payload.memory_governance || payload.memoryGovernance || {},
  );
  const memoryPanel = normalizeMemoryPanel(
    payload.memory_panel ||
      payload.memoryPanel ||
      buildMemoryDocumentPanel(memoryGovernance, executionChecklist),
  );
  const workspaceHref = payload.workspace_href || payload.workspaceHref || `/workspace?project_id=${encodeURIComponent(project.projectId)}`;
  const documentContext = payload.document_context || payload.documentContext || {
    documentId: document.documentId,
  };
  const commentFocusMap = normalizeCommentFocusMap(
    payload.comment_focus_map ||
      payload.commentFocusMap ||
      threadDetail.comment_focus_map ||
      threadDetail.commentFocusMap ||
      buildWorkspaceDocumentCommentFocusMap(threadDetail),
    commentSummary,
  );
  const selectedCommentFocusSource =
    payload.selected_comment_focus ??
    payload.selectedCommentFocus ??
    threadDetail.selected_comment_focus ??
    threadDetail.selectedCommentFocus ??
    buildWorkspaceDocumentSelectedCommentFocus(threadDetail, commentFocusMap) ??
    null;
  const selectedCommentFocus = selectedCommentFocusSource
    ? normalizeThreadCommentItem(selectedCommentFocusSource)
    : null;
  const threadEventSummary =
    payload.thread_event_summary ??
    payload.threadEventSummary ??
    buildThreadEventSummary(threadDetail);
  const topbarStatus =
    payload.topbar_status ??
    payload.topbarStatus ??
    buildWorkspaceDocumentTopbarStatus({
      documentKind: document.kind,
      selectedThread,
      threadPanel,
      memoryPanel,
    });
  const executionGuideQueue =
    payload.execution_guide_queue ||
    payload.executionGuideQueue ||
    buildWorkspaceHeroActionQueue(
      executionChecklist,
      decisionFocus,
      commentWorkflow,
      memoryPanel ? memoryGovernance : {},
    );
  const focusStripWorkflowGuidance =
    payload.focus_strip_workflow_guidance ||
    payload.focusStripWorkflowGuidance ||
    (isMemoryDocument ? null : buildFocusStripWorkflowGuidance(threadDetail, selectedThread));
  const executionFocusGuidance =
    payload.execution_focus_guidance ||
    payload.executionFocusGuidance ||
    executionChecklist?.focus_guidance ||
    executionChecklist?.focusGuidance ||
    buildExecutionFocusGuidanceModel(executionChecklist, {
      commentThreadCount: threadDetail.counts.commentThreads,
      openDecisionCount: threadDetail.counts.openDecisions,
      threadEventCount: threadDetail.counts.events,
      workflowGuidance: focusStripWorkflowGuidance,
      actionQueue: executionGuideQueue,
    });
  const memoryFocusGuidance =
    payload.memory_focus_guidance ||
    payload.memoryFocusGuidance ||
    memoryPanel?.focus_guidance ||
    memoryPanel?.focusGuidance ||
    buildMemoryFocusGuidanceModel(memoryPanel, executionChecklist, executionGuideQueue);
  const focusStripHtml = isMemoryDocument
    ? renderMemoryFocusStrip(memoryPanel, executionChecklist, {
        guidanceModel: memoryFocusGuidance,
        actionQueue: executionGuideQueue,
      })
    : renderChecklistFocusStrip(executionChecklist, {
        guidanceModel: executionFocusGuidance,
      });
  const composeOwnerAgent =
    payload.compose_owner_agent ??
    payload.composeOwnerAgent ??
    buildWorkspaceDocumentComposeOwnerAgent(threadDetail, selectedThread);
  const threadDecisionUrl = selectedThread
    ? `/workspace/threads/${encodeURIComponent(selectedThread.thread_key)}/decision`
    : '';
  const threadCommentUrl = selectedThread
    ? `/workspace/threads/${encodeURIComponent(selectedThread.thread_key)}/comment`
    : '';
  const documentSaveUrl = `/workspace/docs/${encodeURIComponent(document.documentId)}/save`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(project.projectId)} · ${escapeHtml(document.title)}</title>
    <style>
      :root {
        --bg: #f4efe7;
        --panel: rgba(255, 252, 246, 0.92);
        --panel-strong: rgba(255, 255, 255, 0.96);
        --ink: #1c221f;
        --muted: #5f6962;
        --line: rgba(49, 60, 51, 0.12);
        --shadow: 0 24px 48px rgba(73, 58, 37, 0.10);
        --red: #b34f42;
        --yellow: #b18434;
        --green: #2f7658;
        --blue: #345f87;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", "PingFang SC", "Hiragino Sans GB", sans-serif;
        color: var(--ink);
        background: linear-gradient(180deg, #faf6ef 0%, #f0e8dc 100%);
      }

      .shell {
        max-width: 1520px;
        margin: 0 auto;
        padding: 22px 18px 28px;
      }

      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 16px;
      }

      .topbar a {
        color: var(--blue);
        text-decoration: none;
      }

      .meta {
        color: var(--muted);
        font-size: 13px;
      }

      .layout {
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr) 390px;
        gap: 16px;
        align-items: start;
      }

      .checklist-focus-strip {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.95fr);
        gap: 16px;
        align-items: start;
        margin-bottom: 16px;
        background: linear-gradient(135deg, rgba(255, 252, 246, 0.98), rgba(247, 241, 232, 0.96));
      }

      .checklist-focus-main h2 {
        margin: 0 0 8px;
      }

      .checklist-focus-main p {
        margin: 0 0 12px;
        color: var(--muted);
        line-height: 1.65;
      }

      .checklist-focus-eyebrow {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(52, 95, 135, 0.12);
        color: var(--blue);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        margin-bottom: 10px;
      }

      .checklist-focus-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .checklist-focus-pills span {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(49, 60, 51, 0.06);
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
      }

      .checklist-focus-actions,
      .checklist-focus-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 12px;
      }

      .checklist-focus-side {
        display: grid;
        gap: 10px;
      }

      .focus-guide-queue {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }

      .focus-guide-card {
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(246, 239, 230, 0.88);
        padding: 14px 16px;
        display: grid;
        gap: 10px;
      }

      .focus-guide-card.tone-red {
        border-color: rgba(179, 61, 62, 0.28);
        background: rgba(255, 232, 233, 0.88);
      }

      .focus-guide-card.tone-yellow {
        border-color: rgba(184, 129, 44, 0.24);
        background: rgba(255, 245, 224, 0.9);
      }

      .focus-guide-card.tone-blue {
        border-color: rgba(76, 120, 129, 0.24);
        background: rgba(233, 242, 244, 0.9);
      }

      .focus-guide-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .focus-guide-badge {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .focus-guide-card h3 {
        margin: 0;
        font-size: 16px;
        line-height: 1.4;
      }

      .focus-guide-card p {
        margin: 0;
        font-size: 13px;
        color: var(--muted);
        line-height: 1.5;
      }

      .checklist-focus-proof {
        border-radius: 16px;
        border: 1px solid rgba(49, 60, 51, 0.08);
        background: rgba(255,255,255,0.88);
        padding: 12px 14px;
      }

      .checklist-focus-proof strong {
        display: block;
        margin-bottom: 6px;
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
      }

      .checklist-focus-proof span {
        display: block;
        font-size: 14px;
        line-height: 1.6;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: var(--shadow);
        padding: 18px;
      }

      .panel h1, .panel h2, .panel h3 {
        margin: 0 0 10px;
        letter-spacing: -0.02em;
      }

      .doc-nav-list,
      .thread-list,
      .thread-task-grid,
      .thread-event-list,
      .decision-action-list {
        display: grid;
        gap: 10px;
      }

      .doc-nav-item,
      .thread-list-item {
        display: block;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: var(--panel-strong);
        padding: 12px;
        color: inherit;
        text-decoration: none;
      }

      .doc-nav-item.is-selected,
      .thread-list-item.is-selected {
        border-color: rgba(52, 95, 135, 0.35);
        box-shadow: inset 0 0 0 1px rgba(52, 95, 135, 0.08);
      }

      .doc-nav-item strong,
      .thread-list-item strong {
        display: block;
        margin-bottom: 6px;
      }

      .doc-nav-item span,
      .thread-list-item span,
      .muted {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }

      .thread-list-item .thread-focus-summary {
        color: var(--ink);
      }

      .thread-list-item .thread-checklist-summary {
        margin-top: 4px;
        color: var(--ink);
      }

      .thread-list-item .thread-checklist-note {
        margin-top: 2px;
      }

      .doc-shell {
        min-height: 70vh;
        background: rgba(255,255,255,0.90);
      }

      .doc-toolbar {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin: 14px 0 12px;
      }

      .doc-outline-card {
        margin: 14px 0 12px;
        border-radius: 18px;
        border: 1px solid rgba(49, 60, 51, 0.08);
        background: rgba(250, 247, 242, 0.92);
        padding: 12px 14px;
      }

      .doc-outline-card strong {
        display: block;
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--muted);
        text-transform: uppercase;
      }

      .doc-outline-list {
        display: grid;
        gap: 8px;
      }

      .doc-outline-link {
        color: var(--blue);
        text-decoration: none;
        font-size: 13px;
        line-height: 1.55;
      }

      .doc-outline-link.level-2 {
        padding-left: 12px;
      }

      .doc-outline-link.level-3 {
        padding-left: 24px;
      }

      .doc-toolbar button {
        border: none;
        border-radius: 999px;
        background: var(--ink);
        color: white;
        padding: 10px 16px;
        font: inherit;
        cursor: pointer;
      }

      .doc-toolbar button.is-dirty {
        background: var(--blue);
      }

      .doc-editor {
        width: 100%;
        min-height: 280px;
        border: 1px solid rgba(49, 60, 51, 0.14);
        border-radius: 18px;
        padding: 14px;
        background: rgba(255,255,255,0.98);
        color: var(--ink);
        resize: vertical;
        font: 14px/1.7 ui-monospace, "SFMono-Regular", Menlo, monospace;
      }

      .doc-preview {
        margin-top: 18px;
        border-top: 1px solid rgba(49, 60, 51, 0.08);
        padding-top: 18px;
      }

      .doc-content h2,
      .doc-content h3,
      .doc-content h4 {
        margin: 18px 0 10px;
      }

      .doc-content p,
      .doc-content li {
        line-height: 1.75;
      }

      .doc-content ul {
        padding-left: 18px;
      }

      .doc-spacer {
        height: 10px;
      }

      .thread-focus {
        margin-bottom: 18px;
      }

      .thread-focus-callout {
        margin-top: 10px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(52, 95, 135, 0.18);
        background: rgba(240, 246, 251, 0.82);
      }

      .thread-focus-callout strong {
        display: block;
        margin-bottom: 4px;
        font-size: 13px;
      }

      .thread-focus-callout span {
        color: var(--ink);
        font-size: 13px;
        line-height: 1.6;
      }

      .checklist-context-progress {
        display: block;
        color: var(--muted) !important;
      }

      .thread-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 16px;
      }

      .thread-stat {
        border-radius: 16px;
        background: rgba(255,255,255,0.92);
        border: 1px solid var(--line);
        padding: 12px;
      }

      .thread-stat strong {
        display: block;
        font-size: 22px;
        margin-bottom: 4px;
      }

      .thread-task-card,
      .comment-thread-card,
      .workflow-card,
      .decision-action-card,
      .thread-event {
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.94);
        padding: 14px;
      }

      .thread-task-top,
      .decision-action-top,
      .thread-event-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }

      .thread-task-badge,
      .decision-action-badge,
      .thread-event-badge {
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 0 10px;
        border-radius: 999px;
        background: var(--green);
        color: white;
        font-size: 12px;
        font-weight: 600;
      }

      .tone-red .thread-task-badge,
      .tone-red .decision-action-badge,
      .tone-red .thread-event-badge {
        background: var(--red);
      }

      .tone-yellow .thread-task-badge,
      .tone-yellow .decision-action-badge,
      .tone-yellow .thread-event-badge {
        background: var(--yellow);
      }

      .tone-blue .thread-task-badge,
      .tone-blue .decision-action-badge,
      .tone-blue .thread-event-badge {
        background: var(--blue);
      }

      .thread-task-status,
      .decision-action-status,
      .thread-event-time {
        color: var(--muted);
        font-size: 12px;
      }

      .thread-task-step {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(47, 118, 88, 0.12);
        color: var(--green);
        font-size: 12px;
        font-weight: 600;
      }

      .thread-task-card h4,
      .comment-thread-card h4,
      .workflow-card h4,
      .decision-action-card h4,
      .thread-event h4 {
        margin: 0 0 8px;
      }

      .thread-task-card p,
      .comment-thread-card p,
      .workflow-card p,
      .decision-action-card p,
      .thread-event p {
        margin: 0 0 10px;
        color: var(--muted);
        line-height: 1.6;
      }

      .workflow-steps {
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.7;
      }

      .workflow-metrics,
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }

      .workflow-metric,
      .meta-grid-row {
        border-radius: 14px;
        border: 1px solid rgba(49, 60, 51, 0.08);
        background: rgba(250, 247, 242, 0.92);
        padding: 10px 12px;
      }

      .workflow-metric strong,
      .meta-grid-row dt {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
      }

      .workflow-metric span,
      .meta-grid-row dd {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
      }

      .checklist-overview-card {
        margin-bottom: 18px;
      }

      .checklist-progress {
        margin: 12px 0;
      }

      .checklist-progress-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
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
        background: rgba(49, 60, 51, 0.08);
        overflow: hidden;
      }

      .checklist-progress-bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(52, 95, 135, 0.92), rgba(47, 118, 88, 0.92));
      }

      .checklist-kpis {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .checklist-kpis span {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(49, 60, 51, 0.06);
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
      }

      .checklist-remaining {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }

      .checklist-remaining span {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(52, 95, 135, 0.10);
        color: var(--ink);
        font-size: 12px;
      }

      .checklist-mini-grid {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }

      .checklist-mini-item {
        display: block;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(250, 247, 242, 0.92);
        padding: 12px;
        color: inherit;
        text-decoration: none;
      }

      .checklist-mini-top {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        margin-bottom: 8px;
      }

      .checklist-mini-top em,
      .checklist-mini-top span {
        font-size: 12px;
        font-style: normal;
      }

      .checklist-mini-top em {
        color: var(--muted);
      }

      .checklist-mini-top span {
        color: var(--ink);
      }

      .checklist-mini-item strong {
        display: block;
        margin-bottom: 6px;
      }

      .checklist-mini-item span {
        display: block;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }

      .checklist-mini-item.status-completed {
        border-color: rgba(47, 118, 88, 0.18);
      }

      .checklist-mini-item.status-in_progress {
        border-color: rgba(52, 95, 135, 0.20);
      }

      .checklist-mini-item.status-pending {
        border-color: rgba(177, 132, 52, 0.20);
      }

      .comment-summary-card {
        margin-bottom: 12px;
      }

      .comment-focus-card {
        margin: 0 0 14px;
      }

      .comment-summary-kpis {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .comment-summary-kpis span {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(49, 60, 51, 0.06);
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
      }

      .comment-filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0 10px;
      }

      .comment-filter-status {
        margin: 0 0 14px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid rgba(49, 60, 51, 0.08);
        background: rgba(250, 247, 242, 0.9);
      }

      .comment-filter-status strong {
        display: block;
        margin-bottom: 6px;
      }

      .comment-filter-button {
        border: 1px solid rgba(49, 60, 51, 0.10);
        border-radius: 999px;
        min-height: 32px;
        padding: 0 12px;
        background: rgba(255,255,255,0.86);
        color: var(--muted);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
      }

      .comment-filter-button.is-active {
        border-color: rgba(52, 95, 135, 0.24);
        background: rgba(52, 95, 135, 0.12);
        color: var(--ink);
      }

      .comment-focus-card.is-hidden,
      .comment-thread-card.is-hidden {
        display: none;
      }

      .comment-audit-list {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }

      .comment-audit-item {
        border-radius: 16px;
        border: 1px solid rgba(49, 60, 51, 0.08);
        background: rgba(250, 247, 242, 0.92);
        padding: 12px;
      }

      .comment-audit-top,
      .comment-audit-meta {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 8px;
      }

      .comment-audit-top {
        margin-bottom: 8px;
      }

      .comment-audit-badge {
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

      .tone-red .comment-audit-badge {
        background: rgba(178, 61, 44, 0.12);
      }

      .tone-yellow .comment-audit-badge {
        background: rgba(177, 132, 52, 0.14);
      }

      .comment-audit-item strong {
        display: block;
        margin-bottom: 6px;
      }

      .comment-audit-detail {
        display: block;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.55;
      }

      .comment-audit-meta {
        margin-top: 10px;
        color: var(--muted);
        font-size: 12px;
      }

      .comment-audit-meta a {
        color: var(--blue);
        text-decoration: none;
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

      .workflow-note {
        width: 100%;
        min-height: 74px;
        border-radius: 14px;
        border: 1px solid rgba(49, 60, 51, 0.12);
        padding: 10px 12px;
        resize: vertical;
        font: inherit;
        margin-top: 12px;
      }

      .memory-review-panel {
        display: grid;
        gap: 10px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(49, 60, 51, 0.08);
      }

      .memory-review-panel-inline {
        margin-top: 14px;
      }

      .source-recovery-form {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }

      .source-recovery-field {
        display: grid;
        gap: 6px;
      }

      .source-recovery-field span {
        font-size: 12px;
        text-transform: uppercase;
        color: var(--muted);
      }

      .source-recovery-field input {
        width: 100%;
        border-radius: 14px;
        border: 1px solid rgba(49, 60, 51, 0.12);
        padding: 10px 12px;
        font: inherit;
        background: rgba(255, 255, 255, 0.82);
      }

      .thread-task-next {
        display: grid;
        gap: 4px;
        border-top: 1px solid rgba(49, 60, 51, 0.08);
        padding-top: 10px;
      }

      .thread-task-next strong {
        font-size: 12px;
        text-transform: uppercase;
        color: var(--muted);
      }

      .thread-task-links,
      .decision-action-buttons {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 10px;
      }

      .thread-task-links a,
      .thread-event-link {
        color: var(--blue);
        text-decoration: none;
        font-size: 13px;
      }

      .decision-note {
        width: 100%;
        min-height: 74px;
        border-radius: 14px;
        border: 1px solid rgba(49, 60, 51, 0.12);
        padding: 10px 12px;
        resize: vertical;
        font: inherit;
      }

      .decision-action-buttons button {
        border: none;
        border-radius: 999px;
        padding: 9px 12px;
        cursor: pointer;
        background: rgba(28, 34, 31, 0.08);
        color: var(--ink);
        font: inherit;
      }

      .thread-event-meta {
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
        font-size: 13px;
      }

      .workspace-feedback {
        margin-top: 10px;
        color: var(--muted);
        font-size: 13px;
      }

      @media (max-width: 1180px) {
        .layout {
          grid-template-columns: 1fr;
        }

        .checklist-focus-strip {
          grid-template-columns: 1fr;
        }

        .doc-shell {
          min-height: auto;
        }

        .workflow-metrics,
        .meta-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="topbar">
        <div>
          <a href="${escapeHtml(workspaceHref)}">返回工作台</a>
          <span class="meta"> / ${escapeHtml(document.title)} / 最近刷新 ${escapeHtml(formatIso(payload.generated_at))}</span>
        </div>
        <div class="meta">${escapeHtml(topbarStatus)}</div>
      </div>

      ${focusStripHtml}

      <div class="layout">
        <aside class="panel">
          <h2>文档目录</h2>
          <div class="doc-nav-list">
            ${payload.documents
              .map(
                (entry) => `
                  <a class="doc-nav-item${entry.isSelected ? ' is-selected' : ''}" href="${escapeHtml(entry.href)}">
                    <strong>${escapeHtml(entry.title)}</strong>
                    <span>${escapeHtml(entry.description)}</span>
                  </a>
                `,
              )
              .join('')}
          </div>

          ${
            isMemoryDocument
              ? renderMemoryDirectory(memoryPanel)
              : `
                <h3 id="thread-directory" style="margin-top:20px;">线程目录</h3>
                <div class="thread-list">
                  ${payload.thread_groups
                    .map(
                      (group) => `
                        <a class="thread-list-item${selectedThread?.thread_key === group.thread_key ? ' is-selected' : ''}" href="${escapeHtml(
                          buildWorkspaceThreadHref(project.projectId, group.thread_key, documentContext),
                        )}">
                          <strong>${escapeHtml(group.thread_label)}</strong>
                          <span>${escapeHtml(group.statusSummary || `${group.task_count} 个任务 · ${group.in_progress_count} 个处理中 · ${group.red_count} 个红灯`)}</span>
                          ${group.overviewSummary ? `<span>${escapeHtml(group.overviewSummary)}</span>` : ''}
                          ${
                            readChecklistFocusNote(group) || readChecklistProgressSummary(group)
                              ? `
                                <span class="thread-checklist-summary">
                                  ${escapeHtml(buildChecklistRelationTitle(group))}
                                </span>
                                ${
                                  readChecklistFocusNote(group)
                                    ? `<span class="thread-checklist-note">${escapeHtml(readChecklistFocusNote(group))}</span>`
                                    : ''
                                }
                                ${
                                  readChecklistProgressSummary(group)
                                    ? `<span class="thread-checklist-note checklist-context-progress">${escapeHtml(readChecklistProgressSummary(group))}</span>`
                                    : ''
                                }
                              `
                              : ''
                          }
                          ${group.focusLabel ? `<span class="thread-focus-summary">当前聚焦：${escapeHtml(group.focusLabel)}</span>` : ''}
                          ${group.signalSummary ? `<span>${escapeHtml(group.signalSummary)}</span>` : ''}
                        </a>
                      `,
                    )
                    .join('')}
                </div>
              `
          }
        </aside>

        <main class="panel doc-shell">
          <h1>${escapeHtml(document.title)}</h1>
          <p class="muted">${escapeHtml(document.description)} · 本地路径：${escapeHtml(document.path)}</p>
          <div class="doc-outline-card">
            <strong>文档导航</strong>
            <div data-document-outline>${renderDocumentOutline(document.outline)}</div>
          </div>
          <div class="doc-toolbar">
            <div class="meta">这里直接编辑 Cortex 本地 Markdown，作为主版本。</div>
            <button type="button" data-save-document>保存文档</button>
          </div>
          <textarea class="doc-editor" data-document-editor>${escapeHtml(document.body)}</textarea>
          <div class="workspace-feedback" data-document-feedback>尚未保存新的修改。</div>

          <div class="doc-preview">
            <h3>当前渲染预览</h3>
            <div class="doc-content" data-document-preview>${document.html}</div>
          </div>
        </main>

        <aside class="panel">
          ${
            isMemoryDocument
              ? renderMemoryRightRail(memoryPanel, executionChecklist)
              : `
                <div class="thread-focus" data-thread-focus-card>
                  <h2>${escapeHtml(threadPanel.title)}</h2>
                  <p class="muted">${escapeHtml(threadPanel.subtitle)}</p>
                  ${threadPanel.focusLabel ? `<p class="muted">当前聚焦：${escapeHtml(threadPanel.focusLabel)}</p>` : ''}
                  ${renderChecklistRelationSceneBlock(threadPanel, executionChecklist, 'thread-focus-card', {
                    title: '当前闭环关系',
                  })}
                  ${renderThreadStateSceneBlock(threadPanel, 'thread-focus-card')}
                  ${threadPanel.queueSummary ? `<p class="muted">队列概览：${escapeHtml(threadPanel.queueSummary)}</p>` : ''}
                  ${threadPanel.signalSummary ? `<p class="muted">${escapeHtml(threadPanel.signalSummary)}</p>` : ''}
                </div>

                ${renderThreadStatsGrid(
                  [
                    { key: 'open-decisions', label: '待拍板', value: String(threadDetail.counts.openDecisions || 0) },
                    { key: 'events', label: '线程事件', value: String(threadDetail.counts.events || 0) },
                    { key: 'related-tasks', label: '关联任务', value: String(selectedThread?.task_count || 0) },
                    { key: 'red-signals', label: '红灯数量', value: String(selectedThread?.red_count || 0) },
                  ],
                  {
                    context: 'thread-focus-card',
                  },
                )}

                ${renderExecutionChecklistCard(executionChecklist, threadPanel)}

                <h3>执行摘要</h3>
                <article
                  class="workflow-card tone-${escapeHtml(executionSnapshot.tone || 'green')}"
                  id="execution-summary-card"
                  data-execution-summary-card
                >
                  <div class="decision-action-top">
                    <span class="decision-action-badge">${escapeHtml(humanSignalLevel(executionSnapshot.signalLevel))}</span>
                    <span class="decision-action-status">${escapeHtml(executionSnapshot.statusLabel)}</span>
                  </div>
                  <p>${escapeHtml(executionSnapshot.focusSummary)}</p>
                  ${renderSceneCardBodyBlocks({
                    context: 'execution-summary-card',
                    threadPanel,
                    relationRecord: threadPanel,
                    executionChecklist,
                    relationTitle: '当前关联闭环',
                    middleHtml: `
                      ${
                        executionSnapshot.blockerReason
                          ? renderWorkflowNextSection('卡点原因', executionSnapshot.blockerReason, {
                              context: 'execution-summary-card',
                              block: 'blocker-reason',
                            })
                          : ''
                      }
                      ${
                        executionSnapshot.recommendedAction
                          ? renderWorkflowNextSection(
                              executionSnapshot.executionStatus === 'waiting_human' ? '需要你做什么' : '推荐动作',
                              executionSnapshot.recommendedAction,
                              {
                                context: 'execution-summary-card',
                                block:
                                  executionSnapshot.executionStatus === 'waiting_human'
                                    ? 'requested-human-action'
                                    : 'recommended-action',
                              },
                            )
                          : ''
                      }
                      ${renderMetaGrid(
                        [
                          { key: 'current-node', label: '当前节点', value: executionSnapshot.currentNode },
                          { key: 'owner', label: '当前负责人', value: executionSnapshot.ownerSummary },
                          { key: 'activity', label: '活跃度', value: executionSnapshot.activityLabel },
                          { key: 'last-movement', label: '最后动作', value: executionSnapshot.lastMovement },
                          { key: 'task-summary', label: '线程任务', value: executionSnapshot.taskSummary },
                          { key: 'task-focus', label: '当前活跃子任务', value: executionSnapshot.taskFocus },
                          { key: 'task-breakdown', label: '子任务分布', value: executionSnapshot.taskBreakdown },
                          { key: 'signal-summary', label: '红黄绿分布', value: executionSnapshot.signalSummary },
                          { key: 'why-now', label: '为什么现在处理', value: executionSnapshot.whyNow },
                          { key: 'impact-scope', label: '影响范围', value: executionSnapshot.impactScope },
                          { key: 'evidence', label: '证据', value: executionSnapshot.evidenceSummary },
                        ],
                        {
                          context: 'execution-summary-card',
                        },
                      )}
                    `,
                    middleAttributes: {
                      'data-scene-card-body-middle': 'execution-summary-details',
                    },
                  })}
                </article>

                ${
                  threadDetail.sourceRecovery
                    ? `
                      <h3 style="margin-top:20px;">${escapeHtml(threadDetail.sourceRecovery.title)}</h3>
                      <article class="workflow-card tone-yellow" id="thread-source-recovery">
                        <p>${escapeHtml(threadDetail.sourceRecovery.summary)}</p>
                        ${renderSceneCardBodyBlocks({
                          context: 'source-recovery',
                          threadPanel,
                          relationRecord: threadPanel,
                          executionChecklist,
                          relationTitle: '当前关联闭环',
                          middleHtml: `
                            ${renderMetaGrid(
                              [
                                { key: 'residual-pattern', label: '残留类型', value: threadDetail.sourceRecovery.residualPatternLabel },
                                { key: 'evidence-status', label: '证据状态', value: threadDetail.sourceRecovery.evidenceStatusLabel },
                                { key: 'source-label', label: '线程来源', value: threadDetail.sourceRecovery.sourceLabel },
                                { key: 'latest-checkpoint', label: '最近 Checkpoint', value: threadDetail.sourceRecovery.latestCheckpointLabel },
                                { key: 'checkpoint-summary', label: 'Checkpoint 摘要', value: threadDetail.sourceRecovery.latestCheckpointSummary },
                              ],
                              {
                                context: 'source-recovery',
                              },
                            )}
                            ${
                              threadDetail.sourceRecovery.evidenceDetail
                                ? renderWorkflowNextSection('证据说明', threadDetail.sourceRecovery.evidenceDetail, {
                                    context: 'source-recovery',
                                    block: 'evidence-detail',
                                  })
                                : ''
                            }
                            ${renderWorkflowNextSection('建议处理', threadDetail.sourceRecovery.cleanupHint, {
                              context: 'source-recovery',
                              block: 'cleanup-hint',
                            })}
                            ${
                              (threadDetail.sourceRecovery.suggestions || []).length > 0
                                ? `
                                  ${renderWorkflowNextSection('建议来源', threadDetail.sourceRecovery.suggestionHint || '', {
                                    context: 'source-recovery',
                                    block: 'suggestion-hint',
                                  })}
                                  ${renderMetaGrid(
                                    threadDetail.sourceRecovery.suggestions.map((suggestion, index) => ({
                                      key: `suggestion-${index + 1}`,
                                      label: suggestion.label,
                                      value: suggestion.reason
                                        ? `${suggestion.value} · ${suggestion.reason}`
                                        : suggestion.value,
                                    })),
                                    {
                                      context: 'source-recovery-suggestions',
                                    },
                                  )}
                                `
                                : ''
                            }
                            ${
                              threadDetail.sourceRecovery.briefId
                                ? renderWorkflowNextSection(
                                    '直接修补来源',
                                    threadDetail.sourceRecovery.submitHint || '',
                                    {
                                      context: 'source-recovery',
                                      block: 'source-repair',
                                      extraHtml: `
                                        <div class="source-recovery-form" data-source-recovery-form>
                                          <label class="source-recovery-field">
                                            <span>source_url</span>
                                            <input type="text" data-source-recovery-url value="${escapeHtml(threadDetail.sourceRecovery.suggestedSourceUrl || '')}" placeholder="例如 notion://page/.../discussion/.../comment/..." />
                                          </label>
                                          <label class="source-recovery-field">
                                            <span>source_ref</span>
                                            <input type="text" data-source-recovery-ref value="${escapeHtml(threadDetail.sourceRecovery.suggestedSourceRef || '')}" placeholder="例如 command:CMD-20260509-001" />
                                          </label>
                                          <div class="decision-action-buttons">
                                            <button type="button" data-source-recovery-submit data-brief-id="${escapeHtml(threadDetail.sourceRecovery.briefId)}">保存来源线索</button>
                                          </div>
                                        </div>
                                      `,
                                    },
                                  )
                                : ''
                            }
                            ${
                              (threadDetail.sourceRecovery.steps || []).length > 0
                                ? `<ul class="workflow-steps">${(threadDetail.sourceRecovery.steps || [])
                                    .map((step) => `<li>${escapeHtml(step)}</li>`)
                                    .join('')}</ul>`
                                : ''
                            }
                          `,
                          middleAttributes: {
                            'data-scene-card-body-middle': 'source-recovery-details',
                          },
                        })}
                        <div class="thread-task-links">
                          <a href="${escapeHtml(threadDetail.sourceRecovery.governanceHref)}">返回线程治理</a>
                        </div>
                      </article>
                    `
                    : ''
                }

                <h3 id="task-flow">任务流转</h3>
                <article class="workflow-card" id="thread-workflow-card" data-thread-workflow-card>
                  <h4>${escapeHtml(threadDetail.workflow.title)}</h4>
                  <p>${escapeHtml(threadDetail.workflow.summary)}</p>
                  ${renderSceneCardBodyBlocks({
                    context: 'thread-workflow-card',
                    threadPanel,
                    relationRecord: {
                      focusLabel: threadDetail.workflow.focusChecklistLabel,
                      focusNote: threadDetail.workflow.focusChecklistNote,
                      checklistStepLabel: threadDetail.workflow.focusChecklistStepLabel,
                      checklistStepTitle: threadDetail.workflow.focusChecklistStepTitle,
                      checklistProgressLabel: threadDetail.workflow.focusChecklistProgressLabel,
                      checklistProgressSummary: threadDetail.workflow.focusChecklistProgressSummary,
                    },
                    executionChecklist,
                    middleHtml: `
                      ${
                        threadDetail.workflow.present
                          ? `
                            <div class="workflow-metrics">
                              <div class="workflow-metric">
                                <strong>命令</strong>
                                <span>${escapeHtml(String(threadDetail.workflow.counts?.commands || 0))}</span>
                              </div>
                              <div class="workflow-metric">
                                <strong>Run</strong>
                                <span>${escapeHtml(String(threadDetail.workflow.counts?.runs || 0))}</span>
                              </div>
                              <div class="workflow-metric">
                                <strong>回执</strong>
                                <span>${escapeHtml(String(threadDetail.workflow.counts?.receipts || 0))}</span>
                              </div>
                              <div class="workflow-metric">
                                <strong>Checkpoint</strong>
                                <span>${escapeHtml(String(threadDetail.workflow.counts?.checkpoints || 0))}</span>
                              </div>
                            </div>
                          `
                          : ''
                      }
                      ${
                        threadDetail.workflow.steps.length > 0
                          ? `<ul class="workflow-steps">${threadDetail.workflow.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ul>`
                          : `<div class="muted">当前线程还没有形成可视化的评论驱动任务链路。</div>`
                      }
                      ${renderMetaGrid([
                        { label: '聚焦子任务', value: threadDetail.workflow.focusTaskLabel },
                        { label: '流转视角', value: threadDetail.workflow.focusScopeLabel },
                        ...buildChecklistInlineMeta({
                          checklistStepLabel: threadDetail.workflow.focusChecklistStepLabel,
                          checklistStepTitle: threadDetail.workflow.focusChecklistStepTitle,
                          checklistProgressLabel: threadDetail.workflow.focusChecklistProgressLabel,
                        }),
                        { label: '并行情况', value: threadDetail.workflow.parallelSummary },
                        { label: '最新回执', value: threadDetail.workflow.latestReceiptLabel },
                        { label: '回执摘要', value: threadDetail.workflow.latestReceiptSummary },
                        { label: '最新 Checkpoint', value: threadDetail.workflow.latestCheckpointLabel },
                        { label: 'Checkpoint 摘要', value: threadDetail.workflow.latestCheckpointSummary },
                      ])}
                    `,
                    middleAttributes: {
                      'data-scene-card-body-middle': 'thread-workflow-details',
                    },
                    nodeGuidance: pickWorkflowNodeGuidance(threadDetail.workflow),
                    extraWorkflowBlocks: [
                      renderWorkflowNextSection('下一步', threadDetail.workflow.nextAction, {
                        context: 'thread-workflow-card',
                        block: 'next-action',
                      }),
                    ],
                  })}
                  ${
                    threadDetail.workflow.sourceUrl
                      ? `<a class="thread-event-link" href="${escapeHtml(threadDetail.workflow.sourceUrl)}" target="_blank" rel="noreferrer">打开原始评论</a>`
                      : ''
                  }
                  ${
                    threadDetail.workflow.present && threadDetail.workflow.commandId && threadDetail.workflow.ownerAgent
                      ? `
                        <div data-thread-inline-action-box="workflow">
                          <textarea class="workflow-note" data-workflow-note data-thread-inline-action-note="workflow" placeholder="补充新的执行说明（可选）"></textarea>
                          <div class="decision-action-buttons" data-thread-inline-action-list="workflow">
                            <button type="button" data-workflow-action="continue" data-command-id="${escapeHtml(threadDetail.workflow.commandId)}" data-owner-agent="${escapeHtml(threadDetail.workflow.ownerAgent)}" data-thread-inline-action-button="continue">继续执行</button>
                            <button type="button" data-workflow-action="improve" data-command-id="${escapeHtml(threadDetail.workflow.commandId)}" data-owner-agent="${escapeHtml(threadDetail.workflow.ownerAgent)}" data-thread-inline-action-button="improve">要求修改</button>
                            <button type="button" data-workflow-action="retry" data-command-id="${escapeHtml(threadDetail.workflow.commandId)}" data-owner-agent="${escapeHtml(threadDetail.workflow.ownerAgent)}" data-thread-inline-action-button="retry">重新执行</button>
                            <button type="button" data-workflow-action="stop" data-command-id="${escapeHtml(threadDetail.workflow.commandId)}" data-owner-agent="${escapeHtml(threadDetail.workflow.ownerAgent)}" data-thread-inline-action-button="stop">停止任务</button>
                          </div>
                        </div>
                      `
                      : ''
                  }
                </article>

                <h3 style="margin-top:20px;">协作输入</h3>
                <article class="workflow-card" id="workspace-compose" data-workspace-compose-card>
                  ${
                    selectedThread
                      ? `
                        <p>在这里直接补充新的自然语言协作指令。默认会按“继续执行”进入 Cortex 链路；如果要明确修改、重试或停止，也可以在正文里写 <code>[improve]</code>、<code>[retry]</code>、<code>[stop]</code>。</p>
                        ${renderThreadStateSceneBlock(threadPanel, 'compose-card')}
                        ${renderChecklistRelationSceneBlock(threadPanel, executionChecklist, 'compose-card', {
                          title: '当前关联闭环',
                        })}
                        ${renderMetaGrid([
                          { label: '挂载线程', value: selectedThread.thread_label || selectedThread.thread_key },
                          { label: '默认负责人', value: composeOwnerAgent || '未分配，将由 Cortex 自动判断' },
                        ])}
                        <div data-thread-inline-action-box="compose">
                          <textarea class="workflow-note" data-compose-note data-thread-inline-action-note="compose" placeholder="例如：把这条线程的下一步计划压缩成 3 条并继续推进；或者说明这里为什么需要黄灯 / 红灯拍板。"></textarea>
                          <div class="decision-action-buttons" data-thread-inline-action-list="compose">
                            <button type="button" data-compose-mode="comment" data-thread-inline-action-button="comment">直接继续执行</button>
                            <button type="button" data-compose-mode="yellow" data-thread-inline-action-button="yellow">挂黄灯待审</button>
                            <button type="button" data-compose-mode="red" data-thread-inline-action-button="red">发红灯拍板</button>
                          </div>
                        </div>
                      `
                      : `
                        <div class="muted">当前还没有线程进入工作台，先从左侧线程目录或首页任务卡进入一个真实线程，再在这里发起协作输入。</div>
                      `
                  }
                </article>

                <h3 id="comment-threads" style="margin-top:20px;">评论线程</h3>
                <article class="workflow-card comment-summary-card" data-comment-summary-card>
                  <h4>${escapeHtml(commentSummary?.headline || '评论线程总览')}</h4>
                  <p>${escapeHtml(commentSummary?.detail || '这里会先说明当前评论队列里最需要你关注的是什么。')}</p>
                  ${renderThreadStateSceneBlock(threadPanel, 'comment-summary-card')}
                  ${renderChecklistRelationSceneBlock(threadPanel, executionChecklist, 'comment-summary-card', {
                    title: '当前关联闭环',
                  })}
                  <div class="comment-summary-kpis">
                    <span>${escapeHtml(String(commentSummary?.triageCount ?? commentSummary?.triage_count ?? 0))} 待分流</span>
                    <span>${escapeHtml(String(commentSummary?.readyCount ?? commentSummary?.ready_count ?? 0))} 已接回执行</span>
                    <span>${escapeHtml(String(commentSummary?.rejectedCount ?? commentSummary?.rejected_count ?? 0))} 已拦截</span>
                    <span>${escapeHtml(String(commentSummary?.resolvedCount ?? commentSummary?.resolved_count ?? 0))} 历史层</span>
                  </div>
                </article>
                <div
                  class="comment-filter-bar"
                  data-comment-filter-bar
                  data-default-filter="${escapeHtml(
                    commentSummary?.selectedFilter ||
                      commentSummary?.selected_filter ||
                      commentSummary?.defaultFilter ||
                      commentSummary?.default_filter ||
                      'all',
                  )}"
                >
                  ${(commentSummary?.filters || [])
                    .map(
                      (filter) => `
                        <button
                          type="button"
                          class="comment-filter-button${
                            filter.value ===
                            (commentSummary?.selectedFilter ||
                              commentSummary?.selected_filter ||
                              commentSummary?.defaultFilter ||
                              commentSummary?.default_filter ||
                              'all')
                              ? ' is-active'
                              : ''
                          }"
                          data-comment-filter="${escapeHtml(filter.value)}"
                          data-comment-filter-headline="${escapeHtml(filter.headline || '')}"
                          data-comment-filter-detail="${escapeHtml(filter.detail || '')}"
                        >
                          ${escapeHtml(filter.label)} · ${escapeHtml(String(filter.count || 0))}
                        </button>
                      `,
                    )
                    .join('')}
                </div>
                <article class="comment-filter-status" data-comment-filter-status>
                  <strong data-comment-filter-status-headline>${escapeHtml(commentSummary?.selectedFocus?.headline || commentSummary?.defaultFocus?.headline || '当前聚焦：全部评论 · 0 条')}</strong>
                  <span class="muted" data-comment-filter-status-detail>${escapeHtml(commentSummary?.selectedFocus?.detail || commentSummary?.defaultFocus?.detail || '这里会解释当前筛选层为什么值得优先看。')}</span>
                  ${renderThreadStateSceneBlock(threadPanel, 'comment-filter-status')}
                  ${renderChecklistRelationSceneBlock(threadPanel, executionChecklist, 'comment-filter-status', {
                    title: '当前关联闭环',
                  })}
                </article>
                ${renderCommentFocusPanel(commentFocusMap, commentSummary, executionChecklist, threadPanel)}
                <div class="thread-event-list" data-comment-thread-list>
                  ${
                    threadDetail.comment_threads.length > 0
                      ? threadDetail.comment_threads
                          .map((comment) => renderCommentThreadCard(comment, executionChecklist, threadPanel))
                          .join('')
                      : `<div class="muted">当前线程还没有进入工作台的评论记录。</div>`
                  }
                </div>

                <h3>关联任务</h3>
                <div class="thread-task-grid">
                  ${
                    threadPanel.tasks.length > 0
                      ? threadPanel.tasks
                          .map((task) =>
                            renderThreadTask(
                              task,
                              project.projectId,
                              document.documentId,
                              documentContext,
                              executionChecklist,
                              threadPanel,
                            ),
                          )
                          .join('')
                      : `<div class="muted">当前还没有与这个文档关联的执行线程。</div>`
                  }
                </div>

                <h3 id="quick-decisions" style="margin-top:20px;">快速拍板</h3>
                <div class="decision-action-list">
                  ${
                    threadDetail.open_decisions.length > 0
                      ? threadDetail.open_decisions
                          .map((decision) =>
                            renderDecisionActionCard(decision, threadDetail.workflow, executionChecklist, threadPanel),
                          )
                          .join('')
                      : `<div class="muted">当前线程没有待拍板决策，系统可以继续自行推进。</div>`
                  }
                </div>

                <h3 style="margin-top:20px;">线程事件</h3>
                <article
                  class="workflow-card thread-event-summary-card"
                  id="thread-event-summary-card"
                  data-thread-event-summary-card
                >
                  <h4>线程事件总览</h4>
                  <p>${escapeHtml(threadEventSummary)}</p>
                  ${renderThreadStateSceneBlock(threadPanel, 'thread-event-summary-card')}
                  ${renderChecklistRelationSceneBlock(threadPanel, executionChecklist, 'thread-event-summary-card', {
                    title: '当前关联闭环',
                  })}
                  <div class="comment-summary-kpis">
                    <span>${escapeHtml(String(threadDetail.counts.commands || 0))} 命令</span>
                    <span>${escapeHtml(String(threadDetail.counts.runs || 0))} Run</span>
                    <span>${escapeHtml(String(threadDetail.counts.receipts || 0))} 回执</span>
                    <span>${escapeHtml(String(threadDetail.counts.checkpoints || 0))} Checkpoint</span>
                    <span>${escapeHtml(String(threadDetail.counts.decisions || 0))} 决策</span>
                    <span>${escapeHtml(String(threadDetail.counts.inbox || 0))} Inbox</span>
                  </div>
                </article>
                <div class="thread-event-list">
                  ${
                    threadDetail.events.length > 0
                      ? threadDetail.events.map((event) => renderThreadEvent(event, threadPanel)).join('')
                      : `<div class="muted">当前线程还没有可展示的执行事件。</div>`
                  }
                </div>
                <div class="workspace-feedback" data-thread-feedback>你可以在这里直接处理红灯决策，不必跳回旧链路。</div>
              `
          }
        </aside>
      </div>
    </div>

    <script>
      const projectId = ${JSON.stringify(project.projectId)};
      const documentId = ${JSON.stringify(document.documentId)};
      const documentSaveUrl = ${JSON.stringify(documentSaveUrl)};
      const threadCommentUrl = ${JSON.stringify(threadCommentUrl)};
      const threadDecisionUrl = ${JSON.stringify(threadDecisionUrl)};
      const taskBriefSourceUpdateUrl = '/task-briefs/update-source';

      async function postJson(url, payload) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok || data.ok === false) {
          throw new Error(data.error || '请求失败');
        }
        return data;
      }

      const documentEditor = document.querySelector('[data-document-editor]');
      const documentPreview = document.querySelector('[data-document-preview]');
      const documentOutline = document.querySelector('[data-document-outline]');
      const documentFeedback = document.querySelector('[data-document-feedback]');
      const saveButton = document.querySelector('[data-save-document]');

      function renderMarkdownDocumentClient(markdown) {
        const lines = String(markdown || '').split(/\\r?\\n/);
        const html = [];
        const outline = [];
        let inList = false;
        let headingIndex = 0;

        function escapeHtmlClient(value) {
          return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
        }

        function compactClient(value) {
          return String(value || '').replace(/\\s+/g, ' ').trim();
        }

        function pushHeading(title, level) {
          const safeTitle = compactClient(title);
          if (!safeTitle) return;
          headingIndex += 1;
          const anchorId = 'doc-heading-' + headingIndex;
          outline.push({ level, title: safeTitle, anchorId });
          html.push('<h' + Math.min(level + 1, 4) + ' id="' + anchorId + '">' + escapeHtmlClient(safeTitle) + '</h' + Math.min(level + 1, 4) + '>');
        }

        for (const line of lines) {
          const raw = line.trimEnd();
          const trimmed = raw.trim();

          if (!trimmed) {
            if (inList) {
              html.push('</ul>');
              inList = false;
            }
            html.push('<div class="doc-spacer"></div>');
            continue;
          }

          const headingMatch = trimmed.match(/^(#{1,3})\\s+(.+)$/);
          if (headingMatch) {
            if (inList) {
              html.push('</ul>');
              inList = false;
            }
            pushHeading(headingMatch[2], Math.min(headingMatch[1].length, 3));
            continue;
          }

          const boldHeadingMatch = trimmed.match(/^\\*\\*(.+)\\*\\*$/);
          if (boldHeadingMatch) {
            if (inList) {
              html.push('</ul>');
              inList = false;
            }
            pushHeading(boldHeadingMatch[1], 2);
            continue;
          }

          if (trimmed.startsWith('- ')) {
            if (!inList) {
              html.push('<ul>');
              inList = true;
            }
            html.push('<li>' + escapeHtmlClient(trimmed.slice(2)) + '</li>');
            continue;
          }

          if (inList) {
            html.push('</ul>');
            inList = false;
          }

          html.push('<p>' + escapeHtmlClient(trimmed) + '</p>');
        }

        if (inList) {
          html.push('</ul>');
        }

        return { html: html.join('\\n'), outline };
      }

      function renderDocumentOutlineClient(outline) {
        if (!Array.isArray(outline) || outline.length === 0) {
          return '<div class="muted">当前文档还没有可导航的标题结构。</div>';
        }

        return '<div class="doc-outline-list">' + outline.map((entry) =>
          '<a class="doc-outline-link level-' + String(entry.level || 1) + '" href="#' + entry.anchorId + '">' + entry.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;') + '</a>'
        ).join('') + '</div>';
      }

      function markDocumentDirty() {
        if (saveButton) {
          saveButton.classList.add('is-dirty');
        }
        if (documentFeedback) {
          documentFeedback.textContent = '当前有未保存修改，预览已即时更新。';
        }
      }

      if (documentEditor) {
        documentEditor.addEventListener('input', () => {
          const rendered = renderMarkdownDocumentClient(documentEditor.value);
          if (documentPreview) {
            documentPreview.innerHTML = rendered.html;
          }
          if (documentOutline) {
            documentOutline.innerHTML = renderDocumentOutlineClient(rendered.outline);
          }
          markDocumentDirty();
        });
      }

      if (saveButton && documentEditor) {
        saveButton.addEventListener('click', async () => {
          saveButton.disabled = true;
          documentFeedback.textContent = '正在保存到本地 Cortex Markdown...';
          try {
            const result = await postJson(documentSaveUrl, {
              project_id: projectId,
              body: documentEditor.value,
            });
            documentPreview.innerHTML = result.document.html;
            if (documentOutline) {
              documentOutline.innerHTML = renderDocumentOutlineClient(result.document.outline || []);
            }
            documentFeedback.textContent = '已保存。主版本已更新到本地 Markdown。';
            saveButton.classList.remove('is-dirty');
          } catch (error) {
            documentFeedback.textContent = '保存失败：' + error.message;
          } finally {
            saveButton.disabled = false;
          }
        });
      }

      const threadFeedback = document.querySelector('[data-thread-feedback]');
      const memoryReviewButtons = document.querySelectorAll('[data-memory-review-action]');
      for (const button of memoryReviewButtons) {
        button.addEventListener('click', async () => {
          const memoryId = button.getAttribute('data-memory-id');
          const action = button.getAttribute('data-memory-review-action');
          const actionBox = button.closest('[data-memory-review-box]');
          const noteField = actionBox ? actionBox.querySelector('[data-memory-review-note]') : null;
          const reviewNote = noteField && noteField.value ? noteField.value.trim() : '';

          if (!memoryId || !action) {
            return;
          }

          const statusByAction = {
            accepted: 'durable',
            rejected: 'rejected',
            needs_followup: 'candidate',
          };
          const actionLabel =
            action === 'accepted'
              ? '接受为 durable memory'
              : action === 'rejected'
                ? '拒绝沉淀'
                : '标记为 needs_followup';

          button.disabled = true;
          if (threadFeedback) {
            threadFeedback.textContent = '正在更新 memory reviewer 决策...';
          }
          try {
            await postJson('/memory/' + encodeURIComponent(memoryId) + '/review', {
              review_state: action,
              status: statusByAction[action] || undefined,
              next_step: reviewNote || null,
              review_actor: 'workspace_memory_reviewer',
              review_note: reviewNote || null,
            });
            if (threadFeedback) {
              threadFeedback.textContent = actionLabel + ' 已提交，正在刷新 reviewer 现场...';
            }
            window.location.reload();
          } catch (error) {
            if (threadFeedback) {
              threadFeedback.textContent = '提交失败：' + error.message;
            }
            button.disabled = false;
          }
        });
      }

      const memoryReviewerRefreshButtons = document.querySelectorAll('[data-memory-reviewer-refresh]');
      for (const button of memoryReviewerRefreshButtons) {
        button.addEventListener('click', async () => {
          const memoryId = button.getAttribute('data-memory-id');
          if (!memoryId) {
            return;
          }

          button.disabled = true;
          if (threadFeedback) {
            threadFeedback.textContent = '正在重跑 reviewer 评估...';
          }
          try {
            await postJson('/memory/' + encodeURIComponent(memoryId) + '/reviewer-review', {
              force: true,
            });
            if (threadFeedback) {
              threadFeedback.textContent = 'Reviewer 评估已刷新，正在回到最新现场...';
            }
            window.location.reload();
          } catch (error) {
            if (threadFeedback) {
              threadFeedback.textContent = '刷新失败：' + error.message;
            }
            button.disabled = false;
          }
        });
      }

      const suggestionReviewButtons = document.querySelectorAll('[data-suggestion-review-action]');
      for (const button of suggestionReviewButtons) {
        button.addEventListener('click', async () => {
          const suggestionId = button.getAttribute('data-suggestion-id');
          const action = button.getAttribute('data-suggestion-review-action');
          const actionBox = button.closest('[data-suggestion-review-box]');
          const noteField = actionBox ? actionBox.querySelector('[data-suggestion-review-note]') : null;
          const reviewNote = noteField && noteField.value ? noteField.value.trim() : '';

          if (!suggestionId || !action) {
            return;
          }

          const actionLabel =
            action === 'accept'
              ? 'Suggestion 已转成 candidate memory'
              : 'Suggestion 已标记为暂不沉淀';

          button.disabled = true;
          if (threadFeedback) {
            threadFeedback.textContent = action === 'accept'
              ? '正在把 suggestion 转成 candidate memory...'
              : '正在标记 suggestion 暂不沉淀...';
          }
          try {
            if (action === 'accept') {
              await postJson('/suggestions/' + encodeURIComponent(suggestionId) + '/accept', {
                applied_at: new Date().toISOString(),
                review_note: reviewNote || null,
                review_actor: 'workspace_memory_reviewer',
              });
            } else {
              await postJson('/suggestions/' + encodeURIComponent(suggestionId) + '/reject', {
                rejected_reason: reviewNote || '当前先不沉淀为 memory',
                review_note: reviewNote || null,
                review_actor: 'workspace_memory_reviewer',
                skip_memory_projection: true,
              });
            }
            if (threadFeedback) {
              threadFeedback.textContent = actionLabel + '，正在刷新 reviewer 现场...';
            }
            window.location.reload();
          } catch (error) {
            if (threadFeedback) {
              threadFeedback.textContent = '提交失败：' + error.message;
            }
            button.disabled = false;
          }
        });
      }

      const sourceRecoveryButton = document.querySelector('[data-source-recovery-submit]');
      if (sourceRecoveryButton) {
        sourceRecoveryButton.addEventListener('click', async () => {
          const briefId = sourceRecoveryButton.getAttribute('data-brief-id');
          const sourceUrlField = document.querySelector('[data-source-recovery-url]');
          const sourceRefField = document.querySelector('[data-source-recovery-ref]');
          const sourceUrl = sourceUrlField ? sourceUrlField.value.trim() : '';
          const sourceRef = sourceRefField ? sourceRefField.value.trim() : '';
          const currentUrl = new URL(window.location.href);

          if (!sourceUrl && !sourceRef) {
            threadFeedback.textContent = '至少补一个来源字段，再保存这条来源线索。';
            return;
          }

          const payload = {
            brief_id: briefId,
            project_id: projectId,
            document_id: documentId,
          };
          const view = currentUrl.searchParams.get('view');
          const threadFilter = currentUrl.searchParams.get('thread_filter');
          const commentFilter = currentUrl.searchParams.get('comment_filter');
          const residualPattern = currentUrl.searchParams.get('residual_pattern');
          const includeResidual = currentUrl.searchParams.get('include_residual');
          const includeSynthetic = currentUrl.searchParams.get('include_synthetic');

          if (view) {
            payload.view = view;
          }
          if (threadFilter) {
            payload.thread_filter = threadFilter;
          }
          if (commentFilter) {
            payload.comment_filter = commentFilter;
          }
          if (residualPattern) {
            payload.residual_pattern = residualPattern;
          }
          if (includeResidual) {
            payload.include_residual = includeResidual;
          }
          if (includeSynthetic) {
            payload.include_synthetic = includeSynthetic;
          }
          if (sourceUrl) {
            payload.source_url = sourceUrl;
          }
          if (sourceRef) {
            payload.source_ref = sourceRef;
          }

          sourceRecoveryButton.disabled = true;
          threadFeedback.textContent = '正在补回这条子任务的来源线索...';
          try {
            const result = await postJson(taskBriefSourceUpdateUrl, payload);
            threadFeedback.textContent = '来源线索已保存，正在切回修补后的真实线程现场...';
            const refreshUrl = result.refresh_url || result.refreshUrl;
            if (refreshUrl) {
              window.location.assign(refreshUrl);
              return;
            }

            const nextThreadKey = result.brief?.thread_key || result.brief?.threadKey;
            if (nextThreadKey) {
              currentUrl.pathname = '/workspace/threads/' + encodeURIComponent(nextThreadKey);
              window.location.assign(currentUrl.toString());
              return;
            }

            window.location.reload();
          } catch (error) {
            threadFeedback.textContent = '保存失败：' + error.message;
            sourceRecoveryButton.disabled = false;
          }
        });
      }
      function findCommentReplyNote(commandId) {
        return (
          document.querySelector('[data-comment-reply-note="' + commandId + '"]') ||
          document.querySelector('[data-comment-note="' + commandId + '"]') ||
          document.querySelector('[data-comment-promote-note="' + commandId + '"]')
        );
      }
      const decisionButtons = document.querySelectorAll('[data-decision-action]');
      for (const button of decisionButtons) {
        button.addEventListener('click', async () => {
          if (!threadDecisionUrl) {
            return;
          }

          const card = button.closest('[data-decision-card]');
          const decisionId = button.getAttribute('data-decision-id');
          const status = button.getAttribute('data-decision-action');
          const noteField = card ? card.querySelector('[data-decision-note]') : null;
          const decisionNote = noteField ? noteField.value : '';

          button.disabled = true;
          threadFeedback.textContent = '正在提交决策...';
          try {
            await postJson(threadDecisionUrl, {
              project_id: projectId,
              document_id: documentId,
              decision_id: decisionId,
              status,
              decision_note: decisionNote,
            });
            threadFeedback.textContent = '决策已提交，正在刷新线程现场...';
            window.location.reload();
          } catch (error) {
            threadFeedback.textContent = '提交失败：' + error.message;
            button.disabled = false;
          }
        });
      }

      const workflowButtons = document.querySelectorAll('[data-workflow-action]');
      for (const button of workflowButtons) {
        button.addEventListener('click', async () => {
          const commandId = button.getAttribute('data-command-id');
          const ownerAgent = button.getAttribute('data-owner-agent');
          const action = button.getAttribute('data-workflow-action');
          const noteField = document.querySelector('[data-workflow-note]');
          const instruction = noteField && noteField.value.trim() ? noteField.value.trim() : button.textContent.trim();

          button.disabled = true;
          threadFeedback.textContent = '正在生成下一条派生命令...';
          try {
            await postJson('/commands/derive', {
              parent_command_id: commandId,
              owner_agent: ownerAgent,
              parsed_action: action,
              instruction,
              reason: 'workspace_thread_action:' + action,
            });
            threadFeedback.textContent = '新的派生命令已生成，正在刷新线程现场...';
            window.location.reload();
          } catch (error) {
            threadFeedback.textContent = '派发失败：' + error.message;
            button.disabled = false;
          }
        });
      }

      const commentReplyButtons = document.querySelectorAll('[data-comment-reply-mode]');
      for (const button of commentReplyButtons) {
        button.addEventListener('click', async () => {
          if (!threadCommentUrl) {
            return;
          }

          const commandId = button.getAttribute('data-command-id');
          const ownerAgent = button.getAttribute('data-owner-agent');
          const mode = button.getAttribute('data-comment-reply-mode') || 'comment';
          const commentTitle = button.getAttribute('data-comment-title') || '';
          const commentSummary = button.getAttribute('data-comment-summary') || '';
          const noteField = findCommentReplyNote(commandId);
          const body = noteField && noteField.value ? noteField.value.trim() : '';

          if (!body) {
            threadFeedback.textContent = '先写下你要回复这条评论的内容，再继续提交。';
            return;
          }

          button.disabled = true;
          threadFeedback.textContent = '正在写入这条评论的线程回复...';
          try {
            const result = await postJson(threadCommentUrl, {
              project_id: projectId,
              document_id: documentId,
              body,
              mode,
              reply_only: true,
              owner_agent: ownerAgent,
              reply_to_command_id: commandId,
              reply_to_comment_title: commentTitle,
              reply_to_comment_summary: commentSummary,
            });
            threadFeedback.textContent = '线程回复已写入，正在刷新当前评论现场...';
            window.location.assign(result.refresh_url || result.refreshUrl || window.location.href);
          } catch (error) {
            threadFeedback.textContent = '提交失败：' + error.message;
            button.disabled = false;
          }
        });
      }

      const commentCommandButtons = document.querySelectorAll('[data-comment-command-action]');
      for (const button of commentCommandButtons) {
        button.addEventListener('click', async () => {
          const commandId = button.getAttribute('data-command-id');
          const ownerAgent = button.getAttribute('data-owner-agent');
          const action = button.getAttribute('data-comment-command-action');
          const noteField = findCommentReplyNote(commandId);
          const instruction = noteField && noteField.value.trim() ? noteField.value.trim() : button.textContent.trim();

          button.disabled = true;
          threadFeedback.textContent = '正在基于评论生成下一条派生命令...';
          try {
            await postJson('/commands/derive', {
              parent_command_id: commandId,
              owner_agent: ownerAgent,
              parsed_action: action,
              instruction,
              reason: 'workspace_comment_action:' + action,
            });
            threadFeedback.textContent = '评论动作已派发，正在刷新线程现场...';
            window.location.reload();
          } catch (error) {
            threadFeedback.textContent = '派发失败：' + error.message;
            button.disabled = false;
          }
        });
      }

      const commentPromoteButtons = document.querySelectorAll('[data-comment-promote-action]');
      for (const button of commentPromoteButtons) {
        button.addEventListener('click', async () => {
          const commandId = button.getAttribute('data-command-id');
          const ownerAgent = button.getAttribute('data-owner-agent');
          const action = button.getAttribute('data-comment-promote-action');
          const noteField = findCommentReplyNote(commandId);
          const instruction = noteField && noteField.value ? noteField.value.trim() : '';

          if (!instruction) {
            threadFeedback.textContent = '先补一句明确执行指令，再把这条 triage 评论接回执行链路。';
            return;
          }

          button.disabled = true;
          threadFeedback.textContent = '正在把 triage 评论转回执行链路...';
          try {
            await postJson('/commands/derive', {
              parent_command_id: commandId,
              owner_agent: ownerAgent,
              parsed_action: action,
              instruction,
              reason: 'workspace_comment_promote:' + action,
            });
            threadFeedback.textContent = '这条 triage 评论已经重新接回执行链路，正在刷新线程现场...';
            window.location.reload();
          } catch (error) {
            threadFeedback.textContent = '派发失败：' + error.message;
            button.disabled = false;
          }
        });
      }

      const commentEscalateButtons = document.querySelectorAll('[data-comment-escalate-mode]');
      for (const button of commentEscalateButtons) {
        button.addEventListener('click', async () => {
          if (!threadCommentUrl) {
            return;
          }

          const commandId = button.getAttribute('data-command-id');
          const ownerAgent = button.getAttribute('data-owner-agent');
          const mode = button.getAttribute('data-comment-escalate-mode');
          const commentSummary = button.getAttribute('data-comment-summary') || '';
          const noteField = findCommentReplyNote(commandId);
          const body = noteField && noteField.value ? noteField.value.trim() : '';

          if (!body) {
            threadFeedback.textContent = '先补一句明确说明，再把这条 triage 评论升级成黄灯或红灯。';
            return;
          }

          button.disabled = true;
          threadFeedback.textContent = mode === 'red' ? '正在把这条评论升级成红灯...' : '正在把这条评论升级成黄灯...';
          try {
            await postJson(threadCommentUrl, {
              project_id: projectId,
              document_id: documentId,
              body,
              mode,
              owner_agent: ownerAgent,
              context_quote: commentSummary ? '源评论：' + commentSummary : '',
            });
            threadFeedback.textContent = mode === 'red' ? '红灯已登记，正在刷新线程现场...' : '黄灯已登记，正在刷新线程现场...';
            window.location.reload();
          } catch (error) {
            threadFeedback.textContent = '升级失败：' + error.message;
            button.disabled = false;
          }
        });
      }

      const composeButtons = document.querySelectorAll('[data-compose-mode]');
      for (const button of composeButtons) {
        button.addEventListener('click', async () => {
          if (!threadCommentUrl) {
            return;
          }

          const mode = button.getAttribute('data-compose-mode');
          const noteField = document.querySelector('[data-compose-note]');
          const body = noteField && noteField.value ? noteField.value.trim() : '';
          if (!body) {
            threadFeedback.textContent = '先写下这条线程的新指令或拍板说明，再提交。';
            return;
          }

          button.disabled = true;
          threadFeedback.textContent =
            mode === 'red'
              ? '正在登记红灯决策...'
              : mode === 'yellow'
                ? '正在登记黄灯决策...'
                : '正在写入评论并生成下一步流转...';
          try {
            await postJson(threadCommentUrl, {
              project_id: projectId,
              document_id: documentId,
              body,
              mode,
            });
            threadFeedback.textContent =
              mode === 'red'
                ? '红灯已登记，线程现场正在刷新...'
                : mode === 'yellow'
                  ? '黄灯已登记，线程现场正在刷新...'
                  : '执行指令已写入，线程现场正在刷新...';
            window.location.reload();
          } catch (error) {
            threadFeedback.textContent = '提交失败：' + error.message;
            button.disabled = false;
          }
        });
      }

      const inboxButtons = document.querySelectorAll('[data-inbox-action]');
      for (const button of inboxButtons) {
        button.addEventListener('click', async () => {
          const inboxId = button.getAttribute('data-inbox-id');
          const action = button.getAttribute('data-inbox-action');
          if (!inboxId || !action) {
            return;
          }

          button.disabled = true;
          threadFeedback.textContent = '正在更新评论 triage 状态...';
          try {
            await postJson('/inbox/' + encodeURIComponent(inboxId) + '/act', {
              action,
            });
            threadFeedback.textContent = '评论状态已更新，正在刷新线程现场...';
            window.location.reload();
          } catch (error) {
            threadFeedback.textContent = '更新失败：' + error.message;
            button.disabled = false;
          }
        });
      }

      const commentFilterBar = document.querySelector('[data-comment-filter-bar]');
      const commentFilterButtons = document.querySelectorAll('[data-comment-filter]');
      const commentFocusEntries = document.querySelectorAll('[data-comment-focus-entry]');
      const commentCards = document.querySelectorAll('[data-comment-bucket]');
      const commentFilterHeadline = document.querySelector('[data-comment-filter-status-headline]');
      const commentFilterDetail = document.querySelector('[data-comment-filter-status-detail]');
      const workspaceContextLinks = [...document.querySelectorAll('a[href^="/workspace"]')];
      let currentCommentFilter = 'all';

      function normalizeCommentFilter(filterValue) {
        const normalized = String(filterValue || 'all').trim().toLowerCase();
        return ['all', 'triage', 'ready', 'rejected', 'resolved'].includes(normalized) ? normalized : 'all';
      }

      function syncCommentFilterUrl(filterValue) {
        try {
          const nextUrl = new URL(window.location.href);
          if (filterValue !== 'all') {
            nextUrl.searchParams.set('comment_filter', filterValue);
          } else {
            nextUrl.searchParams.delete('comment_filter');
          }
          window.history.replaceState({}, '', nextUrl.toString());
        } catch {}
      }

      function syncCommentFilterLinks(filterValue) {
        for (const link of workspaceContextLinks) {
          const rawHref = link.getAttribute('href');
          if (!rawHref || !rawHref.startsWith('/workspace')) {
            continue;
          }

          try {
            const nextUrl = new URL(rawHref, window.location.origin);
            if (filterValue !== 'all') {
              nextUrl.searchParams.set('comment_filter', filterValue);
            } else {
              nextUrl.searchParams.delete('comment_filter');
            }
            link.setAttribute('href', nextUrl.pathname + nextUrl.search + nextUrl.hash);
          } catch {}
        }
      }

      function applyCommentFilter(filterValue, options = {}) {
        const normalized = normalizeCommentFilter(filterValue);
        currentCommentFilter = normalized;
        for (const card of commentCards) {
          const shouldHide = normalized !== 'all' && card.getAttribute('data-comment-bucket') !== normalized;
          card.classList.toggle('is-hidden', shouldHide);
        }
        for (const card of commentFocusEntries) {
          const shouldHide = card.getAttribute('data-comment-focus-for') !== normalized;
          card.classList.toggle('is-hidden', shouldHide);
        }
        let activeButton = null;
        for (const button of commentFilterButtons) {
          const isActive = button.getAttribute('data-comment-filter') === normalized;
          button.classList.toggle('is-active', isActive);
          if (isActive) {
            activeButton = button;
          }
        }
        if (activeButton && commentFilterHeadline) {
          commentFilterHeadline.textContent = activeButton.getAttribute('data-comment-filter-headline') || '当前聚焦：全部评论';
        }
        if (activeButton && commentFilterDetail) {
          commentFilterDetail.textContent =
            activeButton.getAttribute('data-comment-filter-detail') || '这里会解释当前筛选层为什么值得优先看。';
        }
        if (options.syncLinks !== false) {
          syncCommentFilterLinks(currentCommentFilter);
        }
        if (options.syncUrl === true) {
          syncCommentFilterUrl(currentCommentFilter);
        }
      }

      if (commentFilterBar && commentFilterButtons.length > 0) {
        const defaultFilter = commentFilterBar.getAttribute('data-default-filter') || 'all';
        applyCommentFilter(defaultFilter, { syncLinks: true, syncUrl: false });
        for (const button of commentFilterButtons) {
          button.addEventListener('click', () => {
            applyCommentFilter(button.getAttribute('data-comment-filter') || 'all', { syncLinks: true, syncUrl: true });
          });
        }
      }
    </script>
  </body>
</html>`;
}
