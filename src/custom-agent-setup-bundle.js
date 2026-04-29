function compact(value) {
  return String(value ?? '').trim();
}

export function normalizePublicMcpUrl(value) {
  const raw = compact(value);
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    if (!/^https:$/.test(parsed.protocol)) {
      return null;
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function redactToken(token) {
  const raw = compact(token);
  if (!raw) {
    return null;
  }

  if (raw.length <= 10) {
    return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
  }

  return `${raw.slice(0, 6)}...${raw.slice(-6)}`;
}

export function buildCustomAgentSetupBundle({
  projectId,
  project,
  localMcpHealth,
  cortexContext,
  publicMcpUrl,
  bearerToken,
  allowedHosts = [],
} = {}) {
  const normalizedPublicUrl = normalizePublicMcpUrl(publicMcpUrl);
  const authRequired = compact(bearerToken).length > 0;
  const localMcpOk = localMcpHealth?.ok === true;
  const cortexContextOk = cortexContext?.ok === true;
  const adminPrereqs = [
    'Workspace admin 已开启 Settings -> Notion AI -> AI connectors -> Enable Custom MCP servers',
    '当前 workspace 为 Business 或 Enterprise 计划',
    '你对目标 Custom Agent 至少有 Can Edit 或 Full Access',
  ];

  const blockers = [];
  if (!localMcpOk) {
    blockers.push('local_mcp_unhealthy');
  }
  if (!cortexContextOk) {
    blockers.push('cortex_context_unavailable');
  }
  if (!normalizedPublicUrl) {
    blockers.push('public_mcp_url_missing');
  }

  const ready = blockers.length === 0;

  return {
    ok: ready,
    status: ready ? 'ready_for_notion_setup' : 'action_required',
    blockers,
    project_id: compact(projectId) || 'PRJ-cortex',
    public_mcp_url: normalizedPublicUrl,
    local_mcp: {
      ok: localMcpOk,
      service: localMcpHealth?.service || null,
      mcp_endpoint: localMcpHealth?.mcp_endpoint || '/mcp',
    },
    cortex_context: {
      ok: cortexContextOk,
      collaboration_mode: cortexContext?.collaboration_mode || cortexContext?.collaborationMode || null,
      configured_page_ids:
        cortexContext?.async_contract?.scope_guard?.configured_page_ids ||
        cortexContext?.async_contract?.scopeGuard?.configuredPageIds ||
        [],
    },
    auth: {
      required: authRequired,
      header_name: authRequired ? 'Authorization' : null,
      header_value_template: authRequired ? 'Bearer <CORTEX_MCP_BEARER_TOKEN>' : null,
      token_preview: authRequired ? redactToken(bearerToken) : null,
      allowed_hosts: Array.isArray(allowedHosts) ? allowedHosts.filter(Boolean) : [],
    },
    notion_agent: {
      agent_name: 'Cortex Router',
      display_name: 'Cortex Workflow MCP',
      tools: [
        'get_cortex_context',
        'ingest_notion_comment',
        'claim_next_command',
        'submit_agent_receipt',
      ],
      triggers: [
        'The agent is mentioned in a page or comment',
        'A comment is added to a page',
      ],
      pages_to_grant_access: [
        project?.root_page_url || project?.rootPageUrl || null,
        project?.notion_review_page_id || project?.notionReviewPageId || null,
        project?.notion_memory_page_id || project?.notionMemoryPageId || null,
        project?.notion_scan_page_id || project?.notionScanPageId || null,
      ].filter(Boolean),
    },
    admin_prereqs: adminPrereqs,
    next_actions: ready
      ? [
          '在 Notion 里创建或打开 Cortex Router Custom Agent',
          '到 Tools & Access -> Add connection -> Custom MCP server',
          `填入 MCP URL: ${normalizedPublicUrl}`,
          authRequired ? '补 Header 鉴权：Authorization: Bearer <CORTEX_MCP_BEARER_TOKEN>' : '当前无需额外 Header 鉴权',
          '只启用 4 个 Cortex tools，并先把写工具保持 Always ask',
          '打开 mention trigger 与 comment added trigger',
          '先在目标页面 @Cortex Router 跑一条 green comment 做首个真实接入',
        ]
      : [
          !normalizedPublicUrl ? '先配置一个当前可用的公网 HTTPS MCP URL（不能是 127.0.0.1）' : null,
          !localMcpOk ? '先修复本地 cortex-custom-agent-mcp 健康状态' : null,
          !cortexContextOk ? '先修复 /notion/custom-agent/context 返回' : null,
        ].filter(Boolean),
  };
}
