import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { loadProjectEnv } from './project-env.js';
import { resolveCommentScanPageIds } from './notion-comment-pages.js';
import { getCurrentBotUserId, scanCommentsUnderPage } from './notion-agent-sync.js';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}

function isDisabled(value) {
  return ['0', 'false', 'no', 'off'].includes(compact(value).toLowerCase());
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(compact(value).toLowerCase());
}

function normalizePageId(value) {
  return compact(value).replace(/-/g, '').toLowerCase();
}

function normalizeSeenEntry(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return {
    projectId: value.projectId || value.project_id || null,
    pageId: value.pageId || value.page_id || null,
    createdTime: value.createdTime || value.created_time || null,
    processedAt: value.processedAt || value.processed_at || null,
  };
}

export function defaultNotionCommentPollerStatePath(cwd = process.cwd()) {
  return resolve(cwd, 'tmp', 'notion-comment-poller-state.json');
}

export function notionCommentPollerEnabled(env = process.env) {
  const explicit = env.NOTION_COMMENT_POLLER_ENABLE ?? env.NOTION_COMMENT_POLL_ENABLE;
  if (isDisabled(explicit)) {
    return false;
  }
  if (isEnabled(explicit)) {
    return true;
  }
  return Boolean(compact(env.NOTION_API_KEY));
}

export function loadNotionCommentPollerState(statePath = defaultNotionCommentPollerStatePath()) {
  if (!existsSync(statePath)) {
    return {
      version: 1,
      seen: {},
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    const seen = {};
    for (const [commentId, entry] of Object.entries(parsed?.seen || {})) {
      const normalized = normalizeSeenEntry(entry);
      if (commentId && normalized) {
        seen[commentId] = normalized;
      }
    }
    return {
      version: 1,
      ...parsed,
      seen,
    };
  } catch {
    return {
      version: 1,
      seen: {},
    };
  }
}

export function saveNotionCommentPollerState(statePath, state, { maxSeen = 5000 } = {}) {
  const entries = Object.entries(state?.seen || {})
    .sort(([, left], [, right]) => compact(right.processedAt).localeCompare(compact(left.processedAt)))
    .slice(0, maxSeen);
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    seen: Object.fromEntries(entries),
  };

  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function shouldIngestScannedComment(comment, state, { now = Date.now(), firstRunLookbackMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!comment?.commentId || !compact(comment.body)) {
    return false;
  }

  if (state?.seen?.[comment.commentId]) {
    return false;
  }

  if (firstRunLookbackMs > 0) {
    const createdMs = Date.parse(comment.createdTime || '');
    if (Number.isFinite(createdMs) && createdMs < now - firstRunLookbackMs) {
      return false;
    }
  }

  return true;
}

export function buildNotionCommentWebhookPayload({ comment, projectId }) {
  return {
    project_id: projectId,
    target_type: comment.anchorBlockId ? 'block' : 'page',
    target_id: comment.anchorBlockId || comment.pageId,
    page_id: comment.pageId,
    discussion_id: comment.discussionId,
    comment_id: comment.commentId,
    body: comment.body,
    context_quote: comment.contextQuote || '',
    anchor_block_id: comment.anchorBlockId || null,
    source_url: comment.sourceUrl,
  };
}

async function postJson(fetchImpl, url, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status} ${url}`);
  }
  return payload;
}

export function resolveNotionCommentPollTargets({ cwd = process.cwd(), env = process.env, dbPath } = {}) {
  const targets = [];
  const seen = new Set();
  const defaultProjectId = compact(env.PROJECT_ID || env.CORTEX_DEFAULT_PROJECT_ID) || 'PRJ-cortex';
  const includeAllProjects = isEnabled(env.NOTION_COMMENT_POLLER_INCLUDE_ALL_PROJECTS);

  const addTarget = (project, pageId) => {
    const normalized = normalizePageId(pageId);
    if (!normalized) {
      return;
    }
    const key = `${project.projectId}:${normalized}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    targets.push({
      projectId: project.projectId,
      pageId,
    });
  };

  const envProject = {
    projectId: defaultProjectId,
    notionScanPageId: env.NOTION_SCAN_PAGE_ID,
    notionReviewPageId: env.NOTION_REVIEW_PAGE_ID,
  };
  for (const pageId of resolveCommentScanPageIds({ project: envProject, env })) {
    addTarget(envProject, pageId);
  }

  const resolvedDbPath = dbPath || env.CORTEX_DB_PATH || resolve(cwd, 'db', 'cortex.db');
  if (existsSync(resolvedDbPath)) {
    const store = createStore({ dbPath: resolvedDbPath });
    try {
      for (const project of store.listProjects()) {
        if (!includeAllProjects && project.projectId !== defaultProjectId) {
          continue;
        }
        for (const pageId of resolveCommentScanPageIds({ project, env: {} })) {
          addTarget(project, pageId);
        }
      }
    } finally {
      store.close();
    }
  }

  return targets;
}

export async function pollNotionCommentsOnce(options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = {
    ...process.env,
    ...(options.env || {}),
  };
  const apiKey = compact(options.apiKey || env.NOTION_API_KEY);
  const fetchImpl = options.fetchImpl || fetch;
  const cortexBaseUrl = compact(options.cortexBaseUrl || env.CORTEX_BASE_URL) || 'http://127.0.0.1:19100';
  const statePath = options.statePath || env.NOTION_COMMENT_POLLER_STATE_PATH || defaultNotionCommentPollerStatePath(cwd);
  const state = options.state || loadNotionCommentPollerState(statePath);
  const targets =
    options.targets ||
    resolveNotionCommentPollTargets({
      cwd,
      env,
      dbPath: options.dbPath,
    });
  const scanComments = options.scanCommentsUnderPage || scanCommentsUnderPage;
  const getSelfUserId = options.getCurrentBotUserId || getCurrentBotUserId;
  const now = typeof options.now === 'function' ? options.now() : options.now || Date.now();
  const firstRunLookbackMs =
    options.firstRunLookbackMs ??
    parsePositiveInt(env.NOTION_COMMENT_POLLER_FIRST_RUN_LOOKBACK_MS, 24 * 60 * 60 * 1000);
  const maxBlocks = parsePositiveInt(env.NOTION_COMMENT_POLLER_MAX_BLOCKS, 300);
  const maxSeen = parsePositiveInt(env.NOTION_COMMENT_POLLER_MAX_SEEN, 5000);

  if (!apiKey) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing_notion_api_key',
      targets: [],
      ingested: [],
      statePath,
    };
  }

  if (targets.length === 0) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing_scan_targets',
      targets: [],
      ingested: [],
      statePath,
    };
  }

  const selfUserId = options.selfUserId === undefined ? await getSelfUserId({ apiKey }) : options.selfUserId;
  const ingested = [];
  const scanned = [];
  const errors = [];

  for (const target of targets) {
    try {
      const comments = await scanComments({
        apiKey,
        pageId: target.pageId,
        selfUserId,
        maxBlocks,
      });
      scanned.push({
        projectId: target.projectId,
        pageId: target.pageId,
        count: comments.length,
      });

      for (const comment of comments) {
        if (!shouldIngestScannedComment(comment, state, { now, firstRunLookbackMs })) {
          continue;
        }

        const payload = buildNotionCommentWebhookPayload({
          comment,
          projectId: target.projectId,
        });
        const response = await postJson(fetchImpl, `${cortexBaseUrl}/webhook/notion-comment`, payload);
        const processedAt = new Date(now).toISOString();
        state.seen[comment.commentId] = {
          projectId: target.projectId,
          pageId: target.pageId,
          createdTime: comment.createdTime,
          processedAt,
        };
        ingested.push({
          projectId: target.projectId,
          pageId: target.pageId,
          commentId: comment.commentId,
          commandId: response.commandId || response.command_id || null,
          isDuplicate: Boolean(response.isDuplicate),
        });
      }
    } catch (error) {
      errors.push({
        projectId: target.projectId,
        pageId: target.pageId,
        error: String(error?.message || error),
      });
    }
  }

  const savedState = options.saveState === false ? state : saveNotionCommentPollerState(statePath, state, { maxSeen });
  return {
    ok: errors.length === 0,
    skipped: false,
    statePath,
    targets,
    scanned,
    ingested,
    errors,
    state: savedState,
  };
}

export function createNotionCommentPoller(options = {}) {
  const intervalMs = parsePositiveInt(options.intervalMs || process.env.NOTION_COMMENT_POLLER_INTERVAL_MS, 5000);
  const logger = options.logger || console;
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) {
      return;
    }

    const result = await pollNotionCommentsOnce(options);
    if (result.skipped) {
      logger.warn?.(`[notion-comment-poller] skipped: ${result.reason}`);
    } else if (result.ingested.length > 0) {
      logger.info?.(`[notion-comment-poller] ingested ${result.ingested.length} comment(s)`);
    }
  }

  async function loop() {
    while (!stopped) {
      try {
        await tick();
      } catch (error) {
        logger.error?.(`[notion-comment-poller] ${String(error?.stack || error?.message || error)}`);
      }
      await new Promise((resolvePromise) => {
        timer = setTimeout(resolvePromise, intervalMs);
      });
    }
  }

  return {
    intervalMs,
    async pollOnce() {
      return pollNotionCommentsOnce(options);
    },
    start() {
      void loop();
    },
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    },
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isCli) {
  loadProjectEnv(process.cwd(), {
    overrideKeys: ['CORTEX_BASE_URL'],
  });

  if (!notionCommentPollerEnabled(process.env)) {
    console.log('[notion-comment-poller] disabled');
  } else {
    const poller = createNotionCommentPoller();
    poller.start();
  }
}
