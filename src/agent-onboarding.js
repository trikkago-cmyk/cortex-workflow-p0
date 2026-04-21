import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function readJsonFile(filePath, fallback) {
  if (!filePath || !existsSync(filePath)) {
    return structuredClone(fallback);
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function compact(value) {
  return String(value ?? '').trim();
}

function normalizeExtraEnv(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function upsertBy(list, matcher, nextValue) {
  const index = list.findIndex(matcher);
  if (index >= 0) {
    list[index] = {
      ...list[index],
      ...nextValue,
    };
    return { updated: true, created: false };
  }

  list.push(nextValue);
  return { updated: false, created: true };
}

export function upsertAgentRegistryEntry({
  filePath,
  agentName,
  projectId = 'PRJ-cortex',
  ownerAgent = null,
  source = 'notion_comment',
  mode = 'webhook',
  pollIntervalMs = 1000,
  handlerKind = 'external_webhook',
  webhookUrl = '',
  webhookToken = '',
  channel = '',
  targetType = '',
  includeUnassigned = false,
  onlyUnassigned = false,
  enabled = true,
  extraEnv = {},
}) {
  const normalizedAgentName = compact(agentName);
  if (!normalizedAgentName) {
    throw new Error('agentName is required');
  }

  const current = readJsonFile(filePath, {
    defaults: {},
    agents: [],
  });

  current.defaults = current.defaults && typeof current.defaults === 'object' ? current.defaults : {};
  current.agents = Array.isArray(current.agents) ? current.agents : [];

  const result = upsertBy(
    current.agents,
    (entry) => compact(entry.agent_name || entry.agentName) === normalizedAgentName,
    {
      agent_name: normalizedAgentName,
      enabled,
      handler_kind: compact(handlerKind) || null,
      project_id: compact(projectId) || 'PRJ-cortex',
      source: compact(source) || 'notion_comment',
      owner_agent: ownerAgent === null ? normalizedAgentName : compact(ownerAgent) || normalizedAgentName,
      mode: compact(mode) || 'webhook',
      poll_interval_ms: Number(pollIntervalMs) > 0 ? Number(pollIntervalMs) : 1000,
      include_unassigned: Boolean(includeUnassigned),
      only_unassigned: Boolean(onlyUnassigned),
      ...(compact(channel) ? { channel: compact(channel) } : {}),
      ...(compact(targetType) ? { target_type: compact(targetType) } : {}),
      ...(compact(webhookUrl) ? { webhook_url: compact(webhookUrl) } : {}),
      ...(compact(webhookToken) ? { webhook_token: compact(webhookToken) } : {}),
      ...(Object.keys(normalizeExtraEnv(extraEnv)).length > 0 ? { extra_env: normalizeExtraEnv(extraEnv) } : {}),
    },
  );

  writeJsonFile(filePath, current);
  return result;
}

export function upsertNotionRoutingAliases({ filePath, aliases = {}, agentName }) {
  const normalizedAgentName = compact(agentName);
  if (!normalizedAgentName) {
    throw new Error('agentName is required');
  }

  const current = readJsonFile(filePath, {
    aliases: {},
    pages: {},
    blocks: {},
    defaults: {},
  });

  current.aliases = current.aliases && typeof current.aliases === 'object' ? current.aliases : {};
  let changed = false;

  for (const rawAlias of Object.keys(aliases)) {
    const alias = compact(rawAlias).replace(/^@+/, '');
    if (!alias) {
      continue;
    }

    if (current.aliases[alias] !== normalizedAgentName) {
      current.aliases[alias] = normalizedAgentName;
      changed = true;
    }
  }

  writeJsonFile(filePath, current);
  return {
    createdOrUpdated: changed,
    aliasCount: Object.keys(aliases).length,
  };
}

export function upsertExecutorRoute({ filePath, agentName, webhookUrl, webhookToken = '' }) {
  const normalizedAgentName = compact(agentName);
  const normalizedWebhookUrl = compact(webhookUrl);
  if (!normalizedAgentName) {
    throw new Error('agentName is required');
  }
  if (!normalizedWebhookUrl) {
    throw new Error('webhookUrl is required');
  }

  const current = readJsonFile(filePath, {
    default: null,
    agents: {},
  });

  current.agents = current.agents && typeof current.agents === 'object' ? current.agents : {};
  current.agents[normalizedAgentName] = {
    url: normalizedWebhookUrl,
    ...(compact(webhookToken) ? { token: compact(webhookToken) } : {}),
  };

  writeJsonFile(filePath, current);
  return {
    createdOrUpdated: true,
  };
}

export function onboardExternalAgent({
  agentRegistryFile,
  notionRoutingFile,
  executorRoutingFile,
  agentName,
  aliases = [],
  webhookUrl,
  webhookToken = '',
  projectId = 'PRJ-cortex',
  ownerAgent = null,
  source = 'notion_comment',
  mode = 'webhook',
  pollIntervalMs = 1000,
  handlerKind = 'external_webhook',
  channel = '',
  targetType = '',
  includeUnassigned = false,
  onlyUnassigned = false,
  enabled = true,
  extraEnv = {},
}) {
  const aliasMap = Object.fromEntries(
    aliases
      .map((alias) => compact(alias).replace(/^@+/, ''))
      .filter(Boolean)
      .map((alias) => [alias, agentName]),
  );

  const registry = upsertAgentRegistryEntry({
    filePath: agentRegistryFile,
    agentName,
    projectId,
    ownerAgent,
    source,
    mode,
    pollIntervalMs,
    handlerKind,
    webhookUrl,
    webhookToken,
    channel,
    targetType,
    includeUnassigned,
    onlyUnassigned,
    enabled,
    extraEnv,
  });

  const routing = upsertNotionRoutingAliases({
    filePath: notionRoutingFile,
    aliases: aliasMap,
    agentName,
  });

  const executor = upsertExecutorRoute({
    filePath: executorRoutingFile,
    agentName,
    webhookUrl,
    webhookToken,
  });

  return {
    agentName,
    aliases: Object.keys(aliasMap),
    webhookUrl,
    registry,
    routing,
    executor,
  };
}
