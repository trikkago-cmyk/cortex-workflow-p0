import { existsSync, readFileSync } from 'node:fs';

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeRoute(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const url = normalizeText(value.url);
  if (!url) {
    return null;
  }

  return {
    url,
    token: normalizeText(value.token),
  };
}

export function loadExecutorRouting(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return {
      default: null,
      agents: {},
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    const agents = Object.fromEntries(
      Object.entries(parsed.agents || {})
        .map(([agentName, route]) => [String(agentName).trim(), normalizeRoute(route)])
        .filter(([agentName, route]) => agentName && route),
    );

    return {
      default: normalizeRoute(parsed.default),
      agents,
    };
  } catch {
    return {
      default: null,
      agents: {},
    };
  }
}

export function resolveExecutorRoute({
  agentName,
  routingFile,
  routingConfig,
  fallbackUrl,
  fallbackToken,
}) {
  const routes = routingConfig || loadExecutorRouting(routingFile);
  const normalizedAgentName = normalizeText(agentName);

  if (normalizedAgentName && routes.agents?.[normalizedAgentName]) {
    return routes.agents[normalizedAgentName];
  }

  if (routes.default) {
    return routes.default;
  }

  const url = normalizeText(fallbackUrl);
  if (!url) {
    return null;
  }

  return {
    url,
    token: normalizeText(fallbackToken),
  };
}
