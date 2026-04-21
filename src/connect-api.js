import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  defaultAgentRegistryFile,
  loadAgentRegistry,
  resolveExecutorRouteFromAgentRegistry,
} from './agent-registry.js';
import { onboardExternalAgent } from './agent-onboarding.js';
import { loadExecutorRouting, resolveExecutorRoute } from './executor-routing.js';

function compact(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

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

function normalizeAliases(input) {
  if (Array.isArray(input)) {
    return [...new Set(input.map((item) => compact(item)?.replace(/^@+/, '')).filter(Boolean))];
  }

  const csv = compact(input);
  if (!csv) {
    return [];
  }

  return [...new Set(csv.split(',').map((item) => compact(item)?.replace(/^@+/, '')).filter(Boolean))];
}

function normalizeExtraEnv(input) {
  if (!input) {
    return {};
  }

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function resolveCodexSessionId(agent = {}) {
  return compact(
    agent?.extraEnv?.CODEX_SESSION_ID ||
      agent?.extraEnv?.CODEX_THREAD_ID ||
      agent?.extraEnv?.codex_session_id ||
      agent?.extraEnv?.codex_thread_id,
  );
}

function resolveCodexThreadName(agent = {}) {
  return compact(
    agent?.extraEnv?.CODEX_THREAD_NAME ||
      agent?.extraEnv?.codex_thread_name,
  );
}

function normalizeRoute(route, source) {
  if (!route?.url) {
    return null;
  }

  return {
    url: route.url,
    hasToken: Boolean(route.token),
    source,
  };
}

function defaultHealthUrl(routeUrl) {
  const normalizedRouteUrl = compact(routeUrl);
  if (!normalizedRouteUrl) {
    return null;
  }

  try {
    const url = new URL(normalizedRouteUrl);
    url.pathname = '/health';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function loadNotionRouting(filePath) {
  const routing = readJsonFile(filePath, {
    aliases: {},
    pages: {},
    blocks: {},
    defaults: {},
  });

  return {
    aliases: routing.aliases && typeof routing.aliases === 'object' ? routing.aliases : {},
    pages: routing.pages && typeof routing.pages === 'object' ? routing.pages : {},
    blocks: routing.blocks && typeof routing.blocks === 'object' ? routing.blocks : {},
    defaults: routing.defaults && typeof routing.defaults === 'object' ? routing.defaults : {},
  };
}

function collectAliases(routing, agentName) {
  return Object.entries(routing.aliases || {})
    .filter(([, mappedAgent]) => compact(mappedAgent) === agentName)
    .map(([alias]) => alias)
    .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
}

function buildAgentStatus({ agent, aliases, effectiveRoute, executorRoute }) {
  const issues = [];
  const warnings = [];

  if (agent.mode === 'webhook' && !effectiveRoute?.url) {
    issues.push('missing_webhook_route');
  }

  if (agent.handlerKind === 'external_webhook' && !compact(agent.webhookUrl)) {
    warnings.push('explicit_webhook_url_missing');
  }

  if (agent.handlerKind === 'codex_resume' && !resolveCodexSessionId(agent)) {
    issues.push('missing_codex_session_id');
  }

  if (aliases.length === 0) {
    warnings.push('mention_alias_missing');
  }

  if (executorRoute?.url && effectiveRoute?.url && executorRoute.url !== effectiveRoute.url) {
    warnings.push('executor_route_differs_from_effective_route');
  }

  if (!agent.enabled) {
    return {
      status: 'disabled',
      issues,
      warnings,
    };
  }

  if (issues.length > 0) {
    return {
      status: 'misconfigured',
      issues,
      warnings,
    };
  }

  if (warnings.length > 0) {
    return {
      status: 'warning',
      issues,
      warnings,
    };
  }

  return {
    status: 'ready',
    issues,
    warnings,
  };
}

function buildConnectAgentSnapshot({ agent, registry, executorRouting, notionRouting }) {
  const registryRoute = normalizeRoute(
    resolveExecutorRouteFromAgentRegistry({
      agentName: agent.agentName,
      registry,
    }),
    'agent_registry',
  );
  const executorAgentRoute = normalizeRoute(executorRouting.agents?.[agent.agentName], 'executor_routing');
  const executorDefaultRoute = normalizeRoute(executorRouting.default, 'executor_routing_default');
  const fallbackExecutorRoute = normalizeRoute(
    resolveExecutorRoute({
      agentName: agent.agentName,
      routingConfig: executorRouting,
    }),
    executorAgentRoute ? 'executor_routing' : executorDefaultRoute ? 'executor_routing_default' : null,
  );
  const effectiveRoute = registryRoute || fallbackExecutorRoute;
  const aliases = collectAliases(notionRouting, agent.agentName);
  const status = buildAgentStatus({
    agent,
    aliases,
    effectiveRoute,
    executorRoute: executorAgentRoute || executorDefaultRoute,
  });

  return {
    agentName: agent.agentName,
    enabled: agent.enabled,
    handlerKind: agent.handlerKind,
    projectId: agent.projectId,
    source: agent.source,
    targetType: agent.targetType,
    channel: agent.channel,
    ownerAgent: agent.ownerAgent,
    includeUnassigned: agent.includeUnassigned,
    onlyUnassigned: agent.onlyUnassigned,
    mode: agent.mode,
    pollIntervalMs: agent.pollIntervalMs,
    webhookUrl: agent.webhookUrl,
    webhookTokenConfigured: Boolean(agent.webhookToken),
    codexSessionId: resolveCodexSessionId(agent),
    codexThreadName: resolveCodexThreadName(agent),
    extraEnvKeys: Object.keys(agent.extraEnv || {}).sort(),
    aliases,
    registryRoute,
    executorRoute: executorAgentRoute || executorDefaultRoute,
    effectiveRoute,
    status: status.status,
    issues: status.issues,
    warnings: status.warnings,
  };
}

function resolveConnectFiles(options = {}) {
  const cwd = options.cwd || process.cwd();
  return {
    agentRegistryFile:
      options.agentRegistryFile || process.env.AGENT_REGISTRY_FILE || defaultAgentRegistryFile(cwd),
    notionRoutingFile:
      options.notionRoutingFile || process.env.NOTION_ROUTING_RULES_PATH || resolve(cwd, 'docs', 'notion-routing.json'),
    executorRoutingFile:
      options.executorRoutingFile || process.env.EXECUTOR_ROUTING_FILE || resolve(cwd, 'docs', 'executor-routing.json'),
  };
}

export function listConnectAgents(options = {}) {
  const files = resolveConnectFiles(options);
  const registry = loadAgentRegistry(files.agentRegistryFile);
  const notionRouting = loadNotionRouting(files.notionRoutingFile);
  const executorRouting = loadExecutorRouting(files.executorRoutingFile);

  return {
    files,
    agents: registry.agents
      .map((agent) =>
        buildConnectAgentSnapshot({
          agent,
          registry,
          executorRouting,
          notionRouting,
        }),
      )
      .sort((left, right) => left.agentName.localeCompare(right.agentName, 'en')),
  };
}

export function getConnectAgent(agentName, options = {}) {
  const normalizedAgentName = compact(agentName);
  if (!normalizedAgentName) {
    throw new Error('agent_name is required');
  }

  const result = listConnectAgents(options);
  const agent = result.agents.find((item) => item.agentName === normalizedAgentName);
  return {
    ...result,
    agent: agent || null,
  };
}

export function onboardConnectAgent(payload = {}, options = {}) {
  const files = resolveConnectFiles(options);
  const agentName = compact(payload.agent_name || payload.agentName);
  const webhookUrl = compact(payload.webhook_url || payload.webhookUrl);
  const extraEnv = normalizeExtraEnv(payload.extra_env || payload.extraEnv);

  if (compact(payload.codex_session_id || payload.codexSessionId)) {
    extraEnv.CODEX_SESSION_ID = compact(payload.codex_session_id || payload.codexSessionId);
  }
  if (compact(payload.codex_thread_name || payload.codexThreadName)) {
    extraEnv.CODEX_THREAD_NAME = compact(payload.codex_thread_name || payload.codexThreadName);
  }
  if (compact(payload.codex_resume_prompt_prefix || payload.codexResumePromptPrefix)) {
    extraEnv.CODEX_RESUME_PROMPT_PREFIX = compact(
      payload.codex_resume_prompt_prefix || payload.codexResumePromptPrefix,
    );
  }

  if (!agentName) {
    throw new Error('agent_name is required');
  }

  if (!webhookUrl) {
    throw new Error('webhook_url is required');
  }

  const result = onboardExternalAgent({
    agentRegistryFile: files.agentRegistryFile,
    notionRoutingFile: files.notionRoutingFile,
    executorRoutingFile: files.executorRoutingFile,
    agentName,
    aliases: normalizeAliases(payload.aliases || payload.alias_csv || payload.aliases_csv),
    webhookUrl,
    webhookToken: compact(payload.webhook_token || payload.webhookToken) || '',
    projectId: compact(payload.project_id || payload.projectId) || 'PRJ-cortex',
    ownerAgent: compact(payload.owner_agent || payload.ownerAgent),
    source: compact(payload.source) || 'notion_comment',
    mode: compact(payload.mode) || 'webhook',
    pollIntervalMs: Number(payload.poll_interval_ms || payload.pollIntervalMs || 1000),
    handlerKind: compact(payload.handler_kind || payload.handlerKind) || 'external_webhook',
    channel: compact(payload.channel),
    targetType: compact(payload.target_type || payload.targetType),
    includeUnassigned: Boolean(payload.include_unassigned ?? payload.includeUnassigned),
    onlyUnassigned: Boolean(payload.only_unassigned ?? payload.onlyUnassigned),
    enabled: payload.enabled === undefined ? true : Boolean(payload.enabled),
    extraEnv,
  });

  const detail = getConnectAgent(agentName, files);
  return {
    files,
    changes: result,
    agent: detail.agent,
  };
}

export async function verifyConnectAgent(agentName, options = {}) {
  const normalizedAgentName = compact(agentName);
  if (!normalizedAgentName) {
    throw new Error('agent_name is required');
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const detail = getConnectAgent(normalizedAgentName, options);
  if (!detail.agent) {
    return {
      ok: false,
      status: 'missing',
      agent: null,
      checks: [],
      issues: ['agent_not_found'],
      warnings: [],
      healthUrl: null,
    };
  }

  const checks = [
    {
      name: 'registry_entry',
      status: 'pass',
      detail: 'agent registry entry exists',
    },
    {
      name: 'mention_alias',
      status: detail.agent.aliases.length > 0 ? 'pass' : 'warn',
      detail: detail.agent.aliases.length > 0 ? `aliases=${detail.agent.aliases.join(',')}` : 'no aliases configured',
    },
    {
      name: 'effective_route',
      status: detail.agent.effectiveRoute?.url ? 'pass' : 'fail',
      detail: detail.agent.effectiveRoute?.url || 'missing',
    },
  ];

  const issues = [...detail.agent.issues];
  const warnings = [...detail.agent.warnings];

  let healthUrl = compact(options.healthUrl || options.health_url) || defaultHealthUrl(detail.agent.effectiveRoute?.url);

  if (options.network === true || options.network === 'true' || options.network === '1') {
    if (!healthUrl) {
      checks.push({
        name: 'network_health',
        status: 'warn',
        detail: 'health url unavailable',
      });
      warnings.push('health_url_unavailable');
    } else if (typeof fetchImpl !== 'function') {
      checks.push({
        name: 'network_health',
        status: 'warn',
        detail: 'fetch implementation unavailable',
      });
      warnings.push('fetch_unavailable');
    } else {
      try {
        const response = await fetchImpl(healthUrl, { method: 'GET' });
        checks.push({
          name: 'network_health',
          status: response.ok ? 'pass' : 'fail',
          detail: `http ${response.status}`,
        });
        if (!response.ok) {
          issues.push(`health_check_failed:${response.status}`);
        }
      } catch (error) {
        checks.push({
          name: 'network_health',
          status: 'fail',
          detail: String(error?.message || error),
        });
        issues.push('health_check_unreachable');
      }
    }
  } else {
    healthUrl = healthUrl || null;
  }

  let status = detail.agent.status;
  if (detail.agent.enabled && issues.length > 0) {
    status = 'misconfigured';
  } else if (detail.agent.enabled && warnings.length > 0 && status === 'ready') {
    status = 'warning';
  }

  return {
    ok: issues.length === 0,
    status,
    agent: detail.agent,
    checks,
    issues,
    warnings,
    healthUrl,
  };
}
