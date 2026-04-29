import { readFileSync } from 'node:fs';
import { compileMemoryHub } from '../src/memory-hub.js';
import { resolveProjectSyncPreserveBlockTypes, syncReviewMarkdownToNotion } from '../src/notion-review-sync.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd());

const apiKey = process.env.NOTION_API_KEY;
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const notionBaseUrl = process.env.NOTION_BASE_URL;
const notionVersion = process.env.NOTION_VERSION;
const memoryHubOwnerProjectId = process.env.MEMORY_HUB_OWNER_PROJECT_ID || 'PRJ-cortex';

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

const reviewResponse = await fetch(`${baseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`);
const reviewPayload = await reviewResponse.json();

if (!reviewResponse.ok || reviewPayload.ok === false) {
  console.error(JSON.stringify(reviewPayload, null, 2));
  process.exit(1);
}

const pageId = process.env.NOTION_MEMORY_PAGE_ID || reviewPayload.project?.notion_memory_page_id;
if (!pageId) {
  console.error('NOTION_MEMORY_PAGE_ID is required, or configure project.notion_memory_page_id via /projects/upsert');
  process.exit(1);
}

const compilation = compileMemoryHub({
  cwd: process.cwd(),
  dbPath: process.env.CORTEX_DB_PATH,
});
const markdown = readFileSync(
  projectId === memoryHubOwnerProjectId ? compilation.paths.baseMemoryPath : compilation.paths.indexPath,
  'utf8',
);
const result = await syncReviewMarkdownToNotion({
  apiKey,
  pageId,
  markdown,
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
      memoryHubOwnerProjectId,
      globalMemorySync: projectId === memoryHubOwnerProjectId,
      pageId,
      memoryPath: projectId === memoryHubOwnerProjectId ? compilation.paths.baseMemoryPath : compilation.paths.indexPath,
      memoryHubPaths: compilation.paths,
      memoryStats: compilation.stats,
      deletedBlocks: result.deleted,
      appendedBlocks: result.appended,
    },
    null,
    2,
  ),
);
