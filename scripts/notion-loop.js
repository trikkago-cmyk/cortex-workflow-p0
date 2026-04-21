import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getCurrentBotUserId, scanCommentsUnderPage } from '../src/notion-agent-sync.js';
import { loadRoutingRules, resolveCommentOwnerAgent } from '../src/comment-routing.js';
import {
  buildCompactExecutionMarkdown,
  buildCompactReviewMarkdown,
  buildProjectMemoryLandingMarkdown,
} from '../src/notion-compact-pages.js';
import { compileMemoryHub } from '../src/memory-hub.js';
import {
  buildProjectIndexSummary,
  extractProjectBoardData,
  mergeBoardDataWithExecutionDoc,
  notionPageUrlFromId,
  syncProjectIndexRow,
} from '../src/notion-project-index-sync.js';
import { buildExecutionCheckpointKey, buildReviewCheckpointKey } from '../src/notion-sync-dedupe.js';
import {
  fetchWithTimeout,
  formatDisplayTime,
  syncReviewMarkdownToNotion,
} from '../src/notion-review-sync.js';
import { resolveCommentScanPageIds } from '../src/notion-comment-pages.js';
import { loadProjectEnv } from '../src/project-env.js';
import { loadSyncPreferences } from '../src/notion-sync-preferences.js';
import { ensureProjectWorkspace, resolveProjectWorkspacePaths } from '../src/project-workspace.js';

loadProjectEnv(process.cwd());

const apiKey = process.env.NOTION_API_KEY;
const cortexBaseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const notionBaseUrl = process.env.NOTION_BASE_URL;
const notionVersion = process.env.NOTION_VERSION;
const intervalMs = Number(process.env.LOOP_INTERVAL_MS || 3000);
const runOnce = process.argv.includes('--once') || process.env.LOOP_ONCE === '1';
const workspace = ensureProjectWorkspace({
  cwd: process.cwd(),
  projectId,
  projectName: process.env.PROJECT_NAME,
});
const resolvedPaths = resolveProjectWorkspacePaths({
  cwd: process.cwd(),
  projectId,
});
const memoryPath = workspace.memoryPath;
const executionDocPath = workspace.executionDocPath;
const routingRulesPath =
  process.env.NOTION_ROUTING_RULES_PATH || `${process.cwd()}/docs/notion-routing.json`;
const statePath = resolvedPaths.statePath;
const projectIndexDatabaseId = process.env.NOTION_PROJECT_INDEX_DATABASE_ID;
const quickScanBlockLimit = Number(process.env.NOTION_QUICK_SCAN_BLOCK_LIMIT || 120);
const fullScanEveryLoops = Number(process.env.NOTION_FULL_SCAN_EVERY_LOOPS || 20);
const syncPreferencesFile = resolvedPaths.syncPreferencesFile;
const skipMemorySync = process.env.SKIP_MEMORY_SYNC === '1';
const memoryHubOwnerProjectId = process.env.MEMORY_HUB_OWNER_PROJECT_ID || 'PRJ-cortex';
const syncLayoutVersion = 'summary-nav-v3';

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

let selfUserIdPromise = null;

function readLoopState() {
  if (!existsSync(statePath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeLoopState(nextState) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(nextState, null, 2), 'utf8');
}

function sha1(text) {
  return createHash('sha1').update(String(text || ''), 'utf8').digest('hex');
}

function syncStamp() {
  return formatDisplayTime();
}

function buildNavigationSummary(reviewPayload, executionMarkdown = '') {
  const rawBoardData = extractProjectBoardData(reviewPayload);
  const boardData = executionMarkdown
    ? mergeBoardDataWithExecutionDoc(rawBoardData, executionMarkdown)
    : rawBoardData;

  return {
    currentTask: boardData.currentTask,
    coreProgress: boardData.currentProgress,
    syncedAt: syncStamp(),
  };
}

async function fetchProjectReview() {
  const response = await fetchWithTimeout(`${cortexBaseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`, {}, 10000);
  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(JSON.stringify(payload));
  }

  return payload;
}

async function fetchProjectCheckpoints() {
  const response = await fetchWithTimeout(
    `${cortexBaseUrl}/checkpoints?project_id=${encodeURIComponent(projectId)}&limit=12`,
    {},
    10000,
  );
  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(JSON.stringify(payload));
  }

  return payload.checkpoints || [];
}

async function ingestComment(comment, routingRules) {
  const routing = resolveCommentOwnerAgent({
    body: comment.body,
    pageId: comment.pageId,
    anchorBlockId: comment.anchorBlockId,
    rules: routingRules,
  });
  const response = await fetchWithTimeout(`${cortexBaseUrl}/webhook/notion-comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      target_type: 'page',
      target_id: comment.pageId,
      page_id: comment.pageId,
      discussion_id: comment.discussionId,
      comment_id: comment.commentId,
      body: comment.body,
      owner_agent: routing.ownerAgent,
      context_quote: comment.contextQuote,
      anchor_block_id: comment.anchorBlockId,
      source_url: comment.sourceUrl,
    }),
  }, 10000);

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(JSON.stringify(payload));
  }

  return payload;
}

async function syncReviewIfNeeded(reviewPayload, checkpoints) {
  const loopState = readLoopState();
  const pageId = process.env.NOTION_REVIEW_PAGE_ID || reviewPayload.project?.notion_review_page_id;
  if (!pageId) {
    return { synced: false, reason: 'missing_review_page_id' };
  }

  const executionMarkdown = existsSync(executionDocPath) ? readFileSync(executionDocPath, 'utf8') : '';
  const compactReviewMarkdown = buildCompactReviewMarkdown({
    project: reviewPayload.project,
    reviewPayload,
    executionMarkdown,
    checkpoints,
  });
  const reviewSyncHash = sha1(
    buildReviewCheckpointKey({
      reviewPayload: {
        ...reviewPayload,
        markdown: compactReviewMarkdown,
      },
      executionMarkdown,
      layoutVersion: syncLayoutVersion,
    }),
  );
  if (reviewSyncHash === loopState.lastReviewHash && pageId === loopState.lastReviewPageId) {
    return { synced: false, reason: 'review_unchanged' };
  }

  const result = await syncReviewMarkdownToNotion({
    apiKey,
    pageId,
    markdown: compactReviewMarkdown,
    baseUrl: notionBaseUrl,
    notionVersion,
  });

  writeLoopState({
    ...loopState,
    lastReviewHash: reviewSyncHash,
    lastReviewPageId: pageId,
  });
  return { synced: true, pageId, ...result };
}

async function syncMemoryIfNeeded(reviewPayload) {
  if (skipMemorySync) {
    return { synced: false, reason: 'memory_sync_skipped' };
  }
  if (projectId !== memoryHubOwnerProjectId) {
    return {
      synced: false,
      reason: 'memory_hub_owned_by_other_project',
      ownerProjectId: memoryHubOwnerProjectId,
    };
  }

  const loopState = readLoopState();
  const pageId = process.env.NOTION_MEMORY_PAGE_ID || reviewPayload.project?.notion_memory_page_id;
  if (!pageId) {
    return { synced: false, reason: 'missing_memory_page_id' };
  }

  const compilation = compileMemoryHub({
    cwd: process.cwd(),
    dbPath: process.env.CORTEX_DB_PATH,
  });
  const markdown =
    projectId === memoryHubOwnerProjectId
      ? readFileSync(compilation.paths.baseMemoryPath, 'utf8')
      : buildProjectMemoryLandingMarkdown({
          project: reviewPayload.project,
          globalMemoryUrl: notionPageUrlFromId(reviewPayload.project?.notion_memory_page_id),
        });
  const memoryHash = sha1(markdown);
  if (memoryHash === loopState.lastMemoryHash && pageId === loopState.lastMemoryPageId) {
    return { synced: false, reason: 'memory_unchanged' };
  }

  const result = await syncReviewMarkdownToNotion({
    apiKey,
    pageId,
    markdown,
    baseUrl: notionBaseUrl,
    notionVersion,
  });

  writeLoopState({
    ...loopState,
    lastMemoryHash: memoryHash,
    lastMemoryPageId: pageId,
  });
  return { synced: true, pageId, memoryStats: compilation.stats, ...result };
}

async function syncExecutionDocIfNeeded(reviewPayload, checkpoints) {
  const loopState = readLoopState();
  const pageId = process.env.NOTION_SCAN_PAGE_ID || reviewPayload.project?.notion_scan_page_id;
  if (!pageId) {
    return { synced: false, reason: 'missing_scan_page_id' };
  }
  if (!existsSync(executionDocPath)) {
    return { synced: false, reason: 'missing_execution_doc_file' };
  }

  const markdown = readFileSync(executionDocPath, 'utf8');
  const compactExecutionMarkdown = buildCompactExecutionMarkdown({
    project: reviewPayload.project,
    reviewPayload,
    executionMarkdown: markdown,
    checkpoints,
  });
  const syncPreferences = loadSyncPreferences(syncPreferencesFile);
  const showSummaryNav = syncPreferences.executionPage?.showSummaryNav !== false;
  const executionDocSyncHash = sha1(
    buildExecutionCheckpointKey({
      markdown: compactExecutionMarkdown,
      showSummaryNav,
      layoutVersion: syncLayoutVersion,
    }),
  );
  if (executionDocSyncHash === loopState.lastExecutionDocHash && pageId === loopState.lastExecutionDocPageId) {
    return { synced: false, reason: 'execution_doc_unchanged' };
  }

  const result = await syncReviewMarkdownToNotion({
    apiKey,
    pageId,
    markdown: compactExecutionMarkdown,
    baseUrl: notionBaseUrl,
    notionVersion,
  });

  writeLoopState({
    ...loopState,
    lastExecutionDocHash: executionDocSyncHash,
    lastExecutionDocPageId: pageId,
  });
  return { synced: true, pageId, ...result };
}

async function syncProjectIndexIfNeeded(reviewPayload) {
  if (!projectIndexDatabaseId) {
    return { synced: false, reason: 'missing_project_index_database_id' };
  }

  const project = reviewPayload.project || {};
  const latestSummary = buildProjectIndexSummary(reviewPayload);
  const rawBoardData = extractProjectBoardData(reviewPayload);
  const boardData =
    existsSync(executionDocPath)
      ? mergeBoardDataWithExecutionDoc(rawBoardData, readFileSync(executionDocPath, 'utf8'))
      : rawBoardData;
  const executionDocUrl = notionPageUrlFromId(project.notion_scan_page_id);
  const reviewPageUrl = notionPageUrlFromId(project.notion_review_page_id);
  const memoryPageUrl = notionPageUrlFromId(project.notion_memory_page_id);
  const hashPayload = JSON.stringify({
    syncLayoutVersion,
    projectId,
    status: project.status,
    rootPageUrl: project.root_page_url,
    reviewPageUrl,
    executionDocUrl,
    memoryPageUrl,
    latestSummary,
    updatedAt: project.updated_at,
    boardData,
  });
  const nextHash = sha1(hashPayload);
  const loopState = readLoopState();
  if (loopState.lastProjectIndexHash === nextHash) {
    return { synced: false, reason: 'project_index_unchanged' };
  }

  const result = await syncProjectIndexRow({
    apiKey,
    databaseId: projectIndexDatabaseId,
    projectId,
    status: project.status,
    rootPageUrl: project.root_page_url,
    reviewPageUrl,
    executionDocUrl,
    memoryPageUrl,
    latestSummary,
    updatedAt: project.updated_at,
    boardData,
    baseUrl: notionBaseUrl,
    notionVersion,
  });

  writeLoopState({
    ...loopState,
    lastProjectIndexHash: nextHash,
  });
  if (result.skipped) {
    return {
      synced: false,
      reason: result.reason || 'same_checkpoint',
      databaseId: projectIndexDatabaseId,
      ...result,
    };
  }

  return { synced: true, databaseId: projectIndexDatabaseId, ...result };
}

async function scanAndIngestComments(reviewPayload) {
  const pageIds = resolveCommentScanPageIds({
    project: reviewPayload.project,
    env: process.env,
  });
  if (pageIds.length === 0) {
    return { scanned: false, reason: 'missing_scan_page_id', ingested: 0, duplicates: 0 };
  }
  const loopState = readLoopState();
  const scanIteration = Number(loopState.commentScanIteration || 0);
  const shouldDeepScan = fullScanEveryLoops <= 1 || scanIteration % fullScanEveryLoops === 0;
  const maxBlocks = shouldDeepScan ? undefined : quickScanBlockLimit;

  if (!selfUserIdPromise) {
    selfUserIdPromise = getCurrentBotUserId({
      apiKey,
      baseUrl: notionBaseUrl,
      notionVersion,
    }).catch(() => null);
  }

  const selfUserId = await selfUserIdPromise;
  const comments = [];
  const seenCommentIds = new Set();
  for (const pageId of pageIds) {
    const pageComments = await scanCommentsUnderPage({
      apiKey,
      pageId,
      selfUserId,
      maxBlocks,
      baseUrl: notionBaseUrl,
      notionVersion,
    });

    for (const comment of pageComments) {
      if (!comment?.commentId || seenCommentIds.has(comment.commentId)) {
        continue;
      }

      seenCommentIds.add(comment.commentId);
      comments.push(comment);
    }
  }
  const routingRules = loadRoutingRules(routingRulesPath);

  let ingested = 0;
  let duplicates = 0;
  for (const comment of comments) {
    const payload = await ingestComment(comment, routingRules);
    if (payload.isDuplicate) {
      duplicates += 1;
    } else {
      ingested += 1;
    }
  }

  writeLoopState({
    ...loopState,
    commentScanIteration: scanIteration + 1,
  });

  return {
    scanned: true,
    pageIds,
    scanMode: shouldDeepScan ? 'deep' : 'quick',
    maxBlocks: maxBlocks ?? null,
    commentsSeen: comments.length,
    ingested,
    duplicates,
  };
}

async function runOnceLoop() {
  const reviewPayload = await fetchProjectReview();
  const checkpoints = await fetchProjectCheckpoints();
  const reviewSync = await syncReviewIfNeeded(reviewPayload, checkpoints);
  const memorySync = await syncMemoryIfNeeded(reviewPayload);
  const executionDocSync = await syncExecutionDocIfNeeded(reviewPayload, checkpoints);
  const projectIndexSync = await syncProjectIndexIfNeeded(reviewPayload);
  const commentScan = await scanAndIngestComments(reviewPayload);

  const summary = {
    ok: true,
    projectId,
    reviewSync,
    memorySync,
    executionDocSync,
    projectIndexSync,
    commentScan,
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (runOnce) {
  try {
    await runOnceLoop();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  console.log(`[notion-loop] polling project ${projectId} every ${intervalMs}ms`);
  while (true) {
    try {
      await runOnceLoop();
    } catch (error) {
      console.error(`[notion-loop] ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
