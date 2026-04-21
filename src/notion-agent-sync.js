import {
  DEFAULT_NOTION_BASE_URL,
  DEFAULT_NOTION_RETRY_ATTEMPTS,
  DEFAULT_NOTION_RETRY_BASE_MS,
  DEFAULT_NOTION_VERSION,
  fetchWithTimeout,
  validateNotionConfig,
} from './notion-review-sync.js';

function sleep(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableNetworkError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error || '');
  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    message.includes('ECONNRESET') ||
    message.includes('fetch failed') ||
    message.includes('Request timed out')
  );
}

function isRetriableNotionStatus(status) {
  return status === 429 || status >= 500;
}

function resolveRetryDelayMs(response, attempt) {
  const retryAfterSeconds = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return DEFAULT_NOTION_RETRY_BASE_MS * attempt;
}

function chunkRichText(text, maxLength = 1900) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < normalized.length; index += maxLength) {
    chunks.push({
      type: 'text',
      text: {
        content: normalized.slice(index, index + maxLength),
      },
    });
  }
  return chunks;
}

async function notionRequest(pathname, { apiKey, baseUrl, notionVersion, method = 'GET', body } = {}) {
  const validated = validateNotionConfig({ apiKey, baseUrl, notionVersion });
  let lastError = null;

  for (let attempt = 1; attempt <= DEFAULT_NOTION_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${validated.baseUrl}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${validated.apiKey}`,
          'Notion-Version': validated.notionVersion,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const raw = await response.text();
      const payload = raw ? JSON.parse(raw) : null;

      if (!response.ok) {
        const error = new Error(`Notion API ${method} ${pathname} failed: ${response.status} ${raw}`);
        if (attempt < DEFAULT_NOTION_RETRY_ATTEMPTS && isRetriableNotionStatus(response.status)) {
          lastError = error;
          await sleep(resolveRetryDelayMs(response, attempt));
          continue;
        }
        throw error;
      }

      return payload;
    } catch (error) {
      if (attempt < DEFAULT_NOTION_RETRY_ATTEMPTS && isRetriableNetworkError(error)) {
        lastError = error;
        await sleep(DEFAULT_NOTION_RETRY_BASE_MS * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`Notion API ${method} ${pathname} failed after retries`);
}

export function plainTextFromRichText(richText = []) {
  return richText
    .map((item) => item?.plain_text || item?.text?.content || '')
    .join('')
    .trim();
}

export function parseNotionSourceUrl(sourceUrl) {
  const match = String(sourceUrl || '').match(/^notion:\/\/page\/([^/]+)\/discussion\/([^/]+)\/comment\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return {
    pageId: match[1],
    discussionId: match[2],
    commentId: match[3],
  };
}

function blockPlainText(block) {
  if (!block?.type) {
    return '';
  }

  const payload = block[block.type];
  if (!payload) {
    return '';
  }

  if (Array.isArray(payload.rich_text)) {
    return plainTextFromRichText(payload.rich_text);
  }

  if (typeof payload.title === 'string') {
    return payload.title;
  }

  return '';
}

export async function getCurrentBotUserId({
  apiKey,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const payload = await notionRequest('/v1/users/me', {
    apiKey,
    baseUrl,
    notionVersion,
  });

  return payload?.id || null;
}

export async function listBlockChildren({
  apiKey,
  blockId,
  startCursor,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const params = new URLSearchParams({ page_size: '100' });
  if (startCursor) {
    params.set('start_cursor', startCursor);
  }

  return notionRequest(`/v1/blocks/${blockId}/children?${params.toString()}`, {
    apiKey,
    baseUrl,
    notionVersion,
  });
}

export async function retrieveBlock({
  apiKey,
  blockId,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  return notionRequest(`/v1/blocks/${blockId}`, {
    apiKey,
    baseUrl,
    notionVersion,
  });
}

export async function collectDescendantBlockIds({
  apiKey,
  rootBlockId,
  maxBlocks = Number.POSITIVE_INFINITY,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const result = [];
  const queue = [rootBlockId];

  while (queue.length > 0 && result.length < maxBlocks) {
    const blockId = queue.shift();
    let cursor = null;

    do {
      const payload = await listBlockChildren({
        apiKey,
        blockId,
        startCursor: cursor,
        baseUrl,
        notionVersion,
      });

      for (const child of payload.results || []) {
        result.push(child.id);
        if (result.length >= maxBlocks) {
          return result;
        }
        if (child.has_children) {
          queue.push(child.id);
        }
      }

      cursor = payload.has_more ? payload.next_cursor : null;
    } while (cursor);
  }

  return result;
}

export async function listCommentsForBlock({
  apiKey,
  blockId,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const results = [];
  let cursor = null;

  do {
    const params = new URLSearchParams({ block_id: blockId, page_size: '100' });
    if (cursor) {
      params.set('start_cursor', cursor);
    }

    const payload = await notionRequest(`/v1/comments?${params.toString()}`, {
      apiKey,
      baseUrl,
      notionVersion,
    });

    results.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  return results;
}

export async function scanCommentsUnderPage({
  apiKey,
  pageId,
  selfUserId,
  maxBlocks,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const blockIds = [
    pageId,
    ...(await collectDescendantBlockIds({
      apiKey,
      rootBlockId: pageId,
      maxBlocks,
      baseUrl,
      notionVersion,
    })),
  ];
  const uniqueComments = new Map();
  const blockTextCache = new Map();

  for (const blockId of blockIds) {
    const comments = await listCommentsForBlock({
      apiKey,
      blockId,
      baseUrl,
      notionVersion,
    });

    for (const comment of comments) {
      if (!comment?.id || uniqueComments.has(comment.id)) {
        continue;
      }

      if (selfUserId && comment.created_by?.id === selfUserId) {
        continue;
      }

      let contextQuote = '';
      if (blockId !== pageId) {
        if (!blockTextCache.has(blockId)) {
          const block = await retrieveBlock({
            apiKey,
            blockId,
            baseUrl,
            notionVersion,
          });
          blockTextCache.set(blockId, blockPlainText(block));
        }
        contextQuote = blockTextCache.get(blockId) || '';
      }

      uniqueComments.set(comment.id, {
        pageId,
        discussionId: comment.discussion_id,
        commentId: comment.id,
        body: plainTextFromRichText(comment.rich_text),
        anchorBlockId: blockId !== pageId ? blockId : null,
        contextQuote,
        createdTime: comment.created_time,
        sourceUrl: `notion://page/${pageId}/discussion/${comment.discussion_id}/comment/${comment.id}`,
      });
    }
  }

  return [...uniqueComments.values()].sort((left, right) => left.createdTime.localeCompare(right.createdTime));
}

export async function replyToDiscussion({
  apiKey,
  discussionId,
  text,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  return notionRequest('/v1/comments', {
    apiKey,
    baseUrl,
    notionVersion,
    method: 'POST',
    body: {
      discussion_id: discussionId,
      rich_text: chunkRichText(text),
    },
  });
}
