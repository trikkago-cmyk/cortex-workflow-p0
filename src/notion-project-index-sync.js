import {
  DEFAULT_NOTION_BASE_URL,
  DEFAULT_NOTION_VERSION,
  fetchWithTimeout,
  formatDisplayTime,
  syncReviewMarkdownToNotion,
  validateNotionConfig,
} from './notion-review-sync.js';

const DEFAULT_NOTION_DATABASE_VERSION = '2022-06-28';

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
  const validated = validateNotionConfig({
    apiKey,
    baseUrl,
    notionVersion: notionVersion || DEFAULT_NOTION_DATABASE_VERSION || DEFAULT_NOTION_VERSION,
  });
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
    throw new Error(`Notion API ${method} ${pathname} failed: ${response.status} ${raw}`);
  }

  return payload;
}

function titleFromPage(page, titlePropertyName) {
  const titleProperty = page?.properties?.[titlePropertyName];
  if (titleProperty?.type === 'title') {
    return (titleProperty.title || []).map((item) => item.plain_text).join('');
  }

  return '';
}

function normalizeCheckpointText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeProjectIndexText(value, maxLength = 80, fallback = '暂无') {
  const normalized = normalizeCheckpointText(value);
  if (!normalized) {
    return fallback;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}

function normalizeBoardDataForDisplay(boardData = {}) {
  return {
    currentTask: summarizeProjectIndexText(boardData.currentTask, 48, '未设置'),
    currentProgress: summarizeProjectIndexText(boardData.currentProgress, 72, '暂无进展摘要'),
    riskStatus: summarizeProjectIndexText(boardData.riskStatus, 12, '正常'),
    riskPoint: summarizeProjectIndexText(boardData.riskPoint, 56, '无'),
    greenAction: summarizeProjectIndexText(boardData.greenAction, 56, '无'),
    nextStep: summarizeProjectIndexText(boardData.nextStep, 56, '无'),
    redCount: Number(boardData.redCount || boardData.red_count || 0),
    yellowCount: Number(boardData.yellowCount || boardData.yellow_count || 0),
  };
}

function buildProjectIndexLatestSummary({ projectStatus = 'active', boardData = {} } = {}) {
  const normalizedStatus = normalizeCheckpointText(projectStatus || 'active').toLowerCase();
  const normalizedBoardData = normalizeBoardDataForDisplay(boardData);

  if (normalizedStatus === 'paused') {
    return '项目已暂停，等待恢复。';
  }
  if (normalizedStatus === 'archived') {
    return '项目已归档。';
  }
  if (normalizedBoardData.riskStatus === '红灯' && normalizedBoardData.riskPoint !== '无') {
    return summarizeProjectIndexText(`红灯待拍板：${normalizedBoardData.riskPoint}`, 72);
  }
  if (normalizedBoardData.riskStatus === '红灯' && normalizedBoardData.redCount > 0) {
    return `红灯待拍板：${normalizedBoardData.redCount} 项待决策`;
  }
  if (normalizedBoardData.riskStatus === '黄灯' && normalizedBoardData.riskPoint !== '无') {
    return summarizeProjectIndexText(`黄灯关注：${normalizedBoardData.riskPoint}`, 72);
  }
  if (normalizedBoardData.riskStatus === '黄灯' && normalizedBoardData.yellowCount > 0) {
    return `黄灯关注：${normalizedBoardData.yellowCount} 项待回看`;
  }
  if (normalizedBoardData.currentProgress !== '暂无进展摘要') {
    return summarizeProjectIndexText(`已推进：${normalizedBoardData.currentProgress}`, 72);
  }
  if (normalizedBoardData.greenAction !== '无') {
    return summarizeProjectIndexText(`已推进：${normalizedBoardData.greenAction}`, 72);
  }
  if (normalizedBoardData.nextStep !== '无') {
    return summarizeProjectIndexText(`下一步：${normalizedBoardData.nextStep}`, 72);
  }
  return '当前无异常，继续推进。';
}

function buildProjectRowTitle(projectId, boardData = {}) {
  const normalizedProjectId = normalizeCheckpointText(projectId) || 'unknown-project';
  const normalizedBoardData = normalizeBoardDataForDisplay(boardData);
  return `${normalizedProjectId} · ${normalizedBoardData.currentTask || '未命名任务'}`;
}

function richTextPropertyValue(page, propertyName) {
  const property = page?.properties?.[propertyName];
  if (property?.type === 'rich_text') {
    return (property.rich_text || []).map((item) => item.plain_text || item.text?.content || '').join('');
  }
  if (property?.type === 'title') {
    return (property.title || []).map((item) => item.plain_text || item.text?.content || '').join('');
  }
  return '';
}

function selectPropertyValue(page, propertyName) {
  const property = page?.properties?.[propertyName];
  return property?.type === 'select' ? property.select?.name || '' : '';
}

function datePropertyValue(page, propertyName) {
  const property = page?.properties?.[propertyName];
  return property?.type === 'date' ? property.date?.start || '' : '';
}

function urlPropertyValue(page, propertyName) {
  const property = page?.properties?.[propertyName];
  return property?.type === 'url' ? property.url || '' : '';
}

function checkpointPayload({ projectId, status, boardData = {} }) {
  const normalizedBoardData = normalizeBoardDataForDisplay(boardData);
  return {
    projectId: normalizeCheckpointText(projectId),
    status: normalizeCheckpointText(status || 'active'),
    currentTask: normalizeCheckpointText(normalizedBoardData.currentTask),
    currentProgress: normalizeCheckpointText(normalizedBoardData.currentProgress),
    riskStatus: normalizeCheckpointText(normalizedBoardData.riskStatus),
    riskPoint: normalizeCheckpointText(normalizedBoardData.riskPoint),
    greenAction: normalizeCheckpointText(normalizedBoardData.greenAction),
    nextStep: normalizeCheckpointText(normalizedBoardData.nextStep),
  };
}

export function buildProjectCheckpointKey({ projectId, status, boardData = {} }) {
  return JSON.stringify(checkpointPayload({ projectId, status, boardData }));
}

function buildStoredCheckpointKey({ projectId, status, boardData = {} }) {
  return `checkpoint:${buildProjectCheckpointKey({ projectId, status, boardData })}`;
}

function pageProjectId(page) {
  return normalizeCheckpointText(richTextPropertyValue(page, '项目 ID'));
}

function pageBoardData(page) {
  return normalizeBoardDataForDisplay({
    currentTask: richTextPropertyValue(page, '当前任务'),
    currentProgress: richTextPropertyValue(page, '当前进展'),
    riskStatus: selectPropertyValue(page, '风险状态'),
    riskPoint: richTextPropertyValue(page, '风险点'),
    greenAction: richTextPropertyValue(page, '已推进'),
    nextStep: richTextPropertyValue(page, '下一步'),
  });
}

function pageCheckpointKey(page) {
  const stored = normalizeCheckpointText(richTextPropertyValue(page, '同步键'));
  if (stored.startsWith('checkpoint:')) {
    return stored.slice('checkpoint:'.length);
  }

  return buildProjectCheckpointKey({
    projectId: pageProjectId(page),
    status: selectPropertyValue(page, '状态'),
    boardData: pageBoardData(page),
  });
}

function pageSyncTime(page) {
  return (
    datePropertyValue(page, '同步时间') ||
    normalizeCheckpointText(richTextPropertyValue(page, '项目更新时间')) ||
    page?.last_edited_time ||
    page?.created_time ||
    ''
  );
}

function liveDatabasePages(pages = []) {
  return pages.filter((page) => !page.archived && !page.in_trash);
}

function sortPagesBySyncTimeDesc(pages = []) {
  return [...pages].sort((left, right) => {
    const leftTime = Date.parse(pageSyncTime(left));
    const rightTime = Date.parse(pageSyncTime(right));
    const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
    const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
    return safeRight - safeLeft;
  });
}

function normalizePageId(pageId) {
  const raw = String(pageId || '').trim();
  if (!raw) {
    return null;
  }
  const condensed = raw.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(condensed)) {
    return raw;
  }
  return condensed;
}

export function notionPageUrlFromId(pageId) {
  const normalized = normalizePageId(pageId);
  if (!normalized) {
    return null;
  }
  return `https://www.notion.so/${normalized}`;
}

export function buildProjectIndexSummary(reviewPayload = {}) {
  const project = reviewPayload.project || {};
  const boardData = extractProjectBoardData(reviewPayload);
  return buildProjectIndexLatestSummary({
    projectStatus: project.status || 'active',
    boardData,
  });
}

export function extractProjectBoardData(reviewPayload = {}) {
  const summary = reviewPayload.summary || {};
  const latestBrief = summary.latest_brief;
  const latestCheckpoint = summary.latest_checkpoint;
  const activeCommands = summary.active_commands || [];
  const recentDoneCommands = summary.recent_done_commands || [];
  const redDecisions = summary.red_decisions || [];
  const yellowDecisions = summary.yellow_decisions || [];
  const greenNotes = summary.green_notes || [];
  const nextSteps = summary.next_steps || [];

  const currentTask = latestCheckpoint?.title || latestBrief?.title || '未设置';
  const currentProgress =
    latestCheckpoint?.summary ||
    recentDoneCommands[0]?.result_summary ||
    recentDoneCommands[0]?.resultSummary ||
    activeCommands[0]?.instruction ||
    summary.trajectory_reason ||
    summary.trajectoryReason ||
    '暂无进展摘要';

  const riskStatus =
    redDecisions.length > 0
      ? '红灯'
      : yellowDecisions.length > 0
        ? '黄灯'
        : latestCheckpoint?.signal_level === 'red'
          ? '红灯'
          : latestCheckpoint?.signal_level === 'yellow'
            ? '黄灯'
            : '正常';
  const riskPoint =
    redDecisions[0]?.question ||
    yellowDecisions[0]?.question ||
    (latestCheckpoint?.signal_level && latestCheckpoint.signal_level !== 'green' ? latestCheckpoint.summary : null) ||
    '无';
  const greenAction =
    greenNotes[0]?.question ||
    (latestCheckpoint?.signal_level === 'green' ? latestCheckpoint.summary : null) ||
    recentDoneCommands[0]?.result_summary ||
    recentDoneCommands[0]?.resultSummary ||
    '无';
  const nextStep = latestCheckpoint?.next_step || nextSteps[0] || '无';

  return normalizeBoardDataForDisplay({
    currentTask,
    currentProgress,
    riskStatus,
    riskPoint,
    greenAction,
    nextStep,
    redCount: redDecisions.length,
    yellowCount: yellowDecisions.length,
  });
}

export function mergeBoardDataWithExecutionDoc(boardData, markdown = '') {
  const lines = String(markdown || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const findValue = (prefix) => {
    const line = lines.find((item) => item.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : null;
  };

  const collectAfter = (marker, stopMarkers = []) => {
    const startIndex = lines.findIndex((line) => line === marker);
    if (startIndex === -1) {
      return [];
    }

    const values = [];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (stopMarkers.includes(line)) {
        break;
      }
      if (line.startsWith('- ')) {
        values.push(line.slice(2).trim());
      }
    }
    return values;
  };

  const collectAfterAny = (markers = [], stopMarkers = []) => {
    for (const marker of markers) {
      const values = collectAfter(marker, stopMarkers);
      if (values.length > 0) {
        return values;
      }
    }
    return [];
  };
  const summarizeItems = (items = [], maxItems = 5) => {
    const normalized = items.filter(Boolean);
    if (normalized.length <= maxItems) {
      return normalized;
    }
    return [...normalized.slice(0, maxItems), `其余 ${normalized.length - maxItems} 项已折叠`];
  };

  const task = findValue('- 任务：');
  const currentTask = findValue('- 当前任务：');
  const currentProgress = findValue('- 当前进展：') || findValue('- 核心进展：');
  const decisionStatus = findValue('- 决策状态：');
  const nextStepLine = findValue('- 下一步：');
  const explicitRed = findValue('- 🔴 红灯：');
  const explicitYellow = findValue('- 🟡 黄灯：');
  const explicitGreen = findValue('- 🟢 已推进：');
  const progressItems = collectAfterAny(['## 🟢 核心进展', '- 当前进展：'], ['## 风险举手', '## 决策状态', '## 重点 To Do', '## 下一步']);
  const redItems = collectAfterAny(['### 🔴 红灯'], ['### 🟡 黄灯', '### 🟢 已推进', '## 重点 To Do', '## 下一步']);
  const yellowItems = collectAfterAny(['### 🟡 黄灯'], ['### 🟢 已推进', '## 重点 To Do', '## 下一步']);
  const greenItems = collectAfterAny(['### 🟢 已推进', '- 已推进的绿灯动作：'], ['## 重点 To Do', '## 下一步']);
  const nextItems = collectAfterAny(['## 重点 To Do', '## 下一步']);
  const red = redItems.find((item) => item !== '暂无' && item !== '暂无。') || findValue('- 红灯：');
  const yellow = yellowItems.find((item) => item !== '暂无' && item !== '暂无。') || findValue('- 黄灯：');
  const extractDecisionSegment = (emoji) => {
    if (!decisionStatus) {
      return null;
    }
    const match = decisionStatus.match(new RegExp(`${emoji}\\s*([^；]+)`));
    return match?.[1]?.trim() || null;
  };
  const redDecision = extractDecisionSegment('🔴');
  const yellowDecision = extractDecisionSegment('🟡');
  const greenDecision = extractDecisionSegment('🟢');

  return normalizeBoardDataForDisplay({
    ...boardData,
    currentTask: currentTask || task || boardData.currentTask,
    currentProgress:
      currentProgress || (progressItems.length > 0 ? summarizeItems(progressItems).join('；') : boardData.currentProgress),
    riskStatus:
      explicitRed && explicitRed !== '无'
        ? '红灯'
        : explicitYellow && explicitYellow !== '无'
          ? '黄灯'
          : red && red !== '暂无。' && red !== '暂无'
        ? '红灯'
        : yellow && yellow !== '暂无。' && yellow !== '暂无'
          ? '黄灯'
          : redDecision && redDecision !== '无'
            ? '红灯'
            : yellowDecision && yellowDecision !== '无'
              ? '黄灯'
              : boardData.riskStatus,
    riskPoint:
      explicitRed && explicitRed !== '无'
        ? explicitRed
        : explicitYellow && explicitYellow !== '无'
          ? explicitYellow
          : red && red !== '暂无。' && red !== '暂无'
        ? red
        : yellow && yellow !== '暂无。' && yellow !== '暂无'
          ? yellow
          : redDecision && redDecision !== '无'
            ? redDecision
            : yellowDecision && yellowDecision !== '无'
              ? yellowDecision
          : boardData.riskPoint,
    greenAction:
      explicitGreen && explicitGreen !== '无'
        ? explicitGreen
        : greenDecision && greenDecision !== '无'
        ? greenDecision
        : greenItems.length > 0
          ? summarizeItems(greenItems).join('；')
          : boardData.greenAction,
    nextStep: nextStepLine || nextItems[0] || boardData.nextStep,
  });
}

async function retrieveDatabase({
  apiKey,
  databaseId,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_DATABASE_VERSION,
}) {
  return notionRequest(`/v1/databases/${normalizePageId(databaseId)}`, {
    apiKey,
    baseUrl,
    notionVersion,
  });
}

async function updateDatabase({
  apiKey,
  databaseId,
  properties,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_DATABASE_VERSION,
}) {
  return notionRequest(`/v1/databases/${normalizePageId(databaseId)}`, {
    apiKey,
    baseUrl,
    notionVersion,
    method: 'PATCH',
    body: {
      properties,
    },
  });
}

async function queryAllDatabasePages({
  apiKey,
  databaseId,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_DATABASE_VERSION,
}) {
  const results = [];
  let cursor = null;

  do {
    const payload = await notionRequest(`/v1/databases/${normalizePageId(databaseId)}/query`, {
      apiKey,
      baseUrl,
      notionVersion,
      method: 'POST',
      body: cursor ? { start_cursor: cursor } : {},
    });

    results.push(...(payload.results || []));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  return results;
}

async function createDatabaseRow({
  apiKey,
  databaseId,
  properties,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_DATABASE_VERSION,
}) {
  return notionRequest('/v1/pages', {
    apiKey,
    baseUrl,
    notionVersion,
    method: 'POST',
    body: {
      parent: {
        database_id: normalizePageId(databaseId),
      },
      properties,
    },
  });
}

async function updatePageProperties({
  apiKey,
  pageId,
  properties,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_DATABASE_VERSION,
}) {
  return notionRequest(`/v1/pages/${normalizePageId(pageId)}`, {
    apiKey,
    baseUrl,
    notionVersion,
    method: 'PATCH',
    body: {
      properties,
    },
  });
}

async function archivePage({
  apiKey,
  pageId,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_DATABASE_VERSION,
}) {
  return notionRequest(`/v1/pages/${normalizePageId(pageId)}`, {
    apiKey,
    baseUrl,
    notionVersion,
    method: 'PATCH',
    body: {
      archived: true,
    },
  });
}

function buildSchemaPatch(database) {
  const properties = database?.properties || {};
  const missing = {};

  if (!properties['状态']) {
    missing['状态'] = {
      select: {
        options: [{ name: 'active' }, { name: 'paused' }, { name: 'archived' }],
      },
    };
  }
  if (!properties['根页面']) {
    missing['根页面'] = { url: {} };
  }
  if (!properties['总览页']) {
    missing['总览页'] = { url: {} };
  }
  if (!properties['执行文档']) {
    missing['执行文档'] = { url: {} };
  }
  if (!properties['协作记忆']) {
    missing['协作记忆'] = { url: {} };
  }
  if (!properties['最新摘要']) {
    missing['最新摘要'] = { rich_text: {} };
  }
  if (!properties['更新时间']) {
    missing['更新时间'] = { rich_text: {} };
  }
  if (!properties['项目更新时间']) {
    missing['项目更新时间'] = { rich_text: {} };
  }
  if (!properties['同步时间']) {
    missing['同步时间'] = { date: {} };
  }
  if (!properties['项目 ID']) {
    missing['项目 ID'] = { rich_text: {} };
  }
  if (!properties['项目']) {
    missing['项目'] = { select: {} };
  }
  if (!properties['同步键']) {
    missing['同步键'] = { rich_text: {} };
  }
  if (!properties['当前任务']) {
    missing['当前任务'] = { rich_text: {} };
  }
  if (!properties['当前进展']) {
    missing['当前进展'] = { rich_text: {} };
  }
  if (!properties['风险状态']) {
    missing['风险状态'] = {
      select: {
        options: [{ name: '正常' }, { name: '黄灯' }, { name: '红灯' }],
      },
    };
  }
  if (!properties['风险点']) {
    missing['风险点'] = { rich_text: {} };
  }
  if (!properties['已推进']) {
    missing['已推进'] = { rich_text: {} };
  }
  if (!properties['下一步']) {
    missing['下一步'] = { rich_text: {} };
  }

  return missing;
}

function buildRowProperties({
  titlePropertyName,
  rowTitle,
  projectId,
  snapshotKey,
  status,
  rootPageUrl,
  reviewPageUrl,
  executionDocUrl,
  memoryPageUrl,
  latestSummary,
  syncedAt,
  projectUpdatedAt,
  syncedAtIso,
  boardData,
}) {
  const normalizedBoardData = normalizeBoardDataForDisplay(boardData);
  const normalizedLatestSummary = summarizeProjectIndexText(latestSummary, 96, '当前无异常，继续推进。');
  return {
    [titlePropertyName]: {
      title: chunkRichText(rowTitle),
    },
    '项目 ID': {
      rich_text: chunkRichText(projectId),
    },
    项目: {
      select: {
        name: projectId,
      },
    },
    同步键: {
      rich_text: chunkRichText(snapshotKey),
    },
    状态: {
      select: {
        name: status || 'active',
      },
    },
    根页面: {
      url: rootPageUrl || null,
    },
    总览页: {
      url: reviewPageUrl || null,
    },
    执行文档: {
      url: executionDocUrl || null,
    },
    协作记忆: {
      url: memoryPageUrl || null,
    },
    最新摘要: {
      rich_text: chunkRichText(normalizedLatestSummary),
    },
    当前任务: {
      rich_text: chunkRichText(normalizedBoardData.currentTask),
    },
    当前进展: {
      rich_text: chunkRichText(normalizedBoardData.currentProgress),
    },
    风险状态: {
      select: {
        name: normalizedBoardData.riskStatus,
      },
    },
    风险点: {
      rich_text: chunkRichText(normalizedBoardData.riskPoint),
    },
    已推进: {
      rich_text: chunkRichText(normalizedBoardData.greenAction),
    },
    下一步: {
      rich_text: chunkRichText(normalizedBoardData.nextStep),
    },
    更新时间: {
      rich_text: chunkRichText(`${syncedAt}（本地同步）`),
    },
    项目更新时间: {
      rich_text: chunkRichText(projectUpdatedAt || syncedAt),
    },
    同步时间: {
      date: {
        start: syncedAtIso,
      },
    },
  };
}

export function buildProjectIndexHistoryMarkdown({
  projectId,
  syncedAt,
  projectUpdatedAt,
  latestSummary,
  boardData,
}) {
  return [
    `# 状态快照 · ${syncedAt || 'unknown time'}`,
    `- 项目：${projectId}`,
    projectUpdatedAt ? `- 项目更新时间：${projectUpdatedAt}` : null,
    latestSummary ? `- 最新摘要：${latestSummary}` : null,
    boardData?.currentTask ? `- 当前任务：${boardData.currentTask}` : null,
    boardData?.currentProgress ? `- 核心进展：${boardData.currentProgress}` : null,
    `- 🔴 红灯：${boardData?.riskStatus === '红灯' ? boardData?.riskPoint : '无'}`,
    `- 🟡 黄灯：${boardData?.riskStatus === '黄灯' ? boardData?.riskPoint : '无'}`,
    `- 🟢 已推进：${boardData?.greenAction || '无'}`,
    boardData?.nextStep ? `- 下一步：${boardData.nextStep}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function syncProjectIndexRow({
  apiKey,
  databaseId,
  projectId,
  status,
  rootPageUrl,
  reviewPageUrl,
  executionDocUrl,
  memoryPageUrl,
  latestSummary,
  updatedAt,
  boardData,
  clock = () => new Date(),
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_DATABASE_VERSION,
}) {
  const normalizedBoardData = normalizeBoardDataForDisplay(boardData);
  const normalizedLatestSummary = summarizeProjectIndexText(latestSummary, 96, '当前无异常，继续推进。');
  const database = await retrieveDatabase({
    apiKey,
    databaseId,
    baseUrl,
    notionVersion,
  });
  const schemaPatch = buildSchemaPatch(database);
  if (Object.keys(schemaPatch).length > 0) {
    await updateDatabase({
      apiKey,
      databaseId,
      properties: schemaPatch,
      baseUrl,
      notionVersion,
    });
  }

  const freshDatabase = Object.keys(schemaPatch).length > 0
    ? await retrieveDatabase({
        apiKey,
        databaseId,
        baseUrl,
        notionVersion,
      })
    : database;

  const titlePropertyName =
    Object.entries(freshDatabase.properties || {}).find(([, value]) => value?.type === 'title')?.[0] || 'Name';

  const syncedAtDate = clock();
  const syncedAtIso = syncedAtDate instanceof Date ? syncedAtDate.toISOString() : new Date(syncedAtDate).toISOString();
  const displaySyncedAt = formatDisplayTime(syncedAtIso);
  const displayProjectUpdatedAt = updatedAt ? formatDisplayTime(updatedAt) : displaySyncedAt;
  const historyMarkdown = buildProjectIndexHistoryMarkdown({
    projectId,
    syncedAt: displaySyncedAt,
    projectUpdatedAt: displayProjectUpdatedAt,
    latestSummary: normalizedLatestSummary,
    boardData: normalizedBoardData,
  });
  const checkpointKey = buildProjectCheckpointKey({
    projectId,
    status,
    boardData: normalizedBoardData,
  });
  const snapshotKey = buildStoredCheckpointKey({
    projectId,
    status,
    boardData: normalizedBoardData,
  });
  const existingPages = sortPagesBySyncTimeDesc(
    liveDatabasePages(
      await queryAllDatabasePages({
        apiKey,
        databaseId,
        baseUrl,
        notionVersion,
      }),
    ).filter((page) => pageProjectId(page) === normalizeCheckpointText(projectId)),
  );
  const latestProjectPage = existingPages[0] || null;
  const olderProjectPages = latestProjectPage ? existingPages.slice(1) : [];
  const archiveOlderProjectPages = async () => {
    const archivedPageIds = [];
    for (const page of olderProjectPages) {
      await archivePage({
        apiKey,
        pageId: page.id,
        baseUrl,
        notionVersion,
      });
      archivedPageIds.push(page.id);
    }
    return archivedPageIds;
  };
  if (latestProjectPage && pageCheckpointKey(latestProjectPage) === checkpointKey) {
    const metadataUnchanged =
      normalizeCheckpointText(selectPropertyValue(latestProjectPage, '状态')) === normalizeCheckpointText(status || 'active') &&
      normalizeCheckpointText(urlPropertyValue(latestProjectPage, '根页面')) === normalizeCheckpointText(rootPageUrl || '') &&
      normalizeCheckpointText(urlPropertyValue(latestProjectPage, '总览页')) === normalizeCheckpointText(reviewPageUrl || '') &&
      normalizeCheckpointText(urlPropertyValue(latestProjectPage, '执行文档')) === normalizeCheckpointText(executionDocUrl || '') &&
      normalizeCheckpointText(urlPropertyValue(latestProjectPage, '协作记忆')) === normalizeCheckpointText(memoryPageUrl || '') &&
      normalizeCheckpointText(richTextPropertyValue(latestProjectPage, '最新摘要')) ===
        normalizeCheckpointText(normalizedLatestSummary) &&
      normalizeCheckpointText(richTextPropertyValue(latestProjectPage, '项目更新时间')) ===
        normalizeCheckpointText(displayProjectUpdatedAt) &&
      normalizeCheckpointText(titleFromPage(latestProjectPage, titlePropertyName)) ===
        normalizeCheckpointText(buildProjectRowTitle(projectId, normalizedBoardData));

    if (!metadataUnchanged) {
      const refreshProperties = buildRowProperties({
        titlePropertyName,
        rowTitle: buildProjectRowTitle(projectId, normalizedBoardData),
        projectId,
        snapshotKey,
        status,
        rootPageUrl,
        reviewPageUrl,
        executionDocUrl,
        memoryPageUrl,
        latestSummary: normalizedLatestSummary,
        syncedAt: displaySyncedAt,
        projectUpdatedAt: displayProjectUpdatedAt,
        syncedAtIso,
        boardData: normalizedBoardData,
      });

      delete refreshProperties[titlePropertyName];
      delete refreshProperties['项目 ID'];
      delete refreshProperties['同步键'];

      await updatePageProperties({
        apiKey,
        pageId: latestProjectPage.id,
        properties: refreshProperties,
        baseUrl,
        notionVersion,
      });

      await syncReviewMarkdownToNotion({
        apiKey,
        pageId: latestProjectPage.id,
        markdown: historyMarkdown,
        baseUrl,
        notionVersion,
      });

      const archivedPageIds = await archiveOlderProjectPages();

      return {
        created: false,
        skipped: false,
        updated: true,
        reason: 'same_checkpoint_refreshed',
        pageId: latestProjectPage.id,
        url: latestProjectPage.url || notionPageUrlFromId(latestProjectPage.id),
        archivedCount: archivedPageIds.length,
        archivedPageIds,
      };
    }

    const archivedPageIds = await archiveOlderProjectPages();

    return {
      created: false,
      skipped: archivedPageIds.length === 0,
      reason: archivedPageIds.length > 0 ? 'same_checkpoint_compacted' : 'same_checkpoint',
      pageId: latestProjectPage.id,
      url: latestProjectPage.url || notionPageUrlFromId(latestProjectPage.id),
      archivedCount: archivedPageIds.length,
      archivedPageIds,
    };
  }

  if (latestProjectPage) {
    const refreshProperties = buildRowProperties({
      titlePropertyName,
      rowTitle: buildProjectRowTitle(projectId, normalizedBoardData),
      projectId,
      snapshotKey,
      status,
      rootPageUrl,
      reviewPageUrl,
      executionDocUrl,
      memoryPageUrl,
      latestSummary: normalizedLatestSummary,
      syncedAt: displaySyncedAt,
      projectUpdatedAt: displayProjectUpdatedAt,
      syncedAtIso,
      boardData: normalizedBoardData,
    });

    delete refreshProperties['项目 ID'];

    await updatePageProperties({
      apiKey,
      pageId: latestProjectPage.id,
      properties: refreshProperties,
      baseUrl,
      notionVersion,
    });

    await syncReviewMarkdownToNotion({
      apiKey,
      pageId: latestProjectPage.id,
      markdown: historyMarkdown,
      baseUrl,
      notionVersion,
    });

    const archivedPageIds = await archiveOlderProjectPages();

    return {
      created: false,
      skipped: false,
      updated: true,
      reason: 'latest_project_row_updated',
      pageId: latestProjectPage.id,
      url: latestProjectPage.url || notionPageUrlFromId(latestProjectPage.id),
      archivedCount: archivedPageIds.length,
      archivedPageIds,
    };
  }

  const rowTitle = buildProjectRowTitle(projectId, normalizedBoardData);
  const properties = buildRowProperties({
    titlePropertyName,
    rowTitle,
    projectId,
    snapshotKey,
    status,
    rootPageUrl,
    reviewPageUrl,
    executionDocUrl,
    memoryPageUrl,
    latestSummary: normalizedLatestSummary,
    syncedAt: displaySyncedAt,
    projectUpdatedAt: displayProjectUpdatedAt,
    syncedAtIso,
    boardData: normalizedBoardData,
  });

  const page = await createDatabaseRow({
    apiKey,
    databaseId,
    properties,
    baseUrl,
    notionVersion,
  });

  await syncReviewMarkdownToNotion({
    apiKey,
    pageId: page.id,
    markdown: historyMarkdown,
    baseUrl,
    notionVersion,
  });

  return {
    created: true,
    skipped: false,
    pageId: page.id,
    url: page.url || notionPageUrlFromId(page.id),
  };
}

export async function dedupeProjectIndexRows({
  apiKey,
  databaseId,
  projectId,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_DATABASE_VERSION,
}) {
  const pages = sortPagesBySyncTimeDesc(
    liveDatabasePages(
      await queryAllDatabasePages({
        apiKey,
        databaseId,
        baseUrl,
        notionVersion,
      }),
    ).filter((page) => {
      if (!projectId) {
        return true;
      }
      return pageProjectId(page) === normalizeCheckpointText(projectId);
    }),
  );

  const pagesByProject = new Map();
  for (const page of pages) {
    const key = pageProjectId(page) || page.id;
    if (!pagesByProject.has(key)) {
      pagesByProject.set(key, []);
    }
    pagesByProject.get(key).push(page);
  }

  const archivedPageIds = [];
  for (const projectPages of pagesByProject.values()) {
    const [, ...olderPages] = projectPages;
    for (const page of olderPages) {
      await archivePage({
        apiKey,
        pageId: page.id,
        baseUrl,
        notionVersion,
      });
      archivedPageIds.push(page.id);
    }
  }

  return {
    scanned: pages.length,
    archivedCount: archivedPageIds.length,
    archivedPageIds,
  };
}
