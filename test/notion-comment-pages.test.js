import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommentScanPageIds } from '../src/notion-comment-pages.js';

test('resolveCommentScanPageIds watches both execution and review pages', () => {
  const pageIds = resolveCommentScanPageIds({
    project: {
      notion_scan_page_id: 'scan-page-001',
      notion_review_page_id: 'review-page-001',
    },
    env: {},
  });

  assert.deepEqual(pageIds, ['scan-page-001', 'review-page-001']);
});

test('resolveCommentScanPageIds preserves env overrides and dedupes repeated ids', () => {
  const pageIds = resolveCommentScanPageIds({
    project: {
      notion_scan_page_id: 'scan-page-001',
      notion_review_page_id: 'review-page-001',
    },
    env: {
      NOTION_SCAN_PAGE_ID: 'scan-page-001',
      NOTION_REVIEW_PAGE_ID: 'review-page-001',
    },
  });

  assert.deepEqual(pageIds, ['scan-page-001', 'review-page-001']);
});
