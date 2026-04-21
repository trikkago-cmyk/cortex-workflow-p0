function normalizePageId(value) {
  const raw = String(value || '').trim();
  return raw || null;
}

export function resolveCommentScanPageIds({ project = {}, env = process.env } = {}) {
  const candidates = [
    env.NOTION_SCAN_PAGE_ID,
    env.NOTION_REVIEW_PAGE_ID,
    project.notion_scan_page_id,
    project.notionScanPageId,
    project.notion_review_page_id,
    project.notionReviewPageId,
  ];

  const seen = new Set();
  const pageIds = [];

  for (const candidate of candidates) {
    const pageId = normalizePageId(candidate);
    if (!pageId || seen.has(pageId)) {
      continue;
    }

    seen.add(pageId);
    pageIds.push(pageId);
  }

  return pageIds;
}
