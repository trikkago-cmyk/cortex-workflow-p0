import { existsSync, readFileSync } from 'node:fs';
import {
  buildProjectIndexSummary,
  extractProjectBoardData,
  mergeBoardDataWithExecutionDoc,
  notionPageUrlFromId,
  syncProjectIndexRow,
} from '../src/notion-project-index-sync.js';
import { fetchWithTimeout } from '../src/notion-review-sync.js';
import { loadProjectEnv } from '../src/project-env.js';
import { ensureProjectWorkspace } from '../src/project-workspace.js';

loadProjectEnv(process.cwd());

const apiKey = process.env.NOTION_API_KEY;
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const notionBaseUrl = process.env.NOTION_BASE_URL;
const notionVersion = process.env.NOTION_VERSION;
const databaseId = process.env.NOTION_PROJECT_INDEX_DATABASE_ID;
const workspace = ensureProjectWorkspace({
  cwd: process.cwd(),
  projectId,
  projectName: process.env.PROJECT_NAME,
});
const executionDocPath = workspace.executionDocPath;

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

if (!databaseId) {
  console.error('NOTION_PROJECT_INDEX_DATABASE_ID is required');
  process.exit(1);
}

const reviewResponse = await fetchWithTimeout(`${baseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`, {}, 10000);
const reviewPayload = await reviewResponse.json();

if (!reviewResponse.ok || reviewPayload.ok === false) {
  console.error(JSON.stringify(reviewPayload, null, 2));
  process.exit(1);
}

const project = reviewPayload.project || {};
const latestSummary = buildProjectIndexSummary(reviewPayload);
const rawBoardData = extractProjectBoardData(reviewPayload);
const boardData =
  existsSync(executionDocPath)
    ? mergeBoardDataWithExecutionDoc(rawBoardData, readFileSync(executionDocPath, 'utf8'))
    : rawBoardData;
const result = await syncProjectIndexRow({
  apiKey,
  databaseId,
  projectId,
  status: project.status,
  rootPageUrl: project.root_page_url,
  reviewPageUrl: notionPageUrlFromId(project.notion_review_page_id),
  executionDocUrl: notionPageUrlFromId(project.notion_scan_page_id),
  memoryPageUrl: notionPageUrlFromId(project.notion_memory_page_id),
  latestSummary,
  updatedAt: project.updated_at,
  boardData,
  baseUrl: notionBaseUrl,
  notionVersion,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      projectId,
      databaseId,
      latestSummary,
      boardData,
      ...result,
    },
    null,
    2,
  ),
);

process.exit(0);
