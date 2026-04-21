import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createPage } from '../src/notion-review-sync.js';
import { loadProjectEnv } from '../src/project-env.js';
import { ensureProjectWorkspace, resolveProjectWorkspacePaths } from '../src/project-workspace.js';

loadProjectEnv(process.cwd());

function extractNotionPageId(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const direct = raw.replace(/-/g, '');
  if (/^[0-9a-fA-F]{32}$/.test(direct)) {
    return direct;
  }

  const urlMatch = raw.match(/([0-9a-fA-F]{32})(?:\?|$)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  return null;
}

const apiKey = process.env.NOTION_API_KEY;
const cortexBaseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const projectName = process.env.PROJECT_NAME || '';
const notionBaseUrl = process.env.NOTION_BASE_URL;
const notionVersion = process.env.NOTION_VERSION;
const parentInput = process.env.NOTION_PARENT_PAGE_ID || process.env.NOTION_PARENT_PAGE_URL || process.argv[2];
const projectOwnerAgent = process.env.PROJECT_OWNER_AGENT || '';
const routingRulesPath = process.env.NOTION_ROUTING_RULES_PATH || resolve(process.cwd(), 'docs', 'notion-routing.json');
const workspace = ensureProjectWorkspace({
  cwd: process.cwd(),
  projectId,
  projectName,
});
const resolvedPaths = resolveProjectWorkspacePaths({
  cwd: process.cwd(),
  projectId,
});
const memoryPath = workspace.memoryPath;
const executionDocPath = workspace.executionDocPath;
const statePath = resolvedPaths.statePath;
const projectLabel = projectName || projectId;
const reviewTitle = process.env.REVIEW_PAGE_TITLE || `${projectLabel} 工作台`;
const memoryTitle = process.env.MEMORY_PAGE_TITLE || `${projectLabel} 协作记忆`;
const scanTitle = process.env.SCAN_PAGE_TITLE || `${projectLabel} 执行文档`;

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

function sha1(text) {
  return createHash('sha1').update(String(text || ''), 'utf8').digest('hex');
}

function updateRoutingRules(pageIds = []) {
  if (!projectOwnerAgent) {
    return;
  }

  let rules = {
    aliases: {},
    pages: {},
    blocks: {},
    defaults: {},
  };

  if (existsSync(routingRulesPath)) {
    try {
      rules = JSON.parse(readFileSync(routingRulesPath, 'utf8'));
    } catch {}
  }

  const nextRules = {
    aliases: rules.aliases || {},
    pages: {
      ...(rules.pages || {}),
    },
    blocks: rules.blocks || {},
    defaults: rules.defaults || {},
  };

  for (const pageId of pageIds.filter(Boolean)) {
    nextRules.pages[pageId] = projectOwnerAgent;
  }

  mkdirSync(dirname(routingRulesPath), { recursive: true });
  writeFileSync(routingRulesPath, JSON.stringify(nextRules, null, 2), 'utf8');
}

const parentPageId = extractNotionPageId(parentInput);
if (!parentPageId) {
  console.error('A Notion parent page URL or page id is required');
  process.exit(1);
}

const reviewResponse = await fetch(`${cortexBaseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`);
const reviewPayload = await reviewResponse.json();

if (!reviewResponse.ok || reviewPayload.ok === false) {
  console.error(JSON.stringify(reviewPayload, null, 2));
  process.exit(1);
}

const reviewMarkdown = reviewPayload.markdown;
const memoryMarkdown = existsSync(memoryPath)
  ? readFileSync(memoryPath, 'utf8')
  : `# ${projectId} Collaboration Memory\n\n- Memory file missing locally: ${memoryPath}`;
const scanMarkdown = existsSync(executionDocPath)
  ? readFileSync(executionDocPath, 'utf8')
  : `# ${projectLabel} 执行文档\n\n- 当前任务：待同步\n- 核心进展：待同步\n- 最近同步：未同步（上海时间）\n`;

const reviewPage = await createPage({
  apiKey,
  parentPageId,
  title: reviewTitle,
  markdown: reviewMarkdown,
  icon: '📋',
  baseUrl: notionBaseUrl,
  notionVersion,
});

const memoryPage = await createPage({
  apiKey,
  parentPageId,
  title: memoryTitle,
  markdown: memoryMarkdown,
  icon: '🧠',
  baseUrl: notionBaseUrl,
  notionVersion,
});

const scanPage = await createPage({
  apiKey,
  parentPageId,
  title: scanTitle,
  markdown: scanMarkdown,
  icon: '💬',
  baseUrl: notionBaseUrl,
  notionVersion,
});

const upsertResponse = await fetch(`${cortexBaseUrl}/projects/upsert`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: projectId,
    name: projectName || projectId,
    root_page_url: reviewPage.url,
    notion_parent_page_id: parentPageId,
    notion_review_page_id: reviewPage.id,
    notion_memory_page_id: memoryPage.id,
    notion_scan_page_id: scanPage.id,
  }),
});

const upsertPayload = await upsertResponse.json();
if (!upsertResponse.ok || upsertPayload.ok === false) {
  console.error(JSON.stringify(upsertPayload, null, 2));
  process.exit(1);
}

updateRoutingRules([reviewPage.id, memoryPage.id, scanPage.id]);

mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(
  statePath,
  JSON.stringify(
    {
      lastReviewHash: sha1(reviewMarkdown),
      lastReviewPageId: reviewPage.id,
      lastMemoryHash: sha1(memoryMarkdown),
      lastMemoryPageId: memoryPage.id,
    },
    null,
    2,
  ),
  'utf8',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      projectId,
      parentPageId,
      reviewPage: {
        id: reviewPage.id,
        url: reviewPage.url,
      },
      memoryPage: {
        id: memoryPage.id,
        url: memoryPage.url,
      },
      scanPage: {
        id: scanPage.id,
        url: scanPage.url,
      },
    },
    null,
    2,
  ),
);
