import { existsSync, readFileSync } from 'node:fs';

function normalizeAgentName(value) {
  const raw = String(value || '').trim();
  return raw || null;
}

function compactWhitespace(value) {
  return String(value || '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripRoutingNoise(value) {
  return compactWhitespace(String(value || '').replace(/^[\s,，:：;；\-–—]+/, ''));
}

function resolveAgentAlias(rawMention, rules = {}) {
  const mention = normalizeAgentName(rawMention);
  if (!mention) {
    return null;
  }

  const aliasTarget = rules.aliases?.[mention];
  if (aliasTarget) {
    return normalizeAgentName(aliasTarget);
  }

  if (mention.startsWith('agent-')) {
    return mention;
  }

  return null;
}

function extractPrefixRouting(body) {
  let remaining = String(body || '').trim();
  let ownerAgent = null;

  while (remaining.startsWith('[')) {
    const match = remaining.match(/^\[(agent|to|owner)\s*:\s*([^\]]+)\]\s*/i);
    if (!match) {
      break;
    }

    ownerAgent = ownerAgent || normalizeAgentName(match[2]);
    remaining = remaining.slice(match[0].length).trim();
  }

  return {
    ownerAgent,
    strippedBody: remaining,
  };
}

export function extractMentionRouting(body, rules = {}) {
  const raw = String(body || '').trim();
  const mentionPattern = /(^|[\s\u3000([{（【<'"]+)@\s*([\p{L}\p{N}._-]+)/gu;
  let match = null;

  while ((match = mentionPattern.exec(raw)) !== null) {
    const resolvedAgent = resolveAgentAlias(match[2], rules);
    if (!resolvedAgent) {
      continue;
    }

    const prefix = match[1] || '';
    const mentionStart = match.index + prefix.length;
    const mentionToken = match[0].slice(prefix.length);
    const mentionEnd = mentionStart + mentionToken.length;
    const strippedBody = stripRoutingNoise(`${raw.slice(0, mentionStart)}${raw.slice(mentionEnd)}`);

    return {
      ownerAgent: resolvedAgent,
      strippedBody,
      mention: match[2],
    };
  }

  return {
    ownerAgent: null,
    strippedBody: raw,
    mention: null,
  };
}

export function extractCommentRouting(body, rules = {}) {
  const prefixRouting = extractPrefixRouting(body);
  if (prefixRouting.ownerAgent) {
    return {
      ...prefixRouting,
      source: 'comment_prefix',
    };
  }

  const mentionRouting = extractMentionRouting(body, rules);
  if (mentionRouting.ownerAgent) {
    return {
      ownerAgent: mentionRouting.ownerAgent,
      strippedBody: mentionRouting.strippedBody,
      source: 'comment_mention',
    };
  }

  return {
    ownerAgent: null,
    strippedBody: String(body || '').trim(),
    source: 'none',
  };
}

export function loadRoutingRules(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return { pages: {}, blocks: {}, defaults: {}, aliases: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return {
      pages: parsed.pages || {},
      blocks: parsed.blocks || {},
      defaults: parsed.defaults || {},
      aliases: parsed.aliases || {},
    };
  } catch {
    return { pages: {}, blocks: {}, defaults: {}, aliases: {} };
  }
}

export function resolveCommentOwnerAgent({ body, pageId, anchorBlockId, rules = {} }) {
  const extracted = extractCommentRouting(body, rules);
  if (extracted.ownerAgent) {
    return {
      ownerAgent: extracted.ownerAgent,
      source: extracted.source,
      strippedBody: extracted.strippedBody,
    };
  }

  if (anchorBlockId && rules.blocks?.[anchorBlockId]) {
    return {
      ownerAgent: normalizeAgentName(rules.blocks[anchorBlockId]),
      source: 'block_rule',
      strippedBody: extracted.strippedBody,
    };
  }

  if (pageId && rules.pages?.[pageId]) {
    return {
      ownerAgent: normalizeAgentName(rules.pages[pageId]),
      source: 'page_rule',
      strippedBody: extracted.strippedBody,
    };
  }

  if (rules.defaults?.notion_comment) {
    return {
      ownerAgent: normalizeAgentName(rules.defaults.notion_comment),
      source: 'default_rule',
      strippedBody: extracted.strippedBody,
    };
  }

  return {
    ownerAgent: null,
    source: 'unassigned',
    strippedBody: extracted.strippedBody,
  };
}
