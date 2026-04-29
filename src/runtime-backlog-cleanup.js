function compact(value) {
  return String(value ?? '').trim();
}

function compactLower(value) {
  return compact(value).toLowerCase();
}

function joinText(parts = []) {
  return parts.map((part) => compact(part)).filter(Boolean).join('\n');
}

function parseTime(value) {
  const timestamp = Date.parse(compact(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function ageHoursSince(value, nowMs) {
  const timestamp = parseTime(value);
  if (timestamp === null) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (nowMs - timestamp) / (1000 * 60 * 60));
}

function isOlderThan(value, minimumAgeHours, nowMs) {
  return ageHoursSince(value, nowMs) >= minimumAgeHours;
}

function buildCleanupNote(reason, actor, nowIso) {
  return `[cleanup:${actor}] ${nowIso} ${reason}`;
}

function appendCleanupNote(existingText, reason, actor, nowIso) {
  const note = buildCleanupNote(reason, actor, nowIso);
  const current = compact(existingText);
  if (!current) {
    return note;
  }
  if (current.includes(note)) {
    return current;
  }
  return `${current}\n\n${note}`;
}

function createDecisionItem(decision, reason, actor, nowIso) {
  return {
    kind: 'decision',
    id: decision.decision_id || decision.decisionId,
    projectId: decision.project_id || decision.projectId,
    reason,
    note: buildCleanupNote(reason, actor, nowIso),
    createdAt: decision.created_at || decision.createdAt || null,
  };
}

function createCommandItem(command, reason, actor, nowIso) {
  return {
    kind: 'command',
    id: command.command_id || command.commandId,
    projectId: command.project_id || command.projectId,
    reason,
    note: appendCleanupNote(command.result_summary || command.resultSummary, reason, actor, nowIso),
    createdAt: command.created_at || command.createdAt || null,
  };
}

function createOutboxItem(message, reason, actor, nowIso) {
  return {
    kind: 'outbox',
    id: message.id,
    projectId:
      message.payload?.project_id ||
      message.payload?.projectId ||
      null,
    reason,
    note: appendCleanupNote(message.error, reason, actor, nowIso),
    createdAt: message.created_at || message.createdAt || null,
  };
}

export function classifyFailedCommand(command, options = {}) {
  const actor = options.actor || 'runtime-backlog-cleanup';
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = options.nowIso || new Date(nowMs).toISOString();
  const minimumAgeHours = Number.isFinite(options.minimumAgeHours) ? options.minimumAgeHours : 168;
  const createdAt = command.created_at || command.createdAt || command.updated_at || command.updatedAt;

  if (compactLower(command.status) !== 'failed') {
    return null;
  }

  if (!isOlderThan(createdAt, minimumAgeHours, nowMs)) {
    return null;
  }

  const blob = compactLower(
    joinText([
      command.command_id,
      command.commandId,
      command.instruction,
      command.context_quote,
      command.contextQuote,
      command.owner_agent,
      command.ownerAgent,
      command.source_url,
      command.sourceUrl,
      command.result_summary,
      command.resultSummary,
    ]),
  );

  if (blob.includes('obsolete validation artifact')) {
    return createCommandItem(command, '历史 validation artifact，已不再代表当前待办。', actor, nowIso);
  }

  if (blob.includes('codex smoke')) {
    return createCommandItem(command, '历史 Codex / Notion smoke 命令，保留记录但从 readiness backlog 归档。', actor, nowIso);
  }

  if (blob.includes('ext-e2e') || blob.includes('外部 agent 验收')) {
    return createCommandItem(command, '历史 external agent 验收命令，已被新的 onboarding smoke 收口替代。', actor, nowIso);
  }

  if (blob.includes('missing required field(s): text') && (blob.includes('胖虎') || blob.includes('panghu'))) {
    return createCommandItem(command, '历史胖虎接入验证残留，当前链路已迁移，不再作为活跃失败项保留。', actor, nowIso);
  }

  if (blob.includes('project-index:notion-sync failed') && blob.includes('request timed out')) {
    return createCommandItem(command, '历史 Notion 同步超时残留，当前 Custom Agent 主路径下不再作为活跃失败项。', actor, nowIso);
  }

  return null;
}

export function classifyOpenRedDecision(decision, options = {}) {
  const actor = options.actor || 'runtime-backlog-cleanup';
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = options.nowIso || new Date(nowMs).toISOString();
  const minimumAgeHours = Number.isFinite(options.minimumAgeHours) ? options.minimumAgeHours : 168;
  const createdAt = decision.created_at || decision.createdAt || decision.updated_at || decision.updatedAt;

  if (compactLower(decision.status) !== 'needs_review') {
    return null;
  }

  if (compactLower(decision.signal_level || decision.signalLevel) !== 'red') {
    return null;
  }

  if (!isOlderThan(createdAt, minimumAgeHours, nowMs)) {
    return null;
  }

  const question = compactLower(decision.question);
  const whyNow = compactLower(decision.why_now || decision.whyNow);

  if (whyNow.includes('smoke')) {
    return createDecisionItem(decision, '历史本地红灯 smoke 验证残留，已不再阻塞当前执行。', actor, nowIso);
  }

  if (question.includes('人工验收') || question.includes('可测性验收')) {
    return createDecisionItem(decision, '历史 P0 人工验收闸口，当前工作已继续推进，转为历史归档。', actor, nowIso);
  }

  if (question.includes('红灯通知') || question.includes('快速唤醒') || question.includes('立即查看')) {
    return createDecisionItem(decision, '历史红灯通知联调残留，当前仅保留审计痕迹。', actor, nowIso);
  }

  return null;
}

export function classifyOutboxMessage(message, context = {}, options = {}) {
  const actor = options.actor || 'runtime-backlog-cleanup';
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = options.nowIso || new Date(nowMs).toISOString();
  const minimumAgeHours = Number.isFinite(options.minimumAgeHours) ? options.minimumAgeHours : 168;
  const createdAt = message.created_at || message.createdAt;
  const status = compactLower(message.status);

  if (!['pending', 'failed'].includes(status)) {
    return null;
  }

  if (!isOlderThan(createdAt, minimumAgeHours, nowMs)) {
    return null;
  }

  const payload = message.payload || {};
  const linkedCommandId = compact(payload.command_id || payload.commandId);
  const linkedDecisionId = compact(payload.decision_id || payload.decisionId);
  const projectId = compactLower(payload.project_id || payload.projectId);
  const blob = compactLower(
    joinText([
      message.text,
      message.error,
      JSON.stringify(payload),
    ]),
  );

  if (linkedDecisionId && context.decisionIds?.has(linkedDecisionId)) {
    return createOutboxItem(message, `关联 red decision ${linkedDecisionId} 已归档，清理对应待发送消息。`, actor, nowIso);
  }

  if (linkedCommandId && context.commandIds?.has(linkedCommandId)) {
    return createOutboxItem(message, `关联 command ${linkedCommandId} 已归档，清理对应交接消息。`, actor, nowIso);
  }

  if (
    status === 'pending' &&
    compactLower(payload.type) === 'red_alert' &&
    (blob.includes('人工验收') || blob.includes('smoke') || blob.includes('测试'))
  ) {
    return createOutboxItem(message, '历史 red alert 待发送提醒已过期，转入归档避免继续污染 readiness。', actor, nowIso);
  }

  if (
    status === 'pending' &&
    compactLower(payload.kind) === 'external_agent_handoff' &&
    (blob.includes('ext-e2e') || blob.includes('验收') || blob.includes('smoke'))
  ) {
    return createOutboxItem(message, '历史 external agent handoff 待发送消息已过期，转入归档。', actor, nowIso);
  }

  if (projectId.startsWith('prj-cortex-smoke-')) {
    return createOutboxItem(message, '历史 smoke project 的 outbox 残留，转入归档。', actor, nowIso);
  }

  if (blob.includes('fresh test')) {
    return createOutboxItem(message, '历史 fresh test 消息发送失败，转入归档避免污染 readiness。', actor, nowIso);
  }

  if (blob.includes('stale callback_url') || blob.includes('dead public tunnel')) {
    return createOutboxItem(message, '历史公网 tunnel callback 残留，当前链路已切换，转入归档。', actor, nowIso);
  }

  if (blob.includes('127.0.0.1') && blob.includes('external_agent_handoff') && blob.includes('stale')) {
    return createOutboxItem(message, '历史本地回调地址残留，当前不再作为活跃发送失败项。', actor, nowIso);
  }

  return null;
}

export function buildRuntimeBacklogCleanupPlan(snapshot = {}, options = {}) {
  const actor = options.actor || 'runtime-backlog-cleanup';
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = options.nowIso || new Date(nowMs).toISOString();
  const minimumAgeHours = Number.isFinite(options.minimumAgeHours) ? options.minimumAgeHours : 168;

  const failedCommands = Array.isArray(snapshot.failedCommands) ? snapshot.failedCommands : [];
  const openRedDecisions = Array.isArray(snapshot.openRedDecisions) ? snapshot.openRedDecisions : [];
  const pendingOutbox = Array.isArray(snapshot.pendingOutbox) ? snapshot.pendingOutbox : [];
  const failedOutbox = Array.isArray(snapshot.failedOutbox) ? snapshot.failedOutbox : [];

  const commands = failedCommands
    .map((command) =>
      classifyFailedCommand(command, {
        actor,
        nowMs,
        nowIso,
        minimumAgeHours,
      }),
    )
    .filter(Boolean);

  const decisions = openRedDecisions
    .map((decision) =>
      classifyOpenRedDecision(decision, {
        actor,
        nowMs,
        nowIso,
        minimumAgeHours,
      }),
    )
    .filter(Boolean);

  const commandIds = new Set(commands.map((item) => item.id));
  const decisionIds = new Set(decisions.map((item) => item.id));
  const outboxContext = { commandIds, decisionIds };

  const outbox = [...pendingOutbox, ...failedOutbox]
    .map((message) =>
      classifyOutboxMessage(message, outboxContext, {
        actor,
        nowMs,
        nowIso,
        minimumAgeHours,
      }),
    )
    .filter(Boolean);

  return {
    actor,
    generatedAt: nowIso,
    minimumAgeHours,
    summary: {
      failedCommandsScanned: failedCommands.length,
      openRedDecisionsScanned: openRedDecisions.length,
      outboxScanned: pendingOutbox.length + failedOutbox.length,
      commandsToArchive: commands.length,
      decisionsToArchive: decisions.length,
      outboxToArchive: outbox.length,
      totalActions: commands.length + decisions.length + outbox.length,
    },
    actions: {
      commands,
      decisions,
      outbox,
    },
  };
}
