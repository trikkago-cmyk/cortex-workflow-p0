import { defaultAgentRegistryFile, resolveExecutorRouteFromAgentRegistry } from './agent-registry.js';
import { parseNotionSourceUrl, replyToDiscussion } from './notion-agent-sync.js';
import { resolveExecutorRoute } from './executor-routing.js';

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
  const logger = options.logger || console;
  const execute = createCommandExecutor({
    ...options,
    fetchImpl,
  });
  const notionApiKey = options.notionApiKey || process.env.NOTION_API_KEY || '';
  const notionBaseUrl = options.notionBaseUrl || process.env.NOTION_BASE_URL;
  const notionVersion = options.notionVersion || process.env.NOTION_VERSION;
  const notionReply = options.notionReply || replyToDiscussion;

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

  async function maybeReplyToNotion(command, replyText) {
    if (!replyText || command.source !== 'notion_comment') {
      return null;
    }

    if (!notionApiKey) {
      throw new Error('NOTION_API_KEY is required to reply to notion comments');
    }

    const sourceRef = parseNotionSourceUrl(command.source_url);
    if (!sourceRef) {
      throw new Error(`Command ${command.command_id} has no parseable Notion source URL`);
    }

    return notionReply({
      apiKey: notionApiKey,
      discussionId: sourceRef.discussionId,
      text: replyText,
      baseUrl: notionBaseUrl,
      notionVersion,
    });
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

      if (String(result?.status || 'done') === 'failed') {
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
        };
      }

      await maybeReplyToNotion(command, replyText);
      await completeCommand(command.command_id, resultSummaryText);

      return {
        commandId: command.command_id,
        status: 'done',
        replied: Boolean(replyText && command.source === 'notion_comment'),
        resultSummary: resultSummaryText,
      };
    } catch (error) {
      const message = String(error?.message || error);
      await failCommand(command.command_id, message);
      return {
        commandId: command.command_id,
        status: 'failed',
        replied: false,
        error: message,
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
