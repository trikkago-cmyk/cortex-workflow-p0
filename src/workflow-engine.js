const ACTION_PATTERNS = [
  {
    action: 'continue',
    patterns: [/^\s*\[?continue\]?/i, /^\s*继续/, /^\s*推进/, /^\s*approve[_\s-]?/i],
  },
  {
    action: 'improve',
    patterns: [/^\s*\[?improve/i, /^\s*优化/, /^\s*改一下/, /^\s*修改/, /^\s*润色/],
  },
  {
    action: 'retry',
    patterns: [/^\s*\[?retry\]?/i, /^\s*重试/, /^\s*重新来/],
  },
  {
    action: 'stop',
    patterns: [/^\s*\[?stop\]?/i, /^\s*停止/, /^\s*停一下/, /^\s*暂停/],
  },
  {
    action: 'clarify',
    patterns: [/^\s*\[?clarify/i, /^\s*澄清/, /^\s*解释/, /^\s*补充说明/],
  },
];

function createEmptyState() {
  return {
    projects: [],
    milestones: [],
    decisionRequests: [],
    commands: [],
  };
}

function clone(value) {
  return structuredClone(value);
}

function nowIso(clock) {
  return clock().toISOString();
}

function dateBucket(isoString) {
  return isoString.slice(0, 10).replaceAll('-', '');
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSignalLevel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (['green', 'yellow', 'red'].includes(normalized)) {
    return normalized;
  }

  if (normalized === 'sync') {
    return 'red';
  }

  if (normalized === 'async') {
    return 'yellow';
  }

  throw new Error(`Unsupported signal level ${value}`);
}

function legacyBlockingLevelFromSignal(signalLevel) {
  if (signalLevel === 'red') {
    return 'Sync';
  }
  if (signalLevel === 'yellow' || signalLevel === 'green') {
    return 'Async';
  }
  return undefined;
}

function signalPriority(signalLevel) {
  if (signalLevel === 'red') {
    return 0;
  }
  if (signalLevel === 'yellow') {
    return 1;
  }
  if (signalLevel === 'green') {
    return 2;
  }
  return 3;
}

function detectAction(rawText, fallback = 'clarify') {
  const text = normalizeWhitespace(rawText);
  if (!text) {
    return fallback;
  }

  for (const candidate of ACTION_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(text))) {
      return candidate.action;
    }
  }

  return fallback;
}

function stripBracketedPrefix(rawText) {
  const text = String(rawText || '').trim();
  const plainMatch = text.match(/^\[(continue|retry|stop|clarify)\]\s*/i);
  if (plainMatch) {
    return text.slice(plainMatch[0].length).trim();
  }

  const detailedMatch = text.match(/^\[(improve|clarify)\s*:\s*([^\]]+)\]\s*/i);
  if (detailedMatch) {
    return detailedMatch[2].trim();
  }

  return text;
}

function channelFromSource(source) {
  if (source === 'notion_comment') {
    return 'notion';
  }
  if (source === 'manual_row') {
    return 'manual';
  }
  return 'enterprise_im';
}

export class WorkflowEngine {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.state = options.initialState ? clone(options.initialState) : createEmptyState();
    this.counters = new Map();
  }

  getState() {
    return clone(this.state);
  }

  createProject(input) {
    const timestamp = nowIso(this.clock);
    const existing = this.state.projects.find((project) => project.projectId === input.projectId);

    if (existing) {
      existing.name = input.name;
      existing.status = input.status || existing.status;
      existing.rootPageUrl = input.rootPageUrl || existing.rootPageUrl;
      existing.reviewWindowNote = input.reviewWindowNote || existing.reviewWindowNote;
      existing.displayTags = [...(input.displayTags || existing.displayTags)];
      existing.retrievalTags = [...(input.retrievalTags || existing.retrievalTags)];
      existing.updatedAt = timestamp;
      return clone(existing);
    }

    const project = {
      projectId: input.projectId,
      name: input.name,
      status: input.status || 'active',
      rootPageUrl: input.rootPageUrl,
      reviewWindowNote: input.reviewWindowNote,
      displayTags: [...(input.displayTags || [])],
      retrievalTags: [...(input.retrievalTags || [])],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.state.projects.push(project);
    return clone(project);
  }

  createMilestone(input) {
    this.requireProjectRef(input.projectId);

    const timestamp = nowIso(this.clock);
    const milestone = {
      milestoneId: input.milestoneId || this.nextId('M'),
      name: input.name,
      projectId: input.projectId,
      phase: input.phase || 'align',
      status: input.status || 'planned',
      contractStatus: 'draft',
      contractUrl: undefined,
      approvedBy: undefined,
      approvedAt: undefined,
      summary: input.summary || '',
      acceptanceResult: input.acceptanceResult || 'n_a',
      artifacts: [],
      writtenBy: input.writtenBy,
      idempotencyKey: input.idempotencyKey || `milestone:${input.milestoneId || input.name}`,
      compressionLevel: input.compressionLevel,
      displayTags: [...(input.displayTags || [])],
      retrievalTags: [...(input.retrievalTags || [])],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.state.milestones.push(milestone);
    return clone(milestone);
  }

  approveMilestoneContract(input) {
    const milestone = this.requireMilestoneRef(input.milestoneId);
    milestone.contractStatus = 'approved';
    milestone.contractUrl = input.contractUrl;
    milestone.approvedBy = input.approvedBy;
    milestone.approvedAt = input.approvedAt || nowIso(this.clock);
    milestone.updatedAt = nowIso(this.clock);
    return clone(milestone);
  }

  evaluateExecutionGate(milestoneId) {
    const milestone = this.requireMilestoneRef(milestoneId);
    const missing = [];

    if (milestone.contractStatus !== 'approved') {
      missing.push('contract_status=approved');
    }
    if (!milestone.contractUrl) {
      missing.push('contract_url');
    }
    if (!milestone.approvedBy) {
      missing.push('approved_by');
    }
    if (!milestone.approvedAt) {
      missing.push('approved_at');
    }

    return {
      allowed: missing.length === 0,
      missing,
    };
  }

  assertExecutionReady(milestoneId) {
    const gate = this.evaluateExecutionGate(milestoneId);
    if (!gate.allowed) {
      throw new Error(`Milestone ${milestoneId} is not ready for execute: ${gate.missing.join(', ')}`);
    }
  }

  createDecisionRequest(input) {
    this.requireProjectRef(input.projectId);
    const signalLevel = normalizeSignalLevel(input.signalLevel || input.blockingLevel);

    if (!signalLevel) {
      throw new Error('Decision request requires signalLevel or blockingLevel');
    }

    const timestamp = nowIso(this.clock);
    const decision = {
      decisionId: input.decisionId || this.nextId('DR'),
      projectId: input.projectId,
      signalLevel,
      blockingLevel: legacyBlockingLevelFromSignal(signalLevel),
      status: signalLevel === 'red' ? 'needs_review' : 'proposed',
      question: input.question,
      options: [...(input.options || [])],
      recommendation: input.recommendation,
      whyNow: input.whyNow,
      escalateAfter: input.escalateAfter,
      impactScope: input.impactScope,
      irreversible: Boolean(input.irreversible),
      downstreamContamination: Boolean(input.downstreamContamination),
      ownerAgent: input.ownerAgent,
      idempotencyKey: input.idempotencyKey || `decision:${input.projectId}:${normalizeWhitespace(input.question)}`,
      sourceUrl: input.sourceUrl,
      displayTags: [...(input.displayTags || [])],
      retrievalTags: [...(input.retrievalTags || [])],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.state.decisionRequests.push(decision);
    return clone(decision);
  }

  buildDecisionAlert(decisionId) {
    const decision = this.requireDecisionRef(decisionId);
    if (decision.signalLevel !== 'red') {
      throw new Error(`Decision ${decisionId} is ${decision.signalLevel}, not red`);
    }

    const reason = [
      decision.irreversible ? '不可逆操作' : null,
      decision.impactScope === 'cross_module' ? '影响跨模块' : null,
      decision.downstreamContamination ? '会污染下游实现' : null,
    ]
      .filter(Boolean)
      .join(' / ');

    return {
      type: 'red_alert',
      signalLevel: decision.signalLevel,
      blockingLevel: decision.blockingLevel,
      projectId: decision.projectId,
      decisionId: decision.decisionId,
      question: decision.question,
      recommendation: decision.recommendation,
      impact: decision.impactScope,
      urgency:
        decision.irreversible || ['data', 'security', 'deploy'].includes(decision.impactScope) ? 'high' : 'normal',
      reason: reason || '需要立即拍板',
      notionUrl: decision.sourceUrl,
      actions: [...decision.options.slice(0, 3).map((_, index) => `approve_${index + 1}`), 'improve', 'stop'],
    };
  }

  buildSyncAlert(decisionId) {
    return this.buildDecisionAlert(decisionId);
  }

  ingestEnterpriseImMessage(input) {
    return this.ingestCommand({
      projectId: input.projectId,
      source: 'openclaw_im_message',
      channel: 'enterprise_im',
      targetType: input.targetType,
      targetId: input.targetId,
      parsedAction: detectAction(input.instruction, 'clarify'),
      instruction: normalizeWhitespace(input.instruction),
      channelSessionId: input.channelSessionId,
      channelMessageId: input.channelMessageId,
      operatorId: input.operatorId,
      idempotencyKey: `im_message:${input.channelSessionId}:${input.channelMessageId}`,
    });
  }

  ingestEnterpriseImAction(input) {
    return this.ingestCommand({
      projectId: input.projectId,
      source: 'openclaw_im_action',
      channel: 'enterprise_im',
      targetType: input.targetType,
      targetId: input.targetId,
      parsedAction: detectAction(input.actionValue, 'continue'),
      instruction: normalizeWhitespace(input.instruction || input.actionValue),
      channelSessionId: input.channelSessionId,
      channelMessageId: input.channelMessageId,
      operatorId: input.operatorId,
      eventKey: input.actionValue,
      sourceUrl: input.sourceUrl,
      idempotencyKey: `im_action:${input.channelMessageId}:${input.actionValue}`,
    });
  }

  ingestNotionComment(input) {
    return this.ingestCommand({
      projectId: input.projectId,
      source: 'notion_comment',
      channel: 'notion',
      targetType: input.targetType,
      targetId: input.targetId,
      parsedAction: detectAction(input.body, 'improve'),
      instruction: normalizeWhitespace(stripBracketedPrefix(input.body)),
      contextQuote: input.contextQuote,
      anchorBlockId: input.anchorBlockId,
      sourceUrl: input.sourceUrl || `notion://page/${input.pageId}/discussion/${input.discussionId}/comment/${input.commentId}`,
      idempotencyKey: `comment:${input.discussionId}:${input.commentId}`,
    });
  }

  claimCommand(input) {
    const command = this.requireCommandRef(input.commandId);
    if (command.status !== 'new') {
      throw new Error(`Command ${input.commandId} cannot be claimed from status ${command.status}`);
    }

    command.status = 'claimed';
    command.claimedBy = input.agentName;
    command.updatedAt = nowIso(this.clock);
    return clone(command);
  }

  startCommand(input) {
    const command = this.requireCommandRef(input.commandId);
    if (command.status !== 'claimed' || command.claimedBy !== input.agentName) {
      throw new Error(`Command ${input.commandId} must be claimed by ${input.agentName} before execution starts`);
    }

    command.status = 'executing';
    command.updatedAt = nowIso(this.clock);
    return clone(command);
  }

  completeCommand(input) {
    const command = this.requireCommandRef(input.commandId);
    if (!command.claimedBy || command.claimedBy !== input.agentName) {
      throw new Error(`Command ${input.commandId} is not owned by ${input.agentName}`);
    }
    if (!['claimed', 'executing'].includes(command.status)) {
      throw new Error(`Command ${input.commandId} cannot be completed from status ${command.status}`);
    }

    command.status = 'done';
    command.resultSummary = normalizeWhitespace(input.resultSummary);
    command.ack = `ack:${command.commandId}`;
    command.updatedAt = nowIso(this.clock);
    return clone(command);
  }

  buildProjectSnapshot(projectId) {
    const project = clone(this.requireProjectRef(projectId));
    const milestones = this.state.milestones
      .filter((milestone) => milestone.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const topDecisions = this.state.decisionRequests
      .filter((decision) => decision.projectId === projectId && ['proposed', 'needs_review'].includes(decision.status))
      .sort((left, right) => {
        const priorityDiff = signalPriority(left.signalLevel) - signalPriority(right.signalLevel);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .slice(0, 3)
      .map((decision) => clone(decision));
    const commands = this.state.commands.filter((command) => command.projectId === projectId);
    const currentMilestone =
      milestones.find((milestone) => ['in_progress', 'ready_for_review'].includes(milestone.status)) || milestones[0];

    const nextSteps = [];
    const newCommands = commands.filter((command) => command.status === 'new').length;

    if (topDecisions.length > 0) {
      nextSteps.push(`Review ${topDecisions.length} pending decision request(s).`);
    }
    if (newCommands > 0) {
      nextSteps.push(`Claim ${newCommands} new command(s).`);
    }
    if (currentMilestone && currentMilestone.status === 'ready_for_review') {
      nextSteps.push(`Review milestone ${currentMilestone.milestoneId}.`);
    }

    return {
      project,
      now: {
        currentMilestone: currentMilestone ? clone(currentMilestone) : undefined,
        topDecisions,
        nextSteps,
      },
      queues: {
        newCommands,
        claimedCommands: commands.filter((command) => command.status === 'claimed').length,
        executingCommands: commands.filter((command) => command.status === 'executing').length,
        pendingDecisions: topDecisions.length,
      },
      menu: milestones.map((milestone) => clone(milestone)),
    };
  }

  ingestCommand(input) {
    this.requireProjectRef(input.projectId);
    const existing = this.state.commands.find(
      (command) => command.source === input.source && command.idempotencyKey === input.idempotencyKey,
    );

    if (existing) {
      return {
        command: clone(existing),
        deduped: true,
      };
    }

    const timestamp = nowIso(this.clock);
    const command = {
      commandId: this.nextId('CMD'),
      projectId: input.projectId,
      channel: input.channel || channelFromSource(input.source),
      targetType: input.targetType,
      targetId: input.targetId,
      parsedAction: input.parsedAction,
      instruction: input.instruction,
      contextQuote: input.contextQuote,
      anchorBlockId: input.anchorBlockId,
      channelSessionId: input.channelSessionId,
      channelMessageId: input.channelMessageId,
      operatorId: input.operatorId,
      eventKey: input.eventKey,
      status: 'new',
      claimedBy: undefined,
      ack: undefined,
      resultSummary: undefined,
      source: input.source,
      sourceUrl: input.sourceUrl,
      idempotencyKey: input.idempotencyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.state.commands.push(command);
    return {
      command: clone(command),
      deduped: false,
    };
  }

  nextId(prefix) {
    const bucket = dateBucket(nowIso(this.clock));
    const counterKey = `${prefix}:${bucket}`;
    const nextValue = (this.counters.get(counterKey) || 0) + 1;
    this.counters.set(counterKey, nextValue);
    return `${prefix}-${bucket}-${String(nextValue).padStart(3, '0')}`;
  }

  requireProjectRef(projectId) {
    const project = this.state.projects.find((candidate) => candidate.projectId === projectId);
    if (!project) {
      throw new Error(`Unknown project ${projectId}`);
    }
    return project;
  }

  requireMilestoneRef(milestoneId) {
    const milestone = this.state.milestones.find((candidate) => candidate.milestoneId === milestoneId);
    if (!milestone) {
      throw new Error(`Unknown milestone ${milestoneId}`);
    }
    return milestone;
  }

  requireDecisionRef(decisionId) {
    const decision = this.state.decisionRequests.find((candidate) => candidate.decisionId === decisionId);
    if (!decision) {
      throw new Error(`Unknown decision request ${decisionId}`);
    }
    return decision;
  }

  requireCommandRef(commandId) {
    const command = this.state.commands.find((candidate) => candidate.commandId === commandId);
    if (!command) {
      throw new Error(`Unknown command ${commandId}`);
    }
    return command;
  }
}

export {
  detectAction,
  normalizeSignalLevel,
  normalizeWhitespace,
  legacyBlockingLevelFromSignal,
};
