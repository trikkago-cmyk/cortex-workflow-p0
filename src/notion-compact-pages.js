import { extractProjectBoardData, mergeBoardDataWithExecutionDoc, notionPageUrlFromId } from './notion-project-index-sync.js';
import { formatDisplayTime } from './notion-review-sync.js';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(value, maxLength = 120) {
  const normalized = compact(value);
  if (!normalized) {
    return '暂无';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function formatCheckpoint(checkpoint) {
  const createdAt = checkpoint.createdAt || checkpoint.created_at;
  const lines = [
    `${createdAt ? `${formatDisplayTime(createdAt)} · ` : ''}${summarize(checkpoint.title, 72)}`,
    summarize(checkpoint.summary, 120),
  ];
  if (checkpoint.nextStep || checkpoint.next_step) {
    lines.push(`下一步：${summarize(checkpoint.nextStep || checkpoint.next_step, 100)}`);
  }
  return lines.join('｜');
}

function dedupeCheckpoints(checkpoints = [], limit = 4) {
  const seen = new Set();
  const result = [];

  for (const checkpoint of checkpoints) {
    const key = [
      compact(checkpoint.title),
      compact(checkpoint.summary),
      compact(checkpoint.nextStep || checkpoint.next_step),
      compact(checkpoint.stage),
      compact(checkpoint.status),
    ].join('|');
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(checkpoint);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function parseLevel2Sections(markdown = '') {
  const lines = String(markdown || '').split('\n');
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith('## ')) {
      if (current) {
        sections.push(current);
      }
      current = {
        heading: line.slice(3).trim(),
        lines: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }
    current.lines.push(line);
  }

  if (current) {
    sections.push(current);
  }

  return sections;
}

function compactSection(section, { maxLines = 8 } = {}) {
  const meaningfulLines = (section.lines || [])
    .map((line) => line.trim())
    .filter(Boolean);
  const keptLines = meaningfulLines.slice(0, maxLines);
  if (meaningfulLines.length > maxLines) {
    keptLines.push(`- 其余 ${meaningfulLines.length - maxLines} 行已折叠`);
  }

  return [`## ${section.heading}`, '', ...(keptLines.length > 0 ? keptLines : ['- 暂无。']), ''].join('\n');
}

function buildBoardData(reviewPayload = {}, executionMarkdown = '') {
  const rawBoardData = extractProjectBoardData(reviewPayload);
  return executionMarkdown ? mergeBoardDataWithExecutionDoc(rawBoardData, executionMarkdown) : rawBoardData;
}

function buildDecisionStatus(summary = {}) {
  const redCount = (summary.red_decisions || summary.redDecisions || []).length;
  const yellowCount = (summary.yellow_decisions || summary.yellowDecisions || []).length;
  const greenNotes = summary.green_notes || summary.greenNotes || [];
  const firstGreen = greenNotes[0]?.question || greenNotes[0]?.summary || '无';
  return `🔴 ${redCount} / 🟡 ${yellowCount} / 🟢 ${summarize(firstGreen, 72)}`;
}

function buildEntryLinks(project = {}) {
  const reviewPageUrl = notionPageUrlFromId(project.notion_review_page_id || project.notionReviewPageId);
  const executionPageUrl = notionPageUrlFromId(project.notion_scan_page_id || project.notionScanPageId);
  const memoryPageUrl = notionPageUrlFromId(project.notion_memory_page_id || project.notionMemoryPageId);
  return [reviewPageUrl ? `工作台：${reviewPageUrl}` : null, executionPageUrl ? `执行文档：${executionPageUrl}` : null, memoryPageUrl ? `记忆页：${memoryPageUrl}` : null]
    .filter(Boolean)
    .join('；');
}

export function buildCompactReviewMarkdown({
  project = {},
  reviewPayload = {},
  executionMarkdown = '',
  checkpoints = [],
} = {}) {
  const summary = reviewPayload.summary || {};
  const boardData = buildBoardData(reviewPayload, executionMarkdown);
  const compactCheckpoints = dedupeCheckpoints(checkpoints);
  const latestBrief = summary.latest_brief || summary.latestBrief;
  const latestComment = (summary.notion_commands || summary.notionCommands || [])[0];
  const entryLinks = buildEntryLinks(project);

  return [
    `# ${(project.name || project.project_id || project.projectId || 'Project').trim()} 工作台`,
    '',
    `- 当前任务：${summarize(boardData.currentTask, 100)}`,
    `- 核心进展：${summarize(boardData.currentProgress, 140)}`,
    `- 决策状态：${buildDecisionStatus(summary)}`,
    `- 下一步：${summarize(boardData.nextStep || (summary.next_steps || summary.nextSteps || [])[0], 100)}`,
    entryLinks ? `- 入口：${entryLinks}` : null,
    '',
    '## 关键 Checkpoints',
    '',
    ...(compactCheckpoints.length > 0 ? compactCheckpoints.map((checkpoint) => `- ${formatCheckpoint(checkpoint)}`) : ['- 暂无。']),
    '',
    '## 最近动作',
    '',
    latestBrief ? `- 任务简报：${summarize(latestBrief.title || latestBrief.what, 120)}` : '- 任务简报：暂无。',
    latestComment ? `- 最近评论：${summarize(latestComment.instruction || latestComment.context_quote || latestComment.contextQuote, 120)}` : '- 最近评论：暂无。',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildCompactExecutionMarkdown({
  project = {},
  reviewPayload = {},
  executionMarkdown = '',
  checkpoints = [],
  maxSections = 4,
} = {}) {
  const boardData = buildBoardData(reviewPayload, executionMarkdown);
  const compactCheckpoints = dedupeCheckpoints(checkpoints, 5);
  const sections = parseLevel2Sections(executionMarkdown).slice(0, maxSections);

  return [
    `# ${(project.name || project.project_id || project.projectId || 'Project').trim()} 执行文档`,
    '',
    `- 当前任务：${summarize(boardData.currentTask, 100)}`,
    `- 当前进展：${summarize(boardData.currentProgress, 140)}`,
    `- 决策状态：${summarize(boardData.riskStatus, 40)}｜${summarize(boardData.riskPoint, 90)}`,
    `- 下一步：${summarize(boardData.nextStep, 100)}`,
    '- 评论方式：直接对具体段落或条目划词评论。',
    '',
    '## 关键 Checkpoints',
    '',
    ...(compactCheckpoints.length > 0 ? compactCheckpoints.map((checkpoint) => `- ${formatCheckpoint(checkpoint)}`) : ['- 暂无。']),
    '',
    '## 最近执行记录',
    '',
    ...(sections.length > 0 ? sections.map((section) => compactSection(section)).join('\n').split('\n') : ['- 暂无。']),
  ].join('\n');
}

export function buildProjectMemoryLandingMarkdown({ project = {}, globalMemoryUrl = null } = {}) {
  return [
    `# ${(project.name || project.project_id || project.projectId || 'Project').trim()} Memory Scope`,
    '',
    '- 本页不再承载独立的长期 memory 正文。',
    '- Base Memory / Knowledge 已统一收敛到全局 Cortex Memory Hub。',
    '- 当前项目只贡献 Timeline 事实和 Candidate Memory，由全局 memory pipeline 汇总治理。',
    globalMemoryUrl ? `- 全局 Memory Hub：${globalMemoryUrl}` : null,
    '',
    '## 说明',
    '',
    '- 需要 review 的 memory 看全局 candidate memory 队列。',
    '- 需要项目事实时，看本项目执行文档与 checkpoint。',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}
