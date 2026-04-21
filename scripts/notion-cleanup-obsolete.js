import { loadProjectEnv } from '../src/project-env.js';
import {
  DEFAULT_NOTION_BASE_URL,
  DEFAULT_NOTION_RETRY_ATTEMPTS,
  DEFAULT_NOTION_RETRY_BASE_MS,
  DEFAULT_NOTION_VERSION,
  fetchWithTimeout,
  validateNotionConfig,
} from '../src/notion-review-sync.js';

loadProjectEnv(process.cwd());

const apiKey = process.env.NOTION_API_KEY;
const notionVersion = process.env.NOTION_VERSION || DEFAULT_NOTION_VERSION;
const notionBaseUrl = process.env.NOTION_BASE_URL || DEFAULT_NOTION_BASE_URL;

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

const obsoletePages = [
  {
    id: '32c0483f-51e8-81b4-9178-decefaaa2d9a',
    reason: '旧 Projects 数据库里的重复 PRJ-cortex 行',
  },
  {
    id: '32d0483f-51e8-8197-866e-ffd26aa4151f',
    reason: '旧 PRJ-cortex 工作台入口页，已由 Cortex 工作台轻量页替代',
  },
  {
    id: '32d0483f-51e8-8159-9471-f6939fdb68f9',
    reason: '旧 PRJ-cortex 执行文档，内容过重且已由轻量执行文档替代',
  },
  {
    id: '32d0483f-51e8-8127-86e5-c81b35742db2',
    reason: '旧 PRJ-cortex 协作记忆页，已由新的记忆枢纽入口替代',
  },
  {
    id: '3430483f-51e8-81be-88c7-e83516f45f72',
    reason: '旧 Cortex 工作台快照页，已被当前轻量工作台替代',
  },
];

const obsoleteBlocks = [
  {
    id: '778a039e-667d-4b7b-b9fe-0b1640a96865',
    reason: '旧 Projects 数据库，已被 Cortex 项目索引替代',
  },
  {
    id: '3ab4a6d1-b604-462a-ae87-7841491950fc',
    reason: '未落地且为空的 Memory Audit 数据库',
  },
  {
    id: '566c741a-c6fe-4e84-a506-06bd83ba48b1',
    reason: '未落地且为空的 Memory Proposals 数据库',
  },
  {
    id: '32c0483f-51e8-80bf-9057-f6549de14334',
    reason: '工作台根页的空白段落块',
  },
];

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

function normalizeId(id) {
  return String(id || '').replace(/-/g, '');
}

function isAlreadyArchivedError(error) {
  const message = String(error?.message || error || '');
  return message.includes("Can't edit block that is archived");
}

function isNotFoundError(error) {
  const message = String(error?.message || error || '');
  return message.includes('object_not_found') || message.includes('Could not find') || message.includes('"status":404');
}

async function notionRequest(pathname, { method = 'GET', body } = {}) {
  const validated = validateNotionConfig({
    apiKey,
    baseUrl: notionBaseUrl,
    notionVersion,
  });
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

async function trashPage(id) {
  try {
    return await notionRequest(`/v1/pages/${normalizeId(id)}`, {
      method: 'PATCH',
      body: { in_trash: true },
    });
  } catch (error) {
    if (isAlreadyArchivedError(error) || isNotFoundError(error)) {
      return {
        archived: true,
        in_trash: true,
        skipped: true,
        skip_reason: isNotFoundError(error) ? 'not_found' : 'already_archived',
        url: null,
      };
    }
    throw error;
  }
}

async function trashBlock(id) {
  try {
    return await notionRequest(`/v1/blocks/${normalizeId(id)}`, {
      method: 'PATCH',
      body: { in_trash: true },
    });
  } catch (error) {
    if (isAlreadyArchivedError(error) || isNotFoundError(error)) {
      return {
        archived: true,
        in_trash: true,
        skipped: true,
        skip_reason: isNotFoundError(error) ? 'not_found' : 'already_archived',
      };
    }
    throw error;
  }
}

const results = [];

for (const item of obsoletePages) {
  const payload = await trashPage(item.id);
  results.push({
    kind: 'page',
    id: item.id,
    reason: item.reason,
    archived: payload.archived,
    in_trash: payload.in_trash,
    skipped: Boolean(payload.skipped),
    skip_reason: payload.skip_reason || null,
    url: payload.url,
  });
}

for (const item of obsoleteBlocks) {
  const payload = await trashBlock(item.id);
  results.push({
    kind: 'block',
    id: item.id,
    reason: item.reason,
    archived: payload.archived,
    in_trash: payload.in_trash,
    skipped: Boolean(payload.skipped),
    skip_reason: payload.skip_reason || null,
  });
}

console.log(JSON.stringify({ ok: true, archived: results }, null, 2));
