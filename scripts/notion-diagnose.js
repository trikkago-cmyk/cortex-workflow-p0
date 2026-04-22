import { loadProjectEnv } from '../src/project-env.js';
import { fetchWithTimeout, validateNotionConfig } from '../src/notion-review-sync.js';

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

function notionPageUrlFromId(value) {
  const id = extractNotionPageId(value);
  return id ? `https://www.notion.so/${id}` : null;
}

function richTextToPlainText(richText = []) {
  return richText.map((item) => item?.plain_text || item?.text?.content || '').join('').trim();
}

function pageTitleFromPayload(payload = {}) {
  const properties = payload?.properties || {};
  for (const property of Object.values(properties)) {
    if (property?.type === 'title') {
      return richTextToPlainText(property.title);
    }
  }
  return '';
}

function normalizeErrorPayload(payload, raw) {
  if (payload && typeof payload === 'object') {
    return {
      code: payload.code || null,
      message: payload.message || raw || null,
      integration_id: payload.additional_data?.integration_id || null,
      request_id: payload.request_id || null,
    };
  }

  return {
    code: null,
    message: raw || null,
    integration_id: null,
    request_id: null,
  };
}

async function notionRequest(pathname, { method = 'GET', body } = {}) {
  const config = validateNotionConfig({
    apiKey: process.env.NOTION_API_KEY,
    baseUrl: process.env.NOTION_BASE_URL,
    notionVersion: process.env.NOTION_VERSION,
  });

  const response = await fetchWithTimeout(`${config.baseUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Notion-Version': config.notionVersion,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    raw,
  };
}

async function fetchProjectReview(baseUrl, projectId) {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/project-review?project_id=${encodeURIComponent(projectId)}`);
    const payload = await response.json();
    if (!response.ok || payload?.ok === false) {
      return {
        ok: false,
        error: payload?.error || `project-review failed with ${response.status}`,
      };
    }

    return {
      ok: true,
      project: payload.project || null,
      review: payload.review || null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
    };
  }
}

function addTarget(targets, seenIds, label, value, source) {
  const pageId = extractNotionPageId(value);
  if (!pageId || seenIds.has(pageId)) {
    return;
  }

  seenIds.add(pageId);
  targets.push({
    label,
    source,
    page_id: pageId,
    page_url: notionPageUrlFromId(pageId),
    raw_value: value,
  });
}

const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const cortexBaseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const explicitTarget = process.env.NOTION_TARGET_PAGE_URL || process.env.NOTION_TARGET_PAGE_ID || process.argv[2] || '';

const projectReview = await fetchProjectReview(cortexBaseUrl, projectId);
const project = projectReview.ok ? projectReview.project : null;

const targets = [];
const seenIds = new Set();

addTarget(targets, seenIds, 'explicit_target', explicitTarget, 'cli_or_env');
addTarget(targets, seenIds, 'project_root_page', project?.root_page_url, 'project_review');
addTarget(targets, seenIds, 'project_parent_page', project?.notion_parent_page_id, 'project_review');
addTarget(targets, seenIds, 'project_review_page', project?.notion_review_page_id, 'project_review');
addTarget(targets, seenIds, 'project_memory_page', project?.notion_memory_page_id, 'project_review');
addTarget(targets, seenIds, 'project_execution_page', project?.notion_scan_page_id, 'project_review');

const whoami = await notionRequest('/v1/users/me');

const targetResults = [];
for (const target of targets) {
  const pageResponse = await notionRequest(`/v1/pages/${target.page_id}`);
  targetResults.push({
    ...target,
    accessible: pageResponse.ok,
    status: pageResponse.status,
    title: pageResponse.ok ? pageTitleFromPayload(pageResponse.payload) : null,
    resolved_url: pageResponse.ok ? pageResponse.payload?.url || target.page_url : target.page_url,
    error: pageResponse.ok ? null : normalizeErrorPayload(pageResponse.payload, pageResponse.raw),
  });
}

const result = {
  ok: targetResults.every((target) => target.accessible),
  checked_at: new Date().toISOString(),
  project_id: projectId,
  cortex: {
    base_url: cortexBaseUrl,
    project_review_accessible: projectReview.ok,
    project_review_error: projectReview.ok ? null : projectReview.error,
    project: project
      ? {
          project_id: project.project_id || project.projectId || projectId,
          name: project.name || null,
          root_page_url: project.root_page_url || null,
          notion_parent_page_id: project.notion_parent_page_id || null,
          notion_review_page_id: project.notion_review_page_id || null,
          notion_memory_page_id: project.notion_memory_page_id || null,
          notion_scan_page_id: project.notion_scan_page_id || null,
        }
      : null,
  },
  notion_api: {
    token_configured: Boolean(process.env.NOTION_API_KEY),
    accessible: whoami.ok,
    status: whoami.status,
    actor: whoami.ok
      ? {
          object: whoami.payload?.object || null,
          type: whoami.payload?.type || null,
          name: whoami.payload?.name || null,
          bot_owner_type: whoami.payload?.bot?.owner?.type || null,
          workspace_name: whoami.payload?.bot?.workspace_name || null,
          workspace_limits: whoami.payload?.bot?.workspace_limits || null,
        }
      : null,
    error: whoami.ok ? null : normalizeErrorPayload(whoami.payload, whoami.raw),
  },
  targets: targetResults,
  next_actions:
    targetResults.length === 0
      ? [
          'Pass a Notion page URL or page id to diagnose a target page.',
          'Example: npm run notion:diagnose -- "https://www.notion.so/your-page-id"',
        ]
      : targetResults.every((target) => target.accessible)
        ? ['Token-based Notion API can access every checked page. You can proceed with notion:bootstrap or notion:sync-all.']
        : [
            'Share the target page and its parent workspace tree with the Notion API integration shown in the error message.',
            'If MCP still points to the old workspace, run codex mcp logout notion, log in again, select the new workspace, and restart Codex.',
            'Re-run npm run notion:diagnose with the new page URL before attempting notion:bootstrap.',
          ],
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
