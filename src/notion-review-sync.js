export const DEFAULT_NOTION_BASE_URL = 'https://api.notion.com';
export const DEFAULT_NOTION_VERSION = '2026-03-11';
export const DEFAULT_DISPLAY_TIME_ZONE = process.env.CORTEX_DISPLAY_TIMEZONE || 'Asia/Shanghai';
export const DEFAULT_REQUEST_TIMEOUT_MS = Number(process.env.NOTION_REQUEST_TIMEOUT_MS || 15000);
export const DEFAULT_NOTION_RETRY_ATTEMPTS = Math.max(1, Number(process.env.NOTION_RETRY_ATTEMPTS || 3));
export const DEFAULT_NOTION_RETRY_BASE_MS = Math.max(0, Number(process.env.NOTION_RETRY_BASE_MS || 600));

function firstNonAsciiChar(value) {
  return [...String(value || '')].find((char) => char.charCodeAt(0) > 255) || null;
}

export function validateNotionConfig({ apiKey, baseUrl, notionVersion } = {}) {
  const normalizedApiKey = String(apiKey || '').trim();
  const normalizedBaseUrl = String(baseUrl || DEFAULT_NOTION_BASE_URL).trim();
  const normalizedVersion = String(notionVersion || DEFAULT_NOTION_VERSION).trim();

  if (!normalizedApiKey) {
    throw new Error('NOTION_API_KEY is required');
  }

  const badApiKeyChar = firstNonAsciiChar(normalizedApiKey);
  if (badApiKeyChar) {
    throw new Error(
      `NOTION_API_KEY contains non-ASCII characters and looks like a placeholder or broken token: ${badApiKeyChar}`,
    );
  }

  if (/\s/.test(normalizedApiKey)) {
    throw new Error('NOTION_API_KEY must not contain whitespace');
  }

  const badBaseUrlChar = firstNonAsciiChar(normalizedBaseUrl);
  if (badBaseUrlChar) {
    throw new Error(`NOTION_BASE_URL contains non-ASCII characters: ${badBaseUrlChar}`);
  }

  const badVersionChar = firstNonAsciiChar(normalizedVersion);
  if (badVersionChar) {
    throw new Error(`NOTION_VERSION contains non-ASCII characters: ${badVersionChar}`);
  }

  return {
    apiKey: normalizedApiKey,
    baseUrl: normalizedBaseUrl,
    notionVersion: normalizedVersion,
  };
}

export function formatDisplayTime(dateInput = new Date(), timeZone = DEFAULT_DISPLAY_TIME_ZONE) {
  const value = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(value.getTime())) {
    return String(dateInput || '').trim() || 'unknown time';
  }

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export async function fetchWithTimeout(url, init = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: init.signal || controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

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

function summarizeSingleLine(text, maxLength = 96) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '暂无';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
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

function markdownLineToBlock(line) {
  const value = String(line || '').trimEnd();
  if (!value.trim()) {
    return null;
  }

  if (value === '---') {
    return {
      object: 'block',
      type: 'divider',
      divider: {},
    };
  }

  if (value.startsWith('# ')) {
    return {
      object: 'block',
      type: 'heading_1',
      heading_1: { rich_text: chunkRichText(value.slice(2).trim()) },
    };
  }

  if (value.startsWith('## ')) {
    return {
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: chunkRichText(value.slice(3).trim()) },
    };
  }

  if (value.startsWith('### ')) {
    return {
      object: 'block',
      type: 'heading_3',
      heading_3: { rich_text: chunkRichText(value.slice(4).trim()) },
    };
  }

  if (value.startsWith('#### ')) {
    return {
      object: 'block',
      type: 'heading_3',
      heading_3: { rich_text: chunkRichText(value.slice(5).trim()) },
    };
  }

  if (value.startsWith('- ')) {
    return {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: chunkRichText(value.slice(2).trim()) },
    };
  }

  const numberedMatch = value.match(/^\d+\.\s+(.*)$/);
  if (numberedMatch) {
    return {
      object: 'block',
      type: 'numbered_list_item',
      numbered_list_item: { rich_text: chunkRichText(numberedMatch[1].trim()) },
    };
  }

  if (value.startsWith('> ')) {
    return {
      object: 'block',
      type: 'quote',
      quote: { rich_text: chunkRichText(value.slice(2).trim()) },
    };
  }

  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: chunkRichText(value.trim()) },
  };
}

export function markdownToNotionBlocks(markdown) {
  return String(markdown || '')
    .split('\n')
    .map(markdownLineToBlock)
    .filter(Boolean);
}

function liveChildren(children = []) {
  return children.filter((block) => !block.archived && !block.in_trash);
}

function richTextToPlainText(richText = []) {
  return richText.map((item) => item?.plain_text || item?.text?.content || '').join('');
}

function blockPlainText(block) {
  if (!block || typeof block !== 'object') {
    return '';
  }

  if (block.type === 'heading_1') {
    return richTextToPlainText(block.heading_1?.rich_text);
  }
  if (block.type === 'heading_2') {
    return richTextToPlainText(block.heading_2?.rich_text);
  }
  if (block.type === 'heading_3') {
    return richTextToPlainText(block.heading_3?.rich_text);
  }
  if (block.type === 'paragraph') {
    return richTextToPlainText(block.paragraph?.rich_text);
  }
  if (block.type === 'bulleted_list_item') {
    return richTextToPlainText(block.bulleted_list_item?.rich_text);
  }
  if (block.type === 'numbered_list_item') {
    return richTextToPlainText(block.numbered_list_item?.rich_text);
  }
  if (block.type === 'quote') {
    return richTextToPlainText(block.quote?.rich_text);
  }

  return '';
}

function buildNavigationScaffoldBlocks(summary = {}) {
  const currentTask = summarizeSingleLine(summary.currentTask, 128);
  const coreProgress = summarizeSingleLine(summary.coreProgress, 160);
  const syncedAt = summarizeSingleLine(summary.syncedAt, 64);
  return [
    {
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: chunkRichText('当前总览') },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: chunkRichText(`当前任务：${currentTask}`) },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: chunkRichText(`核心进展：${coreProgress}`) },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: chunkRichText(`最近同步：${syncedAt}`) },
    },
    {
      object: 'block',
      type: 'divider',
      divider: {},
    },
  ];
}

function extractNavigationAnchor(liveBlocks = []) {
  if (liveBlocks.length >= 5) {
    const [first, second, third, fourth, fifth] = liveBlocks;
    if (
      first.type === 'heading_2' &&
      blockPlainText(first) === '当前总览' &&
      second.type === 'paragraph' &&
      third.type === 'paragraph' &&
      fourth.type === 'paragraph' &&
      fifth.type === 'divider'
    ) {
      return {
        anchorBlockId: fifth.id || null,
        blockIds: [first.id, second.id, third.id, fourth.id, fifth.id].filter(Boolean),
      };
    }
  }

  if (liveBlocks.length >= 3) {
    const [first, second, third] = liveBlocks;
    if (first.type === 'heading_2' && blockPlainText(first) === '导航' && second.type === 'table_of_contents' && third.type === 'divider') {
      return {
        anchorBlockId: third.id || null,
        blockIds: [first.id, second.id, third.id].filter(Boolean),
      };
    }
  }

  return null;
}

export function stripTopLevelTitle(markdown) {
  const lines = String(markdown || '').split('\n');
  let skipped = false;
  const kept = [];

  for (const line of lines) {
    if (!skipped && line.trim().startsWith('# ')) {
      skipped = true;
      continue;
    }
    kept.push(line);
  }

  return kept.join('\n').replace(/^\s+/, '').trim();
}

export function buildAppendEntryMarkdown({ entryTitle, metadata = [], markdown }) {
  const parts = [];
  if (entryTitle) {
    parts.push(`## ${entryTitle}`);
  }

  for (const item of metadata) {
    if (item) {
      parts.push(`- ${String(item).trim()}`);
    }
  }

  const body = stripTopLevelTitle(markdown);
  if (body) {
    if (parts.length > 0) {
      parts.push('');
    }
    parts.push(body);
  }

  return parts.join('\n').trim();
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

function isArchivedBlockDeleteError(error) {
  const message = String(error?.message || error || '');
  return message.includes('Can\'t edit block that is archived');
}

export async function createPage({
  apiKey,
  parentPageId,
  title,
  markdown,
  icon = '🧠',
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const children = markdown ? markdownToNotionBlocks(markdown) : [];
  const initialChildren = children.slice(0, 100);
  const page = await notionRequest('/v1/pages', {
    apiKey,
    baseUrl,
    notionVersion,
    method: 'POST',
    body: {
      parent: {
        page_id: parentPageId,
      },
      icon: {
        type: 'emoji',
        emoji: icon,
      },
      properties: {
        title: {
          title: chunkRichText(title),
        },
      },
      ...(initialChildren.length > 0 ? { children: initialChildren } : {}),
    },
  });

  for (let index = 100; index < children.length; index += 100) {
    await appendBlockChildren({
      apiKey,
      blockId: page.id,
      children: children.slice(index, index + 100),
      baseUrl,
      notionVersion,
    });
  }

  return page;
}

export async function listBlockChildren({
  apiKey,
  blockId,
  maxResults = Number.POSITIVE_INFINITY,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const results = [];
  let cursor = null;

  do {
    const params = new URLSearchParams({ page_size: '100' });
    if (cursor) {
      params.set('start_cursor', cursor);
    }

    const payload = await notionRequest(`/v1/blocks/${blockId}/children?${params.toString()}`, {
      apiKey,
      baseUrl,
      notionVersion,
    });

    results.push(...(payload.results || []));
    if (results.length >= maxResults) {
      return results.slice(0, maxResults);
    }
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  return results;
}

export async function deleteBlock({ apiKey, blockId, baseUrl = DEFAULT_NOTION_BASE_URL, notionVersion = DEFAULT_NOTION_VERSION }) {
  return notionRequest(`/v1/blocks/${blockId}`, {
    apiKey,
    baseUrl,
    notionVersion,
    method: 'DELETE',
  });
}

export async function appendBlockChildren({
  apiKey,
  blockId,
  children,
  position,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  if (!Array.isArray(children) || children.length === 0) {
    return {
      object: 'list',
      results: [],
    };
  }

  return notionRequest(`/v1/blocks/${blockId}/children`, {
    apiKey,
    baseUrl,
    notionVersion,
    method: 'PATCH',
    body: {
      children,
      ...(position ? { position } : {}),
    },
  });
}

async function insertBlockChildrenInOrder({
  apiKey,
  blockId,
  children,
  position,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const batches = [];
  for (let index = 0; index < children.length; index += 100) {
    batches.push(children.slice(index, index + 100));
  }

  if (batches.length === 0) {
    return {
      inserted: 0,
      lastInsertedBlockId: null,
    };
  }

  let nextPosition = position;
  let lastInsertedBlockId = null;

  for (const batch of batches) {
    const payload = await appendBlockChildren({
      apiKey,
      blockId,
      children: batch,
      position: nextPosition,
      baseUrl,
      notionVersion,
    });

    const createdBlocks = payload?.results || [];
    const createdLastBlockId = createdBlocks[createdBlocks.length - 1]?.id || null;
    lastInsertedBlockId = createdLastBlockId || lastInsertedBlockId;

    if (createdLastBlockId && (nextPosition?.type === 'start' || nextPosition?.type === 'after_block')) {
      nextPosition = {
        type: 'after_block',
        after_block: {
          id: createdLastBlockId,
        },
      };
    } else {
      nextPosition = undefined;
    }
  }

  return {
    inserted: children.length,
    lastInsertedBlockId,
  };
}

export async function appendMarkdownEntryToNotion({
  apiKey,
  pageId,
  markdown,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const blocks = markdownToNotionBlocks(markdown);
  if (blocks.length === 0) {
    return {
      appended: 0,
    };
  }

  const existingChildren = await listBlockChildren({
    apiKey,
    blockId: pageId,
    maxResults: 1,
    baseUrl,
    notionVersion,
  });

  const batches = [];
  for (let index = 0; index < blocks.length; index += 100) {
    batches.push(blocks.slice(index, index + 100));
  }

  if (existingChildren.filter((block) => !block.archived && !block.in_trash).length > 0) {
    await appendBlockChildren({
      apiKey,
      blockId: pageId,
      children: [
        {
          object: 'block',
          type: 'divider',
          divider: {},
        },
      ],
      baseUrl,
      notionVersion,
    });
  }

  for (const batch of batches) {
    await appendBlockChildren({
      apiKey,
      blockId: pageId,
      children: batch,
      baseUrl,
      notionVersion,
    });
  }

  return {
    appended: blocks.length,
  };
}

export async function prependMarkdownEntryToNotion({
  apiKey,
  pageId,
  markdown,
  navigation = false,
  clearExistingNavigation = false,
  navigationSummary = null,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const blocks = markdownToNotionBlocks(markdown);
  if (blocks.length === 0) {
    return {
      appended: 0,
      navigationCreated: false,
    };
  }

  const existingChildren = await listBlockChildren({
    apiKey,
    blockId: pageId,
    maxResults: 6,
    baseUrl,
    notionVersion,
  });

  const existingLiveChildren = liveChildren(existingChildren);
  const existingScaffold = extractNavigationAnchor(existingLiveChildren);
  let hasOlderContent = existingLiveChildren.length > 0;
  let navigationCreated = false;
  let scaffoldBlocks = [];

  if (navigation || clearExistingNavigation) {
    if (existingScaffold?.blockIds?.length) {
      for (const blockId of existingScaffold.blockIds) {
        try {
          await deleteBlock({
            apiKey,
            blockId,
            baseUrl,
            notionVersion,
          });
        } catch (error) {
          if (isArchivedBlockDeleteError(error)) {
            continue;
          }
          throw error;
        }
      }
    }
  }

  if (navigation) {
    navigationCreated = !existingScaffold;
    hasOlderContent = existingScaffold?.blockIds?.length
      ? Math.max(existingLiveChildren.length - existingScaffold.blockIds.length, 0) > 0
      : existingLiveChildren.length > 0;

    scaffoldBlocks = buildNavigationScaffoldBlocks(navigationSummary);
  } else if (clearExistingNavigation) {
    hasOlderContent = existingScaffold?.blockIds?.length
      ? Math.max(existingLiveChildren.length - existingScaffold.blockIds.length, 0) > 0
      : existingLiveChildren.length > 0;
  }

  const childrenToInsert = [
    ...scaffoldBlocks,
    ...blocks,
    ...(hasOlderContent
      ? [
          {
            object: 'block',
            type: 'divider',
            divider: {},
          },
        ]
      : []),
  ];

  await insertBlockChildrenInOrder({
    apiKey,
    blockId: pageId,
    children: childrenToInsert,
    position: { type: 'start' },
    baseUrl,
    notionVersion,
  });

  return {
    appended: blocks.length,
    navigationCreated,
  };
}

export async function syncReviewMarkdownToNotion({
  apiKey,
  pageId,
  markdown,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const existingChildren = await listBlockChildren({
    apiKey,
    blockId: pageId,
    baseUrl,
    notionVersion,
  });

  const deletableChildren = existingChildren.filter((block) => !block.archived && !block.in_trash);
  let deletedCount = 0;

  for (const block of deletableChildren) {
    try {
      await deleteBlock({
        apiKey,
        blockId: block.id,
        baseUrl,
        notionVersion,
      });
      deletedCount += 1;
    } catch (error) {
      if (isArchivedBlockDeleteError(error)) {
        deletedCount += 1;
        continue;
      }
      throw error;
    }
  }

  const blocks = markdownToNotionBlocks(markdown);
  const batches = [];
  for (let index = 0; index < blocks.length; index += 100) {
    batches.push(blocks.slice(index, index + 100));
  }

  for (const batch of batches) {
    await appendBlockChildren({
      apiKey,
      blockId: pageId,
      children: batch,
      baseUrl,
      notionVersion,
    });
  }

  return {
    deleted: deletedCount,
    appended: blocks.length,
  };
}
