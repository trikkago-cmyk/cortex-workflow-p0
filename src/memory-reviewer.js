function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasStructuredEvidence(source) {
  const evidence = source?.evidence;
  return Boolean(
    compact(source?.quoteText) ||
      compact(source?.summary) ||
      (evidence && typeof evidence === 'object' && Object.keys(evidence).length > 0),
  );
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function toIsoDate(value) {
  const parsed = new Date(value || 0);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function buildHumanPrompt(recommendation) {
  switch (recommendation) {
    case 'recommend_accept':
      return 'Reviewer-Agent 建议 accept_to_durable；请确认 accept，或在必要时改为 reject / needs_followup。';
    case 'recommend_reject':
      return 'Reviewer-Agent 建议 reject；请确认 reject，或在必要时改为 needs_followup / accept。';
    default:
      return 'Reviewer-Agent 建议先补证据或改表述；请确认 needs_followup，或在信息充分时改为 accept / reject。';
  }
}

function buildReviewerRationale({ strengths = [], missingSignals = [], concerns = [] }) {
  const sections = [];

  if (strengths.length > 0) {
    sections.push(`优势：${strengths.join('；')}`);
  }
  if (missingSignals.length > 0) {
    sections.push(`待补：${missingSignals.join('；')}`);
  }
  if (concerns.length > 0) {
    sections.push(`注意：${concerns.join('；')}`);
  }

  return sections.join(' | ') || 'Reviewer-Agent 未发现足够的结构化判断信号。';
}

export function reviewMemoryCandidate({ memory, sources = [], reviewerAgent = 'reviewer-agent', reviewedAt } = {}) {
  if (!memory) {
    throw new Error('reviewMemoryCandidate requires a memory');
  }

  const metadata = memory.metadata || {};
  const extractorReason = compact(metadata.extractor_reason);
  const sourceCount = sources.length;
  const evidenceCount = sources.filter(hasStructuredEvidence).length;
  const sourceTypes = unique(sources.map((source) => compact(source.sourceType)));
  const hasTitle = Boolean(compact(memory.title));
  const hasSummary = Boolean(compact(memory.summary));
  const highConfidence = memory.confidence === 'high';
  const lowConfidence = memory.confidence === 'low';
  const stableReason = [
    'comment_like_stable_preference',
    'checkpoint_verified_pattern',
    'approved_decision',
    'receipt_incident',
    'suggestion_outcome',
  ].includes(extractorReason);
  const strongSourceType = sourceTypes.some((sourceType) =>
    ['checkpoint', 'decision', 'receipt', 'suggestion', 'comment', 'im_message', 'im_action'].includes(sourceType),
  );

  const strengths = [];
  const missingSignals = [];
  const concerns = [];

  if (sourceCount > 0) {
    strengths.push(`已有 ${sourceCount} 条 source`);
  }
  if (evidenceCount > 0) {
    strengths.push(`已有 ${evidenceCount} 条 evidence`);
  }
  if (stableReason) {
    strengths.push(`extractor_reason=${extractorReason}`);
  }
  if (highConfidence) {
    strengths.push('confidence=high');
  }
  if (strongSourceType) {
    strengths.push(`source_type=${sourceTypes.join(',')}`);
  }

  if (!hasTitle || !hasSummary) {
    missingSignals.push('缺少可审阅的标题或摘要');
  }
  if (sourceCount === 0) {
    missingSignals.push('缺少 source');
  }
  if (evidenceCount === 0) {
    missingSignals.push('缺少可引用 evidence');
  }
  if (lowConfidence) {
    concerns.push('confidence=low');
  }
  if (!stableReason && memory.layer === 'base_memory') {
    concerns.push('base_memory 但缺少明确稳定信号');
  }

  let recommendation = 'needs_followup';

  if (!hasTitle || !hasSummary || sourceCount === 0) {
    recommendation = 'recommend_reject';
  } else if (evidenceCount === 0 || lowConfidence) {
    recommendation = 'needs_followup';
  } else if (stableReason && (highConfidence || strongSourceType || sourceCount > 1)) {
    recommendation = 'recommend_accept';
  } else if (memory.layer === 'timeline' && ['incident', 'decision'].includes(memory.type) && evidenceCount > 0) {
    recommendation = 'recommend_accept';
  } else if (memory.layer === 'base_memory' && ['preference', 'rule', 'decision', 'pattern'].includes(memory.type)) {
    recommendation = 'recommend_accept';
  } else if (memory.layer === 'knowledge' && evidenceCount > 0 && strongSourceType) {
    recommendation = 'recommend_accept';
  }

  const suggestedFinalReviewState =
    recommendation === 'recommend_accept'
      ? 'accepted'
      : recommendation === 'recommend_reject'
        ? 'rejected'
        : 'needs_followup';

  const suggestedStatus =
    recommendation === 'recommend_accept'
      ? 'durable'
      : recommendation === 'recommend_reject'
        ? 'rejected'
        : 'candidate';

  return {
    reviewer_agent: reviewerAgent,
    reviewed_at: toIsoDate(reviewedAt),
    recommendation,
    suggested_final_review_state: suggestedFinalReviewState,
    suggested_status: suggestedStatus,
    human_prompt: buildHumanPrompt(recommendation),
    rationale: buildReviewerRationale({
      strengths,
      missingSignals,
      concerns,
    }),
    strengths,
    missing_signals: missingSignals,
    concerns,
    checks: {
      has_title: hasTitle,
      has_summary: hasSummary,
      source_count: sourceCount,
      evidence_count: evidenceCount,
      confidence: memory.confidence,
      extractor_reason: extractorReason || null,
      source_types: sourceTypes,
      stable_reason: stableReason,
    },
  };
}
