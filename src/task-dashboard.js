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
  const raw = String(iso || '').trim();
  if (!raw) {
    return '未记录';
  }

  return raw.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

const SYNTHETIC_PATTERNS = [
  /\[codex smoke/i,
  /\[test\]/i,
  /\bsmoke\b/i,
  /红灯直达测试/i,
  /快速唤醒测试/i,
  /本地红灯通知 smoke/i,
  /验收链路：claim-next/i,
  /p0可测性验收/i,
  /agent-ext-e2e/i,
];

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
    type: 'memory',
    tone: cardToneFromValue(memory.reviewState || memory.status, 'yellow'),
    badge: `${humanMemoryLayer(memory.layer)} / ${humanMemoryStatus(memory)}`,
    title: summarize(memory.title, 72),
    summary: summarize(memory.summary || memory.nextStep || '等待进一步整理', 140),
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
  };
}

function buildCommentCard(command) {
  return {
    id: command.commandId,
    type: 'comment',
    tone: 'neutral',
    badge: humanCommandStatus(command.status),
    title: summarize(command.instruction, 72),
    summary: summarize(command.contextQuote ? `引用：${command.contextQuote}` : command.resultSummary || '最新评论事件', 140),
    meta: [
      command.ownerAgent ? `路由到：${command.ownerAgent}` : null,
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
      (card) => `
        <article class="task-card tone-${escapeHtml(card.tone)}">
          <div class="task-card-top">
            <span class="task-badge">${escapeHtml(card.badge || card.type)}</span>
            <span class="task-kind">${escapeHtml(card.type)}</span>
          </div>
          <h3>${escapeHtml(card.title || '未命名事项')}</h3>
          <p>${escapeHtml(card.summary || '暂无补充说明')}</p>
          <ul class="task-meta">
            ${(card.meta || []).map((meta) => `<li>${escapeHtml(meta)}</li>`).join('')}
          </ul>
          ${
            card.link
              ? `<a class="task-link" href="${escapeHtml(card.link)}" target="_blank" rel="noreferrer">打开关联位置</a>`
              : ''
          }
        </article>
      `,
    )
    .join('');
}

function renderCount(label, value, tone = 'neutral') {
  return `
    <div class="count-card tone-${escapeHtml(tone)}">
      <div class="count-label">${escapeHtml(label)}</div>
      <div class="count-value">${escapeHtml(String(value))}</div>
    </div>
  `;
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
