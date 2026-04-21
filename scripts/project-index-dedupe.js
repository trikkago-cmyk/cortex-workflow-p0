import { dedupeProjectIndexRows } from '../src/notion-project-index-sync.js';

const apiKey = process.env.NOTION_API_KEY;
const databaseId = process.env.NOTION_PROJECT_INDEX_DATABASE_ID;
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const notionBaseUrl = process.env.NOTION_BASE_URL;
const notionVersion = process.env.NOTION_VERSION;

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

if (!databaseId) {
  console.error('NOTION_PROJECT_INDEX_DATABASE_ID is required');
  process.exit(1);
}

const result = await dedupeProjectIndexRows({
  apiKey,
  databaseId,
  projectId,
  baseUrl: notionBaseUrl,
  notionVersion,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      projectId,
      databaseId,
      ...result,
    },
    null,
    2,
  ),
);
