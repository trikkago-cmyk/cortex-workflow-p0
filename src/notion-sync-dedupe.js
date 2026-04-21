import { extractProjectBoardData, mergeBoardDataWithExecutionDoc } from './notion-project-index-sync.js';

const VOLATILE_SYNC_LINE_PATTERNS = [/^\s*-\s*最近同步：.*$/gm, /^\s*最近同步：.*$/gm];

export function normalizeMarkdownForSync(markdown = '') {
  let normalized = String(markdown || '').replace(/\r\n/g, '\n');

  for (const pattern of VOLATILE_SYNC_LINE_PATTERNS) {
    normalized = normalized.replace(pattern, '');
  }

  return normalized
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildReviewCheckpointKey({
  reviewPayload = {},
  executionMarkdown = '',
  layoutVersion = 'summary-nav-v3',
} = {}) {
  const baseBoardData = extractProjectBoardData(reviewPayload);
  const boardData = executionMarkdown
    ? mergeBoardDataWithExecutionDoc(baseBoardData, executionMarkdown)
    : baseBoardData;

  return JSON.stringify({
    layoutVersion,
    boardData,
    markdown: normalizeMarkdownForSync(reviewPayload.markdown),
  });
}

export function buildExecutionCheckpointKey({
  markdown = '',
  showSummaryNav = true,
  layoutVersion = 'summary-nav-v3',
} = {}) {
  return JSON.stringify({
    layoutVersion,
    showSummaryNav,
    markdown: normalizeMarkdownForSync(markdown),
  });
}
