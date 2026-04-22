import http from 'node:http';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { CortexEngine } from './engine.js';
import { createStore } from './store.js';
import { parseNotionSourceUrl, replyToDiscussion } from './notion-agent-sync.js';
import { appendReceiptLog } from './notion-receipt-mirror.js';
import { CortexProjector } from './projector.js';
import { defaultAgentRegistryFile } from './agent-registry.js';
import {
  getConnectAgent,
  listConnectAgents,
  onboardConnectAgent,
  verifyConnectAgent,
} from './connect-api.js';

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableHash(value) {
  return createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 12);
}

function summarizeInstruction(text, maxLength = 160) {
  const normalized = compact(text);
  if (!normalized) {
    return '未提供指令正文';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function extractDecisionContext(body) {
  if (body.decision_context && typeof body.decision_context === 'object') {
    return body.decision_context;
  }

  if (body.decisionContext && typeof body.decisionContext === 'object') {
    return body.decisionContext;
  }

  if (body.payload?.decision_context && typeof body.payload.decision_context === 'object') {
    return body.payload.decision_context;
  }

  return null;
}

function normalizeSignalLevel(value, fallback = 'green') {
  const raw = compact(value).toLowerCase();
  if (raw === 'red' || raw === 'yellow' || raw === 'green') {
    return raw;
  }
  return fallback;
}

function buildNotionCustomAgentDecisionInput(body) {
  const decisionContext = extractDecisionContext(body);
  const explicitSignal = normalizeSignalLevel(
    body.signal_level ||
      body.signalLevel ||
      body.blocking_level ||
      body.blockingLevel ||
      decisionContext?.signal_level ||
      decisionContext?.signalLevel,
    '',
  );
  const signalLevel = explicitSignal === 'red' || explicitSignal === 'yellow' ? explicitSignal : decisionContext ? 'yellow' : null;

  if (!signalLevel) {
    return null;
  }

  const sourceUrl =
    compact(body.source_url || body.sourceUrl) ||
    `notion://page/${body.page_id}/discussion/${body.discussion_id}/comment/${body.comment_id}`;

  return {
    signalLevel,
    question:
      compact(body.question || decisionContext?.question) ||
      `需要处理的 ${signalLevel === 'red' ? '红灯' : '黄灯'}事项：${summarizeInstruction(body.body, 96)}`,
    context:
      compact(body.context || decisionContext?.context || body.context_quote || body.contextQuote) ||
      compact(body.body) ||
      null,
    options: Array.isArray(body.options)
      ? body.options
      : Array.isArray(decisionContext?.options)
        ? decisionContext.options
        : [],
    recommendation: compact(body.recommendation || decisionContext?.recommendation) || null,
    recommendedOption: compact(body.recommended_option || body.recommendedOption || decisionContext?.recommended_option) || null,
    whyNow:
      compact(body.why_now || body.whyNow || decisionContext?.why_now || decisionContext?.whyNow) ||
      `Notion Custom Agent classified the current discussion as ${signalLevel}.`,
    impactScope: compact(body.impact_scope || body.impactScope || decisionContext?.impact_scope || decisionContext?.impactScope) || 'module',
    irreversible: Boolean(body.irreversible ?? decisionContext?.irreversible),
    downstreamContamination: Boolean(
      body.downstream_contamination ?? body.downstreamContamination ?? decisionContext?.downstream_contamination,
    ),
    evidenceRefs: Array.isArray(body.evidence_refs)
      ? body.evidence_refs
      : Array.isArray(decisionContext?.evidence_refs)
        ? decisionContext.evidence_refs
        : [],
    requestedHumanAction:
      compact(
        body.requested_human_action ||
          body.requestedHumanAction ||
          decisionContext?.requested_human_action ||
          decisionContext?.requestedHumanAction,
      ) ||
      (signalLevel === 'red' ? '请通过红灯决策流程尽快拍板。' : '请在文档中异步确认后再继续推进。'),
    dueAt: body.due_at || body.dueAt || decisionContext?.due_at || decisionContext?.dueAt || null,
    ownerAgent: compact(body.owner_agent || body.ownerAgent || body.route_to || body.routeTo) || null,
    sourceUrl,
    idempotencyKey:
      compact(body.idempotency_key || body.idempotencyKey) ||
      `notion-custom-agent-decision:${body.page_id}:${body.discussion_id}:${body.comment_id}:${signalLevel}`,
    sessionId: compact(body.session_id || body.sessionId) || null,
    channel: compact(body.channel) || null,
    chatId: compact(body.chat_id || body.chatId) || null,
    threadId: compact(body.thread_id || body.threadId) || null,
    threadUrl: compact(body.thread_url || body.threadUrl) || null,
    actionUrl: compact(body.action_url || body.actionUrl) || null,
    displayTags: Array.isArray(body.display_tags)
      ? body.display_tags
      : Array.isArray(decisionContext?.display_tags)
        ? decisionContext.display_tags
        : [],
    retrievalTags: Array.isArray(body.retrieval_tags)
      ? body.retrieval_tags
      : Array.isArray(decisionContext?.retrieval_tags)
        ? decisionContext.retrieval_tags
        : [],
  };
}

function normalizeReceiptStatus(value) {
  const raw = compact(value).toLowerCase();
  if (['delivered', 'completed', 'failed', 'acknowledged', 'read'].includes(raw)) {
    return raw;
  }
  if (raw === 'success' || raw === 'succeeded' || raw === 'ok') {
    return 'completed';
  }
  if (raw === 'done') {
    return 'completed';
  }
  if (raw === 'started' || raw === 'processing' || raw === 'in_progress' || raw === 'in-progress') {
    return 'acknowledged';
  }
  if (raw === 'error' || raw === 'errored') {
    return 'failed';
  }
  if (raw === 'cancelled' || raw === 'canceled') {
    return 'failed';
  }
  return null;
}

function normalizeReceiptType(value) {
  const raw = compact(value).toLowerCase();
  if (['result', 'status_update', 'alert', 'heartbeat'].includes(raw)) {
    return raw;
  }
  if (raw === 'status') {
    return 'status_update';
  }
  if (raw === 'monitor') {
    return 'status_update';
  }
  return null;
}

function inferReceiptType({ explicitType, status, signal, payload }) {
  const normalizedExplicit = normalizeReceiptType(explicitType);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  if (normalizeSignalLevel(signal, '') === 'red') {
    return 'alert';
  }

  if (payload?.decision_context || payload?.error) {
    return 'alert';
  }

  if (status === 'acknowledged' || status === 'read' || status === 'delivered') {
    return 'status_update';
  }

  return 'result';
}

function inferSignalLevelFromReceipt({ explicitSignalLevel, status, receiptType }) {
  const rawSignal = compact(explicitSignalLevel);
  if (rawSignal) {
    return normalizeSignalLevel(rawSignal);
  }

  if (status === 'failed' || receiptType === 'alert') {
    return 'red';
  }

  if (status === 'acknowledged' || status === 'read' || status === 'delivered' || receiptType === 'heartbeat' || receiptType === 'status_update') {
    return 'yellow';
  }

  return 'green';
}

function inferCommandStatusFromReceiptStatus(receiptStatus, currentStatus) {
  if (receiptStatus === 'completed') {
    return 'done';
  }
  if (receiptStatus === 'failed') {
    return 'failed';
  }
  return currentStatus;
}

function inferSignalLevelFromReceiptStatus(status, explicitSignalLevel) {
  if (compact(explicitSignalLevel)) {
    return normalizeSignalLevel(explicitSignalLevel);
  }

  if (status === 'failed' || status === 'cancelled') {
    return 'red';
  }

  return 'green';
}

function inferCheckpointStatusFromSignalLevel(signalLevel) {
  if (signalLevel === 'red') {
    return 'blocked';
  }
  if (signalLevel === 'yellow') {
    return 'needs_review';
  }
  return 'passed';
}

function inferQualityGradeFromSignalLevel(signalLevel, explicitQualityGrade) {
  const raw = compact(explicitQualityGrade);
  if (raw) {
    return raw;
  }
  if (signalLevel === 'red') {
    return 'needs_review';
  }
  if (signalLevel === 'yellow') {
    return 'draft';
  }
  return 'pass';
}

function inferAnomalyLevelFromSignalLevel(signalLevel, explicitAnomalyLevel) {
  const raw = compact(explicitAnomalyLevel);
  if (raw) {
    return raw;
  }
  if (signalLevel === 'red') {
    return 'high';
  }
  if (signalLevel === 'yellow') {
    return 'medium';
  }
  return 'low';
}

function summarizeReceiptTitle(agentName, command) {
  return `${compact(agentName) || '外部 agent'} 回执：${summarizeInstruction(command?.instruction, 60)}`;
}

function summarizeReceiptSummary({ agentName, status, resultSummary }) {
  const normalizedSummary = compact(resultSummary);
  if (normalizedSummary) {
    return normalizedSummary;
  }

  const normalizedAgentName = compact(agentName) || '外部 agent';
  if (status === 'failed') {
    return `${normalizedAgentName} 回执失败。`;
  }
  if (status === 'acknowledged') {
    return `${normalizedAgentName} 已确认接收并开始执行。`;
  }
  if (status === 'delivered') {
    return `${normalizedAgentName} 已收到交接消息。`;
  }
  if (status === 'read') {
    return `${normalizedAgentName} 已读当前任务。`;
  }
  return `${normalizedAgentName} 已完成外部执行回执。`;
}

function formatExecutorBridgeText({ agentName, projectId, command }) {
  const source = compact(command?.source) || 'unknown';
  const commandId = compact(command?.command_id || command?.commandId) || 'unknown-command';
  const ownerAgent = compact(command?.owner_agent || command?.ownerAgent) || compact(agentName) || 'unknown-agent';
  const instruction = summarizeInstruction(command?.instruction);
  const sourceUrl = compact(command?.source_url || command?.sourceUrl);

  return [
    `[Cortex Handoff -> ${ownerAgent}]`,
    `项目：${compact(projectId) || compact(command?.project_id || command?.projectId) || 'PRJ-cortex'}`,
    `命令：${commandId}`,
    `来源：${source}`,
    `任务：${instruction}`,
    sourceUrl ? `来源链接：${sourceUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw);
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
  if (missing.length > 0) {
    throw new Error(`Missing required field(s): ${missing.join(', ')}`);
  }
}

function mapCommandForApi(command) {
  return {
    command_id: command.commandId,
    commandId: command.commandId,
    project_id: command.projectId,
    projectId: command.projectId,
    status: command.status,
    parsed_action: command.parsedAction,
    parsedAction: command.parsedAction,
    instruction: command.instruction,
    context_quote: command.contextQuote,
    contextQuote: command.contextQuote,
    anchor_block_id: command.anchorBlockId,
    anchorBlockId: command.anchorBlockId,
    owner_agent: command.ownerAgent,
    ownerAgent: command.ownerAgent,
    source_url: command.sourceUrl,
    sourceUrl: command.sourceUrl,
    claimed_by: command.claimedBy,
    claimedBy: command.claimedBy,
    result_summary: command.resultSummary,
    resultSummary: command.resultSummary,
    receipt_count: command.receiptCount,
    receiptCount: command.receiptCount,
    last_receipt_at: command.lastReceiptAt,
    lastReceiptAt: command.lastReceiptAt,
    inbox_item_count: command.inboxItemCount,
    inboxItemCount: command.inboxItemCount,
    last_inbox_item_at: command.lastInboxItemAt,
    lastInboxItemAt: command.lastInboxItemAt,
    ack: command.ack,
    source: command.source,
    target_type: command.targetType,
    target_id: command.targetId,
    parent_command_id: command.parentCommandId,
    parentCommandId: command.parentCommandId,
    created_at: command.createdAt,
    createdAt: command.createdAt,
    updated_at: command.updatedAt,
    updatedAt: command.updatedAt,
  };
}

function mapDecisionForApi(decision) {
  return {
    decision_id: decision.decisionId,
    decisionId: decision.decisionId,
    project_id: decision.projectId,
    projectId: decision.projectId,
    signal_level: decision.signalLevel,
    signalLevel: decision.signalLevel,
    blocking_level: decision.blockingLevel,
    blockingLevel: decision.blockingLevel,
    blocking_scope: decision.blockingScope || decision.impactScope || null,
    blockingScope: decision.blockingScope || decision.impactScope || null,
    status: decision.status,
    question: decision.question,
    context: decision.context,
    options: decision.options,
    recommendation: decision.recommendation,
    recommended_option: decision.recommendedOption,
    recommendedOption: decision.recommendedOption,
    why_now: decision.whyNow,
    impact_scope: decision.impactScope,
    irreversible: decision.irreversible,
    downstream_contamination: decision.downstreamContamination,
    evidence_refs: decision.evidenceRefs,
    evidenceRefs: decision.evidenceRefs,
    requested_human_action: decision.requestedHumanAction,
    requestedHumanAction: decision.requestedHumanAction,
    due_at: decision.dueAt,
    dueAt: decision.dueAt,
    escalate_after: decision.escalateAfter,
    owner_agent: decision.ownerAgent,
    ownerAgent: decision.ownerAgent,
    source_url: decision.sourceUrl,
    sourceUrl: decision.sourceUrl,
    inbox_item_id: decision.inboxItemId,
    inboxItemId: decision.inboxItemId,
    decided_by: decision.decidedBy,
    decidedBy: decision.decidedBy,
    decided_at: decision.decidedAt,
    decidedAt: decision.decidedAt,
    decision_note: decision.decisionNote,
    decisionNote: decision.decisionNote,
    selected_option: decision.selectedOption,
    selectedOption: decision.selectedOption,
    display_tags: decision.displayTags,
    displayTags: decision.displayTags,
    retrieval_tags: decision.retrievalTags,
    retrievalTags: decision.retrievalTags,
    created_at: decision.createdAt,
    createdAt: decision.createdAt,
    updated_at: decision.updatedAt,
    updatedAt: decision.updatedAt,
  };
}

function mapTaskBriefForApi(brief) {
  return {
    brief_id: brief.briefId,
    briefId: brief.briefId,
    project_id: brief.projectId,
    projectId: brief.projectId,
    title: brief.title,
    why: brief.why,
    context: brief.context,
    what: brief.what,
    status: brief.status,
    owner_agent: brief.ownerAgent,
    ownerAgent: brief.ownerAgent,
    source: brief.source,
    source_url: brief.sourceUrl,
    sourceUrl: brief.sourceUrl,
    channel_session_id: brief.channelSessionId,
    channelSessionId: brief.channelSessionId,
    target_type: brief.targetType,
    targetType: brief.targetType,
    target_id: brief.targetId,
    targetId: brief.targetId,
    memory_context_refs: brief.memoryContextRefs,
    memoryContextRefs: brief.memoryContextRefs,
    created_at: brief.createdAt,
    createdAt: brief.createdAt,
    updated_at: brief.updatedAt,
    updatedAt: brief.updatedAt,
  };
}

function mapConnectRouteForApi(route) {
  if (!route) {
    return null;
  }

  return {
    url: route.url,
    has_token: route.hasToken,
    hasToken: route.hasToken,
    source: route.source,
  };
}

function mapConnectAgentForApi(agent) {
  if (!agent) {
    return null;
  }

  return {
    agent_name: agent.agentName,
    agentName: agent.agentName,
    enabled: agent.enabled,
    status: agent.status,
    handler_kind: agent.handlerKind,
    handlerKind: agent.handlerKind,
    project_id: agent.projectId,
    projectId: agent.projectId,
    source: agent.source,
    target_type: agent.targetType,
    targetType: agent.targetType,
    channel: agent.channel,
    owner_agent: agent.ownerAgent,
    ownerAgent: agent.ownerAgent,
    include_unassigned: agent.includeUnassigned,
    includeUnassigned: agent.includeUnassigned,
    only_unassigned: agent.onlyUnassigned,
    onlyUnassigned: agent.onlyUnassigned,
    mode: agent.mode,
    poll_interval_ms: agent.pollIntervalMs,
    pollIntervalMs: agent.pollIntervalMs,
    webhook_url: agent.webhookUrl,
    webhookUrl: agent.webhookUrl,
    webhook_token_configured: agent.webhookTokenConfigured,
    webhookTokenConfigured: agent.webhookTokenConfigured,
    aliases: agent.aliases,
    issues: agent.issues,
    warnings: agent.warnings,
    registry_route: mapConnectRouteForApi(agent.registryRoute),
    registryRoute: mapConnectRouteForApi(agent.registryRoute),
    executor_route: mapConnectRouteForApi(agent.executorRoute),
    executorRoute: mapConnectRouteForApi(agent.executorRoute),
    effective_route: mapConnectRouteForApi(agent.effectiveRoute),
    effectiveRoute: mapConnectRouteForApi(agent.effectiveRoute),
  };
}

function mapConnectVerificationForApi(result) {
  return {
    ok: result.ok,
    status: result.status,
    health_url: result.healthUrl,
    healthUrl: result.healthUrl,
    checks: result.checks,
    issues: result.issues,
    warnings: result.warnings,
    agent: mapConnectAgentForApi(result.agent),
  };
}

function mapOutboxForApi(message) {
  return {
    id: message.id,
    channel: message.channel,
    session_id: message.sessionId,
    chat_id: message.chatId,
    text: message.text,
    payload: message.payload,
    priority: message.priority,
    created_at: message.createdAt,
    status: message.status,
    error: message.error,
  };
}

function mapRunForApi(run) {
  return {
    run_id: run.runId,
    runId: run.runId,
    project_id: run.projectId,
    projectId: run.projectId,
    brief_id: run.briefId,
    briefId: run.briefId,
    command_id: run.commandId,
    commandId: run.commandId,
    decision_id: run.decisionId,
    decisionId: run.decisionId,
    agent_name: run.agentName,
    agentName: run.agentName,
    role: run.role,
    phase: run.phase,
    status: run.status,
    title: run.title,
    summary: run.summary,
    quality_grade: run.qualityGrade,
    qualityGrade: run.qualityGrade,
    anomaly_level: run.anomalyLevel,
    anomalyLevel: run.anomalyLevel,
    feedback_source: run.feedbackSource,
    feedbackSource: run.feedbackSource,
    started_at: run.startedAt,
    startedAt: run.startedAt,
    completed_at: run.completedAt,
    completedAt: run.completedAt,
    created_at: run.createdAt,
    createdAt: run.createdAt,
    updated_at: run.updatedAt,
    updatedAt: run.updatedAt,
  };
}

function mapCheckpointForApi(checkpoint) {
  return {
    checkpoint_id: checkpoint.checkpointId,
    checkpointId: checkpoint.checkpointId,
    project_id: checkpoint.projectId,
    projectId: checkpoint.projectId,
    run_id: checkpoint.runId,
    runId: checkpoint.runId,
    brief_id: checkpoint.briefId,
    briefId: checkpoint.briefId,
    command_id: checkpoint.commandId,
    commandId: checkpoint.commandId,
    decision_id: checkpoint.decisionId,
    decisionId: checkpoint.decisionId,
    signal_level: checkpoint.signalLevel,
    signalLevel: checkpoint.signalLevel,
    stage: checkpoint.stage,
    status: checkpoint.status,
    title: checkpoint.title,
    summary: checkpoint.summary,
    evidence: checkpoint.evidence,
    next_step: checkpoint.nextStep,
    nextStep: checkpoint.nextStep,
    quality_grade: checkpoint.qualityGrade,
    qualityGrade: checkpoint.qualityGrade,
    anomaly_level: checkpoint.anomalyLevel,
    anomalyLevel: checkpoint.anomalyLevel,
    feedback_source: checkpoint.feedbackSource,
    feedbackSource: checkpoint.feedbackSource,
    created_by: checkpoint.createdBy,
    createdBy: checkpoint.createdBy,
    memory_candidate_count: checkpoint.memoryCandidateCount,
    memoryCandidateCount: checkpoint.memoryCandidateCount,
    created_at: checkpoint.createdAt,
    createdAt: checkpoint.createdAt,
    updated_at: checkpoint.updatedAt,
    updatedAt: checkpoint.updatedAt,
  };
}

function mapProjectForApi(project) {
  return {
    project_id: project.projectId,
    projectId: project.projectId,
    name: project.name,
    status: project.status,
    root_page_url: project.rootPageUrl,
    rootPageUrl: project.rootPageUrl,
    review_window_note: project.reviewWindowNote,
    reviewWindowNote: project.reviewWindowNote,
    notification_channel: project.notificationChannel,
    notificationChannel: project.notificationChannel,
    notification_target: project.notificationTarget,
    notificationTarget: project.notificationTarget,
    notion_review_page_id: project.notionReviewPageId,
    notionReviewPageId: project.notionReviewPageId,
    notion_parent_page_id: project.notionParentPageId,
    notionParentPageId: project.notionParentPageId,
    notion_memory_page_id: project.notionMemoryPageId,
    notionMemoryPageId: project.notionMemoryPageId,
    notion_scan_page_id: project.notionScanPageId,
    notionScanPageId: project.notionScanPageId,
    created_at: project.createdAt,
    createdAt: project.createdAt,
    updated_at: project.updatedAt,
    updatedAt: project.updatedAt,
  };
}

function mapReceiptForApi(receipt) {
  return {
    receipt_id: receipt.receiptId,
    receiptId: receipt.receiptId,
    command_id: receipt.commandId,
    commandId: receipt.commandId,
    project_id: receipt.projectId,
    projectId: receipt.projectId,
    session_id: receipt.sessionId,
    sessionId: receipt.sessionId,
    status: receipt.status,
    receipt_type: receipt.receiptType,
    receiptType: receipt.receiptType,
    payload: receipt.payload,
    signal: receipt.signal,
    channel: receipt.channel,
    target: receipt.target,
    idempotency_key: receipt.idempotencyKey,
    idempotencyKey: receipt.idempotencyKey,
    parent_receipt_id: receipt.parentReceiptId,
    parentReceiptId: receipt.parentReceiptId,
    created_at: receipt.createdAt,
    createdAt: receipt.createdAt,
  };
}

function mapMemoryForApi(memory) {
  return {
    memory_id: memory.memoryId,
    memoryId: memory.memoryId,
    project_id: memory.projectId,
    projectId: memory.projectId,
    layer: memory.layer,
    type: memory.type,
    title: memory.title,
    summary: memory.summary,
    status: memory.status,
    review_state: memory.reviewState,
    reviewState: memory.reviewState,
    confidence: memory.confidence,
    freshness: memory.freshness,
    next_step: memory.nextStep,
    nextStep: memory.nextStep,
    owner_agent: memory.ownerAgent,
    ownerAgent: memory.ownerAgent,
    source_count: memory.sourceCount,
    sourceCount: memory.sourceCount,
    related_memory: memory.relatedMemory,
    relatedMemory: memory.relatedMemory,
    metadata: memory.metadata,
    reviewer_recommendation: memory.metadata?.reviewer_recommendation || null,
    reviewerRecommendation: memory.metadata?.reviewer_recommendation || null,
    human_review: memory.metadata?.human_review || null,
    humanReview: memory.metadata?.human_review || null,
    human_confirmation_required: Boolean(memory.metadata?.human_confirmation_required),
    humanConfirmationRequired: Boolean(memory.metadata?.human_confirmation_required),
    created_at: memory.createdAt,
    createdAt: memory.createdAt,
    updated_at: memory.updatedAt,
    updatedAt: memory.updatedAt,
  };
}

function mapMemorySourceForApi(source) {
  return {
    source_id: source.sourceId,
    sourceId: source.sourceId,
    memory_id: source.memoryId,
    memoryId: source.memoryId,
    project_id: source.projectId,
    projectId: source.projectId,
    source_type: source.sourceType,
    sourceType: source.sourceType,
    source_ref: source.sourceRef,
    sourceRef: source.sourceRef,
    source_url: source.sourceUrl,
    sourceUrl: source.sourceUrl,
    quote_text: source.quoteText,
    quoteText: source.quoteText,
    summary: source.summary,
    evidence: source.evidence,
    created_at: source.createdAt,
    createdAt: source.createdAt,
  };
}

function mapInboxForApi(item) {
  return {
    item_id: item.itemId,
    itemId: item.itemId,
    project_id: item.projectId,
    projectId: item.projectId,
    queue: item.queue,
    object_type: item.objectType,
    objectType: item.objectType,
    action_type: item.actionType,
    actionType: item.actionType,
    risk_level: item.riskLevel,
    riskLevel: item.riskLevel,
    status: item.status,
    title: item.title,
    summary: item.summary,
    owner_agent: item.ownerAgent,
    ownerAgent: item.ownerAgent,
    source_ref: item.sourceRef,
    sourceRef: item.sourceRef,
    source_url: item.sourceUrl,
    sourceUrl: item.sourceUrl,
    assigned_to: item.assignedTo,
    assignedTo: item.assignedTo,
    payload: item.payload,
    idempotency_key: item.idempotencyKey,
    idempotencyKey: item.idempotencyKey,
    created_at: item.createdAt,
    createdAt: item.createdAt,
    updated_at: item.updatedAt,
    updatedAt: item.updatedAt,
    resolved_at: item.resolvedAt,
    resolvedAt: item.resolvedAt,
  };
}

function mapDecisionPacketForApi(packet) {
  return {
    ...mapDecisionForApi(packet),
    inbox_status: packet.inboxStatus,
    inboxStatus: packet.inboxStatus,
    overdue: Boolean(packet.overdue),
    inbox_item: packet.inboxItem ? mapInboxForApi(packet.inboxItem) : null,
    inboxItem: packet.inboxItem ? mapInboxForApi(packet.inboxItem) : null,
  };
}

function mapSuggestionForApi(suggestion) {
  return {
    suggestion_id: suggestion.suggestionId,
    suggestionId: suggestion.suggestionId,
    project_id: suggestion.projectId,
    projectId: suggestion.projectId,
    source_type: suggestion.sourceType,
    sourceType: suggestion.sourceType,
    source_ref: suggestion.sourceRef,
    sourceRef: suggestion.sourceRef,
    document_ref: suggestion.documentRef,
    documentRef: suggestion.documentRef,
    anchor_block_id: suggestion.anchorBlockId,
    anchorBlockId: suggestion.anchorBlockId,
    selected_text: suggestion.selectedText,
    selectedText: suggestion.selectedText,
    proposed_text: suggestion.proposedText,
    proposedText: suggestion.proposedText,
    reason: suggestion.reason,
    impact_scope: suggestion.impactScope,
    impactScope: suggestion.impactScope,
    status: suggestion.status,
    owner_agent: suggestion.ownerAgent,
    ownerAgent: suggestion.ownerAgent,
    applied_at: suggestion.appliedAt,
    appliedAt: suggestion.appliedAt,
    rejected_reason: suggestion.rejectedReason,
    rejectedReason: suggestion.rejectedReason,
    created_at: suggestion.createdAt,
    createdAt: suggestion.createdAt,
    updated_at: suggestion.updatedAt,
    updatedAt: suggestion.updatedAt,
  };
}

function buildProjectReviewPayload(result) {
  return {
    ok: true,
    project: mapProjectForApi(result.project),
    summary: {
      latest_brief: result.summary.latestBrief ? mapTaskBriefForApi(result.summary.latestBrief) : null,
      latest_checkpoint: result.summary.latestCheckpoint ? mapCheckpointForApi(result.summary.latestCheckpoint) : null,
      next_steps: result.summary.nextSteps,
      red_decisions: result.summary.redDecisions.map(mapDecisionForApi),
      yellow_decisions: result.summary.yellowDecisions.map(mapDecisionForApi),
      green_notes: result.summary.greenNotes.map(mapDecisionForApi),
      active_commands: result.summary.activeCommands.map(mapCommandForApi),
      recent_done_commands: result.summary.recentDoneCommands.map(mapCommandForApi),
      notion_commands: result.summary.notionCommands.map(mapCommandForApi),
      recent_runs: result.summary.recentRuns.map(mapRunForApi),
      run_role_progress: result.summary.runRoleProgress,
      trajectory_status: result.summary.trajectoryStatus,
      trajectory_reason: result.summary.trajectoryReason,
    },
    markdown: result.markdown,
  };
}

function createSyncAlias(redAlert) {
  if (!redAlert) {
    return undefined;
  }

  return {
    type: 'sync_alert',
    projectId: redAlert.projectId,
    decisionId: redAlert.decisionId,
    question: redAlert.question,
    recommendation: redAlert.recommendation,
    impact: redAlert.impact,
    urgency: redAlert.urgency,
  };
}

export function createCortexServer(options = {}) {
  const store = options.store || createStore({ dbPath: options.dbPath, clock: options.clock });
  const engine =
    options.engine ||
    new CortexEngine({
      store,
      defaultProjectId: options.defaultProjectId,
      defaultChannel: options.defaultChannel,
    });
  const notionApiKey = options.notionApiKey || process.env.NOTION_API_KEY || '';
  const notionBaseUrl = options.notionBaseUrl || process.env.NOTION_BASE_URL;
  const notionVersion = options.notionVersion || process.env.NOTION_VERSION;
  const notionReply = options.notionReply || replyToDiscussion;
  const projector = options.projector || new CortexProjector({ engine });
  const cwd = options.cwd || process.cwd();
  const connectFiles = {
    agentRegistryFile:
      options.agentRegistryFile || process.env.AGENT_REGISTRY_FILE || defaultAgentRegistryFile(cwd),
    notionRoutingFile:
      options.notionRoutingFile || process.env.NOTION_ROUTING_RULES_PATH || resolve(cwd, 'docs', 'notion-routing.json'),
    executorRoutingFile:
      options.executorRoutingFile || process.env.EXECUTOR_ROUTING_FILE || resolve(cwd, 'docs', 'executor-routing.json'),
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const connectDetailMatch = url.pathname.match(/^\/connect\/agents\/([^/]+)$/);
    const connectVerifyMatch = url.pathname.match(/^\/connect\/agents\/([^/]+)\/verify$/);
    const memoryReviewerMatch = url.pathname.match(/^\/memory\/([^/]+)\/reviewer-review$/);
    const memoryDetailMatch = url.pathname.match(/^\/memory\/([^/]+)$/);
    const memoryReviewMatch = url.pathname.match(/^\/memory\/([^/]+)\/review$/);
    const inboxDetailMatch = url.pathname.match(/^\/inbox\/([^/]+)$/);
    const inboxActMatch = url.pathname.match(/^\/inbox\/([^/]+)\/act$/);
    const suggestionDetailMatch = url.pathname.match(/^\/suggestions\/([^/]+)$/);
    const suggestionAcceptMatch = url.pathname.match(/^\/suggestions\/([^/]+)\/accept$/);
    const suggestionRejectMatch = url.pathname.match(/^\/suggestions\/([^/]+)\/reject$/);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, engine.health());
      }

      if (req.method === 'GET' && url.pathname === '/connect/agents') {
        const result = listConnectAgents(connectFiles);
        return sendJson(res, 200, {
          ok: true,
          agents: result.agents.map(mapConnectAgentForApi),
        });
      }

      if (req.method === 'GET' && connectDetailMatch) {
        const result = getConnectAgent(decodeURIComponent(connectDetailMatch[1]), connectFiles);
        if (!result.agent) {
          return sendJson(res, 404, {
            ok: false,
            error: 'Connect agent not found',
          });
        }

        return sendJson(res, 200, {
          ok: true,
          agent: mapConnectAgentForApi(result.agent),
        });
      }

      if (req.method === 'GET' && url.pathname === '/commands') {
        const limit = url.searchParams.get('limit');
        const result = engine.listCommands({
          projectId: url.searchParams.get('project_id'),
          commandId: url.searchParams.get('command_id'),
          status: url.searchParams.get('status'),
          source: url.searchParams.get('source'),
          ownerAgent: url.searchParams.get('owner_agent'),
          targetType: url.searchParams.get('target_type'),
          parsedAction: url.searchParams.get('parsed_action'),
          limit: limit ? Number(limit) : undefined,
        });
        return sendJson(res, 200, {
          ok: true,
          commands: result.commands.map(mapCommandForApi),
        });
      }

      if (req.method === 'GET' && url.pathname === '/decisions') {
        const result = engine.listDecisionRequests({
          projectId: url.searchParams.get('project_id'),
          signalLevel: url.searchParams.get('signal_level'),
          status: url.searchParams.get('status'),
        });

        return sendJson(res, 200, {
          ok: true,
          decisions: result.decisions.map(mapDecisionForApi),
        });
      }

      if (req.method === 'GET' && url.pathname === '/decision-hub') {
        const result = engine.buildDecisionHub({
          projectId: url.searchParams.get('project_id'),
          signalLevel: url.searchParams.get('signal_level'),
          status: url.searchParams.get('status'),
          view: url.searchParams.get('view'),
        });

        return sendJson(res, 200, {
          ok: true,
          summary: {
            total_count: result.summary.totalCount,
            totalCount: result.summary.totalCount,
            open_count: result.summary.openCount,
            openCount: result.summary.openCount,
            terminal_count: result.summary.terminalCount,
            terminalCount: result.summary.terminalCount,
            red_count: result.summary.redCount,
            redCount: result.summary.redCount,
            yellow_count: result.summary.yellowCount,
            yellowCount: result.summary.yellowCount,
            green_count: result.summary.greenCount,
            greenCount: result.summary.greenCount,
            overdue_count: result.summary.overdueCount,
            overdueCount: result.summary.overdueCount,
            decide_queue_open_count: result.summary.decideQueueOpenCount,
            decideQueueOpenCount: result.summary.decideQueueOpenCount,
          },
          view: result.view,
          decisions: result.decisions.map(mapDecisionPacketForApi),
        });
      }

      if (req.method === 'GET' && url.pathname === '/task-briefs') {
        const result = engine.listTaskBriefs({
          projectId: url.searchParams.get('project_id'),
          status: url.searchParams.get('status'),
          targetType: url.searchParams.get('target_type'),
        });

        return sendJson(res, 200, {
          ok: true,
          briefs: result.briefs.map(mapTaskBriefForApi),
        });
      }

      if (req.method === 'GET' && url.pathname === '/runs') {
        const limit = url.searchParams.get('limit');
        const result = engine.listRuns({
          projectId: url.searchParams.get('project_id'),
          runId: url.searchParams.get('run_id'),
          status: url.searchParams.get('status'),
          role: url.searchParams.get('role'),
          agentName: url.searchParams.get('agent_name'),
          commandId: url.searchParams.get('command_id'),
          limit: limit ? Number(limit) : undefined,
        });

        return sendJson(res, 200, {
          ok: true,
          runs: result.runs.map(mapRunForApi),
        });
      }

      if (req.method === 'GET' && url.pathname === '/checkpoints') {
        const limit = url.searchParams.get('limit');
        const result = engine.listCheckpoints({
          projectId: url.searchParams.get('project_id'),
          runId: url.searchParams.get('run_id'),
          stage: url.searchParams.get('stage'),
          status: url.searchParams.get('status'),
          signalLevel: url.searchParams.get('signal_level'),
          limit: limit ? Number(limit) : undefined,
        });

        return sendJson(res, 200, {
          ok: true,
          checkpoints: result.checkpoints.map(mapCheckpointForApi),
        });
      }

      if (req.method === 'GET' && url.pathname === '/receipts') {
        const commandId = url.searchParams.get('command_id');
        const projectId = url.searchParams.get('project_id');
        const status = url.searchParams.get('status');
        const since = url.searchParams.get('since');
        const limit = url.searchParams.get('limit');

        if (commandId) {
          const result = engine.getCommandReceipts(commandId);
          return sendJson(res, 200, {
            ok: true,
            command_id: commandId,
            receipts: result.receipts.map(mapReceiptForApi),
          });
        }

        if (projectId) {
          const result = engine.getReceiptsByProject(projectId, {
            status,
            since: since ? Number(since) : undefined,
            limit: limit ? Number(limit) : undefined,
          });
          return sendJson(res, 200, {
            ok: true,
            project_id: projectId,
            receipts: result.receipts.map(mapReceiptForApi),
          });
        }

        return sendJson(res, 400, {
          ok: false,
          error: 'command_id or project_id required',
          code: 'MISSING_QUERY',
        });
      }

      if (req.method === 'GET' && url.pathname === '/memory') {
        const limit = url.searchParams.get('limit');
        const result = engine.listMemory({
          projectId: url.searchParams.get('project_id'),
          layer: url.searchParams.get('layer'),
          status: url.searchParams.get('status'),
          reviewState: url.searchParams.get('review_state'),
          type: url.searchParams.get('type'),
          limit: limit ? Number(limit) : undefined,
        });

        return sendJson(res, 200, {
          ok: true,
          memories: result.memories.map(mapMemoryForApi),
        });
      }

      if (req.method === 'GET' && memoryDetailMatch) {
        const result = engine.getMemory(memoryDetailMatch[1]);
        if (!result.memory) {
          return sendJson(res, 404, {
            ok: false,
            error: 'Memory not found',
          });
        }

        return sendJson(res, 200, {
          ok: true,
          memory: mapMemoryForApi(result.memory),
          sources: result.sources.map(mapMemorySourceForApi),
        });
      }

      if (req.method === 'GET' && url.pathname === '/inbox') {
        const limit = url.searchParams.get('limit');
        const result = engine.listInbox({
          projectId: url.searchParams.get('project_id'),
          queue: url.searchParams.get('queue'),
          status: url.searchParams.get('status'),
          objectType: url.searchParams.get('object_type'),
          riskLevel: url.searchParams.get('risk_level'),
          sourceRef: url.searchParams.get('source_ref'),
          limit: limit ? Number(limit) : undefined,
        });

        return sendJson(res, 200, {
          ok: true,
          items: result.items.map(mapInboxForApi),
        });
      }

      if (req.method === 'GET' && inboxDetailMatch) {
        const result = engine.getInboxItem(inboxDetailMatch[1]);
        if (!result.item) {
          return sendJson(res, 404, {
            ok: false,
            error: 'Inbox item not found',
          });
        }

        return sendJson(res, 200, {
          ok: true,
          item: mapInboxForApi(result.item),
        });
      }

      if (req.method === 'GET' && url.pathname === '/suggestions') {
        const limit = url.searchParams.get('limit');
        const result = engine.listSuggestions({
          projectId: url.searchParams.get('project_id'),
          status: url.searchParams.get('status'),
          sourceType: url.searchParams.get('source_type'),
          limit: limit ? Number(limit) : undefined,
        });

        return sendJson(res, 200, {
          ok: true,
          suggestions: result.suggestions.map(mapSuggestionForApi),
        });
      }

      if (req.method === 'GET' && suggestionDetailMatch) {
        const result = engine.getSuggestion(suggestionDetailMatch[1]);
        if (!result.suggestion) {
          return sendJson(res, 404, {
            ok: false,
            error: 'Suggestion not found',
          });
        }

        return sendJson(res, 200, {
          ok: true,
          suggestion: mapSuggestionForApi(result.suggestion),
        });
      }

      if (req.method === 'GET' && url.pathname === '/project-review') {
        const result = engine.buildProjectReview(url.searchParams.get('project_id'));

        return sendJson(res, 200, buildProjectReviewPayload(result));
      }

      if (req.method === 'GET' && url.pathname === '/notion/custom-agent/context') {
        const result = engine.buildProjectReview(url.searchParams.get('project_id'));

        return sendJson(res, 200, {
          ...buildProjectReviewPayload(result),
          collaboration_mode: 'custom_agent',
          collaborationMode: 'custom_agent',
          async_contract: {
            ingress: 'event_driven',
            ingress_webhook: '/webhook/notion-custom-agent',
            ingressWebhook: '/webhook/notion-custom-agent',
            reply_channel: 'notion_comment_discussion',
            replyChannel: 'notion_comment_discussion',
            reviewer_pattern: 'Notion Custom Agent receives mention/comment trigger and calls Cortex APIs directly.',
            reviewerPattern: 'Notion Custom Agent receives mention/comment trigger and calls Cortex APIs directly.',
            legacy_poller: 'disabled_by_default',
            legacyPoller: 'disabled_by_default',
          },
        });
      }

      if (req.method === 'GET' && url.pathname === '/projects') {
        const result = engine.listProjects();
        return sendJson(res, 200, {
          ok: true,
          projects: result.projects.map(mapProjectForApi),
        });
      }

      if (req.method === 'POST' && url.pathname === '/projects/upsert') {
        const body = await readJsonBody(req);
        const project = engine.upsertProject({
          projectId: body.project_id,
          name: body.name,
          status: body.status,
          rootPageUrl: body.root_page_url,
          reviewWindowNote: body.review_window_note,
          notificationChannel: body.notification_channel,
          notificationTarget: body.notification_target,
          notionReviewPageId: body.notion_review_page_id,
          notionParentPageId: body.notion_parent_page_id,
          notionMemoryPageId: body.notion_memory_page_id,
          notionScanPageId: body.notion_scan_page_id,
          displayTags: body.display_tags,
          retrievalTags: body.retrieval_tags,
        });

        return sendJson(res, 200, {
          ok: true,
          project: mapProjectForApi(project),
        });
      }

      if (req.method === 'POST' && url.pathname === '/connect/agents') {
        const body = await readJsonBody(req);
        const result = onboardConnectAgent(body, connectFiles);
        return sendJson(res, 200, {
          ok: true,
          changes: result.changes,
          agent: mapConnectAgentForApi(result.agent),
        });
      }

      if (req.method === 'POST' && connectVerifyMatch) {
        const body = await readJsonBody(req);
        const result = await verifyConnectAgent(decodeURIComponent(connectVerifyMatch[1]), {
          ...connectFiles,
          network: body.network,
          healthUrl: body.health_url || body.healthUrl,
        });

        if (!result.agent) {
          return sendJson(res, 404, {
            ok: false,
            error: 'Connect agent not found',
          });
        }

        return sendJson(res, 200, mapConnectVerificationForApi(result));
      }

      if (req.method === 'POST' && url.pathname === '/memory') {
        const body = await readJsonBody(req);
        requireFields(body, ['layer', 'type', 'title', 'summary']);

        const result = engine.createMemory({
          projectId: body.project_id,
          layer: body.layer,
          type: body.type,
          title: body.title,
          summary: body.summary,
          status: body.status,
          reviewState: body.review_state,
          confidence: body.confidence,
          freshness: body.freshness,
          nextStep: body.next_step,
          ownerAgent: body.owner_agent,
          relatedMemory: body.related_memory,
          metadata: body.metadata,
          sources: Array.isArray(body.sources)
            ? body.sources.map((source) => ({
                sourceType: source.source_type || source.sourceType,
                sourceRef: source.source_ref || source.sourceRef,
                sourceUrl: source.source_url || source.sourceUrl,
                quoteText: source.quote_text || source.quoteText,
                summary: source.summary,
                evidence: source.evidence,
                idempotencyKey: source.idempotency_key || source.idempotencyKey,
              }))
            : [],
          idempotencyKey: body.idempotency_key,
        });

        return sendJson(res, 200, {
          ok: true,
          isDuplicate: result.isDuplicate,
          memory: mapMemoryForApi(result.memory),
          sources: result.sources.map(mapMemorySourceForApi),
          reviewer_assessment: result.reviewerAssessment || null,
          reviewerAssessment: result.reviewerAssessment || null,
        });
      }

      if (req.method === 'POST' && url.pathname === '/memory/extract') {
        const body = await readJsonBody(req);
        requireFields(body, ['source_type']);

        const sourceType = body.source_type || body.sourceType;
        const sourceRef =
          body.source_ref ||
          body.sourceRef ||
          `manual:${sourceType}:${stableHash(
            JSON.stringify([
              body.project_id || body.projectId || 'PRJ-cortex',
              sourceType,
              body.text,
              body.summary,
              body.question,
              body.recommendation,
              body.proposed_text || body.proposedText,
            ]),
          )}`;

        const projections = projector.projectMemoryCandidates({
          projectId: body.project_id || body.projectId || 'PRJ-cortex',
          sourceType,
          sourceRef,
          sourceUrl: body.source_url || body.sourceUrl,
          status: body.status,
          title: body.title,
          text: body.text,
          quoteText: body.quote_text || body.quoteText,
          summary: body.summary,
          question: body.question,
          recommendation: body.recommendation,
          impactScope: body.impact_scope || body.impactScope,
          proposedText: body.proposed_text || body.proposedText,
          evidence: body.evidence,
          payload: body.payload,
          createdAt: body.created_at || body.createdAt,
        });

        return sendJson(res, 200, {
          ok: true,
          source_type: sourceType,
          source_ref: sourceRef,
          projections: projections.map((projection) => ({
            memory: mapMemoryForApi(projection.memory),
            sources: (projection.sources || []).map(mapMemorySourceForApi),
            reviewer_assessment: projection.reviewerAssessment || null,
            reviewerAssessment: projection.reviewerAssessment || null,
            inbox_item: mapInboxForApi(projection.inboxItem),
            inboxItem: mapInboxForApi(projection.inboxItem),
          })),
        });
      }

      if (req.method === 'POST' && memoryReviewerMatch) {
        const body = await readJsonBody(req);

        const result = engine.runReviewerReview({
          memoryId: memoryReviewerMatch[1],
          reviewerAgent: body.reviewer_agent || body.reviewerAgent,
          freshness: body.freshness,
          force: Boolean(body.force),
          skipIfPresent: !body.force,
        });

        return sendJson(res, 200, {
          ok: true,
          skipped: Boolean(result.skipped),
          memory: mapMemoryForApi(result.memory),
          reviewer_assessment: result.assessment || null,
          reviewerAssessment: result.assessment || null,
        });
      }

      if (req.method === 'POST' && memoryReviewMatch) {
        const body = await readJsonBody(req);
        requireFields(body, ['review_state']);

        const result = engine.reviewMemory({
          memoryId: memoryReviewMatch[1],
          reviewState: body.review_state,
          status: body.status,
          nextStep: body.next_step,
          freshness: body.freshness,
          ownerAgent: body.owner_agent,
          reviewActor: body.review_actor || body.reviewActor,
          reviewNote: body.review_note || body.reviewNote,
        });

        return sendJson(res, 200, {
          ok: true,
          memory: mapMemoryForApi(result.memory),
        });
      }

      if (req.method === 'POST' && url.pathname === '/inbox') {
        const body = await readJsonBody(req);
        requireFields(body, ['queue', 'object_type', 'action_type', 'title']);

        const result = engine.createInboxItem({
          projectId: body.project_id,
          queue: body.queue,
          objectType: body.object_type,
          actionType: body.action_type,
          riskLevel: body.risk_level,
          status: body.status,
          title: body.title,
          summary: body.summary,
          ownerAgent: body.owner_agent,
          sourceRef: body.source_ref,
          sourceUrl: body.source_url,
          assignedTo: body.assigned_to,
          payload: body.payload,
          idempotencyKey: body.idempotency_key,
          resolvedAt: body.resolved_at,
        });

        return sendJson(res, 200, {
          ok: true,
          isDuplicate: result.isDuplicate,
          item: mapInboxForApi(result.item),
        });
      }

      if (req.method === 'POST' && inboxActMatch) {
        const body = await readJsonBody(req);
        requireFields(body, ['action']);

        const action = compact(body.action).toLowerCase();
        let nextStatus = body.status;
        if (!nextStatus) {
          if (action === 'resolve') {
            nextStatus = 'resolved';
          } else if (action === 'snooze') {
            nextStatus = 'snoozed';
          } else if (action === 'archive') {
            nextStatus = 'archived';
          } else if (action === 'reopen') {
            nextStatus = 'open';
          }
        }

        const result = engine.actInboxItem({
          itemId: inboxActMatch[1],
          status: nextStatus,
          assignedTo: body.assigned_to,
          payloadPatch: body.payload_patch,
        });

        return sendJson(res, 200, {
          ok: true,
          item: mapInboxForApi(result.item),
        });
      }

      if (req.method === 'POST' && url.pathname === '/suggestions') {
        const body = await readJsonBody(req);
        requireFields(body, ['source_type', 'proposed_text']);

        const result = engine.createSuggestion({
          projectId: body.project_id,
          sourceType: body.source_type,
          sourceRef: body.source_ref,
          documentRef: body.document_ref,
          anchorBlockId: body.anchor_block_id,
          selectedText: body.selected_text,
          proposedText: body.proposed_text,
          reason: body.reason,
          impactScope: body.impact_scope,
          status: body.status,
          ownerAgent: body.owner_agent,
          appliedAt: body.applied_at,
          rejectedReason: body.rejected_reason,
          idempotencyKey: body.idempotency_key,
        });

        return sendJson(res, 200, {
          ok: true,
          isDuplicate: result.isDuplicate,
          suggestion: mapSuggestionForApi(result.suggestion),
        });
      }

      if (req.method === 'POST' && suggestionAcceptMatch) {
        const body = await readJsonBody(req);
        const result = engine.acceptSuggestion({
          suggestionId: suggestionAcceptMatch[1],
          appliedAt: body.applied_at,
        });
        projector.projectSuggestionOutcome(result.suggestion);

        return sendJson(res, 200, {
          ok: true,
          suggestion: mapSuggestionForApi(result.suggestion),
        });
      }

      if (req.method === 'POST' && suggestionRejectMatch) {
        const body = await readJsonBody(req);
        const result = engine.rejectSuggestion({
          suggestionId: suggestionRejectMatch[1],
          rejectedReason: body.rejected_reason,
        });
        projector.projectSuggestionOutcome(result.suggestion);

        return sendJson(res, 200, {
          ok: true,
          suggestion: mapSuggestionForApi(result.suggestion),
        });
      }

      if (req.method === 'GET' && url.pathname === '/sync-decisions') {
        const result = engine.listSyncDecisions(url.searchParams.get('project_id'));
        return sendJson(res, 200, {
          ok: true,
          decisions: result.decisions.map(mapDecisionForApi),
        });
      }

      if (req.method === 'GET' && url.pathname === '/outbox') {
        const status = compact(url.searchParams.get('status'));
        const sessionId = compact(url.searchParams.get('session_id'));
        const limitRaw = Number(url.searchParams.get('limit'));
        const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
        const result = engine.listOutbox({
          status,
          sessionId,
          limit,
        });
        return sendJson(res, 200, {
          ok: true,
          pending: result.pending.map(mapOutboxForApi),
          pending_count: result.pending.length,
          stats: result.stats,
          query: {
            status: status || null,
            session_id: sessionId || null,
            limit: limit || null,
          },
          ...(result.messages
            ? {
                messages: result.messages.map(mapOutboxForApi),
                message_count: result.messages.length,
              }
            : {}),
        });
      }

      if (req.method === 'POST' && url.pathname === '/webhook/im-message') {
        const body = await readJsonBody(req);
        requireFields(body, ['text', 'session_id', 'message_id']);

        const result = engine.ingestImMessage({
          projectId: body.project_id,
          targetType: body.target_type,
          targetId: body.target_id,
          text: body.text,
          sessionId: body.session_id,
          messageId: body.message_id,
          userId: body.user_id,
        });

        return sendJson(res, 200, {
          ok: true,
          commandId: result.commandId,
          isDuplicate: result.isDuplicate,
        });
      }

      if (req.method === 'POST' && url.pathname === '/webhook/im-action') {
        const body = await readJsonBody(req);
        requireFields(body, ['action', 'session_id', 'message_id']);

        const result = engine.ingestImAction({
          projectId: body.project_id,
          targetType: body.target_type,
          targetId: body.target_id,
          action: body.action,
          instruction: body.instruction,
          sessionId: body.session_id,
          messageId: body.message_id,
          userId: body.user_id,
        });

        if (result.decision) {
          projector.projectDecisionOutcome(result.decision);
        }

        return sendJson(res, 200, {
          ok: true,
          commandId: result.commandId,
          isDuplicate: result.isDuplicate,
          decision: result.decision ? mapDecisionForApi(result.decision) : null,
        });
      }

      if (req.method === 'POST' && url.pathname === '/webhook/notion-comment') {
        const body = await readJsonBody(req);
        requireFields(body, ['page_id', 'discussion_id', 'comment_id', 'body']);

        const result = engine.ingestNotionComment({
          projectId: body.project_id,
          targetType: body.target_type,
          targetId: body.target_id,
          pageId: body.page_id,
          discussionId: body.discussion_id,
          commentId: body.comment_id,
          body: body.body,
          ownerAgent: body.owner_agent,
          contextQuote: body.context_quote,
          anchorBlockId: body.anchor_block_id,
          sourceUrl: body.source_url,
        });

        projector.projectNotionComment(result.command);

        return sendJson(res, 200, {
          ok: true,
          commandId: result.commandId,
          isDuplicate: result.isDuplicate,
        });
      }

      if (req.method === 'POST' && url.pathname === '/webhook/notion-custom-agent') {
        const body = await readJsonBody(req);
        requireFields(body, ['page_id', 'discussion_id', 'comment_id', 'body']);

        const decisionInput = buildNotionCustomAgentDecisionInput(body);
        if (decisionInput) {
          const result = engine.createDecision({
            projectId: body.project_id,
            ...decisionInput,
          });

          projector.projectDecisionRequest(result.decision);

          const response = {
            ok: true,
            isDuplicate: result.isDuplicate,
            collaboration_mode: 'custom_agent',
            collaborationMode: 'custom_agent',
            workflow_path: 'decision_request',
            workflowPath: 'decision_request',
            signal_level: result.decision.signalLevel,
            signalLevel: result.decision.signalLevel,
            decision_id: result.decision.decisionId,
            decisionId: result.decision.decisionId,
            command_id: null,
            commandId: null,
            decision: mapDecisionForApi(result.decision),
            invoked_agent: body.invoked_agent || null,
            invokedAgent: body.invoked_agent || null,
            owner_agent: result.decision.ownerAgent,
            ownerAgent: result.decision.ownerAgent,
            outbox_queued: result.outboxQueued,
            outboxQueued: result.outboxQueued,
          };

          if (result._redAlert) {
            response._redAlert = result._redAlert;
            response._syncAlert = createSyncAlias(result._redAlert);
          }

          return sendJson(res, 200, response);
        }

        const result = engine.ingestNotionComment({
          projectId: body.project_id,
          targetType: body.target_type,
          targetId: body.target_id,
          pageId: body.page_id,
          discussionId: body.discussion_id,
          commentId: body.comment_id,
          body: body.body,
          ownerAgent: body.owner_agent || body.route_to,
          contextQuote: body.context_quote,
          anchorBlockId: body.anchor_block_id,
          sourceUrl: body.source_url,
        });

        projector.projectNotionComment(result.command);

        return sendJson(res, 200, {
          ok: true,
          command_id: result.commandId,
          commandId: result.commandId,
          isDuplicate: result.isDuplicate,
          collaboration_mode: 'custom_agent',
          collaborationMode: 'custom_agent',
          workflow_path: 'command',
          workflowPath: 'command',
          signal_level: 'green',
          signalLevel: 'green',
          invoked_agent: body.invoked_agent || null,
          invokedAgent: body.invoked_agent || null,
          owner_agent: result.command.ownerAgent,
          ownerAgent: result.command.ownerAgent,
        });
      }

      if (req.method === 'POST' && url.pathname === '/webhook/codex-message') {
        const body = await readJsonBody(req);

        if (body.command && typeof body.command === 'object') {
          const commandId = compact(body.command.command_id || body.command.commandId) || 'unknown-command';
          const ownerAgent = compact(body.agent_name || body.agentName || body.command.owner_agent || body.command.ownerAgent || 'external-agent');
          const resolvedProjectId = body.project_id || body.command.project_id || body.command.projectId;
          const bridgeText = formatExecutorBridgeText({
            agentName: ownerAgent,
            projectId: resolvedProjectId,
            command: body.command,
          });

          const result = engine.queueCodexMessage({
            projectId: resolvedProjectId,
            channel: body.channel,
            target: body.target,
            text: bridgeText,
            priority: body.priority,
            payload: {
              kind: 'external_agent_handoff',
              handoff_agent: ownerAgent,
              command_id: commandId,
              project_id: resolvedProjectId,
              source: body.command.source || null,
              source_url: body.command.source_url || body.command.sourceUrl || null,
              callback_url: `${body.callback_base_url || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100'}/webhook/agent-receipt`,
            },
          });

          return sendJson(res, 200, {
            ok: true,
            status: 'done',
            reply_text: `已转交给 ${ownerAgent}，后续由企业 IM 侧继续执行。`,
            result_summary: `forwarded command ${commandId} via codex-message bridge`,
            project_id: result.projectId,
            outbox_id: result.message.id,
            priority: result.message.priority,
            status_code: result.message.status,
            callback_url: result.message.payload?.callback_url || null,
          });
        }

        requireFields(body, ['text']);

        const result = engine.queueCodexMessage({
          projectId: body.project_id,
          channel: body.channel,
          target: body.target,
          text: body.text,
          priority: body.priority,
        });

        return sendJson(res, 200, {
          ok: true,
          project_id: result.projectId,
          outbox_id: result.message.id,
          priority: result.message.priority,
          status: result.message.status,
        });
      }

      if (req.method === 'POST' && url.pathname === '/webhook/agent-receipt') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch (error) {
          return sendJson(res, 400, {
            ok: false,
            error: 'Invalid JSON',
            code: 'PARSE_ERROR',
          });
        }

        const outboxId = Number(body.outbox_id || body.outboxId || 0) || null;
        const outboxMessage = outboxId ? store.getOutbox(outboxId) : null;
        const outboxPayload =
          outboxMessage?.payload && typeof outboxMessage.payload === 'object'
            ? outboxMessage.payload
            : {};
        const commandId = compact(body.command_id || body.commandId || outboxPayload.command_id || outboxPayload.commandId);
        const agentName = compact(
          body.agent_name ||
            body.agentName ||
            body.agent ||
            outboxPayload.handoff_agent ||
            outboxPayload.handoffAgent,
        );
        const receiptId = compact(body.receipt_id || body.receiptId);
        const receiptStatus = normalizeReceiptStatus(body.status || 'completed');
        const idempotencyKey =
          compact(body.idempotency_key || body.idempotencyKey) ||
          (outboxId && receiptStatus ? `outbox-receipt:${outboxId}:${receiptStatus}` : '');
        const parentReceiptId = compact(body.parent_receipt_id || body.parentReceiptId);
        const projectId = compact(body.project_id || body.projectId || outboxPayload.project_id || outboxPayload.projectId);
        const sessionId = compact(body.session_id || body.sessionId || outboxMessage?.sessionId);
        const signalInput = body.signal || body.signal_level || body.signalLevel;
        const nextStepInput = body.next_step || body.nextStep;
        const replyTextInput = body.reply_text || body.replyText;
        const payload =
          body.payload && typeof body.payload === 'object'
            ? { ...body.payload }
            : {};

        if (!payload.summary && compact(body.summary)) {
          payload.summary = compact(body.summary);
        }
        if (!payload.details && compact(body.details)) {
          payload.details = compact(body.details);
        }
        if (payload.metrics === undefined && body.metrics && typeof body.metrics === 'object') {
          payload.metrics = body.metrics;
        }
        if (payload.artifacts === undefined && Array.isArray(body.artifacts)) {
          payload.artifacts = body.artifacts;
        }
        if (payload.decision_context === undefined && body.decision_context && typeof body.decision_context === 'object') {
          payload.decision_context = body.decision_context;
        }
        if (payload.outbox_id === undefined && outboxId) {
          payload.outbox_id = outboxId;
        }
        if (payload.delivered_at === undefined && body.delivered_at !== undefined) {
          payload.delivered_at = body.delivered_at;
        }

        const missingRequired = [];
        if (!commandId) {
          missingRequired.push('command_id');
        }
        if (!agentName) {
          missingRequired.push('agent_name');
        }
        if (missingRequired.length > 0) {
          return sendJson(res, 400, {
            ok: false,
            error: `Missing required fields: ${missingRequired.join(', ')}`,
            code: 'MISSING_FIELDS',
            missing: missingRequired,
          });
        }

        const commandRecord = store.getCommand(commandId);
        if (!commandRecord) {
          return sendJson(res, 404, {
            ok: false,
            error: 'Command not found',
            code: 'COMMAND_NOT_FOUND',
            command_id: commandId,
          });
        }

        const project = store.getProject(projectId || commandRecord.projectId) || engine.ensureProject(projectId || commandRecord.projectId);
        if (!receiptStatus) {
          return sendJson(res, 400, {
            ok: false,
            error: 'Invalid status. Must be one of: delivered, completed, failed, acknowledged, read',
            code: 'INVALID_STATUS',
          });
        }

        const receiptType = inferReceiptType({
          explicitType: body.receipt_type || body.receiptType,
          status: receiptStatus,
          signal: signalInput,
          payload,
        });
        if (!receiptType) {
          return sendJson(res, 400, {
            ok: false,
            error: 'Invalid receipt_type. Must be one of: result, status_update, alert, heartbeat',
            code: 'INVALID_TYPE',
          });
        }

        const channel =
          compact(body.channel) ||
          compact(outboxMessage?.channel) ||
          compact(commandRecord.channel) ||
          compact(project?.notificationChannel) ||
          compact(engine.defaultChannel);
        const target =
          compact(body.target) ||
          sessionId ||
          compact(outboxPayload.target) ||
          compact(commandRecord.channelSessionId) ||
          compact(project?.notificationTarget) ||
          compact(commandRecord.targetId);

        const missingRouteFields = [];
        if (!channel) {
          missingRouteFields.push('channel');
        }
        if (!target) {
          missingRouteFields.push('target');
        }
        if (missingRouteFields.length > 0) {
          return sendJson(res, 400, {
            ok: false,
            error: `Missing required fields: ${missingRouteFields.join(', ')}`,
            code: 'MISSING_FIELDS',
            missing: missingRouteFields,
          });
        }

        if (idempotencyKey) {
          const existing = engine.checkReceiptIdempotency(idempotencyKey);
          if (existing) {
            return sendJson(res, 200, {
              ok: true,
              receipt_id: existing.receiptId,
              command_id: commandId,
              status: 'already_recorded',
              recorded_at: existing.createdAt,
              idempotency_key: idempotencyKey,
            });
          }
        }

        try {
          const signalLevel = inferSignalLevelFromReceipt({
            explicitSignalLevel: signalInput,
            status: receiptStatus,
            receiptType,
          });
          const summaryInput = body.result_summary || body.summary || payload.summary || payload.details;
          const resultSummary = summarizeReceiptSummary({
            agentName,
            status: receiptStatus,
            resultSummary: summaryInput,
          });

          const receiptResult = engine.recordReceipt({
            receiptId,
            commandId,
            projectId: projectId || commandRecord.projectId,
            sessionId: sessionId || commandRecord.channelSessionId,
            status: receiptStatus,
            receiptType,
            payload,
            signal: signalLevel,
            channel,
            target,
            idempotencyKey,
            parentReceiptId,
          });

          let updatedOutbox = null;
          if (outboxId && outboxMessage) {
            if (receiptStatus === 'failed' && outboxMessage.status !== 'failed') {
              updatedOutbox = engine.failOutbox(outboxId, compact(payload.details || body.error || resultSummary || 'agent receipt failed'));
            } else if (outboxMessage.status === 'pending') {
              updatedOutbox = engine.ackOutbox(outboxId);
            }
          }

          const nextCommandStatus = inferCommandStatusFromReceiptStatus(receiptStatus, commandRecord.status);
          const updatedCommand =
            nextCommandStatus !== commandRecord.status || resultSummary !== commandRecord.resultSummary || agentName !== commandRecord.claimedBy
              ? engine.updateCommandStatus({
                  commandId,
                  status: nextCommandStatus,
                  claimedBy: agentName,
                  resultSummary,
                  ack: nextCommandStatus === 'done' ? commandRecord.ack || `ack:${commandId}` : commandRecord.ack,
                })
              : store.getCommand(commandId);

          const checkpointResult = engine.recordCheckpoint({
            projectId: commandRecord.projectId,
            commandId: commandRecord.commandId,
            signalLevel,
            stage:
              body.stage ||
              (receiptType === 'alert' ? 'alert' : receiptType === 'heartbeat' || receiptType === 'status_update' ? 'monitor' : 'execute'),
            status: inferCheckpointStatusFromSignalLevel(signalLevel),
            title: body.title || summarizeReceiptTitle(agentName, commandRecord),
            summary: resultSummary,
            evidence:
              Array.isArray(body.evidence) ? body.evidence : Array.isArray(payload.artifacts) ? payload.artifacts : [],
            nextStep: nextStepInput || payload.next_step || payload.nextStep || null,
            qualityGrade: inferQualityGradeFromSignalLevel(signalLevel, body.quality_grade || body.qualityGrade),
            anomalyLevel: inferAnomalyLevelFromSignalLevel(signalLevel, body.anomaly_level || body.anomalyLevel),
            feedbackSource: body.feedback_source || 'agent_receipt',
            createdBy: agentName,
            idempotencyKey:
              idempotencyKey
                ? `agent-receipt-checkpoint:${idempotencyKey}`
                : `agent-receipt:${commandId}:${agentName}:${stableHash(JSON.stringify({
                    status: receiptStatus,
                    receipt_type: receiptType,
                    result_summary: resultSummary,
                    reply_text: replyTextInput || '',
                    next_step: nextStepInput || '',
                  }))}`,
          });

          let decisionResult = null;
          if (signalLevel === 'red' && payload?.decision_context && typeof payload.decision_context === 'object') {
            decisionResult = engine.createDecision({
              projectId: projectId || commandRecord.projectId,
              signalLevel: 'red',
              question: payload.decision_context.question || '需要立即拍板的决策',
              options: Array.isArray(payload.decision_context.options) ? payload.decision_context.options : [],
              recommendation: payload.decision_context.recommendation || resultSummary,
              impactScope: body.impact_scope || 'module',
              ownerAgent: agentName,
              sourceUrl:
                Array.isArray(payload.artifacts) && payload.artifacts.length > 0
                  ? payload.artifacts[0]
                  : commandRecord.sourceUrl,
              sessionId: sessionId || target,
              channel,
              idempotencyKey:
                idempotencyKey
                  ? `agent-receipt-decision:${idempotencyKey}`
                : `agent-receipt-decision:${commandId}:${stableHash(JSON.stringify(payload.decision_context))}`,
            });
            projector.projectDecisionRequest(decisionResult.decision);
          }

          projector.projectReceipt(updatedCommand, receiptResult.receipt);

          let replyId = null;
          const replyText = compact(replyTextInput);
          if (replyText && notionApiKey && commandRecord.source === 'notion_comment' && commandRecord.sourceUrl) {
            const sourceRef = parseNotionSourceUrl(commandRecord.sourceUrl);
            if (sourceRef?.discussionId) {
              const reply = await notionReply({
                apiKey: notionApiKey,
                discussionId: sourceRef.discussionId,
                text: replyText,
                baseUrl: notionBaseUrl,
                notionVersion,
              });
              replyId = reply?.id || null;
            }
          }

          setImmediate(() => {
            appendReceiptLog({
              apiKey: notionApiKey,
              project,
              receipt: receiptResult.receipt,
              command: updatedCommand,
              baseUrl: notionBaseUrl,
              notionVersion,
            }).catch(() => {});
          });

          return sendJson(res, 200, {
            ok: true,
            receipt_id: receiptResult.receipt.receiptId,
            command_id: commandId,
            command_status: updatedCommand.status,
            recorded_at: receiptResult.receipt.createdAt,
            receipt_count: updatedCommand.receiptCount,
            receipt: mapReceiptForApi(receiptResult.receipt),
            command: mapCommandForApi(updatedCommand),
            checkpoint: mapCheckpointForApi(checkpointResult.checkpoint),
            decision: decisionResult?.decision ? mapDecisionForApi(decisionResult.decision) : null,
            reply_id: replyId,
            outbox: updatedOutbox,
          });
        } catch (error) {
          return sendJson(res, 500, {
            ok: false,
            error: 'Failed to record receipt',
            code: 'DATABASE_ERROR',
            message: error.message,
          });
        }
      }

      if (req.method === 'POST' && url.pathname === '/decisions') {
        const body = await readJsonBody(req);
        requireFields(body, ['question']);

        const result = engine.createDecision({
          projectId: body.project_id,
          signalLevel: body.signal_level,
          blockingLevel: body.blocking_level,
          question: body.question,
          context: body.context,
          options: body.options,
          recommendation: body.recommendation,
          recommendedOption: body.recommended_option,
          whyNow: body.why_now,
          impactScope: body.impact_scope,
          irreversible: body.irreversible,
          downstreamContamination: body.downstream_contamination,
          evidenceRefs: body.evidence_refs,
          requestedHumanAction: body.requested_human_action,
          dueAt: body.due_at,
          escalateAfter: body.escalate_after,
          ownerAgent: body.owner_agent,
          sourceUrl: body.source_url,
          displayTags: body.display_tags,
          retrievalTags: body.retrieval_tags,
          idempotencyKey: body.idempotency_key,
          sessionId: body.session_id,
          channel: body.channel,
          chatId: body.chat_id,
          threadId: body.thread_id,
          threadUrl: body.thread_url,
          actionUrl: body.action_url,
        });

        projector.projectDecisionRequest(result.decision);

        const response = {
          ok: true,
          isDuplicate: result.isDuplicate,
          decision: mapDecisionForApi(result.decision),
        };

        if (result._redAlert) {
          response._redAlert = result._redAlert;
          response._syncAlert = createSyncAlias(result._redAlert);
        }

        return sendJson(res, 200, response);
      }

      if (req.method === 'POST' && url.pathname === '/task-briefs') {
        const body = await readJsonBody(req);
        requireFields(body, ['why', 'context', 'what']);

        const result = engine.createTaskBrief({
          projectId: body.project_id,
          title: body.title,
          why: body.why,
          context: body.context,
          what: body.what,
          status: body.status,
          ownerAgent: body.owner_agent,
          source: body.source,
          sourceUrl: body.source_url,
          sessionId: body.session_id,
          targetType: body.target_type,
          targetId: body.target_id,
          idempotencyKey: body.idempotency_key,
          displayTags: body.display_tags,
          retrievalTags: body.retrieval_tags,
        });

        return sendJson(res, 200, {
          ok: true,
          isDuplicate: result.isDuplicate,
          brief: mapTaskBriefForApi(result.brief),
        });
      }

      if (req.method === 'POST' && url.pathname === '/runs') {
        const body = await readJsonBody(req);
        requireFields(body, ['role', 'phase', 'title']);

        const result = engine.recordRun({
          projectId: body.project_id,
          briefId: body.brief_id,
          commandId: body.command_id,
          decisionId: body.decision_id,
          agentName: body.agent_name,
          role: body.role,
          phase: body.phase,
          status: body.status,
          title: body.title,
          summary: body.summary,
          qualityGrade: body.quality_grade,
          anomalyLevel: body.anomaly_level,
          feedbackSource: body.feedback_source,
          startedAt: body.started_at,
          completedAt: body.completed_at,
          idempotencyKey: body.idempotency_key,
        });

        return sendJson(res, 200, {
          ok: true,
          isDuplicate: result.isDuplicate,
          run: mapRunForApi(result.run),
        });
      }

      if (req.method === 'POST' && url.pathname === '/runs/update-status') {
        const body = await readJsonBody(req);
        requireFields(body, ['run_id', 'status']);

        return sendJson(res, 200, {
          ok: true,
          run: mapRunForApi(
            engine.updateRunStatus({
              runId: body.run_id,
              status: body.status,
              summary: body.summary,
              qualityGrade: body.quality_grade,
              anomalyLevel: body.anomaly_level,
              feedbackSource: body.feedback_source,
              completedAt: body.completed_at,
            }),
          ),
        });
      }

      if (req.method === 'POST' && url.pathname === '/checkpoints') {
        const body = await readJsonBody(req);
        requireFields(body, ['stage', 'status', 'title', 'summary']);

        const result = engine.recordCheckpoint({
          projectId: body.project_id,
          runId: body.run_id,
          briefId: body.brief_id,
          commandId: body.command_id,
          decisionId: body.decision_id,
          signalLevel: body.signal_level,
          stage: body.stage,
          status: body.status,
          title: body.title,
          summary: body.summary,
          evidence: body.evidence,
          nextStep: body.next_step,
          qualityGrade: body.quality_grade,
          anomalyLevel: body.anomaly_level,
          feedbackSource: body.feedback_source,
          createdBy: body.created_by,
          idempotencyKey: body.idempotency_key,
        });

        projector.projectCheckpoint(result.checkpoint);

        return sendJson(res, 200, {
          ok: true,
          isDuplicate: result.isDuplicate,
          checkpoint: mapCheckpointForApi(result.checkpoint),
        });
      }

      if (req.method === 'POST' && url.pathname === '/outbox/ack') {
        const body = await readJsonBody(req);
        requireFields(body, ['id']);
        return sendJson(res, 200, engine.ackOutbox(body.id));
      }

      if (req.method === 'POST' && url.pathname === '/outbox/fail') {
        const body = await readJsonBody(req);
        requireFields(body, ['id', 'error']);
        return sendJson(res, 200, engine.failOutbox(body.id, body.error));
      }

      if (req.method === 'POST' && url.pathname === '/commands/claim') {
        const body = await readJsonBody(req);
        requireFields(body, ['command_id', 'agent_name']);
        return sendJson(res, 200, {
          ok: true,
          command: mapCommandForApi(
            engine.claimCommand({
              commandId: body.command_id,
              agentName: body.agent_name,
            }),
          ),
        });
      }

      if (req.method === 'POST' && url.pathname === '/commands/claim-next') {
        const body = await readJsonBody(req);
        requireFields(body, ['agent_name']);
        const result = engine.claimNextCommand({
          projectId: body.project_id,
          source: body.source,
          targetType: body.target_type,
          channel: body.channel,
          ownerAgent: body.owner_agent,
          includeUnassigned: body.include_unassigned === true,
          onlyUnassigned: body.only_unassigned === true,
          agentName: body.agent_name,
        });

        return sendJson(res, 200, {
          ok: true,
          command: result.command ? mapCommandForApi(result.command) : null,
        });
      }

      if (req.method === 'POST' && url.pathname === '/commands/start') {
        const body = await readJsonBody(req);
        requireFields(body, ['command_id', 'agent_name']);
        return sendJson(res, 200, {
          ok: true,
          command: mapCommandForApi(
            engine.startCommand({
              commandId: body.command_id,
              agentName: body.agent_name,
            }),
          ),
        });
      }

      if (req.method === 'POST' && url.pathname === '/commands/derive') {
        const body = await readJsonBody(req);
        requireFields(body, ['parent_command_id', 'owner_agent']);
        const result = engine.deriveCommand({
          parentCommandId: body.parent_command_id,
          ownerAgent: body.owner_agent,
          instruction: body.instruction,
          parsedAction: body.parsed_action,
          targetType: body.target_type,
          targetId: body.target_id,
          contextQuote: body.context_quote,
          anchorBlockId: body.anchor_block_id,
          reason: body.reason,
          agentName: body.agent_name,
        });

        return sendJson(res, 200, {
          ok: true,
          isDuplicate: result.isDuplicate,
          parent_command: mapCommandForApi(result.parent),
          command: mapCommandForApi(result.command),
        });
      }

      if (req.method === 'POST' && url.pathname === '/commands/complete') {
        const body = await readJsonBody(req);
        requireFields(body, ['command_id', 'agent_name', 'result_summary']);
        return sendJson(res, 200, {
          ok: true,
          command: mapCommandForApi(
            engine.completeCommand({
              commandId: body.command_id,
              agentName: body.agent_name,
              resultSummary: body.result_summary,
            }),
          ),
        });
      }

      if (req.method === 'POST' && url.pathname === '/commands/update-status') {
        const body = await readJsonBody(req);
        requireFields(body, ['command_id', 'status']);
        return sendJson(res, 200, {
          ok: true,
          command: mapCommandForApi(
            engine.updateCommandStatus({
              commandId: body.command_id,
              status: body.status,
              ownerAgent: body.owner_agent,
              claimedBy: body.claimed_by,
              resultSummary: body.result_summary,
              ack: body.ack,
            }),
          ),
        });
      }

      if (req.method === 'POST' && url.pathname === '/decisions/update-status') {
        const body = await readJsonBody(req);
        requireFields(body, ['decision_id', 'status']);
        const updatedDecision = engine.updateDecisionStatus({
          decisionId: body.decision_id,
          status: body.status,
          decidedBy: body.decided_by,
          decidedAt: body.decided_at,
          decisionNote: body.decision_note,
          selectedOption: body.selected_option,
        });
        projector.projectDecisionOutcome(updatedDecision);
        return sendJson(res, 200, {
          ok: true,
          decision: mapDecisionForApi(updatedDecision),
        });
      }

      return sendJson(res, 404, {
        ok: false,
        error: 'Not found',
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Invalid JSON',
        });
      }

      return sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
  });

  return {
    server,
    engine,
    store,
    close() {
      server.close();
      store.close();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 19100);
  const host = process.env.CORTEX_BIND_HOST || process.env.HOST || '127.0.0.1';
  const app = createCortexServer({
    dbPath: process.env.CORTEX_DB_PATH,
    defaultProjectId: process.env.CORTEX_DEFAULT_PROJECT_ID || 'PRJ-cortex',
    defaultChannel: process.env.CORTEX_DEFAULT_CHANNEL || 'hiredcity',
  });

  app.server.listen(port, host, () => {
    console.log(`cortex-p0 listening on http://${host}:${port}`);
  });
}
