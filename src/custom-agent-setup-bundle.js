function compact(value) {
  return String(value ?? '').trim();
}

export function extractNotionPageId(value) {
  const raw = compact(value);
  if (!raw) {
    return null;
  }

  const direct = raw.replace(/-/g, '');
  if (/^[0-9a-fA-F]{32}$/.test(direct)) {
    return direct.toLowerCase();
  }

  const urlMatch = raw.match(/([0-9a-fA-F]{32})(?:\?|$)/);
  if (urlMatch) {
    return String(urlMatch[1]).toLowerCase();
  }

  return null;
}

export function notionPageUrlFromId(value) {
  const pageId = extractNotionPageId(value);
  return pageId ? `https://www.notion.so/${pageId}` : null;
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
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
  targetPageUrl,
  targetPageId,
} = {}) {
  const normalizedPublicUrl = normalizePublicMcpUrl(publicMcpUrl);
  const authRequired = compact(bearerToken).length > 0;
  const localMcpOk = localMcpHealth?.ok === true;
  const cortexContextOk = cortexContext?.ok === true;
  const configuredPageIds = unique(
    cortexContext?.async_contract?.scope_guard?.configured_page_ids ||
      cortexContext?.async_contract?.scopeGuard?.configuredPageIds ||
      [],
  );
  const explicitTargetPageId = extractNotionPageId(targetPageId || targetPageUrl);
  const explicitTargetPageUrl = notionPageUrlFromId(explicitTargetPageId) || normalizePublicMcpUrl(targetPageUrl) || compact(targetPageUrl) || null;
  const explicitTargetInScope = explicitTargetPageId ? configuredPageIds.includes(explicitTargetPageId) : null;
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
  if (explicitTargetPageId && configuredPageIds.length > 0 && explicitTargetInScope === false) {
    blockers.push('target_page_out_of_scope');
  }

  const ready = blockers.length === 0;
  const pagesToGrantAccess = unique([
    explicitTargetPageUrl,
    project?.root_page_url || project?.rootPageUrl || null,
    notionPageUrlFromId(project?.notion_parent_page_id || project?.notionParentPageId),
    notionPageUrlFromId(project?.notion_review_page_id || project?.notionReviewPageId),
    notionPageUrlFromId(project?.notion_memory_page_id || project?.notionMemoryPageId),
    notionPageUrlFromId(project?.notion_scan_page_id || project?.notionScanPageId),
  ]);

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
      error: localMcpHealth?.error || null,
    },
    cortex_context: {
      ok: cortexContextOk,
      collaboration_mode: cortexContext?.collaboration_mode || cortexContext?.collaborationMode || null,
      configured_page_ids: configuredPageIds,
      error: cortexContext?.error || null,
    },
    auth: {
      required: authRequired,
      header_name: authRequired ? 'Authorization' : null,
      header_value_template: authRequired ? 'Bearer <CORTEX_MCP_BEARER_TOKEN>' : null,
      token_preview: authRequired ? redactToken(bearerToken) : null,
      allowed_hosts: Array.isArray(allowedHosts) ? allowedHosts.filter(Boolean) : [],
    },
    target_page: {
      page_id: explicitTargetPageId,
      page_url: explicitTargetPageUrl,
      in_project_scope: explicitTargetInScope,
    },
    notion_agent: {
      agent_name: 'Cortex',
      display_name: 'Cortex MCP',
      internal_role: 'router',
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
      pages_to_grant_access: pagesToGrantAccess,
    },
    admin_prereqs: adminPrereqs,
    next_actions: ready
      ? [
          '在 Notion 里创建或打开名为 `Cortex` 的 Custom Agent（内部职责仍然是 router / triage）',
          '到 Tools & Access -> Add connection -> Custom MCP server',
          `填入 MCP URL: ${normalizedPublicUrl}`,
          authRequired ? '补 Header 鉴权：Authorization: Bearer <CORTEX_MCP_BEARER_TOKEN>' : '当前无需额外 Header 鉴权',
          '只启用 4 个 Cortex tools，并先把写工具保持 Always ask',
          '打开 mention trigger 与 comment added trigger',
          '先在目标页面 `@Cortex` 跑一条 green comment 做首个真实接入',
        ]
      : [
          !normalizedPublicUrl ? '先配置一个当前可用的公网 HTTPS MCP URL（不能是 127.0.0.1）' : null,
          !localMcpOk ? '先修复本地 cortex-custom-agent-mcp 健康状态' : null,
          !cortexContextOk ? '先修复 /notion/custom-agent/context 返回' : null,
          explicitTargetPageId && explicitTargetInScope === false
            ? '当前目标 Notion 页面还不在 PRJ-cortex 的 page scope 内。拿到新 workspace 权限后，先运行 `npm run notion:bootstrap -- <target-page-url>` 生成新的工作台/协作记忆/执行文档，或用 `npm run project:upsert` 把新页面树写进项目配置。'
            : null,
        ].filter(Boolean),
  };
}
