import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd());

const baseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';

const payload = {
  project_id: process.env.PROJECT_ID || 'PRJ-cortex',
};

const mappings = [
  ['PROJECT_NAME', 'name'],
  ['PROJECT_STATUS', 'status'],
  ['ROOT_PAGE_URL', 'root_page_url'],
  ['REVIEW_WINDOW_NOTE', 'review_window_note'],
  ['NOTIFICATION_CHANNEL', 'notification_channel'],
  ['NOTIFICATION_TARGET', 'notification_target'],
  ['NOTION_REVIEW_PAGE_ID', 'notion_review_page_id'],
  ['NOTION_PARENT_PAGE_ID', 'notion_parent_page_id'],
  ['NOTION_MEMORY_PAGE_ID', 'notion_memory_page_id'],
  ['NOTION_SCAN_PAGE_ID', 'notion_scan_page_id'],
];

for (const [envName, field] of mappings) {
  if (process.env[envName]) {
    payload[field] = process.env[envName];
  }
}

const response = await fetch(`${baseUrl}/projects/upsert`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));

if (!response.ok || body.ok === false) {
  process.exitCode = 1;
}
