import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeExtraEnv(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function defaultOwnerAgent({ ownerAgent, source, agentName }) {
  if (ownerAgent !== undefined) {
    return ownerAgent === null ? null : normalizeText(ownerAgent);
  }

  if (source === 'notion_comment') {
    return agentName;
  }

  return null;
}

function pickRaw(value, fallbackValue) {
  return value !== undefined ? value : fallbackValue;
}

function normalizeDefaults(defaults = {}) {
  return defaults && typeof defaults === 'object' ? defaults : {};
}

export function defaultAgentRegistryFile(cwd = process.cwd()) {
  return resolve(cwd, 'docs', 'agent-registry.json');
}

export function inferDefaultHandlerKind(agentName) {
  const normalized = normalizeText(agentName)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'agent-router') {
    return 'router';
  }
  if (normalized === 'agent-pm') {
    return 'pm';
  }
  if (normalized === 'agent-architect') {
    return 'architect';
  }
  if (normalized === 'agent-evaluator') {
    return 'evaluator';
  }
  if (normalized === 'agent-notion-worker') {
    return 'shared_actions';
  }

  return null;
}

export function normalizeRegistryAgent(agent = {}, defaults = {}) {
  const normalizedDefaults = normalizeDefaults(defaults);
  const agentName = normalizeText(agent.agent_name || agent.agentName);
  if (!agentName) {
    throw new Error('agent registry entry requires agent_name');
  }

  const explicitWorkerOwnerAgent =
    Object.prototype.hasOwnProperty.call(agent, 'owner_agent')
      ? agent.owner_agent
      : Object.prototype.hasOwnProperty.call(agent, 'ownerAgent')
        ? agent.ownerAgent
        : undefined;
  const explicitDefaultOwnerAgent =
    Object.prototype.hasOwnProperty.call(normalizedDefaults, 'owner_agent')
      ? normalizedDefaults.owner_agent
      : Object.prototype.hasOwnProperty.call(normalizedDefaults, 'ownerAgent')
        ? normalizedDefaults.ownerAgent
        : undefined;

  const source = normalizeText(pickRaw(agent.source, normalizedDefaults.source)) || 'notion_comment';
  const handlerKind =
    normalizeText(
      pickRaw(agent.handler_kind ?? agent.handlerKind, normalizedDefaults.handler_kind ?? normalizedDefaults.handlerKind),
    )?.toLowerCase() || inferDefaultHandlerKind(agentName);

  return {
    agentName,
    enabled: normalizeBoolean(pickRaw(agent.enabled, normalizedDefaults.enabled), true),
    handlerKind,
    projectId:
      normalizeText(
        pickRaw(agent.project_id ?? agent.projectId, normalizedDefaults.project_id ?? normalizedDefaults.projectId),
      ) || 'PRJ-cortex',
    source,
    targetType: normalizeText(
      pickRaw(agent.target_type ?? agent.targetType, normalizedDefaults.target_type ?? normalizedDefaults.targetType),
    ),
    channel: normalizeText(pickRaw(agent.channel, normalizedDefaults.channel)),
    ownerAgent: defaultOwnerAgent({
      ownerAgent: explicitWorkerOwnerAgent !== undefined ? explicitWorkerOwnerAgent : explicitDefaultOwnerAgent,
      source,
      agentName,
    }),
    includeUnassigned: normalizeBoolean(
      pickRaw(
        agent.include_unassigned ?? agent.includeUnassigned,
        normalizedDefaults.include_unassigned ?? normalizedDefaults.includeUnassigned,
      ),
      false,
    ),
    onlyUnassigned: normalizeBoolean(
      pickRaw(
        agent.only_unassigned ?? agent.onlyUnassigned,
        normalizedDefaults.only_unassigned ?? normalizedDefaults.onlyUnassigned,
      ),
      false,
    ),
    mode: normalizeText(pickRaw(agent.mode, normalizedDefaults.mode)) || 'webhook',
    pollIntervalMs: normalizeNumber(
      pickRaw(
        agent.poll_interval_ms ?? agent.pollIntervalMs,
        normalizedDefaults.poll_interval_ms ?? normalizedDefaults.pollIntervalMs,
      ),
      1000,
    ),
    routingFile: normalizeText(
      pickRaw(agent.routing_file ?? agent.routingFile, normalizedDefaults.routing_file ?? normalizedDefaults.routingFile),
    ),
    webhookUrl: normalizeText(
      pickRaw(agent.webhook_url ?? agent.webhookUrl, normalizedDefaults.webhook_url ?? normalizedDefaults.webhookUrl),
    ),
    webhookToken: normalizeText(
      pickRaw(agent.webhook_token ?? agent.webhookToken, normalizedDefaults.webhook_token ?? normalizedDefaults.webhookToken),
    ),
    notionApiKey: normalizeText(
      pickRaw(agent.notion_api_key ?? agent.notionApiKey, normalizedDefaults.notion_api_key ?? normalizedDefaults.notionApiKey),
    ),
    notionBaseUrl: normalizeText(
      pickRaw(agent.notion_base_url ?? agent.notionBaseUrl, normalizedDefaults.notion_base_url ?? normalizedDefaults.notionBaseUrl),
    ),
    notionVersion: normalizeText(
      pickRaw(agent.notion_version ?? agent.notionVersion, normalizedDefaults.notion_version ?? normalizedDefaults.notionVersion),
    ),
    extraEnv: normalizeExtraEnv(agent.extra_env ?? agent.extraEnv ?? normalizedDefaults.extra_env ?? normalizedDefaults.extraEnv),
  };
}

export function loadAgentRegistry(filePath = defaultAgentRegistryFile()) {
  if (!filePath || !existsSync(filePath)) {
    return {
      defaults: {},
      agents: [],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    const defaults = normalizeDefaults(parsed.defaults);
    const agents = Array.isArray(parsed.agents) ? parsed.agents.map((agent) => normalizeRegistryAgent(agent, defaults)) : [];

    return {
      defaults,
      agents,
    };
  } catch (error) {
    throw new Error(`Failed to load agent registry ${filePath}: ${String(error?.message || error)}`);
  }
}

export function buildAgentWebhookUrl(baseUrl, agentName) {
  const normalizedBaseUrl = normalizeText(baseUrl);
  const normalizedAgentName = normalizeText(agentName);

  if (!normalizedBaseUrl) {
    return null;
  }

  if (!normalizedAgentName) {
    return normalizedBaseUrl;
  }

  if (normalizedBaseUrl.includes('{agent_name}')) {
    return normalizedBaseUrl.replace('{agent_name}', encodeURIComponent(normalizedAgentName));
  }

  const trimmedBaseUrl = normalizedBaseUrl.replace(/\/+$/, '');
  if (trimmedBaseUrl.endsWith(`/${normalizedAgentName}`)) {
    return trimmedBaseUrl;
  }

  return `${trimmedBaseUrl}/${encodeURIComponent(normalizedAgentName)}`;
}

function readRegistry(input, options = {}) {
  if (typeof input === 'string') {
    return {
      registry: loadAgentRegistry(input),
      registryFile: input,
    };
  }

  return {
    registry: input || loadAgentRegistry(options.registryFile || defaultAgentRegistryFile(options.cwd)),
    registryFile: options.registryFile || null,
  };
}

export function deriveExecutorPoolFromAgentRegistry(input, options = {}) {
  const { registry, registryFile } = readRegistry(input, options);
  const fallbackWebhookUrl = normalizeText(options.fallbackWebhookUrl);
  const fallbackWebhookToken = normalizeText(options.fallbackWebhookToken);
  const notionApiKey = normalizeText(options.notionApiKey);
  const notionBaseUrl = normalizeText(options.notionBaseUrl);
  const notionVersion = normalizeText(options.notionVersion);

  return {
    defaults: registry.defaults,
    workers: registry.agents
      .filter((agent) => agent.enabled)
      .map((agent) => ({
        agentName: agent.agentName,
        projectId: agent.projectId,
        source: agent.source,
        targetType: agent.targetType,
        channel: agent.channel,
        ownerAgent: agent.ownerAgent,
        includeUnassigned: agent.includeUnassigned,
        onlyUnassigned: agent.onlyUnassigned,
        mode: agent.mode,
        pollIntervalMs: agent.pollIntervalMs,
        routingFile: agent.routingFile,
        webhookUrl: agent.webhookUrl || (agent.mode === 'webhook' ? buildAgentWebhookUrl(fallbackWebhookUrl, agent.agentName) : null),
        webhookToken: agent.webhookToken || fallbackWebhookToken,
        notionApiKey: agent.notionApiKey || notionApiKey,
        notionBaseUrl: agent.notionBaseUrl || notionBaseUrl,
        notionVersion: agent.notionVersion || notionVersion,
        extraEnv: {
          ...agent.extraEnv,
          ...(registryFile ? { AGENT_REGISTRY_FILE: registryFile } : {}),
        },
      })),
  };
}

export function resolveExecutorRouteFromAgentRegistry({
  agentName,
  registryFile,
  registry,
  fallbackUrl,
  fallbackToken,
} = {}) {
  const loadedRegistry = registry || loadAgentRegistry(registryFile);
  const normalizedAgentName = normalizeText(agentName);
  const defaults = normalizeDefaults(loadedRegistry.defaults);
  const matchedAgent = loadedRegistry.agents.find((agent) => agent.enabled && agent.agentName === normalizedAgentName);
  const baseUrl =
    matchedAgent?.webhookUrl ||
    normalizeText(defaults.webhook_url ?? defaults.webhookUrl) ||
    normalizeText(fallbackUrl);
  const token =
    matchedAgent?.webhookToken ||
    normalizeText(defaults.webhook_token ?? defaults.webhookToken) ||
    normalizeText(fallbackToken);
  const url = matchedAgent?.webhookUrl || buildAgentWebhookUrl(baseUrl, normalizedAgentName);

  if (!url) {
    return null;
  }

  return {
    url,
    token,
  };
}
