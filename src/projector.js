import { proposeMemoryCandidates } from './memory-extractor.js';
import { parseCommentIntentEventKey } from './comment-intent.js';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(text, maxLength = 72) {
  const normalized = compact(text);
  if (!normalized) {
    return '未命名事项';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export class CortexProjector {
  constructor(options = {}) {
    this.engine = options.engine;
    if (!this.engine) {
      throw new Error('CortexProjector requires an engine');
    }
  }

  projectNotionComment(command) {
    if (!command || command.source !== 'notion_comment') {
      return null;
    }

    const commentIntent = parseCommentIntentEventKey(command.eventKey);
    const executionPolicy = commentIntent?.comment_execution_policy || 'enqueue';
    const intent = commentIntent?.comment_intent || 'continue_task';
    const riskLevel = executionPolicy === 'enqueue' || executionPolicy === 'log_only' ? 'green' : 'yellow';
    const actionType = executionPolicy === 'enqueue' || executionPolicy === 'log_only' ? 'respond' : 'review';
    const titlePrefix =
      executionPolicy === 'enqueue'
        ? '评论可执行'
        : executionPolicy === 'reject'
          ? '评论已拦截'
          : executionPolicy === 'log_only'
            ? '评论已记录'
          : '评论待分流';

    return this.engine.createInboxItem({
      projectId: command.projectId,
      queue: 'triage',
      objectType: 'comment',
      actionType,
      riskLevel,
      status: executionPolicy === 'enqueue' || executionPolicy === 'log_only' ? 'resolved' : 'open',
      title: `${titlePrefix}：${summarize(command.instruction)}`,
      summary: compact(command.contextQuote) || compact(command.instruction),
      ownerAgent: command.ownerAgent,
      sourceRef: `command:${command.commandId}`,
      sourceUrl: command.sourceUrl,
      payload: {
        kind: 'notion_comment',
        command_id: command.commandId,
        target_type: command.targetType,
        target_id: command.targetId,
        owner_agent: command.ownerAgent,
        comment_intent: intent,
        comment_task_state: commentIntent?.comment_task_state || null,
        comment_execution_policy: executionPolicy,
        comment_executable: commentIntent?.comment_executable ?? true,
        comment_allowed: commentIntent?.comment_allowed ?? true,
        comment_confidence: commentIntent?.comment_confidence || null,
        comment_reason: commentIntent?.comment_reason || null,
      },
      idempotencyKey: `projector:inbox:notion_comment:${command.commandId}:triage`,
    });
  }

  projectDecisionRequest(decision) {
    if (!decision) {
      return null;
    }

    if (!['red', 'yellow'].includes(decision.signalLevel)) {
      return null;
    }

    if (!['proposed', 'needs_review'].includes(decision.status)) {
      return null;
    }

    return this.engine.createInboxItem({
      projectId: decision.projectId,
      queue: 'decide',
      objectType: 'decision',
      actionType: 'decide',
      riskLevel: decision.signalLevel,
      title: `待拍板：${summarize(decision.question)}`,
      summary: compact(decision.recommendation) || compact(decision.whyNow) || compact(decision.question),
      ownerAgent: decision.ownerAgent,
      sourceRef: `decision:${decision.decisionId}`,
      sourceUrl: decision.sourceUrl,
      payload: {
        kind: 'decision_request',
        decision_id: decision.decisionId,
        signal_level: decision.signalLevel,
        impact_scope: decision.impactScope,
        blocking_scope: decision.blockingScope || decision.impactScope || null,
        context: decision.context || null,
        options: decision.options,
        recommendation: decision.recommendation || null,
        recommended_option: decision.recommendedOption || null,
        evidence_refs: decision.evidenceRefs || [],
        requested_human_action: decision.requestedHumanAction || null,
        due_at: decision.dueAt || null,
        decision_status: decision.status,
      },
      idempotencyKey: `projector:inbox:decision:${decision.decisionId}:decide`,
    });
  }

  projectReceipt(command, receipt) {
    if (!command || !receipt) {
      return null;
    }

    if (!['completed', 'failed', 'acknowledged', 'delivered', 'read'].includes(receipt.status)) {
      return null;
    }

    return this.engine.createInboxItem({
      projectId: receipt.projectId || command.projectId,
      queue: 'review',
      objectType: 'result',
      actionType: 'review',
      riskLevel: receipt.signal || 'green',
      title: `执行结果待审阅：${summarize(command.instruction)}`,
      summary:
        compact(receipt.payload?.summary) ||
        compact(receipt.payload?.details) ||
        compact(command.resultSummary) ||
        `${compact(command.claimedBy) || 'agent'} 已回执 ${receipt.status}`,
      ownerAgent: command.ownerAgent || command.claimedBy,
      sourceRef: `command:${command.commandId}`,
      sourceUrl: command.sourceUrl,
      payload: {
        kind: 'agent_receipt',
        command_id: command.commandId,
        receipt_id: receipt.receiptId,
        receipt_status: receipt.status,
        receipt_type: receipt.receiptType,
        signal: receipt.signal,
      },
      idempotencyKey: `projector:inbox:receipt:${receipt.receiptId}:review`,
    });
  }

  projectMemoryCandidates(raw) {
    const candidates = proposeMemoryCandidates(raw);
    const results = [];

    for (const candidate of candidates) {
      const memory = this.engine.createMemory({
        projectId: raw.projectId,
        layer: candidate.layer,
        type: candidate.type,
        title: candidate.title,
        summary: candidate.summary,
        confidence: candidate.confidence,
        freshness: candidate.freshness,
        nextStep: candidate.nextStep,
        metadata: candidate.metadata,
        sources: candidate.sources,
        idempotencyKey: `projector:memory:${raw.sourceType}:${raw.sourceRef}:${candidate.layer}:${candidate.type}`,
      });

      const item = this.engine.createInboxItem({
        projectId: raw.projectId,
        queue: 'review',
        objectType: 'memory',
        actionType: 'review',
        riskLevel: 'green',
        title: `记忆待审阅：${candidate.title}`,
        summary: candidate.summary,
        sourceRef: `${raw.sourceType}:${raw.sourceRef}`,
        sourceUrl: raw.sourceUrl,
        payload: {
          kind: 'memory_candidate',
          memory_id: memory.memory.memoryId,
          source_type: raw.sourceType,
          source_ref: raw.sourceRef,
          reviewer_recommendation: memory.reviewerAssessment?.recommendation || null,
          reviewer_rationale: memory.reviewerAssessment?.rationale || null,
        },
        idempotencyKey: `projector:inbox:${raw.sourceType}:${raw.sourceRef}:memory_review:${candidate.layer}:${candidate.type}`,
      });

      results.push({
        memory: memory.memory,
        sources: memory.sources,
        reviewerAssessment: memory.reviewerAssessment,
        inboxItem: item.item,
      });
    }

    return results;
  }

  projectCheckpoint(checkpoint) {
    if (!checkpoint) {
      return [];
    }

    return this.projectMemoryCandidates({
      projectId: checkpoint.projectId,
      sourceType: 'checkpoint',
      sourceRef: checkpoint.checkpointId,
      sourceUrl: null,
      status: checkpoint.status,
      title: checkpoint.title,
      summary: checkpoint.summary,
      evidence: {
        checkpoint_id: checkpoint.checkpointId,
        evidence: checkpoint.evidence,
      },
      createdAt: checkpoint.createdAt,
    });
  }

  projectDecisionOutcome(decision) {
    if (!decision) {
      return [];
    }

    return this.projectMemoryCandidates({
      projectId: decision.projectId,
      sourceType: 'decision',
      sourceRef: decision.decisionId,
      sourceUrl: decision.sourceUrl,
      status: decision.status,
      impactScope: decision.impactScope,
      question: decision.question,
      recommendation: decision.recommendation,
      createdAt: decision.updatedAt || decision.createdAt,
    });
  }

  projectSuggestionOutcome(suggestion, options = {}) {
    if (!suggestion) {
      return [];
    }

    const reviewNote = compact(options.reviewNote);
    const reviewActor = compact(options.reviewActor);
    const sourceSummary = reviewNote
      ? [suggestion.reason, `Reviewer note：${reviewNote}`].filter(Boolean).join('；')
      : suggestion.reason;

    return this.projectMemoryCandidates({
      projectId: suggestion.projectId,
      sourceType: 'suggestion',
      sourceRef: suggestion.suggestionId,
      sourceUrl: suggestion.documentRef,
      status: suggestion.status,
      proposedText: suggestion.proposedText,
      summary: suggestion.reason,
      sourceSummary,
      evidence: {
        suggestion_id: suggestion.suggestionId,
        selected_text: suggestion.selectedText,
        reviewer_note: reviewNote || null,
        reviewer_actor: reviewActor || null,
      },
      createdAt: suggestion.updatedAt || suggestion.createdAt,
    });
  }
}
