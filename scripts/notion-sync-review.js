import { existsSync, readFileSync } from 'node:fs';
import {
  fetchWithTimeout,
  resolveProjectSyncPreserveBlockTypes,
  syncReviewMarkdownToNotion,
} from '../src/notion-review-sync.js';
import { buildCompactReviewMarkdown } from '../src/notion-compact-pages.js';
import { extractProjectBoardData, mergeBoardDataWithExecutionDoc } from '../src/notion-project-index-sync.js';
import { loadProjectEnv } from '../src/project-env.js';
import { ensureProjectWorkspace } from '../src/project-workspace.js';

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
const executionDocPath = workspace.executionDocPath;

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

const reviewResponse = await fetchWithTimeout(`${baseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`, {}, 10000);
const reviewPayload = await reviewResponse.json();

if (!reviewResponse.ok || reviewPayload.ok === false) {
  console.error(JSON.stringify(reviewPayload, null, 2));
  process.exit(1);
}

const pageId = process.env.NOTION_REVIEW_PAGE_ID || reviewPayload.project?.notion_review_page_id;

if (!pageId) {
  console.error('NOTION_REVIEW_PAGE_ID is required, or configure project.notion_review_page_id via /projects/upsert');
  process.exit(1);
}

const boardData =
  existsSync(executionDocPath)
    ? mergeBoardDataWithExecutionDoc(extractProjectBoardData(reviewPayload), readFileSync(executionDocPath, 'utf8'))
    : extractProjectBoardData(reviewPayload);
const checkpointsResponse = await fetchWithTimeout(`${baseUrl}/checkpoints?project_id=${encodeURIComponent(projectId)}&limit=12`, {}, 10000);
const checkpointsPayload = await checkpointsResponse.json();
if (!checkpointsResponse.ok || checkpointsPayload.ok === false) {
  console.error(JSON.stringify(checkpointsPayload, null, 2));
  process.exit(1);
}
const result = await syncReviewMarkdownToNotion({
  apiKey,
  pageId,
  markdown: buildCompactReviewMarkdown({
    project: reviewPayload.project,
    reviewPayload,
    executionMarkdown: existsSync(executionDocPath) ? readFileSync(executionDocPath, 'utf8') : '',
    checkpoints: checkpointsPayload.checkpoints || [],
  }),
  preserveBlockTypes: resolveProjectSyncPreserveBlockTypes({
    pageId,
    project: reviewPayload.project,
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
      deletedBlocks: result.deleted,
      appendedBlocks: result.appended,
    },
    null,
    2,
  ),
);

process.exit(0);
