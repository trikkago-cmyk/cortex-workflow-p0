import {
  DEFAULT_NOTION_BASE_URL,
  DEFAULT_NOTION_VERSION,
  appendMarkdownEntryToNotion,
  buildAppendEntryMarkdown,
  formatDisplayTime,
} from './notion-review-sync.js';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizePayloadLines(payload = {}) {
  const lines = [];
  const summary = compact(payload.summary);
  if (summary) {
    lines.push(`- 摘要：${summary}`);
  }

  const details = compact(payload.details);
  if (details) {
    lines.push(`- 详情：${details}`);
  }

  const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts.filter(Boolean) : [];
  if (artifacts.length > 0) {
    lines.push('### 产物');
    for (const artifact of artifacts.slice(0, 10)) {
      lines.push(`- ${artifact}`);
    }
  }

  const error = payload.error && typeof payload.error === 'object' ? payload.error : null;
  if (error) {
    lines.push('### 错误');
    if (compact(error.code)) {
      lines.push(`- code：${compact(error.code)}`);
    }
    if (compact(error.message)) {
      lines.push(`- message：${compact(error.message)}`);
    }
    if (error.retryable !== undefined) {
      lines.push(`- retryable：${String(Boolean(error.retryable))}`);
    }
  }

  return lines;
}

export async function appendReceiptLog({
  apiKey,
  project,
  receipt,
  command,
  baseUrl = DEFAULT_NOTION_BASE_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
}) {
  const pageId = project?.notionReviewPageId || project?.notionScanPageId || null;
  if (!apiKey || !pageId || !receipt) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing_config',
    };
  }

  const metadata = [
    `命令：${receipt.commandId}`,
    `状态：${receipt.status}`,
    `类型：${receipt.receiptType}`,
    `信号：${receipt.signal || 'none'}`,
    `渠道：${receipt.channel} -> ${receipt.target}`,
    `时间：${formatDisplayTime(new Date(Number(receipt.createdAt || 0) * 1000))}`,
  ];

  const payloadLines = summarizePayloadLines(receipt.payload || {});
  const markdown = buildAppendEntryMarkdown({
    entryTitle: `🔄 Agent 回执 · ${receipt.receiptType}`,
    metadata,
    markdown: [
      compact(command?.instruction) ? `### 关联任务\n- ${compact(command.instruction)}` : null,
      payloadLines.length > 0 ? payloadLines.join('\n') : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
  });

  const result = await appendMarkdownEntryToNotion({
    apiKey,
    pageId,
    markdown,
    baseUrl,
    notionVersion,
  });

  return {
    ok: true,
    pageId,
    appended: result.appended,
  };
}
