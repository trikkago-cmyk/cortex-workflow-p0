import {
  detectAction,
  legacyBlockingLevelFromSignal,
  normalizeSignalLevel,
  normalizeWhitespace,
} from './workflow-engine.js';
import { extractCommentRouting } from './comment-routing.js';
import { queueRedDecisionAlert } from './adapter.js';
import { buildRedAlertPayload } from './outbox.js';
import { formatDisplayTime } from './notion-review-sync.js';
import { createHash } from 'node:crypto';
import { isLocalNotificationChannel } from './local-notification.js';
import { reviewMemoryCandidate } from './memory-reviewer.js';

function defaultProjectName(projectId) {
  if (projectId === 'PRJ-cortex') {
    return 'Cortex';
  }
  return projectId;
}

function stableHash(value) {
  return createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 12);
}

function nowIso(clock) {
  return clock().toISOString();
}

function reviewerNextStep(assessment) {
  if (!assessment) {
    return '等待 human review。';
  }

  if (assessment.recommendation === 'recommend_accept') {
    return 'Reviewer-Agent 已完成一审，建议 accept_to_durable，等待 human confirm。';
  }

  if (assessment.recommendation === 'recommend_reject') {
    return 'Reviewer-Agent 已完成一审，建议 reject，等待 human confirm。';
  }

  return 'Reviewer-Agent 建议先补证据或改表述，再由 human 决定是否进入 durable。';
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

function summarizeTitle(title, what) {
  if (title) {
    return normalizeWhitespace(title);
  }

  const normalized = normalizeWhitespace(what);
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function asBullets(lines = []) {
  return lines.filter(Boolean).map((line) => `- ${line}`);
}

function asStatusBullets(lines = [], emptyText = '暂无') {
  return lines.length > 0 ? asBullets(lines) : [`- ${emptyText}`];
}

function summarizeRunRoleProgress(runs = []) {
  const grouped = new Map();

  for (const run of runs) {
    const role = String(run?.role || 'executor').trim() || 'executor';
    const current = grouped.get(role) || {
      role,
      total: 0,
      running: 0,
      completed: 0,
      failed: 0,
      latestTitle: null,
    };

    current.total += 1;
    if (run.status === 'running') {
      current.running += 1;
    } else if (run.status === 'completed') {
      current.completed += 1;
    } else if (run.status === 'failed') {
      current.failed += 1;
    }

    if (!current.latestTitle && run.title) {
      current.latestTitle = run.title;
    }

    grouped.set(role, current);
  }

  return [...grouped.values()];
}

function stripBracketedPrefix(text) {
  const raw = String(text || '').trim();
  const plainMatch = raw.match(/^\[(continue|retry|stop|clarify)\]\s*/i);
  if (plainMatch) {
    return raw.slice(plainMatch[0].length).trim();
  }

  const detailedMatch = raw.match(/^\[(improve|clarify)\s*:\s*([^\]]+)\]\s*/i);
  if (detailedMatch) {
    return detailedMatch[2].trim();
  }

  return raw;
}

function decisionStatusFromAction(action) {
  const raw = String(action || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }

  if (raw.startsWith('approve') || raw === 'continue') {
    return 'approved';
  }
  if (raw.startsWith('improve') || raw === 'clarify') {
    return 'changes_requested';
  }
  if (raw === 'retry') {
    return 'retry_requested';
  }
  if (raw === 'stop') {
    return 'stopped';
  }

  return null;
}

const DECISION_STATUSES = new Set([
  'proposed',
  'needs_review',
  'approved',
  'changes_requested',
  'retry_requested',
  'stopped',
  'resolved',
  'archived',
]);

const TERMINAL_DECISION_STATUSES = new Set(['approved', 'stopped', 'resolved', 'archived']);

const COMMAND_STATUSES = new Set([
  'new',
  'claimed',
  'executing',
  'done',
  'failed',
  'cancelled',
  'archived',
]);

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeWhitespace(typeof item === 'string' ? item : JSON.stringify(item)))
    .filter(Boolean);
}

function normalizeOptionalText(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  return normalized || null;
}

function isDecisionTerminalStatus(status) {
  return TERMINAL_DECISION_STATUSES.has(String(status || '').trim());
}

export class CortexEngine {
  constructor(options = {}) {
    this.store = options.store;
    this.defaultProjectId = options.defaultProjectId || 'PRJ-cortex';
    this.defaultChannel = options.defaultChannel || 'hiredcity';

    if (!this.store) {
      throw new Error('CortexEngine requires a store');
    }

    this.store.ensureProject({
      projectId: this.defaultProjectId,
      name: defaultProjectName(this.defaultProjectId),
    });
  }

  ensureProject(projectId) {
    const existing = this.store.getProject(projectId);
    return this.store.ensureProject(
      existing
        ? {
            projectId,
          }
        : {
            projectId,
            name: defaultProjectName(projectId),
          },
    );
  }

  upsertProject(input) {
    const projectId = input.projectId || this.defaultProjectId;
    return this.store.ensureProject({
      projectId,
      name: input.name || defaultProjectName(projectId),
      status: input.status,
      rootPageUrl: input.rootPageUrl,
      reviewWindowNote: input.reviewWindowNote,
      notificationChannel: input.notificationChannel,
      notificationTarget: input.notificationTarget,
      notionReviewPageId: input.notionReviewPageId,
      notionParentPageId: input.notionParentPageId,
      notionMemoryPageId: input.notionMemoryPageId,
      notionScanPageId: input.notionScanPageId,
      displayTags: input.displayTags,
      retrievalTags: input.retrievalTags,
    });
  }

  listProjects() {
    return {
      ok: true,
      projects: this.store.listProjects(),
    };
  }

  ingestImMessage(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);

    const result = this.store.createOrGetCommand({
      projectId,
      source: 'openclaw_im_message',
      channel: 'enterprise_im',
      targetType: input.targetType,
      targetId: input.targetId,
      parsedAction: detectAction(input.text, 'clarify'),
      instruction: normalizeWhitespace(input.text),
      channelSessionId: input.sessionId,
      channelMessageId: input.messageId,
      operatorId: input.userId,
      idempotencyKey: `im_message:${input.sessionId}:${input.messageId}`,
    });

    return {
      ok: true,
      commandId: result.command.commandId,
      isDuplicate: result.deduped,
      command: result.command,
    };
  }

  ingestImAction(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);
    const decisionStatus = input.targetType === 'decision' ? decisionStatusFromAction(input.action) : null;

    const result = this.store.createOrGetCommand({
      projectId,
      source: 'openclaw_im_action',
      channel: 'enterprise_im',
      targetType: input.targetType,
      targetId: input.targetId,
      parsedAction: detectAction(input.action, 'continue'),
      instruction: normalizeWhitespace(input.instruction || input.action),
      channelSessionId: input.sessionId,
      channelMessageId: input.messageId,
      operatorId: input.userId,
      eventKey: input.action,
      idempotencyKey: `im_action:${input.messageId}:${input.action}`,
    });

    let updatedDecision = null;
    if (!result.deduped && input.targetType === 'decision' && input.targetId && decisionStatus) {
      updatedDecision = this.updateDecisionStatus({
        decisionId: input.targetId,
        status: decisionStatus,
        decidedBy: input.userId || 'enterprise_im',
        decidedAt: nowIso(this.store.clock),
        decisionNote: normalizeWhitespace(input.instruction || input.action),
        allowMissing: true,
      });
    }

    return {
      ok: true,
      commandId: result.command.commandId,
      isDuplicate: result.deduped,
      command: result.command,
      decision: updatedDecision,
    };
  }

  ingestNotionComment(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);
    const routing = extractCommentRouting(input.body);
    const normalizedBody = routing.strippedBody || input.body;

    const result = this.store.createOrGetCommand({
      projectId,
      source: 'notion_comment',
      channel: 'notion',
      targetType: input.targetType,
      targetId: input.targetId,
      parsedAction: detectAction(normalizedBody, 'improve'),
      instruction: normalizeWhitespace(stripBracketedPrefix(normalizedBody)),
      contextQuote: normalizeWhitespace(input.contextQuote),
      anchorBlockId: input.anchorBlockId,
      ownerAgent: input.ownerAgent || routing.ownerAgent,
      sourceUrl: input.sourceUrl || `notion://page/${input.pageId}/discussion/${input.discussionId}/comment/${input.commentId}`,
      idempotencyKey: `comment:${input.discussionId}:${input.commentId}`,
    });

    return {
      ok: true,
      commandId: result.command.commandId,
      isDuplicate: result.deduped,
      command: result.command,
    };
  }

  createDecision(input) {
    const projectId = input.projectId || this.defaultProjectId;
    const project = this.ensureProject(projectId);

    const signalLevel = normalizeSignalLevel(input.signalLevel || input.blockingLevel);
    if (!signalLevel) {
      throw new Error('signal_level or blocking_level is required');
    }

    const result = this.store.createOrGetDecisionRequest({
      projectId,
      signalLevel,
      blockingLevel: legacyBlockingLevelFromSignal(signalLevel),
      status: signalLevel === 'red' ? 'needs_review' : 'proposed',
      question: normalizeWhitespace(input.question),
      context: normalizeWhitespace(input.context),
      options: input.options || [],
      recommendation: normalizeWhitespace(input.recommendation),
      recommendedOption: normalizeWhitespace(input.recommendedOption),
      whyNow: normalizeWhitespace(input.whyNow),
      impactScope: input.impactScope,
      irreversible: Boolean(input.irreversible),
      downstreamContamination: Boolean(input.downstreamContamination),
      evidenceRefs: normalizeStringList(input.evidenceRefs),
      requestedHumanAction: normalizeWhitespace(input.requestedHumanAction),
      dueAt: input.dueAt || null,
      escalateAfter: input.escalateAfter,
      ownerAgent: input.ownerAgent,
      sourceUrl: input.sourceUrl,
      displayTags: input.displayTags,
      retrievalTags: input.retrievalTags,
      idempotencyKey:
        input.idempotencyKey || `decision:${projectId}:${normalizeWhitespace(input.question).toLowerCase()}`,
    });

    let redAlert = null;
    let outbox = null;
    if (result.decision.signalLevel === 'red') {
      const channel = input.channel || project.notificationChannel || 'local_notification';
      const sessionId = input.sessionId || input.target || project.notificationTarget;

      if (!sessionId && !isLocalNotificationChannel(channel)) {
        throw new Error('red decisions require session_id or project.notification_target');
      }

      redAlert = buildRedAlertPayload(result.decision, {
        thread_id: input.threadId || input.thread_id,
        thread_url: input.threadUrl || input.thread_url,
        action_url: input.actionUrl || input.action_url,
      });

      if (!result.deduped) {
        outbox = queueRedDecisionAlert({
          store: this.store,
          decision: result.decision,
          sessionId,
          channel,
          chatId: input.chatId || null,
          payload: {
            thread_id: input.threadId || input.thread_id,
            thread_url: input.threadUrl || input.thread_url,
            action_url: input.actionUrl || input.action_url,
          },
        });
      }
    }

    return {
      ok: true,
      decision: result.decision,
      isDuplicate: result.deduped,
      _redAlert: redAlert,
      outboxQueued: Boolean(outbox),
    };
  }

  createTaskBrief(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);

    const result = this.store.createOrGetTaskBrief({
      projectId,
      title: summarizeTitle(input.title, input.what),
      why: normalizeWhitespace(input.why),
      context: normalizeWhitespace(input.context),
      what: normalizeWhitespace(input.what),
      status: input.status || 'draft',
      ownerAgent: input.ownerAgent,
      source: input.source || 'agent_brief',
      sourceUrl: input.sourceUrl,
      channelSessionId: input.channelSessionId || input.sessionId,
      targetType: input.targetType,
      targetId: input.targetId,
      displayTags: input.displayTags,
      retrievalTags: input.retrievalTags,
      idempotencyKey:
        input.idempotencyKey ||
        `task_brief:${projectId}:${normalizeWhitespace(input.what).toLowerCase()}`,
    });

    return {
      ok: true,
      brief: result.brief,
      isDuplicate: result.deduped,
    };
  }

  recordRun(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);

    const result = this.store.createOrGetRun({
      projectId,
      briefId: input.briefId,
      commandId: input.commandId,
      decisionId: input.decisionId,
      agentName: input.agentName,
      role: normalizeWhitespace(input.role || 'executor'),
      phase: normalizeWhitespace(input.phase || 'execute'),
      status: normalizeWhitespace(input.status || 'running'),
      title: summarizeTitle(input.title, input.summary || input.commandInstruction || input.phase || '未命名运行'),
      summary: normalizeWhitespace(input.summary),
      qualityGrade: input.qualityGrade,
      anomalyLevel: input.anomalyLevel,
      feedbackSource: input.feedbackSource,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      idempotencyKey:
        input.idempotencyKey ||
        `run:${projectId}:${input.agentName || 'agent'}:${input.commandId || input.briefId || input.decisionId || normalizeWhitespace(input.title || input.summary || input.phase || 'run')}`,
    });

    return {
      ok: true,
      run: result.run,
      isDuplicate: result.deduped,
    };
  }

  updateRunStatus(input) {
    return this.store.updateRun({
      runId: input.runId,
      status: input.status,
      summary: input.summary,
      qualityGrade: input.qualityGrade,
      anomalyLevel: input.anomalyLevel,
      feedbackSource: input.feedbackSource,
      completedAt: input.completedAt,
    });
  }

  listRuns(filters) {
    return {
      ok: true,
      runs: this.store.listRuns(filters),
    };
  }

  recordCheckpoint(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);
    const normalizedSignalLevel = input.signalLevel ? normalizeSignalLevel(input.signalLevel) : null;

    const result = this.store.createOrGetCheckpoint({
      projectId,
      runId: input.runId,
      briefId: input.briefId,
      commandId: input.commandId,
      decisionId: input.decisionId,
      signalLevel: normalizedSignalLevel,
      stage: normalizeWhitespace(input.stage || 'execute'),
      status: normalizeWhitespace(input.status || 'completed'),
      title: summarizeTitle(input.title, input.summary || input.nextStep || input.stage || 'checkpoint'),
      summary: normalizeWhitespace(input.summary),
      evidence: input.evidence || [],
      nextStep: normalizeWhitespace(input.nextStep),
      qualityGrade: input.qualityGrade,
      anomalyLevel: input.anomalyLevel,
      feedbackSource: input.feedbackSource,
      createdBy: input.createdBy,
      idempotencyKey:
        input.idempotencyKey ||
        `checkpoint:${projectId}:${input.runId || input.commandId || input.briefId || input.decisionId || normalizeWhitespace(input.title || input.summary || input.stage || 'checkpoint')}`,
    });

    return {
      ok: true,
      checkpoint: result.checkpoint,
      isDuplicate: result.deduped,
    };
  }

  listCheckpoints(filters) {
    return {
      ok: true,
      checkpoints: this.store.listCheckpoints(filters),
    };
  }

  recordReceipt(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);

    const result = this.store.recordReceipt({
      receiptId: input.receiptId,
      commandId: input.commandId,
      projectId,
      sessionId: input.sessionId,
      status: input.status,
      receiptType: input.receiptType,
      payload: input.payload,
      signal: input.signal,
      channel: input.channel,
      target: input.target,
      idempotencyKey: input.idempotencyKey,
      parentReceiptId: input.parentReceiptId,
    });

    return {
      ok: true,
      receipt: result.receipt,
      isDuplicate: result.deduped,
    };
  }

  checkReceiptIdempotency(idempotencyKey) {
    return this.store.checkIdempotency(idempotencyKey);
  }

  getCommandReceipts(commandId) {
    return {
      ok: true,
      receipts: this.store.getCommandReceipts(commandId),
    };
  }

  getReceiptsByProject(projectId, options = {}) {
    return {
      ok: true,
      receipts: this.store.getReceiptsByProject(projectId, options),
    };
  }

  createMemory(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);

    const created = this.store.createOrGetMemoryItem({
      projectId,
      layer: normalizeWhitespace(input.layer),
      type: normalizeWhitespace(input.type),
      title: summarizeTitle(input.title, input.summary),
      summary: normalizeWhitespace(input.summary),
      status: input.status,
      reviewState: input.reviewState,
      confidence: input.confidence,
      freshness: input.freshness,
      nextStep: normalizeWhitespace(input.nextStep),
      ownerAgent: input.ownerAgent,
      relatedMemory: input.relatedMemory,
      metadata: input.metadata,
      sources: input.sources,
      idempotencyKey: input.idempotencyKey,
    });

    let result = {
      memory: created.memory,
      sources: created.sources,
      deduped: created.deduped,
    };
    let reviewerAssessment = null;

    if (result.memory?.status === 'candidate') {
      const reviewResult = this.runReviewerReview({
        memoryId: result.memory.memoryId,
        reviewerAgent: input.reviewerAgent,
        skipIfPresent: true,
      });
      reviewerAssessment = reviewResult.assessment;
      result = {
        ...result,
        memory: reviewResult.memory,
      };
    }

    return {
      ok: true,
      memory: result.memory,
      sources: result.sources,
      isDuplicate: result.deduped,
      reviewerAssessment,
    };
  }

  listMemory(filters = {}) {
    return {
      ok: true,
      memories: this.store.listMemoryItems(filters),
    };
  }

  getMemory(memoryId) {
    return {
      ok: true,
      memory: this.store.getMemoryItem(memoryId),
      sources: this.store.listMemorySources(memoryId),
    };
  }

  reviewMemory(input) {
    const existing = this.store.getMemoryItem(input.memoryId);
    const finalStatus =
      input.status ||
      (input.reviewState === 'accepted'
        ? existing?.status === 'candidate'
          ? 'durable'
          : existing?.status
        : input.reviewState === 'rejected'
          ? 'rejected'
          : existing?.status);

    const humanReview = {
      actor: input.reviewActor || 'reviewer-human',
      note: normalizeWhitespace(input.reviewNote),
      decided_at: nowIso(this.store.clock),
      final_review_state: input.reviewState,
      final_status: finalStatus || null,
    };

    return {
      ok: true,
      memory: this.store.reviewMemoryItem({
        memoryId: input.memoryId,
        reviewState: input.reviewState,
        status: input.status,
        nextStep: input.nextStep,
        freshness: input.freshness,
        ownerAgent: input.ownerAgent,
        metadataPatch: {
          human_review: humanReview,
          human_confirmation_required: input.reviewState === 'needs_followup',
          review_stage:
            input.reviewState === 'accepted'
              ? 'human_confirmed_durable'
              : input.reviewState === 'rejected'
                ? 'human_rejected'
                : 'human_needs_followup',
        },
      }),
    };
  }

  runReviewerReview(input) {
    const memory = this.store.getMemoryItem(input.memoryId);
    if (!memory) {
      throw new Error(`Unknown memory ${input.memoryId}`);
    }

    const existingAssessment = memory.metadata?.reviewer_recommendation;
    if (existingAssessment && input.skipIfPresent && !input.force) {
      return {
        ok: true,
        skipped: true,
        memory,
        assessment: existingAssessment,
      };
    }

    const sources = this.store.listMemorySources(input.memoryId);
    const assessment = reviewMemoryCandidate({
      memory,
      sources,
      reviewerAgent: input.reviewerAgent || 'reviewer-agent',
      reviewedAt: nowIso(this.store.clock),
    });

    const updatedMemory = this.store.reviewMemoryItem({
      memoryId: input.memoryId,
      nextStep: reviewerNextStep(assessment),
      freshness: input.freshness,
      ownerAgent: memory.ownerAgent || assessment.reviewer_agent,
      metadataPatch: {
        reviewer_recommendation: assessment,
        human_confirmation_required: true,
        review_stage: 'reviewer_agent_completed',
      },
    });

    return {
      ok: true,
      skipped: false,
      memory: updatedMemory,
      assessment,
    };
  }

  createInboxItem(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);

    const result = this.store.createOrGetInboxItem({
      projectId,
      queue: normalizeWhitespace(input.queue),
      objectType: normalizeWhitespace(input.objectType),
      actionType: normalizeWhitespace(input.actionType),
      riskLevel: normalizeSignalLevel(input.riskLevel || 'green') || 'green',
      status: input.status,
      title: summarizeTitle(input.title, input.summary),
      summary: normalizeWhitespace(input.summary),
      ownerAgent: input.ownerAgent,
      sourceRef: input.sourceRef,
      sourceUrl: input.sourceUrl,
      assignedTo: input.assignedTo,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      resolvedAt: input.resolvedAt,
    });

    return {
      ok: true,
      item: result.item,
      isDuplicate: result.deduped,
    };
  }

  listInbox(filters = {}) {
    return {
      ok: true,
      items: this.store.listInboxItems({
        ...filters,
        sourceRef: filters.sourceRef,
      }),
    };
  }

  getInboxItem(itemId) {
    return {
      ok: true,
      item: this.store.getInboxItem(itemId),
    };
  }

  actInboxItem(input) {
    return {
      ok: true,
      item: this.store.actInboxItem({
        itemId: input.itemId,
        status: input.status,
        assignedTo: input.assignedTo,
        payloadPatch: input.payloadPatch,
      }),
    };
  }

  createSuggestion(input) {
    const projectId = input.projectId || this.defaultProjectId;
    this.ensureProject(projectId);

    const result = this.store.createOrGetSuggestion({
      projectId,
      sourceType: normalizeWhitespace(input.sourceType),
      sourceRef: input.sourceRef,
      documentRef: input.documentRef,
      anchorBlockId: input.anchorBlockId,
      selectedText: input.selectedText,
      proposedText: normalizeWhitespace(input.proposedText),
      reason: normalizeWhitespace(input.reason),
      impactScope: input.impactScope,
      status: input.status,
      ownerAgent: input.ownerAgent,
      appliedAt: input.appliedAt,
      rejectedReason: input.rejectedReason,
      idempotencyKey: input.idempotencyKey,
    });

    return {
      ok: true,
      suggestion: result.suggestion,
      isDuplicate: result.deduped,
    };
  }

  listSuggestions(filters = {}) {
    return {
      ok: true,
      suggestions: this.store.listSuggestions(filters),
    };
  }

  getSuggestion(suggestionId) {
    return {
      ok: true,
      suggestion: this.store.getSuggestion(suggestionId),
    };
  }

  acceptSuggestion(input) {
    return {
      ok: true,
      suggestion: this.store.updateSuggestionStatus({
        suggestionId: input.suggestionId,
        status: 'accepted',
        rejectedReason: null,
        appliedAt: input.appliedAt || new Date().toISOString(),
      }),
    };
  }

  rejectSuggestion(input) {
    return {
      ok: true,
      suggestion: this.store.updateSuggestionStatus({
        suggestionId: input.suggestionId,
        status: 'rejected',
        rejectedReason: input.rejectedReason,
      }),
    };
  }

  queueCodexMessage(input) {
    const projectId = input.projectId || this.defaultProjectId;
    const project = this.ensureProject(projectId);
    const channel = input.channel || project.notificationChannel || this.defaultChannel;
    const target = input.target || project.notificationTarget;

    if (!target) {
      throw new Error('target is required or must be configured on project.notification_target');
    }

    const message = this.store.enqueueOutbox({
      channel,
      sessionId: target,
      text: normalizeWhitespace(input.text),
      priority: input.priority === 'urgent' ? 'urgent' : 'normal',
      payload: {
        source: 'codex_message',
        project_id: projectId,
        target,
        priority: input.priority === 'urgent' ? 'urgent' : 'normal',
        ...(input.payload && typeof input.payload === 'object' ? input.payload : {}),
      },
    });

    return {
      ok: true,
      projectId,
      message,
    };
  }

  claimCommand(input) {
    return this.store.claimCommand(input);
  }

  claimNextCommand(input) {
    const command = this.store.claimNextCommand({
      projectId: input.projectId || this.defaultProjectId,
      source: input.source,
      targetType: input.targetType,
      channel: input.channel,
      ownerAgent: input.ownerAgent,
      includeUnassigned: input.includeUnassigned,
      onlyUnassigned: input.onlyUnassigned,
      agentName: input.agentName,
    });

    return {
      ok: true,
      command,
    };
  }

  startCommand(input) {
    return this.store.startCommand(input);
  }

  completeCommand(input) {
    return this.store.completeCommand(input);
  }

  deriveCommand(input) {
    const parent = this.store.getCommand(input.parentCommandId);
    if (!parent) {
      throw new Error(`Unknown command ${input.parentCommandId}`);
    }

    if (input.agentName && parent.claimedBy && parent.claimedBy !== input.agentName) {
      throw new Error(`Command ${input.parentCommandId} is not claimed by ${input.agentName}`);
    }

    const instruction = normalizeWhitespace(input.instruction || parent.instruction);
    const ownerAgent = normalizeWhitespace(input.ownerAgent);
    if (!ownerAgent) {
      throw new Error('ownerAgent is required');
    }

    const parsedAction = detectAction(input.parsedAction || instruction, parent.parsedAction || 'continue');
    const idempotencySeed = JSON.stringify({
      parentCommandId: input.parentCommandId,
      ownerAgent,
      parsedAction,
      instruction,
      reason: input.reason || '',
    });

    const result = this.store.createOrGetCommand({
      parentCommandId: parent.commandId,
      projectId: parent.projectId,
      channel: parent.channel,
      targetType: input.targetType || parent.targetType,
      targetId: input.targetId || parent.targetId,
      parsedAction,
      instruction,
      contextQuote: input.contextQuote || parent.contextQuote,
      anchorBlockId: input.anchorBlockId || parent.anchorBlockId,
      channelSessionId: parent.channelSessionId,
      channelMessageId: parent.channelMessageId,
      operatorId: parent.operatorId,
      eventKey: input.reason || `derived_from:${parent.commandId}`,
      ownerAgent,
      source: parent.source,
      sourceUrl: parent.sourceUrl,
      idempotencyKey: `derived:${parent.commandId}:${stableHash(idempotencySeed)}`,
    });

    return {
      ok: true,
      parent,
      command: result.command,
      isDuplicate: result.deduped,
    };
  }

  updateDecisionStatus(input) {
    const status = String(input.status || '').trim();
    if (!DECISION_STATUSES.has(status)) {
      throw new Error(`Unsupported decision status ${input.status}`);
    }

    const shouldStampHumanAudit =
      Boolean(input.decidedBy) || Boolean(input.decisionNote) || Boolean(input.selectedOption) || isDecisionTerminalStatus(status);

    const updatedDecision = this.store.updateDecisionStatus({
      decisionId: input.decisionId,
      status,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt ?? (shouldStampHumanAudit ? nowIso(this.store.clock) : undefined),
      decisionNote: normalizeOptionalText(input.decisionNote),
      selectedOption: normalizeOptionalText(input.selectedOption),
      allowMissing: Boolean(input.allowMissing),
    });

    if (!updatedDecision) {
      return null;
    }

    if (updatedDecision.inboxItemId) {
      this.store.actInboxItem({
        itemId: updatedDecision.inboxItemId,
        status: isDecisionTerminalStatus(updatedDecision.status) ? 'resolved' : undefined,
        payloadPatch: {
          decision_status: updatedDecision.status,
          decided_by: updatedDecision.decidedBy || null,
          decided_at: updatedDecision.decidedAt || null,
          decision_note: updatedDecision.decisionNote || null,
          selected_option: updatedDecision.selectedOption || null,
        },
        allowMissing: true,
      });
    }

    return updatedDecision;
  }

  updateCommandStatus(input) {
    const status = String(input.status || '').trim();
    if (!COMMAND_STATUSES.has(status)) {
      throw new Error(`Unsupported command status ${input.status}`);
    }

    return this.store.updateCommandStatus({
      commandId: input.commandId,
      status,
      ownerAgent: input.ownerAgent,
      claimedBy: input.claimedBy,
      resultSummary: input.resultSummary,
      ack: input.ack ?? (status === 'done' ? `ack:${input.commandId}` : undefined),
    });
  }

  listCommands(filters) {
    return {
      ok: true,
      commands: this.store.listCommands(filters),
    };
  }

  listDecisionRequests(filters) {
    return {
      ok: true,
      decisions: this.store.listDecisionRequests(filters),
    };
  }

  buildDecisionHub(filters = {}) {
    const projectId = filters.projectId || this.defaultProjectId;
    const view = String(filters.view || (filters.status ? 'all' : 'open')).trim().toLowerCase() || 'open';
    const decisions = this.store.listDecisionRequests({
      projectId,
      signalLevel: filters.signalLevel,
      status: filters.status,
    });

    const packets = decisions
      .filter((decision) => {
        if (view === 'all') {
          return true;
        }
        if (view === 'closed') {
          return isDecisionTerminalStatus(decision.status);
        }
        return !isDecisionTerminalStatus(decision.status);
      })
      .map((decision) => {
        const inboxItem =
          (decision.inboxItemId ? this.store.getInboxItem(decision.inboxItemId) : null) ||
          this.store.listInboxItems({
            projectId,
            sourceRef: `decision:${decision.decisionId}`,
            objectType: 'decision',
            limit: 1,
          })[0] ||
          null;
        const dueAtMs = decision.dueAt ? Date.parse(decision.dueAt) : Number.NaN;
        const overdue =
          Number.isFinite(dueAtMs) && !isDecisionTerminalStatus(decision.status) && dueAtMs < this.store.clock().getTime();

        return {
          ...decision,
          blockingScope: decision.blockingScope || decision.impactScope || null,
          inboxItem,
          inboxStatus: inboxItem?.status || null,
          overdue,
        };
      });

    return {
      ok: true,
      summary: {
        totalCount: packets.length,
        openCount: packets.filter((packet) => !isDecisionTerminalStatus(packet.status)).length,
        terminalCount: packets.filter((packet) => isDecisionTerminalStatus(packet.status)).length,
        redCount: packets.filter((packet) => packet.signalLevel === 'red').length,
        yellowCount: packets.filter((packet) => packet.signalLevel === 'yellow').length,
        greenCount: packets.filter((packet) => packet.signalLevel === 'green').length,
        overdueCount: packets.filter((packet) => packet.overdue).length,
        decideQueueOpenCount: packets.filter((packet) => packet.inboxItem?.queue === 'decide' && packet.inboxStatus === 'open').length,
      },
      decisions: packets,
      view,
    };
  }

  listTaskBriefs(filters) {
    return {
      ok: true,
      briefs: this.store.listTaskBriefs(filters),
    };
  }

  buildProjectReview(projectId) {
    const resolvedProjectId = projectId || this.defaultProjectId;
    const project = this.store.getProject(resolvedProjectId);
    if (!project) {
      throw new Error(`Unknown project ${resolvedProjectId}`);
    }

    const briefs = this.store.listTaskBriefs({ projectId: resolvedProjectId });
    const decisions = this.store.listDecisionRequests({ projectId: resolvedProjectId });
    const commands = this.store.listCommands(resolvedProjectId);
    const checkpoints = this.store.listCheckpoints({ projectId: resolvedProjectId, limit: 10 });
    const recentRuns = this.store.listRuns({ projectId: resolvedProjectId, limit: 12 });

    const latestBrief = briefs[0];
    const latestCheckpoint = checkpoints[0];
    const redDecisions = decisions.filter((decision) => decision.signalLevel === 'red' && decision.status === 'needs_review');
    const yellowDecisions = decisions.filter((decision) => decision.signalLevel === 'yellow' && decision.status === 'proposed');
    const greenNotes = decisions.filter((decision) => decision.signalLevel === 'green');
    const activeCommands = commands.filter((command) => ['new', 'claimed', 'executing'].includes(command.status));
    const recentDoneCommands = commands.filter((command) => command.status === 'done').slice(0, 5);
    const notionCommands = commands.filter((command) => command.source === 'notion_comment').slice(0, 5);
    const runRoleProgress = summarizeRunRoleProgress(recentRuns);
    const checkpointSignal = latestCheckpoint?.signalLevel || null;
    const checkpointPhase =
      latestCheckpoint
        ? [latestCheckpoint.stage, latestCheckpoint.status, latestCheckpoint.qualityGrade, latestCheckpoint.anomalyLevel]
            .filter(Boolean)
            .join(' / ')
        : null;

    const nextSteps = [];
    if (redDecisions.length > 0) {
      nextSteps.push(`有 ${redDecisions.length} 个红灯事项需要立即拍板。`);
    }
    if (yellowDecisions.length > 0) {
      nextSteps.push(`有 ${yellowDecisions.length} 个黄灯事项已挂起，等 review 窗口统一处理。`);
    }
    if (activeCommands.length > 0) {
      nextSteps.push(`有 ${activeCommands.length} 条执行指令还在队列中。`);
    }
    if (nextSteps.length === 0) {
      if (latestCheckpoint?.nextStep) {
        nextSteps.push(latestCheckpoint.nextStep);
      }
      const briefDrivenNextStep = latestBrief?.what
        ? `继续推进：${summarizeTitle(null, latestBrief.what)}`
        : latestBrief?.title
          ? `继续推进：${latestBrief.title}`
          : null;
      if (nextSteps.length === 0) {
        nextSteps.push(briefDrivenNextStep || '当前没有阻塞项，可以继续推进下一轮执行。');
      }
    }

    const trajectoryStatus =
      redDecisions.length > 0 || checkpointSignal === 'red'
        ? '已偏离，需要立即拍板'
        : yellowDecisions.length > 0 || checkpointSignal === 'yellow'
          ? '存在待对齐项，但还没有脱轨'
          : '未见脱轨信号，当前推进方向正常';

    const trajectoryReason =
      redDecisions.length > 0
        ? `当前有 ${redDecisions.length} 个红灯事项未处理，继续推进会放大错误成本。`
        : yellowDecisions.length > 0
          ? `当前有 ${yellowDecisions.length} 个黄灯事项待 review，需要在合适窗口收口。`
          : checkpointSignal === 'red'
            ? latestCheckpoint.summary
            : checkpointSignal === 'yellow'
              ? latestCheckpoint.summary
              : activeCommands.length > 0
                ? `当前有 ${activeCommands.length} 条执行项在推进，但没有发现需要你立即拍板的阻塞。`
                : latestCheckpoint?.summary || '当前没有红灯、黄灯或积压执行项。';

    const generatedAt = formatDisplayTime(this.store.clock());
    const currentTask = latestCheckpoint?.title || latestBrief?.title || '未设置';
    const currentProgress =
      latestCheckpoint?.summary ||
      latestBrief?.what ||
      recentDoneCommands[0]?.resultSummary ||
      activeCommands[0]?.instruction ||
      trajectoryReason;
    const redSummary =
      redDecisions.length > 0
        ? `${redDecisions.length} 个，当前最需要拍板：${redDecisions[0].question}`
        : checkpointSignal === 'red'
          ? `1 个，最新 checkpoint：${latestCheckpoint.title}`
        : '无';
    const yellowSummary =
      yellowDecisions.length > 0
        ? `${yellowDecisions.length} 个，当前待对齐：${yellowDecisions[0].question}`
        : checkpointSignal === 'yellow'
          ? `1 个，最新 checkpoint：${latestCheckpoint.title}`
        : '无';
    const greenSummary =
      greenNotes.length > 0
        ? greenNotes
            .slice(0, 2)
            .map((decision) => decision.question)
            .join('；')
        : checkpointSignal === 'green'
          ? latestCheckpoint.summary
        : recentDoneCommands[0]?.resultSummary || '无';
    const coreProgressItems =
      latestCheckpoint?.summary
        ? [latestCheckpoint.summary]
        : greenNotes.length > 0
        ? greenNotes.slice(0, 5).map((decision) => decision.question)
        : recentDoneCommands.length > 0
          ? recentDoneCommands.slice(0, 5).map((command) => command.resultSummary)
          : activeCommands.length > 0
            ? activeCommands.slice(0, 5).map((command) => command.instruction)
            : [currentProgress];
    const redItems = redDecisions.slice(0, 5).map((decision) => decision.question);
    const yellowItems = yellowDecisions.slice(0, 5).map((decision) => decision.question);
    const coreProgressSummary = coreProgressItems.join('；');
    const nextStepSummary = nextSteps.join('；');
    const decisionSummary = `🔴 ${redSummary}；🟡 ${yellowSummary}；🟢 ${greenSummary}`;
    const roleProgressSummary =
      runRoleProgress.length > 0
        ? runRoleProgress
            .map((item) => {
              const stats = [`完成 ${item.completed}`];
              if (item.running > 0) {
                stats.push(`执行中 ${item.running}`);
              }
              if (item.failed > 0) {
                stats.push(`失败 ${item.failed}`);
              }
              return `${item.role}(${stats.join(' / ')})`;
            })
            .join('；')
        : '暂无';
    const entryLinks = [
      project.rootPageUrl ? `工作台：${project.rootPageUrl}` : null,
      project.notionScanPageId ? `执行文档：${notionPageUrlFromId(project.notionScanPageId)}` : null,
      project.notionMemoryPageId ? `协作记忆：${notionPageUrlFromId(project.notionMemoryPageId)}` : null,
      project.reviewWindowNote ? `Review 窗口：${project.reviewWindowNote}` : null,
    ]
      .filter(Boolean)
      .join('；');

    const markdown = [
      `# ${project.projectId} 工作台入口`,
      '',
      `- 最近同步：${generatedAt}`,
      `- 当前任务：${currentTask}`,
      checkpointPhase ? `- 当前阶段：${checkpointPhase}` : null,
      `- 🟢 核心进展：${coreProgressSummary}`,
      `- 决策状态：${decisionSummary}`,
      `- 角色进度：${roleProgressSummary}`,
      `- 下一步：${nextStepSummary}`,
      `- 当前判断：${trajectoryStatus}；${trajectoryReason}`,
      entryLinks ? `- 入口：${entryLinks}` : null,
      latestCheckpoint?.nextStep ? `- 最新 checkpoint：${latestCheckpoint.title} · ${latestCheckpoint.nextStep}` : null,
      notionCommands.length > 0
        ? `- 最近评论：${notionCommands[0].instruction}${notionCommands[0].contextQuote ? ` · 引用：${notionCommands[0].contextQuote}` : ''}`
        : '- 最近评论：无',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      ok: true,
      project,
      summary: {
        latestBrief,
        latestCheckpoint,
        redDecisions,
        yellowDecisions,
        greenNotes,
        activeCommands,
        recentDoneCommands,
        notionCommands,
        recentRuns,
        runRoleProgress,
        nextSteps,
        trajectoryStatus,
        trajectoryReason,
      },
      markdown,
    };
  }

  listSyncDecisions(projectId) {
    return this.listDecisionRequests({
      projectId,
      signalLevel: 'red',
      status: 'needs_review',
    });
  }

  listOutbox(options = {}) {
    const { pending, stats, messages } = this.store.listOutbox(options);
    return {
      ok: true,
      pending,
      stats,
      messages,
    };
  }

  ackOutbox(id) {
    const message = this.store.ackOutbox(id);
    return {
      ok: true,
      id: message.id,
      status: message.status,
    };
  }

  failOutbox(id, error) {
    const message = this.store.failOutbox(id, error);
    return {
      ok: true,
      id: message.id,
      status: message.status,
    };
  }

  archiveOutbox(id, note) {
    const message = this.store.archiveOutbox(id, note);
    return {
      ok: true,
      id: message.id,
      status: message.status,
    };
  }

  health() {
    return {
      ok: true,
      service: 'cortex-p0',
    };
  }
}
