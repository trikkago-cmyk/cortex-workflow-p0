import { createHash } from 'node:crypto';
import { defaultAgentRegistryFile, resolveExecutorRouteFromAgentRegistry } from './agent-registry.js';
import { resolveExecutorRoute } from './executor-routing.js';
import {
  parseNotionDiscussionId,
  postNotionDiscussionReply,
  shouldWriteBackToNotionDiscussion,
} from './notion-discussion-writeback.js';

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function readJson(response) {
  const raw = await response.text();
  return raw ? JSON.parse(raw) : {};
}

async function requestJson(fetchImpl, baseUrl, pathname, { method = 'GET', body } = {}) {
  const response = await fetchImpl(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await readJson(response);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status} ${pathname}`);
  }

  return payload;
}

function normalizeMode(value) {
  return String(value || 'echo').trim().toLowerCase();
}

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableHash(value) {
  return createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 12);
}

function pickFirstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function pickFirstObject(...values) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function normalizeReceiptStatus(result = {}) {
  const explicit = compact(result.receiptStatus || result.receipt_status).toLowerCase();
  if (['delivered', 'completed', 'failed', 'acknowledged', 'read'].includes(explicit)) {
    return explicit;
  }

  return String(result.status || 'done').toLowerCase() === 'failed' ? 'failed' : 'completed';
}

function buildReceiptBody({ agentName, command, resultSummary, replyText, result, receiptStatus }) {
  const payload = {};

  const details =
    compact(result.details || result.detail || result.reply_text || result.replyText) || null;
  const nextStep = compact(result.nextStep || result.next_step) || null;
  const title = compact(result.title) || null;
  const stage = compact(result.stage) || null;
  const signal = compact(result.signal || result.signal_level || result.signalLevel) || null;
  const qualityGrade = compact(result.qualityGrade || result.quality_grade) || null;
  const anomalyLevel = compact(result.anomalyLevel || result.anomaly_level) || null;
  const feedbackSource = compact(result.feedbackSource || result.feedback_source) || null;
  const receiptType = compact(result.receiptType || result.receipt_type) || null;
  const artifacts = pickFirstArray(result.artifacts, result.evidence);
  const metrics = pickFirstObject(result.metrics);
  const decisionContext = pickFirstObject(result.decisionContext, result.decision_context);
  const runs = pickFirstArray(result.runs);
  const warnings = pickFirstArray(result.warnings);
  const resolvedInboxItems = pickFirstArray(result.resolvedInboxItems, result.resolved_inbox_items);

  if (details) {
    payload.details = details;
  }
  if (metrics) {
    payload.metrics = metrics;
  }
  if (artifacts) {
    payload.artifacts = artifacts;
  }
  if (decisionContext) {
    payload.decision_context = decisionContext;
  }
  if (runs) {
    payload.runs = runs;
  }
  if (warnings) {
    payload.warnings = warnings;
  }
  if (resolvedInboxItems) {
    payload.resolved_inbox_items = resolvedInboxItems;
  }
  if (result.action_type || result.actionType) {
    payload.action_type = result.action_type || result.actionType;
  }
  if (result.item) {
    payload.item = result.item;
  }
  if (result.memory) {
    payload.memory = result.memory;
  }
  if (result.decision) {
    payload.decision = result.decision;
  }

  const idempotencySeed = JSON.stringify({
    command_id: command.command_id,
    agent_name: agentName,
    receipt_status: receiptStatus,
    result_summary: resultSummary,
    reply_text: replyText || '',
    payload,
  });

  return {
    command_id: command.command_id,
    agent_name: agentName,
    status: receiptStatus,
    receipt_type: receiptType || undefined,
    signal: signal || undefined,
    title: title || undefined,
    stage: stage || undefined,
    summary: resultSummary,
    details: details || undefined,
    next_step: nextStep || undefined,
    quality_grade: qualityGrade || undefined,
    anomaly_level: anomalyLevel || undefined,
    feedback_source: feedbackSource || 'executor_worker',
    reply_text: replyText || undefined,
    payload,
    idempotency_key: `executor-worker:${command.command_id}:${stableHash(idempotencySeed)}`,
  };
}

function summarizeEchoReply(command, agentName) {
  return `已收到，${agentName} 正在处理这条任务：${command.instruction}`;
}

export function createWebhookExecutor(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const routingFile = options.routingFile || process.env.EXECUTOR_ROUTING_FILE;
  const webhookUrl = options.webhookUrl || process.env.EXECUTOR_WEBHOOK_URL;
  const webhookToken = options.webhookToken || process.env.EXECUTOR_WEBHOOK_TOKEN;
  const routingConfig = options.routingConfig;
  const agentRegistryFile =
    options.agentRegistryFile || process.env.AGENT_REGISTRY_FILE || defaultAgentRegistryFile(options.cwd || process.cwd());
  const agentRegistry = options.agentRegistry;

  return async ({ agentName, command }) => {
    let route = resolveExecutorRoute({
      agentName,
      routingFile,
      routingConfig,
      fallbackUrl: webhookUrl,
      fallbackToken: webhookToken,
    });

    if (!route?.url) {
      route = resolveExecutorRouteFromAgentRegistry({
        agentName,
        registryFile: agentRegistryFile,
        registry: agentRegistry,
        fallbackUrl: webhookUrl,
        fallbackToken: webhookToken,
      });
    }

    if (!route?.url) {
      throw new Error(
        'executor webhook route is missing; set AGENT_REGISTRY_FILE, EXECUTOR_ROUTING_FILE, or EXECUTOR_WEBHOOK_URL',
      );
    }

    const response = await fetchImpl(route.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(route.token ? { Authorization: `Bearer ${route.token}` } : {}),
      },
      body: JSON.stringify({
        agent_name: agentName,
        project_id: command.project_id,
        command,
      }),
    });

    const payload = await readJson(response);
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `executor webhook failed: HTTP ${response.status}`);
    }

    return {
      status: payload.status || 'done',
      replyText: payload.reply_text || payload.replyText || null,
      resultSummary:
        payload.result_summary ||
        payload.resultSummary ||
        payload.reply_text ||
        payload.replyText ||
        `Command ${command.command_id} handled by ${agentName}`,
    };
  };
}

function createEchoExecutor(options = {}) {
  return async ({ agentName, command }) => {
    const replyText = summarizeEchoReply(command, agentName);
    return {
      status: 'done',
      replyText: command.source === 'notion_comment' ? replyText : null,
      resultSummary: `echo handled by ${agentName}: ${command.instruction}`,
    };
  };
}

function createCommandExecutor(options = {}) {
  if (options.executor) {
    return options.executor;
  }

  const mode = normalizeMode(options.mode || process.env.EXECUTOR_MODE);
  if (mode === 'echo') {
    return createEchoExecutor(options);
  }
  if (mode === 'webhook') {
    return createWebhookExecutor(options);
  }

  throw new Error(`Unsupported EXECUTOR_MODE ${mode}`);
}

function defaultOwnerAgent({ ownerAgent, source, agentName, onlyUnassigned = false }) {
  if (ownerAgent !== undefined) {
    return ownerAgent || null;
  }

  if (onlyUnassigned) {
    return null;
  }

  if (source === 'notion_comment') {
    return agentName;
  }

  return null;
}

export function createExecutorWorker(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const notionFetchImpl = options.notionFetchImpl || fetchImpl;
  const baseUrl = options.baseUrl || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
  const agentName = options.agentName || process.env.AGENT_NAME;
  const projectId = options.projectId || process.env.PROJECT_ID || 'PRJ-cortex';
  const source = options.source ?? process.env.SOURCE ?? 'notion_comment';
  const targetType = options.targetType ?? process.env.TARGET_TYPE;
  const channel = options.channel ?? process.env.CHANNEL;
  const includeUnassigned = options.includeUnassigned ?? process.env.INCLUDE_UNASSIGNED === '1';
  const onlyUnassigned = options.onlyUnassigned ?? process.env.ONLY_UNASSIGNED === '1';
  const explicitOwnerAgent = Object.prototype.hasOwnProperty.call(options, 'ownerAgent')
    ? options.ownerAgent
    : process.env.OWNER_AGENT;
  const ownerAgent = defaultOwnerAgent({
    ownerAgent: explicitOwnerAgent,
    source,
    agentName,
    onlyUnassigned,
  });
  const pollIntervalMs = Number(options.pollIntervalMs || process.env.EXECUTOR_POLL_INTERVAL_MS || 1000);
  const notionWritebackEnabled = shouldWriteBackToNotionDiscussion({
    enabled: options.notionWritebackEnabled,
  });
  const notionApiKey = options.notionApiKey || process.env.NOTION_API_KEY;
  const notionBaseUrl = options.notionBaseUrl || process.env.NOTION_BASE_URL;
  const notionVersion = options.notionVersion || process.env.NOTION_VERSION;
  const logger = options.logger || console;
  const execute = createCommandExecutor({
    ...options,
    fetchImpl,
  });

  if (!agentName) {
    throw new Error('AGENT_NAME is required');
  }

  let stopped = false;

  async function claimNext() {
    return requestJson(fetchImpl, baseUrl, '/commands/claim-next', {
      method: 'POST',
      body: {
        project_id: projectId,
        source,
        target_type: targetType,
        channel,
        owner_agent: ownerAgent,
        include_unassigned: includeUnassigned,
        only_unassigned: onlyUnassigned,
        agent_name: agentName,
      },
    });
  }

  async function startCommand(commandId) {
    return requestJson(fetchImpl, baseUrl, '/commands/start', {
      method: 'POST',
      body: {
        command_id: commandId,
        agent_name: agentName,
      },
    });
  }

  async function completeCommand(commandId, resultSummary) {
    return requestJson(fetchImpl, baseUrl, '/commands/complete', {
      method: 'POST',
      body: {
        command_id: commandId,
        agent_name: agentName,
        result_summary: resultSummary,
      },
    });
  }

  async function failCommand(commandId, errorMessage) {
    return requestJson(fetchImpl, baseUrl, '/commands/update-status', {
      method: 'POST',
      body: {
        command_id: commandId,
        status: 'failed',
        claimed_by: agentName,
        result_summary: errorMessage,
      },
    });
  }

  async function recordAgentReceipt(command, resultSummary, replyText, result, receiptStatus) {
    const payload = buildReceiptBody({
      agentName,
      command,
      resultSummary,
      replyText,
      result,
      receiptStatus,
    });

    return requestJson(fetchImpl, baseUrl, '/webhook/agent-receipt', {
      method: 'POST',
      body: payload,
    });
  }

  async function writeBackNotionReply(command, replyText) {
    if (!replyText || command.source !== 'notion_comment') {
      return {
        replied: false,
        replySkipped: false,
        replySkipReason: null,
        replyId: null,
        notionFeedbackMode: null,
      };
    }

    if (!notionWritebackEnabled) {
      return {
        replied: false,
        replySkipped: true,
        replySkipReason: 'discussion_writeback_removed',
        replyId: null,
        notionFeedbackMode: 'docs_only',
      };
    }

    const discussionId = parseNotionDiscussionId(command);
    if (!discussionId) {
      logger.warn?.(`[executor-worker] cannot write Notion reply for ${command.command_id}: missing discussion id`);
      return {
        replied: false,
        replySkipped: true,
        replySkipReason: 'missing_discussion_id',
        replyId: null,
        notionFeedbackMode: 'docs_only',
      };
    }

    try {
      const reply = await postNotionDiscussionReply({
        fetchImpl: notionFetchImpl,
        apiKey: notionApiKey,
        baseUrl: notionBaseUrl,
        notionVersion,
        discussionId,
        replyText,
      });

      return {
        replied: true,
        replySkipped: false,
        replySkipReason: null,
        replyId: reply.replyId,
        notionFeedbackMode: 'discussion_writeback',
      };
    } catch (error) {
      logger.warn?.(
        `[executor-worker] Notion discussion writeback failed for ${command.command_id}: ${String(
          error?.message || error,
        )}`,
      );
      return {
        replied: false,
        replySkipped: true,
        replySkipReason: 'notion_writeback_failed',
        replyId: null,
        notionFeedbackMode: 'docs_only',
        writebackError: {
          status: error?.status || null,
          code: error?.code || null,
          message: String(error?.message || error),
          requestId: error?.requestId || null,
        },
      };
    }
  }

  async function handleCommand(command) {
    await startCommand(command.command_id);

    try {
      const result = await execute({
        agentName,
        projectId,
        command,
      });
      const replyText = result?.replyText || result?.reply_text || null;
      const resultSummaryText =
        result?.resultSummary ||
        result?.result_summary ||
        replyText ||
        `Command ${command.command_id} completed by ${agentName}`;
      const receiptStatus = normalizeReceiptStatus(result);

      try {
        const receipt = await recordAgentReceipt(command, resultSummaryText, replyText, result || {}, receiptStatus);
        const commandStatus = receipt?.command_status || receipt?.command?.status || (receiptStatus === 'failed' ? 'failed' : 'done');
        const writeback = await writeBackNotionReply(command, replyText);
        const receiptDocsOnlySkipped =
          !writeback.replied && Boolean(replyText && receipt?.notion_feedback_mode === 'docs_only');
        const replySkipped = writeback.replySkipped || receiptDocsOnlySkipped;
        const replySkipReason =
          writeback.replySkipReason || (replySkipped ? 'discussion_writeback_removed' : null);

        if (replySkipped) {
          logger.info?.(
            `[executor-worker] Notion discussion reply not written for ${command.command_id}; reason=${replySkipReason}`,
          );
        }

        return {
          commandId: command.command_id,
          status: commandStatus,
          replied: writeback.replied,
          replySkipped,
          replySkipReason,
          replyId: writeback.replyId,
          writebackError: writeback.writebackError,
          resultSummary: receipt?.command?.result_summary || resultSummaryText,
          receiptRecorded: true,
          receiptId: receipt?.receipt_id || receipt?.receipt?.receipt_id || receipt?.receipt?.receiptId || null,
          checkpointId:
            receipt?.checkpoint?.checkpoint_id ||
            receipt?.checkpoint?.checkpointId ||
            null,
          notionFeedbackMode:
            writeback.notionFeedbackMode || receipt?.notion_feedback_mode || receipt?.notionFeedbackMode || null,
        };
      } catch (receiptError) {
        logger.warn?.(
          `[executor-worker] receipt recording failed for ${command.command_id}, falling back to direct status update: ${String(
            receiptError?.message || receiptError,
          )}`,
        );
      }

      if (receiptStatus === 'failed') {
        const summary =
          result?.resultSummary ||
          result?.result_summary ||
          result?.replyText ||
          result?.reply_text ||
          `Command ${command.command_id} failed`;
        await failCommand(command.command_id, summary);
        return {
          commandId: command.command_id,
          status: 'failed',
          replied: false,
          resultSummary: summary,
          receiptRecorded: false,
        };
      }

      const writeback = await writeBackNotionReply(command, replyText);
      const replySkipped = writeback.replySkipped || Boolean(replyText && command.source === 'notion_comment');
      const replySkipReason =
        writeback.replySkipReason || (replySkipped ? 'discussion_writeback_removed' : null);
      if (replySkipped) {
        logger.info?.(
          `[executor-worker] Notion discussion reply not written for ${command.command_id}; reason=${replySkipReason}`,
        );
      }
      await completeCommand(command.command_id, resultSummaryText);

      return {
        commandId: command.command_id,
        status: 'done',
        replied: writeback.replied,
        replySkipped,
        replySkipReason,
        replyId: writeback.replyId,
        writebackError: writeback.writebackError,
        resultSummary: resultSummaryText,
        receiptRecorded: false,
      };
    } catch (error) {
      const message = String(error?.message || error);
      await failCommand(command.command_id, message);
      return {
        commandId: command.command_id,
        status: 'failed',
        replied: false,
        error: message,
        receiptRecorded: false,
      };
    }
  }

  async function pollOnce() {
    const claimed = await claimNext();
    const command = claimed.command;

    if (!command) {
      return {
        claimed: false,
        handled: null,
      };
    }

    const handled = await handleCommand(command);
    return {
      claimed: true,
      handled,
    };
  }

  async function start() {
    logger.info?.(
      `[executor] ${agentName} polling ${baseUrl} every ${pollIntervalMs}ms source=${source || '*'} owner=${
        ownerAgent || '*'
      }`,
    );

    while (!stopped) {
      try {
        const result = await pollOnce();
        if (!result.claimed) {
          await sleep(pollIntervalMs);
        }
      } catch (error) {
        logger.error?.('[executor] poll failed', error);
        if (!stopped) {
          await sleep(pollIntervalMs);
        }
      }
    }
  }

  function stop() {
    stopped = true;
  }

  return {
    pollOnce,
    start,
    stop,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const worker = createExecutorWorker();

  process.on('SIGINT', () => {
    worker.stop();
  });

  process.on('SIGTERM', () => {
    worker.stop();
  });

  await worker.start();
}
