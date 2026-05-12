import { createHash } from 'node:crypto';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(text, maxLength = 42) {
  const normalized = compact(text);
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function stableHash(value) {
  return createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 12);
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

export function classifyThreadIdentityKey(value) {
  const raw = compact(value);
  if (!raw) {
    return 'unknown';
  }
  if (raw.startsWith('session:')) {
    return 'session';
  }
  if (raw.startsWith('thread:')) {
    return 'thread';
  }
  if (raw.startsWith('notion:')) {
    return 'notion';
  }
  if (raw.startsWith('source:')) {
    return 'source';
  }
  if (raw.startsWith('target:')) {
    return 'target';
  }
  if (raw.startsWith('brief:')) {
    return 'brief';
  }
  if (raw.startsWith('command:')) {
    return 'command';
  }
  if (raw.startsWith('run:')) {
    return 'run';
  }
  if (raw.startsWith('decision:')) {
    return 'decision';
  }
  if (raw.startsWith('project:')) {
    return 'project';
  }
  return 'unknown';
}

export function humanThreadIdentitySource(value) {
  const raw = compact(value);
  const kind = ['session', 'thread', 'notion', 'source', 'target', 'brief', 'command', 'run', 'decision', 'project'].includes(raw)
    ? raw
    : classifyThreadIdentityKey(raw);
  if (kind === 'session') {
    return '会话线程';
  }
  if (kind === 'thread') {
    return '显式线程键';
  }
  if (kind === 'notion') {
    return 'Notion 讨论';
  }
  if (kind === 'source') {
    return '源链接';
  }
  if (kind === 'target') {
    return '目标对象';
  }
  if (kind === 'brief') {
    return '任务简报回退';
  }
  if (kind === 'command') {
    return '命令回退';
  }
  if (kind === 'run') {
    return 'Run 回退';
  }
  if (kind === 'decision') {
    return '决策回退';
  }
  if (kind === 'project') {
    return '项目默认线程';
  }
  return '未分类来源';
}

export function parseNotionThreadRef(value) {
  const raw = compact(value);
  if (!raw) {
    return null;
  }

  const notionUriMatch = raw.match(/notion:\/\/page\/([^/?#]+)(?:\/discussion\/([^/?#]+))?(?:\/comment\/([^/?#]+))?/i);
  if (notionUriMatch) {
    return {
      pageId: notionUriMatch[1],
      discussionId: notionUriMatch[2] || null,
      commentId: notionUriMatch[3] || null,
    };
  }

  const queryMatch = raw.match(/[?&]page_id=([^&#]+)/i);
  if (queryMatch) {
    return {
      pageId: queryMatch[1],
      discussionId: null,
      commentId: null,
    };
  }

  return null;
}

export function threadSpecificity(threadKey) {
  const raw = compact(threadKey);
  if (!raw) {
    return 0;
  }
  if (raw.startsWith('session:')) {
    return 60;
  }
  if (raw.startsWith('thread:')) {
    return 58;
  }
  if (raw.startsWith('notion:')) {
    return 55;
  }
  if (raw.startsWith('source:')) {
    return 50;
  }
  if (raw.startsWith('target:')) {
    return 40;
  }
  if (raw.startsWith('brief:')) {
    return 20;
  }
  if (raw.startsWith('command:') || raw.startsWith('run:') || raw.startsWith('decision:')) {
    return 15;
  }
  if (raw.startsWith('project:')) {
    return 10;
  }
  return 5;
}

function inferThreadLabelHint(record) {
  return (
    compact(record.threadLabel || record.thread_label) ||
    compact(record.title) ||
    compact(record.question) ||
    compact(record.instruction) ||
    compact(record.summary) ||
    compact(record.target) ||
    compact(record.documentRef || record.document_ref) ||
    null
  );
}

export function deriveThreadIdentity(record = {}, fallback = {}) {
  const labelHint = inferThreadLabelHint(record);
  const explicitKey = compact(record.threadKey || record.thread_key);
  const explicitLabel = compact(record.threadLabel || record.thread_label);

  if (explicitKey) {
    const sourceKind = classifyThreadIdentityKey(explicitKey);
    return {
      key: explicitKey,
      label: explicitLabel || labelHint || explicitKey,
      concrete: !explicitKey.startsWith('project:'),
      explicit: true,
      sourceKind,
      sourceLabel: humanThreadIdentitySource(sourceKind),
    };
  }

  const channelSessionId = compact(record.channelSessionId || record.channel_session_id || record.sessionId || record.session_id);
  if (channelSessionId) {
    return {
      key: `session:${channelSessionId}`,
      label: explicitLabel || labelHint || `会话 ${channelSessionId}`,
      concrete: true,
      explicit: false,
      sourceKind: 'session',
      sourceLabel: humanThreadIdentitySource('session'),
    };
  }

  const explicitPageId = compact(record.pageId || record.page_id);
  const explicitDiscussionId = compact(record.discussionId || record.discussion_id);
  const explicitCommentId = compact(record.commentId || record.comment_id);
  const notionRef =
    explicitPageId
      ? {
          pageId: explicitPageId,
          discussionId: explicitDiscussionId || null,
          commentId: explicitCommentId || null,
        }
      : parseNotionThreadRef(record.sourceUrl || record.source_url || record.sourceRef || record.source_ref || record.documentRef || record.document_ref || null);

  if (notionRef) {
    return {
      key: notionRef.discussionId ? `notion:${notionRef.pageId}:${notionRef.discussionId}` : `notion:${notionRef.pageId}`,
      label: explicitLabel || labelHint || `Notion · ${notionRef.pageId}`,
      concrete: true,
      explicit: false,
      sourceKind: 'notion',
      sourceLabel: humanThreadIdentitySource('notion'),
    };
  }

  if (record.sourceUrl || record.source_url) {
    const sourceUrl = compact(record.sourceUrl || record.source_url);
    return {
      key: `source:${stableHash(sourceUrl)}`,
      label: explicitLabel || labelHint || summarize(sourceUrl, 42),
      concrete: true,
      explicit: false,
      sourceKind: 'source',
      sourceLabel: humanThreadIdentitySource('source'),
    };
  }

  const targetType = compact(record.targetType || record.target_type);
  const targetId = compact(record.targetId || record.target_id);
  if (targetType && targetId) {
    return {
      key: `target:${targetType}:${targetId}`,
      label: explicitLabel || labelHint || `${humanizeToken(targetType)} · ${targetId}`,
      concrete: true,
      explicit: false,
      sourceKind: 'target',
      sourceLabel: humanThreadIdentitySource('target'),
    };
  }

  const briefId = compact(record.briefId || record.brief_id);
  if (briefId) {
    return {
      key: `brief:${briefId}`,
      label: explicitLabel || labelHint || `任务 ${briefId}`,
      concrete: false,
      explicit: false,
      sourceKind: 'brief',
      sourceLabel: humanThreadIdentitySource('brief'),
    };
  }

  const commandId = compact(record.commandId || record.command_id);
  if (commandId) {
    return {
      key: `command:${commandId}`,
      label: explicitLabel || labelHint || `命令 ${commandId}`,
      concrete: false,
      explicit: false,
      sourceKind: 'command',
      sourceLabel: humanThreadIdentitySource('command'),
    };
  }

  const runId = compact(record.runId || record.run_id);
  if (runId) {
    return {
      key: `run:${runId}`,
      label: explicitLabel || labelHint || `Run ${runId}`,
      concrete: false,
      explicit: false,
      sourceKind: 'run',
      sourceLabel: humanThreadIdentitySource('run'),
    };
  }

  const decisionId = compact(record.decisionId || record.decision_id);
  if (decisionId) {
    return {
      key: `decision:${decisionId}`,
      label: explicitLabel || labelHint || `决策 ${decisionId}`,
      concrete: false,
      explicit: false,
      sourceKind: 'decision',
      sourceLabel: humanThreadIdentitySource('decision'),
    };
  }

  return {
    key: `project:${fallback.projectId || 'default'}`,
    label: explicitLabel || labelHint || fallback.projectName || fallback.projectId || '默认线程',
    concrete: false,
    explicit: false,
    sourceKind: 'project',
    sourceLabel: humanThreadIdentitySource('project'),
  };
}
