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
  return {
    projectId: normalizeCheckpointText(projectId),
    status: normalizeCheckpointText(status || 'active'),
    currentTask: normalizeCheckpointText(boardData.currentTask),
    currentProgress: normalizeCheckpointText(boardData.currentProgress),
    riskStatus: normalizeCheckpointText(boardData.riskStatus),
    riskPoint: normalizeCheckpointText(boardData.riskPoint),
    greenAction: normalizeCheckpointText(boardData.greenAction),
    nextStep: normalizeCheckpointText(boardData.nextStep),
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
  return {
    currentTask: richTextPropertyValue(page, '当前任务'),
    currentProgress: richTextPropertyValue(page, '当前进展'),
    riskStatus: selectPropertyValue(page, '风险状态'),
    riskPoint: richTextPropertyValue(page, '风险点'),
    greenAction: richTextPropertyValue(page, '已推进'),
    nextStep: richTextPropertyValue(page, '下一步'),
  };
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
  const summary = reviewPayload.summary || {};
  const latestBrief = summary.latest_brief;
  const latestCheckpoint = summary.latest_checkpoint;
  const redCount = (summary.red_decisions || []).length;
  const yellowCount = (summary.yellow_decisions || []).length;
  const latestDone = summary.recent_done_commands?.[0]?.result_summary;
  const nextStep = latestCheckpoint?.next_step || summary.next_steps?.[0];

  const parts = [
    `状态：${project.status || 'unknown'}`,
    latestCheckpoint?.title ? `当前任务：${latestCheckpoint.title}` : latestBrief?.title ? `当前任务：${latestBrief.title}` : null,
    redCount > 0 ? `红灯：${redCount}` : null,
    yellowCount > 0 ? `黄灯：${yellowCount}` : null,
    latestCheckpoint?.quality_grade ? `质量：${latestCheckpoint.quality_grade}` : null,
    latestCheckpoint?.anomaly_level ? `异常：${latestCheckpoint.anomaly_level}` : null,
    latestDone ? `最近完成：${latestDone}` : null,
    nextStep ? `下一步：${nextStep}` : null,
  ].filter(Boolean);

  return parts.join('；');
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

  return {
    currentTask,
    currentProgress,
    riskStatus,
    riskPoint,
    greenAction,
    nextStep,
    redCount: redDecisions.length,
    yellowCount: yellowDecisions.length,
  };
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

  return {
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
  };
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
  return {
    [titlePropertyName]: {
      title: chunkRichText(rowTitle),
    },
    '项目 ID': {
      rich_text: chunkRichText(projectId),
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
      rich_text: chunkRichText(latestSummary),
    },
    当前任务: {
      rich_text: chunkRichText(boardData.currentTask),
    },
    当前进展: {
      rich_text: chunkRichText(boardData.currentProgress),
    },
    风险状态: {
      select: {
        name: boardData.riskStatus,
      },
    },
    风险点: {
      rich_text: chunkRichText(boardData.riskPoint),
    },
    已推进: {
      rich_text: chunkRichText(boardData.greenAction),
    },
    下一步: {
      rich_text: chunkRichText(boardData.nextStep),
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
    latestSummary,
    boardData,
  });
  const checkpointKey = buildProjectCheckpointKey({
    projectId,
    status,
    boardData,
  });
  const snapshotKey = buildStoredCheckpointKey({
    projectId,
    status,
    boardData,
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
  if (latestProjectPage && pageCheckpointKey(latestProjectPage) === checkpointKey) {
    const metadataUnchanged =
      normalizeCheckpointText(selectPropertyValue(latestProjectPage, '状态')) === normalizeCheckpointText(status || 'active') &&
      normalizeCheckpointText(urlPropertyValue(latestProjectPage, '根页面')) === normalizeCheckpointText(rootPageUrl || '') &&
      normalizeCheckpointText(urlPropertyValue(latestProjectPage, '总览页')) === normalizeCheckpointText(reviewPageUrl || '') &&
      normalizeCheckpointText(urlPropertyValue(latestProjectPage, '执行文档')) === normalizeCheckpointText(executionDocUrl || '') &&
      normalizeCheckpointText(urlPropertyValue(latestProjectPage, '协作记忆')) === normalizeCheckpointText(memoryPageUrl || '') &&
      normalizeCheckpointText(richTextPropertyValue(latestProjectPage, '最新摘要')) === normalizeCheckpointText(latestSummary) &&
      normalizeCheckpointText(richTextPropertyValue(latestProjectPage, '项目更新时间')) ===
        normalizeCheckpointText(displayProjectUpdatedAt);

    if (!metadataUnchanged) {
      const refreshProperties = buildRowProperties({
        titlePropertyName,
        rowTitle: titleFromPage(latestProjectPage, titlePropertyName) || `${projectId} · ${boardData.currentTask || '未命名任务'}`,
        projectId,
        snapshotKey,
        status,
        rootPageUrl,
        reviewPageUrl,
        executionDocUrl,
        memoryPageUrl,
        latestSummary,
        syncedAt: displaySyncedAt,
        projectUpdatedAt: displayProjectUpdatedAt,
        syncedAtIso,
        boardData,
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

      return {
        created: false,
        skipped: false,
        updated: true,
        reason: 'same_checkpoint_refreshed',
        pageId: latestProjectPage.id,
        url: latestProjectPage.url || notionPageUrlFromId(latestProjectPage.id),
      };
    }

    return {
      created: false,
      skipped: true,
      reason: 'same_checkpoint',
      pageId: latestProjectPage.id,
      url: latestProjectPage.url || notionPageUrlFromId(latestProjectPage.id),
    };
  }
  const rowTitle = `${displaySyncedAt} · ${projectId} · ${boardData.currentTask || '未命名任务'}`;
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
    latestSummary,
    syncedAt: displaySyncedAt,
    projectUpdatedAt: displayProjectUpdatedAt,
    syncedAtIso,
    boardData,
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

  const archivedPageIds = [];
  let previousKey = null;

  for (const page of pages) {
    const currentKey = pageCheckpointKey(page);
    if (previousKey && currentKey === previousKey) {
      await archivePage({
        apiKey,
        pageId: page.id,
        baseUrl,
        notionVersion,
      });
      archivedPageIds.push(page.id);
      continue;
    }
    previousKey = currentKey;
  }

  return {
    scanned: pages.length,
    archivedCount: archivedPageIds.length,
    archivedPageIds,
  };
}
