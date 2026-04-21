import { loadRoutingRules, resolveCommentOwnerAgent } from '../src/comment-routing.js';
import { replyToDiscussion } from '../src/notion-agent-sync.js';
import { fetchWithTimeout, validateNotionConfig } from '../src/notion-review-sync.js';
import { loadProjectEnv } from '../src/project-env.js';
import { resolve } from 'node:path';

loadProjectEnv(process.cwd());

const apiKey = process.env.NOTION_API_KEY;
const cortexBaseUrl = process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = process.env.PROJECT_ID || 'PRJ-cortex';
const agentName = process.env.AGENT_NAME || 'agent-notion-worker';
const notionConfig = validateNotionConfig({
  apiKey,
  baseUrl: process.env.NOTION_BASE_URL,
  notionVersion: process.env.NOTION_VERSION,
});
const notionBaseUrl = notionConfig.baseUrl;
const notionVersion = notionConfig.notionVersion;
const explicitPageId = process.env.NOTION_SCAN_PAGE_ID;
const smokeMode = String(process.env.NOTION_SMOKE_MODE || 'manual').trim().toLowerCase();
const autoWaitMs = Number(process.env.NOTION_SMOKE_WAIT_MS || 45000);
const autoPollMs = Number(process.env.NOTION_SMOKE_POLL_INTERVAL_MS || 1500);
const smokePromptOverride = String(process.env.NOTION_SMOKE_PROMPT || '').trim();
const expectedReplySubstring = String(process.env.NOTION_SMOKE_EXPECT_REPLY_SUBSTRING || '').trim();
const expectedResultSubstring = String(process.env.NOTION_SMOKE_EXPECT_RESULT_SUBSTRING || '').trim();
const routingRulesPath =
  process.env.NOTION_ROUTING_RULES_PATH || resolve(process.cwd(), 'docs', 'notion-routing.json');

if (!apiKey) {
  console.error('NOTION_API_KEY is required');
  process.exit(1);
}

async function postJson(pathname, payload) {
  const response = await fetchWithTimeout(`${cortexBaseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 10000);
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(`POST ${pathname} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

async function getJson(pathname) {
  const response = await fetchWithTimeout(`${cortexBaseUrl}${pathname}`, {}, 10000);
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(`GET ${pathname} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

async function notionRequest(pathname, { method = 'GET', body } = {}) {
  const response = await fetchWithTimeout(`${notionBaseUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Notion-Version': notionVersion,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }, 15000);

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(`Notion ${method} ${pathname} failed: ${response.status} ${raw}`);
  }
  return payload;
}

function plainTextFromRichText(richText = []) {
  return richText.map((item) => item?.plain_text || item?.text?.content || '').join('');
}

async function resolveScanPageId() {
  if (explicitPageId) {
    return explicitPageId;
  }

  const review = await getJson(`/project-review?project_id=${encodeURIComponent(projectId)}`);
  const pageId = review.project?.notion_scan_page_id;
  if (!pageId) {
    throw new Error('No notion_scan_page_id configured on project');
  }
  return pageId;
}

async function createPageLevelComment(pageId, text) {
  return notionRequest('/v1/comments', {
    method: 'POST',
    body: {
      parent: { page_id: pageId },
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  });
}

async function listDiscussionComments(pageId, discussionId) {
  const payload = await notionRequest(`/v1/comments?block_id=${pageId}&page_size=100`);
  return (payload.results || [])
    .filter((comment) => comment.discussion_id === discussionId)
    .map((comment) => ({
      id: comment.id,
      discussionId: comment.discussion_id,
      text: plainTextFromRichText(comment.rich_text),
      createdBy: comment.created_by?.id || null,
      createdTime: comment.created_time,
    }));
}

async function listPageComments(pageId) {
  const payload = await notionRequest(`/v1/comments?block_id=${pageId}&page_size=100`);
  return (payload.results || []).map((comment) => ({
    id: comment.id,
    discussionId: comment.discussion_id,
    text: plainTextFromRichText(comment.rich_text),
    createdBy: comment.created_by?.id || null,
    createdTime: comment.created_time,
  }));
}

function extractDelegatedCommandId(command) {
  const summary = String(command?.result_summary || command?.resultSummary || '');
  const match = summary.match(/\b(CMD-\d{8}-\d+)\b/);
  return match ? match[1] : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCommandCompletion(commandId) {
  const deadline = Date.now() + autoWaitMs;

  while (Date.now() < deadline) {
    const commandState = await getJson(`/commands?command_id=${encodeURIComponent(commandId)}&limit=1`);
    const command = commandState.commands?.[0] || null;
    if (command && ['done', 'failed', 'cancelled'].includes(command.status)) {
      return command;
    }
    await sleep(autoPollMs);
  }

  throw new Error(`Timed out waiting for command ${commandId} to finish in ${autoWaitMs}ms`);
}

async function waitForDerivedCommandCompletion(parentCommandId, expectedCommandId = null) {
  const deadline = Date.now() + autoWaitMs;

  while (Date.now() < deadline) {
    if (expectedCommandId) {
      const commandState = await getJson(`/commands?command_id=${encodeURIComponent(expectedCommandId)}&limit=1`);
      const child = commandState.commands?.[0] || null;
      if (child && ['done', 'failed', 'cancelled'].includes(child.status)) {
        return child;
      }
      await sleep(autoPollMs);
      continue;
    }

    const commandState = await getJson(
      `/commands?project_id=${encodeURIComponent(projectId)}&source=notion_comment&limit=100`,
    );
    const child = (commandState.commands || []).find((command) => command.parent_command_id === parentCommandId);

    if (!child) {
      await sleep(autoPollMs);
      continue;
    }

    if (['done', 'failed', 'cancelled'].includes(child.status)) {
      return child;
    }

    await sleep(autoPollMs);
  }

  throw new Error(`Timed out waiting for child command of ${parentCommandId} to finish in ${autoWaitMs}ms`);
}

async function waitForDiscussionReply({ pageId, discussionId, baselineCommentIds, createdCommentId }) {
  const deadline = Date.now() + autoWaitMs;

  while (Date.now() < deadline) {
    const discussionComments = await listDiscussionComments(pageId, discussionId);
    const freshReplies = discussionComments.filter(
      (entry) => !baselineCommentIds.has(entry.id) && entry.id !== createdCommentId,
    );

    if (freshReplies.length > 0) {
      return {
        discussionComments,
        freshReplies,
      };
    }

    await sleep(autoPollMs);
  }

  throw new Error(`Timed out waiting for discussion ${discussionId} to receive a new reply in ${autoWaitMs}ms`);
}

async function main() {
  const pageId = await resolveScanPageId();
  const baselineComments = await listPageComments(pageId).catch(() => []);
  const baselineCommentIds = new Set(baselineComments.map((entry) => entry.id));
  const stamp = new Date().toISOString();
  const prompt =
    smokePromptOverride ||
    `[Codex Smoke ${stamp}] 请验证这条 Notion comment 可以进入 Cortex 命令队列，并由 agent 回复同一 discussion。`;

  // The loop intentionally skips self-authored comments, so the smoke test
  // creates a real Notion discussion and ingests it explicitly.
  const comment = await createPageLevelComment(pageId, prompt);
  const routingRules = loadRoutingRules(routingRulesPath);
  const routing = resolveCommentOwnerAgent({
    body: prompt,
    pageId,
    anchorBlockId: null,
    rules: routingRules,
  });

  const ingested = await postJson('/webhook/notion-comment', {
    project_id: projectId,
    target_type: 'page',
    target_id: pageId,
    page_id: pageId,
    discussion_id: comment.discussion_id,
    comment_id: comment.id,
    body: prompt,
    owner_agent: routing.ownerAgent,
    context_quote: '',
    anchor_block_id: null,
    source_url: `notion://page/${pageId}/discussion/${comment.discussion_id}/comment/${comment.id}`,
  });

  let reply = null;
  let finalCommand = null;
  let childCommand = null;
  let freshReplies = [];
  if (smokeMode === 'auto') {
    finalCommand = await waitForCommandCompletion(ingested.commandId);
    const delegatedCommandId = extractDelegatedCommandId(finalCommand);
    if (delegatedCommandId) {
      childCommand = await waitForDerivedCommandCompletion(ingested.commandId, delegatedCommandId);
    }
  } else {
    await postJson('/commands/claim', {
      command_id: ingested.commandId,
      agent_name: agentName,
    });

    await postJson('/commands/start', {
      command_id: ingested.commandId,
      agent_name: agentName,
    });

    const replyText = `[Codex Smoke Reply] 已验证 Cortex 可把这条 Notion discussion 写入命令队列，并由 ${agentName} 在同一 discussion 回复。`;

    reply = await replyToDiscussion({
      apiKey,
      discussionId: comment.discussion_id,
      text: replyText,
      baseUrl: notionBaseUrl,
      notionVersion,
    });

    const completed = await postJson('/commands/complete', {
      command_id: ingested.commandId,
      agent_name: agentName,
      result_summary: replyText,
    });
    finalCommand = completed.command;
  }

  const discussionResult =
    smokeMode === 'auto'
      ? await waitForDiscussionReply({
          pageId,
          discussionId: comment.discussion_id,
          baselineCommentIds,
          createdCommentId: comment.id,
        })
      : {
          discussionComments: await listDiscussionComments(pageId, comment.discussion_id),
          freshReplies: [],
        };
  const commandState = await getJson(`/commands?command_id=${encodeURIComponent(ingested.commandId)}&limit=1`);
  const discussionComments = discussionResult.discussionComments;
  freshReplies = discussionResult.freshReplies;
  const childResultSummary = childCommand?.result_summary || childCommand?.resultSummary || null;
  const freshReplyText = freshReplies.map((entry) => entry.text).join('\n');

  if (expectedReplySubstring && !freshReplies.some((entry) => String(entry.text || '').includes(expectedReplySubstring))) {
    throw new Error(
      `Expected fresh reply to include ${JSON.stringify(expectedReplySubstring)}, got ${JSON.stringify(freshReplies)}`,
    );
  }

  if (expectedResultSubstring) {
    const haystack = [childResultSummary, finalCommand?.result_summary, finalCommand?.resultSummary]
      .filter(Boolean)
      .join('\n');
    if (!haystack.includes(expectedResultSubstring)) {
      throw new Error(
        `Expected command result to include ${JSON.stringify(expectedResultSubstring)}, got ${JSON.stringify(haystack)}`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        smokeMode,
        pageId,
        commandId: ingested.commandId,
        routedOwnerAgent: routing.ownerAgent,
        routingSource: routing.source,
        replyId: reply?.id || null,
        finalStatus: finalCommand?.status || commandState.commands?.[0]?.status || null,
        finalResultSummary: finalCommand?.result_summary || finalCommand?.resultSummary || null,
        childCommandId: childCommand?.command_id || childCommand?.commandId || null,
        childCommandStatus: childCommand?.status || null,
        childResultSummary,
        discussionCommentCount: discussionComments.length,
        freshReplyCount: freshReplies.length,
        freshReplyText,
        freshReplies,
        discussionComments,
        storedCommand: commandState.commands?.[0] || finalCommand || null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
