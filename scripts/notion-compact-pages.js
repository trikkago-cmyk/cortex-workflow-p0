import { readFileSync } from 'node:fs';
import { buildCompactExecutionMarkdown, buildCompactReviewMarkdown, buildProjectMemoryLandingMarkdown } from '../src/notion-compact-pages.js';
import { compileMemoryHub } from '../src/memory-hub.js';
import { fetchWithTimeout, syncReviewMarkdownToNotion } from '../src/notion-review-sync.js';
import { loadProjectEnv } from '../src/project-env.js';
import { ensureProjectWorkspace } from '../src/project-workspace.js';

loadProjectEnv(process.cwd());

const apiKey = process.env.NOTION_API_KEY;
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const notionBaseUrl = process.env.NOTION_BASE_URL;
const notionVersion = process.env.NOTION_VERSION;
const explicitProjectId = String(process.env.PROJECT_ID || '').trim();
const memoryHubOwnerProjectId = process.env.MEMORY_HUB_OWNER_PROJECT_ID || 'PRJ-cortex';

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

async function getJson(url) {
  const response = await fetchWithTimeout(url, {}, 10000);
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(JSON.stringify(payload));
  }
  return payload;
}

const projectsPayload = await getJson(`${baseUrl}/projects`);
const allProjects = projectsPayload.projects || [];
const projects = explicitProjectId
  ? allProjects.filter((project) => project.project_id === explicitProjectId || project.projectId === explicitProjectId)
  : allProjects.filter((project) => project.notion_review_page_id || project.notion_scan_page_id || project.notion_memory_page_id);

const memoryHub = compileMemoryHub({
  cwd: process.cwd(),
  dbPath: process.env.CORTEX_DB_PATH,
});
const globalMemoryMarkdown = readFileSync(memoryHub.paths.baseMemoryPath, 'utf8');
const ownerProject = allProjects.find(
  (project) => (project.project_id || project.projectId) === memoryHubOwnerProjectId,
);
const globalMemoryUrl = ownerProject?.notion_memory_page_id
  ? `https://www.notion.so/${String(ownerProject.notion_memory_page_id).replace(/-/g, '')}`
  : null;

const results = [];

for (const project of projects) {
  const projectId = project.project_id || project.projectId;
  const workspace = ensureProjectWorkspace({
    cwd: process.cwd(),
    projectId,
    projectName: project.name,
  });
  const reviewPayload = await getJson(`${baseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`);
  const checkpointsPayload = await getJson(`${baseUrl}/checkpoints?project_id=${encodeURIComponent(projectId)}&limit=12`);
  const executionMarkdown = readFileSync(workspace.executionDocPath, 'utf8');

  const projectResult = {
    projectId,
    review: null,
    execution: null,
    memory: null,
  };

  if (project.notion_review_page_id || project.notionReviewPageId) {
    const reviewResult = await syncReviewMarkdownToNotion({
      apiKey,
      pageId: project.notion_review_page_id || project.notionReviewPageId,
      markdown: buildCompactReviewMarkdown({
        project: reviewPayload.project,
        reviewPayload,
        executionMarkdown,
        checkpoints: checkpointsPayload.checkpoints || [],
      }),
      baseUrl: notionBaseUrl,
      notionVersion,
    });
    projectResult.review = reviewResult;
  }

  if (project.notion_scan_page_id || project.notionScanPageId) {
    const executionResult = await syncReviewMarkdownToNotion({
      apiKey,
      pageId: project.notion_scan_page_id || project.notionScanPageId,
      markdown: buildCompactExecutionMarkdown({
        project: reviewPayload.project,
        reviewPayload,
        executionMarkdown,
        checkpoints: checkpointsPayload.checkpoints || [],
      }),
      baseUrl: notionBaseUrl,
      notionVersion,
    });
    projectResult.execution = executionResult;
  }

  if (project.notion_memory_page_id || project.notionMemoryPageId) {
    const memoryResult = await syncReviewMarkdownToNotion({
      apiKey,
      pageId: project.notion_memory_page_id || project.notionMemoryPageId,
      markdown:
        projectId === memoryHubOwnerProjectId
          ? globalMemoryMarkdown
          : buildProjectMemoryLandingMarkdown({
              project,
              globalMemoryUrl,
            }),
      baseUrl: notionBaseUrl,
      notionVersion,
    });
    projectResult.memory = memoryResult;
  }

  results.push(projectResult);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      projects: results,
      memoryHub: {
        paths: memoryHub.paths,
        stats: memoryHub.stats,
      },
    },
    null,
    2,
  ),
);
