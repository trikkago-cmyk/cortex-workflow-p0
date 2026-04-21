import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCompactExecutionMarkdown, buildCompactReviewMarkdown, buildProjectMemoryLandingMarkdown } from '../src/notion-compact-pages.js';
import { compileMemoryHub } from '../src/memory-hub.js';
import { createPage, fetchWithTimeout } from '../src/notion-review-sync.js';
import { loadProjectEnv } from '../src/project-env.js';
import { ensureProjectWorkspace } from '../src/project-workspace.js';

loadProjectEnv(process.cwd());

const apiKey = process.env.NOTION_API_KEY;
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const notionBaseUrl = process.env.NOTION_BASE_URL || 'https://api.notion.com';
const notionVersion = process.env.NOTION_VERSION || '2026-03-11';
const explicitProjectId = String(process.env.PROJECT_ID || '').trim();
const memoryHubOwnerProjectId = process.env.MEMORY_HUB_OWNER_PROJECT_ID || 'PRJ-cortex';
const routingRulesPath = process.env.NOTION_ROUTING_RULES_PATH || resolve(process.cwd(), 'docs', 'notion-routing.json');

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

function normalizePageId(value) {
  return String(value || '').replace(/-/g, '');
}

async function getJson(url) {
  const response = await fetchWithTimeout(url, {}, 10000);
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(JSON.stringify(payload));
  }
  return payload;
}

async function archivePage(pageId) {
  const response = await fetchWithTimeout(`${notionBaseUrl}/v1/pages/${normalizePageId(pageId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': notionVersion,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ in_trash: true }),
  }, 15000);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(payload));
  }
  return payload;
}

function readRoutingRules() {
  if (!existsSync(routingRulesPath)) {
    return {
      aliases: {},
      pages: {},
      blocks: {},
      defaults: {},
    };
  }

  return JSON.parse(readFileSync(routingRulesPath, 'utf8'));
}

function writeRoutingRules(rules) {
  writeFileSync(routingRulesPath, JSON.stringify(rules, null, 2), 'utf8');
}

const projectsPayload = await getJson(`${baseUrl}/projects`);
const allProjects = projectsPayload.projects || [];
const projects = explicitProjectId
  ? allProjects.filter((project) => (project.project_id || project.projectId) === explicitProjectId)
  : allProjects.filter((project) => project.notion_parent_page_id || project.notionParentPageId);

const memoryHub = compileMemoryHub({
  cwd: process.cwd(),
  dbPath: process.env.CORTEX_DB_PATH,
});
const globalMemoryMarkdown = readFileSync(memoryHub.paths.baseMemoryPath, 'utf8');

const routingRules = readRoutingRules();
const results = [];

for (const project of projects) {
  const projectId = project.project_id || project.projectId;
  const parentPageId = project.notion_parent_page_id || project.notionParentPageId;
  if (!parentPageId) {
    continue;
  }

  const workspace = ensureProjectWorkspace({
    cwd: process.cwd(),
    projectId,
    projectName: project.name,
  });
  const reviewPayload = await getJson(`${baseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`);
  const checkpointsPayload = await getJson(`${baseUrl}/checkpoints?project_id=${encodeURIComponent(projectId)}&limit=12`);
  const executionMarkdown = readFileSync(workspace.executionDocPath, 'utf8');
  const ownerProject = allProjects.find(
    (candidate) => (candidate.project_id || candidate.projectId) === memoryHubOwnerProjectId,
  );
  const globalMemoryUrl = ownerProject?.notion_memory_page_id || ownerProject?.notionMemoryPageId
    ? `https://www.notion.so/${normalizePageId(ownerProject.notion_memory_page_id || ownerProject.notionMemoryPageId)}`
    : null;

  const reviewPage = await createPage({
    apiKey,
    parentPageId,
    title: `${project.name || projectId} 工作台`,
    markdown: buildCompactReviewMarkdown({
      project: reviewPayload.project,
      reviewPayload,
      executionMarkdown,
      checkpoints: checkpointsPayload.checkpoints || [],
    }),
    icon: '📋',
    baseUrl: notionBaseUrl,
    notionVersion,
  });

  const executionPage = await createPage({
    apiKey,
    parentPageId,
    title: `${project.name || projectId} 执行文档`,
    markdown: buildCompactExecutionMarkdown({
      project: reviewPayload.project,
      reviewPayload,
      executionMarkdown,
      checkpoints: checkpointsPayload.checkpoints || [],
    }),
    icon: '💬',
    baseUrl: notionBaseUrl,
    notionVersion,
  });

  const memoryPage = await createPage({
    apiKey,
    parentPageId,
    title: `${project.name || projectId} 协作记忆`,
    markdown:
      projectId === memoryHubOwnerProjectId
        ? globalMemoryMarkdown
        : buildProjectMemoryLandingMarkdown({
            project,
            globalMemoryUrl,
          }),
    icon: '🧠',
    baseUrl: notionBaseUrl,
    notionVersion,
  });

  await fetchWithTimeout(`${baseUrl}/projects/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      name: project.name || projectId,
      root_page_url: reviewPage.url,
      notion_parent_page_id: parentPageId,
      notion_review_page_id: reviewPage.id,
      notion_memory_page_id: memoryPage.id,
      notion_scan_page_id: executionPage.id,
    }),
  }, 10000);

  const oldPageMappings = [
    project.notion_review_page_id || project.notionReviewPageId,
    project.notion_memory_page_id || project.notionMemoryPageId,
    project.notion_scan_page_id || project.notionScanPageId,
  ].filter(Boolean);
  for (const [pageId, ownerAgent] of Object.entries(routingRules.pages || {})) {
    if (oldPageMappings.includes(pageId)) {
      routingRules.pages[reviewPage.id] = ownerAgent;
      routingRules.pages[memoryPage.id] = ownerAgent;
      routingRules.pages[executionPage.id] = ownerAgent;
    }
  }

  for (const pageId of oldPageMappings) {
    delete routingRules.pages[pageId];
    await archivePage(pageId);
  }

  results.push({
    projectId,
    reviewPage: { id: reviewPage.id, url: reviewPage.url },
    executionPage: { id: executionPage.id, url: executionPage.url },
    memoryPage: { id: memoryPage.id, url: memoryPage.url },
    archivedPageIds: oldPageMappings,
  });
}

writeRoutingRules(routingRules);

console.log(
  JSON.stringify(
    {
      ok: true,
      results,
    },
    null,
    2,
  ),
);
