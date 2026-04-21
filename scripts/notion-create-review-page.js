import { createPage } from '../src/notion-review-sync.js';

const apiKey = process.env.NOTION_API_KEY;
const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const pageTitle = process.env.PAGE_TITLE || `${projectId} Review Panel`;
const notionBaseUrl = process.env.NOTION_BASE_URL;
const notionVersion = process.env.NOTION_VERSION;

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

const parentPageId = process.env.NOTION_PARENT_PAGE_ID || reviewPayload.project?.notion_parent_page_id;

if (!parentPageId) {
  console.error('NOTION_PARENT_PAGE_ID is required, or configure project.notion_parent_page_id via /projects/upsert');
  process.exit(1);
}

const page = await createPage({
  apiKey,
  parentPageId,
  title: pageTitle,
  markdown: reviewPayload.markdown,
  baseUrl: notionBaseUrl,
  notionVersion,
});

const upsertResponse = await fetch(`${baseUrl}/projects/upsert`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: projectId,
    notion_parent_page_id: parentPageId,
    notion_review_page_id: page.id,
  }),
});

const upsertPayload = await upsertResponse.json();

if (!upsertResponse.ok || upsertPayload.ok === false) {
  console.error(JSON.stringify(upsertPayload, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      projectId,
      pageId: page.id,
      url: page.url,
      title: pageTitle,
    },
    null,
    2,
  ),
);
