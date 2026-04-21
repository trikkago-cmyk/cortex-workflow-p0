function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(text, maxLength = 72) {
  const normalized = compact(text);
  if (!normalized) {
    return '未命名记忆';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function containsAny(text, patterns) {
  const normalized = compact(text);
  return patterns.some((pattern) => normalized.includes(pattern));
}

function buildSource(raw) {
  return {
    sourceType: raw.sourceType,
    sourceRef: raw.sourceRef,
    sourceUrl: raw.sourceUrl,
    quoteText: raw.quoteText || raw.text || raw.summary || raw.title || raw.question || null,
    summary: raw.summary || raw.reason || raw.title || raw.question || null,
    evidence: raw.evidence || raw.payload || {},
  };
}

function buildCompilerMetadata(raw, claim) {
  return {
    source_type: raw.sourceType,
    extractor_reason: claim.reason,
    compiler_version: 'v2',
    source_stage: 'raw',
    compiled_tier: claim.compiledTier || 'source',
    target_tier: claim.targetTier || 'topic',
    legacy_layer: claim.layer,
    governance_mode: 'review_required',
  };
}

function buildCandidate(raw, claim) {
  return {
    layer: claim.layer,
    type: claim.type,
    title: claim.title,
    summary: claim.summary,
    confidence: claim.confidence || 'medium',
    freshness: raw.createdAt || null,
    nextStep: claim.nextStep || '进入 review，决定 accept / reject / needs_followup',
    metadata: buildCompilerMetadata(raw, claim),
    sources: [buildSource(raw)],
  };
}

function extractFromCommentLike(raw) {
  const text = compact(raw.text || raw.quoteText || raw.summary);
  if (!text) {
    return [];
  }

  const stableMarkers = ['默认', '不要', '必须', '优先', '直接', '不需要', '先', '只要', '一律'];
  if (!containsAny(text, stableMarkers)) {
    return [];
  }

  const type = containsAny(text, ['必须', '一律', '不要', '不允许']) ? 'rule' : 'preference';

  return [
    {
      layer: 'base_memory',
      type,
      title: summarize(text),
      summary: text,
      confidence: containsAny(text, ['必须', '默认', '直接']) ? 'high' : 'medium',
      reason: 'comment_like_stable_preference',
      compiledTier: 'source',
      targetTier: 'topic',
    },
  ];
}

function extractFromCheckpoint(raw) {
  const text = compact(raw.summary || raw.text || raw.title);
  if (!text) {
    return [];
  }

  if (raw.status !== 'passed') {
    return [];
  }

  const verifiedMarkers = ['已验证', '跑通', '可复用', '模式', '稳定', '闭环', '已接通'];
  if (!containsAny(text, verifiedMarkers)) {
    return [];
  }

  return [
    {
      layer: 'knowledge',
      type: 'pattern',
      title: summarize(text),
      summary: text,
      confidence: 'high',
      reason: 'checkpoint_verified_pattern',
      compiledTier: 'source',
      targetTier: 'topic',
    },
  ];
}

function extractFromDecision(raw) {
  const text = compact([raw.question, raw.recommendation].filter(Boolean).join(' - '));
  if (!text) {
    return [];
  }

  if (!['approved', 'resolved'].includes(raw.status)) {
    return [];
  }

  const layer = raw.impactScope === 'cross_module' ? 'knowledge' : 'timeline';
  return [
    {
      layer,
      type: layer === 'knowledge' ? 'rule' : 'decision',
      title: summarize(raw.question || text),
      summary: text,
      confidence: raw.impactScope === 'cross_module' ? 'high' : 'medium',
      reason: 'approved_decision',
      compiledTier: 'source',
      targetTier: layer === 'knowledge' ? 'topic' : 'source',
    },
  ];
}

function extractFromReceipt(raw) {
  const text = compact(raw.summary || raw.text || raw.payload?.summary || raw.payload?.details);
  if (!text) {
    return [];
  }

  if (raw.signal !== 'red' && raw.status !== 'failed') {
    return [];
  }

  return [
    {
      layer: 'timeline',
      type: 'incident',
      title: summarize(text),
      summary: text,
      confidence: 'high',
      reason: 'receipt_incident',
      compiledTier: 'source',
      targetTier: 'source',
    },
  ];
}

function extractFromSuggestion(raw) {
  const status = compact(raw.status).toLowerCase();
  if (!['accepted', 'rejected'].includes(status)) {
    return [];
  }

  const proposedText = compact(raw.proposedText || raw.summary || raw.text);
  if (!proposedText) {
    return [];
  }

  return [
    {
      layer: 'knowledge',
      type: 'pattern',
      title: summarize(proposedText),
      summary:
        status === 'accepted'
          ? `已接受的建议：${proposedText}`
          : `已拒绝的建议：${proposedText}`,
      confidence: 'medium',
      reason: 'suggestion_outcome',
      compiledTier: 'source',
      targetTier: 'topic',
    },
  ];
}

export function extractAtomicClaims(raw) {
  if (!raw || !raw.sourceType) {
    return [];
  }

  switch (raw.sourceType) {
    case 'comment':
    case 'im_message':
    case 'im_action':
      return extractFromCommentLike(raw);
    case 'checkpoint':
      return extractFromCheckpoint(raw);
    case 'decision':
      return extractFromDecision(raw);
    case 'receipt':
      return extractFromReceipt(raw);
    case 'suggestion':
      return extractFromSuggestion(raw);
    default:
      return [];
  }
}

export function proposeMemoryCandidates(raw) {
  return extractAtomicClaims(raw).map((claim) => buildCandidate(raw, claim));
}
