import { existsSync, readFileSync } from 'node:fs';

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

function defaultOwnerAgent({ ownerAgent, source, agentName }) {
  if (ownerAgent !== undefined) {
    return ownerAgent === null ? null : normalizeText(ownerAgent);
  }

  if (source === 'notion_comment') {
    return agentName;
  }

  return null;
}

function normalizeWorkerConfig(worker = {}, defaults = {}) {
  const agentName = normalizeText(worker.agent_name || worker.agentName);
  if (!agentName) {
    throw new Error('executor worker config requires agent_name');
  }

  const explicitWorkerOwnerAgent =
    Object.prototype.hasOwnProperty.call(worker, 'owner_agent')
      ? worker.owner_agent
      : Object.prototype.hasOwnProperty.call(worker, 'ownerAgent')
        ? worker.ownerAgent
        : undefined;
  const explicitDefaultOwnerAgent =
    Object.prototype.hasOwnProperty.call(defaults, 'owner_agent')
      ? defaults.owner_agent
      : Object.prototype.hasOwnProperty.call(defaults, 'ownerAgent')
        ? defaults.ownerAgent
        : undefined;
  const source = normalizeText(worker.source ?? defaults.source) || 'notion_comment';
  const ownerAgent = defaultOwnerAgent({
    ownerAgent: explicitWorkerOwnerAgent !== undefined ? explicitWorkerOwnerAgent : explicitDefaultOwnerAgent,
    source,
    agentName,
  });

  return {
    agentName,
    projectId: normalizeText(worker.project_id || worker.projectId || defaults.project_id || defaults.projectId) || 'PRJ-cortex',
    source,
    targetType: normalizeText(worker.target_type || worker.targetType || defaults.target_type || defaults.targetType),
    channel: normalizeText(worker.channel || defaults.channel),
    ownerAgent,
    includeUnassigned: normalizeBoolean(
      worker.include_unassigned ?? worker.includeUnassigned ?? defaults.include_unassigned ?? defaults.includeUnassigned,
      false,
    ),
    onlyUnassigned: normalizeBoolean(
      worker.only_unassigned ?? worker.onlyUnassigned ?? defaults.only_unassigned ?? defaults.onlyUnassigned,
      false,
    ),
    mode: normalizeText(worker.mode || defaults.mode) || 'webhook',
    pollIntervalMs: normalizeNumber(
      worker.poll_interval_ms ?? worker.pollIntervalMs ?? defaults.poll_interval_ms ?? defaults.pollIntervalMs,
      1000,
    ),
    routingFile: normalizeText(worker.routing_file || worker.routingFile || defaults.routing_file || defaults.routingFile),
    webhookUrl: normalizeText(worker.webhook_url || worker.webhookUrl || defaults.webhook_url || defaults.webhookUrl),
    webhookToken: normalizeText(worker.webhook_token || worker.webhookToken || defaults.webhook_token || defaults.webhookToken),
    notionApiKey: normalizeText(worker.notion_api_key || worker.notionApiKey || defaults.notion_api_key || defaults.notionApiKey),
    notionBaseUrl: normalizeText(worker.notion_base_url || worker.notionBaseUrl || defaults.notion_base_url || defaults.notionBaseUrl),
    notionVersion: normalizeText(worker.notion_version || worker.notionVersion || defaults.notion_version || defaults.notionVersion),
    extraEnv: worker.extra_env && typeof worker.extra_env === 'object' ? worker.extra_env : {},
  };
}

export function loadExecutorPoolConfig(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return {
      defaults: {},
      workers: [],
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    const defaults = parsed.defaults && typeof parsed.defaults === 'object' ? parsed.defaults : {};
    const workers = Array.isArray(parsed.workers) ? parsed.workers.map((worker) => normalizeWorkerConfig(worker, defaults)) : [];

    return {
      defaults,
      workers,
    };
  } catch (error) {
    throw new Error(`Failed to load executor pool config ${filePath}: ${String(error?.message || error)}`);
  }
}

export function buildExecutorWorkerEnv(worker) {
  return {
    AGENT_NAME: worker.agentName,
    PROJECT_ID: worker.projectId,
    SOURCE: worker.source,
    ...(worker.targetType ? { TARGET_TYPE: worker.targetType } : {}),
    ...(worker.channel ? { CHANNEL: worker.channel } : {}),
    ...(worker.ownerAgent !== null ? { OWNER_AGENT: worker.ownerAgent } : {}),
    INCLUDE_UNASSIGNED: worker.includeUnassigned ? '1' : '0',
    ONLY_UNASSIGNED: worker.onlyUnassigned ? '1' : '0',
    EXECUTOR_MODE: worker.mode,
    EXECUTOR_POLL_INTERVAL_MS: String(worker.pollIntervalMs),
    ...(worker.routingFile ? { EXECUTOR_ROUTING_FILE: worker.routingFile } : {}),
    ...(worker.webhookUrl ? { EXECUTOR_WEBHOOK_URL: worker.webhookUrl } : {}),
    ...(worker.webhookToken ? { EXECUTOR_WEBHOOK_TOKEN: worker.webhookToken } : {}),
    ...(worker.notionApiKey ? { NOTION_API_KEY: worker.notionApiKey } : {}),
    ...(worker.notionBaseUrl ? { NOTION_BASE_URL: worker.notionBaseUrl } : {}),
    ...(worker.notionVersion ? { NOTION_VERSION: worker.notionVersion } : {}),
    ...worker.extraEnv,
  };
}
