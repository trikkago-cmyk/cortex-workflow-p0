import { existsSync, readFileSync } from 'node:fs';
import {
  fetchWithTimeout,
  syncReviewMarkdownToNotion,
} from '../src/notion-review-sync.js';
import { buildCompactExecutionMarkdown } from '../src/notion-compact-pages.js';
import { extractProjectBoardData, mergeBoardDataWithExecutionDoc } from '../src/notion-project-index-sync.js';
import { loadProjectEnv } from '../src/project-env.js';
import { loadSyncPreferences } from '../src/notion-sync-preferences.js';
import { ensureProjectWorkspace, resolveProjectWorkspacePaths } from '../src/project-workspace.js';

loadProjectEnv(process.cwd());

const apiKey = process.env.NOTION_API_KEY;
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const notionBaseUrl = process.env.NOTION_BASE_URL;
const notionVersion = process.env.NOTION_VERSION;
const workspace = ensureProjectWorkspace({
  cwd: process.cwd(),
  projectId,
  projectName: process.env.PROJECT_NAME,
});
const resolvedPaths = resolveProjectWorkspacePaths({
  cwd: process.cwd(),
  projectId,
});
const executionDocPath = workspace.executionDocPath;
const syncPreferencesFile = resolvedPaths.syncPreferencesFile;

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

if (!existsSync(executionDocPath)) {
  console.error(`Execution doc file not found: ${executionDocPath}`);
  process.exit(1);
}

const reviewResponse = await fetchWithTimeout(`${baseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`, {}, 10000);
const reviewPayload = await reviewResponse.json();

if (!reviewResponse.ok || reviewPayload.ok === false) {
  console.error(JSON.stringify(reviewPayload, null, 2));
  process.exit(1);
}

const pageId = process.env.NOTION_SCAN_PAGE_ID || reviewPayload.project?.notion_scan_page_id;
if (!pageId) {
  console.error('NOTION_SCAN_PAGE_ID is required, or configure project.notion_scan_page_id via /projects/upsert');
  process.exit(1);
}

const markdown = readFileSync(executionDocPath, 'utf8');
const boardData = mergeBoardDataWithExecutionDoc(extractProjectBoardData(reviewPayload), markdown);
const checkpointsResponse = await fetchWithTimeout(`${baseUrl}/checkpoints?project_id=${encodeURIComponent(projectId)}&limit=12`, {}, 10000);
const checkpointsPayload = await checkpointsResponse.json();
if (!checkpointsResponse.ok || checkpointsPayload.ok === false) {
  console.error(JSON.stringify(checkpointsPayload, null, 2));
  process.exit(1);
}
const syncPreferences = loadSyncPreferences(syncPreferencesFile);
const showSummaryNav = syncPreferences.executionPage?.showSummaryNav !== false;
const result = await syncReviewMarkdownToNotion({
  apiKey,
  pageId,
  markdown: buildCompactExecutionMarkdown({
    project: reviewPayload.project,
    reviewPayload,
    executionMarkdown: markdown,
    checkpoints: checkpointsPayload.checkpoints || [],
  }),
  baseUrl: notionBaseUrl,
  notionVersion,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      projectId,
      pageId,
      executionDocPath,
      showSummaryNav,
      deletedBlocks: result.deleted,
      appendedBlocks: result.appended,
    },
    null,
    2,
  ),
);

process.exit(0);
