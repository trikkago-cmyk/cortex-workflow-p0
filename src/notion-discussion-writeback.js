import {
  DEFAULT_NOTION_BASE_URL,
  DEFAULT_NOTION_RETRY_ATTEMPTS,
  DEFAULT_NOTION_RETRY_BASE_MS,
  DEFAULT_NOTION_VERSION,
  fetchWithTimeout,
  validateNotionConfig,
} from './notion-review-sync.js';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function envEnabled(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function chunkRichText(text, maxLength = 1900) {
  const value = String(text || '').trim();
  if (!value) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < value.length; index += maxLength) {
    chunks.push({
      type: 'text',
      text: {
        content: value.slice(index, index + maxLength),
      },
    });
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504 || status >= 500;
}

export function parseNotionDiscussionId(command = {}) {
  const explicit = compact(command.discussion_id || command.discussionId);
  if (explicit) {
    return explicit;
  }

  const threadKey = compact(command.thread_key || command.threadKey);
  const threadMatch = threadKey.match(/^notion:([^:]+):([^:]+)$/i);
  if (threadMatch?.[2]) {
    return threadMatch[2];
  }

  const sourceUrl = compact(command.source_url || command.sourceUrl);
  const notionUriMatch = sourceUrl.match(/\/discussion\/([^/?#]+)/i);
  if (notionUriMatch?.[1]) {
    return notionUriMatch[1];
  }

  const notionDiscussionParam = sourceUrl.match(/[?&]d=([0-9a-f-]{32,36})/i);
  if (notionDiscussionParam?.[1]) {
    return notionDiscussionParam[1];
  }

  return null;
}

export function shouldWriteBackToNotionDiscussion(options = {}) {
  if (options.enabled !== undefined) {
    return Boolean(options.enabled);
  }

  return envEnabled(process.env.NOTION_DISCUSSION_WRITEBACK, false);
}

export async function postNotionDiscussionReply({
  fetchImpl = fetchWithTimeout,
  apiKey = process.env.NOTION_API_KEY,
  baseUrl = process.env.NOTION_BASE_URL || DEFAULT_NOTION_BASE_URL,
  notionVersion = process.env.NOTION_VERSION || DEFAULT_NOTION_VERSION,
  discussionId,
  replyText,
  timeoutMs,
  retryAttempts = DEFAULT_NOTION_RETRY_ATTEMPTS,
  retryBaseMs = DEFAULT_NOTION_RETRY_BASE_MS,
} = {}) {
  const text = compact(replyText);
  if (!text) {
    return { ok: false, skipped: true, skipReason: 'empty_reply_text' };
  }

  const normalizedDiscussionId = compact(discussionId);
  if (!normalizedDiscussionId) {
    return { ok: false, skipped: true, skipReason: 'missing_discussion_id' };
  }

  const config = validateNotionConfig({ apiKey, baseUrl, notionVersion });
  const richText = chunkRichText(text);
  const attempts = Math.max(1, Number(retryAttempts) || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchImpl(`${config.baseUrl}/v1/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Notion-Version': config.notionVersion,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        discussion_id: normalizedDiscussionId,
        rich_text: richText,
      }),
      ...(timeoutMs ? { timeoutMs } : {}),
    });

    const raw = await response.text();
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = { raw };
    }

    if (response.ok) {
      return {
        ok: true,
        replyId: payload?.id || null,
        payload,
      };
    }

    const message = payload?.message || `Notion comments API returned HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.code || null;
    error.requestId = payload?.request_id || null;
    lastError = error;

    if (attempt < attempts && isRetriableStatus(response.status)) {
      await sleep(Math.max(0, Number(retryBaseMs) || 0) * attempt);
      continue;
    }

    throw error;
  }

  throw lastError || new Error('Notion comments API failed before sending a request');
}
