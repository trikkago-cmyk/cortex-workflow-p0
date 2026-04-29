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

  return raw.toLowerCase();
}

export function extractProjectScopePageIds(project = {}) {
  return Array.from(
    new Set(
      [
        extractNotionPageId(project.root_page_url || project.rootPageUrl),
        extractNotionPageId(project.notion_parent_page_id || project.notionParentPageId),
        extractNotionPageId(project.notion_review_page_id || project.notionReviewPageId),
        extractNotionPageId(project.notion_memory_page_id || project.notionMemoryPageId),
        extractNotionPageId(project.notion_scan_page_id || project.notionScanPageId),
      ].filter(Boolean),
    ),
  );
}

export function pickPrimaryProjectPageId(project = {}) {
  return (
    extractNotionPageId(project.notion_parent_page_id || project.notionParentPageId) ||
    extractNotionPageId(project.root_page_url || project.rootPageUrl) ||
    extractNotionPageId(project.notion_review_page_id || project.notionReviewPageId) ||
    extractNotionPageId(project.notion_scan_page_id || project.notionScanPageId) ||
    null
  );
}

export function buildNotionCustomAgentLiveUatReport({
  templateProjectId,
  projectId,
  scenarios = [],
  cleanup = {},
} = {}) {
  const normalizedScenarios = Array.isArray(scenarios) ? scenarios : [];
  const passed = normalizedScenarios.filter((scenario) => scenario?.passed === true);
  const failed = normalizedScenarios.filter((scenario) => scenario?.passed !== true);
  const cleanupOk = cleanup?.ok !== false;

  return {
    ok: failed.length === 0 && cleanupOk,
    status: failed.length === 0 && cleanupOk ? 'ready' : 'blocking',
    template_project_id: compact(templateProjectId) || null,
    project_id: compact(projectId) || null,
    summary: {
      total: normalizedScenarios.length,
      passed: passed.length,
      failed: failed.length,
      cleanup_archived_outbox: Number(cleanup?.archived_outbox_count || 0),
      cleanup_remaining_pending: Number(cleanup?.remaining_pending_count || 0),
    },
    failed_scenarios: failed.map((scenario) => ({
      name: scenario.name,
      reason: scenario.reason || 'scenario_failed',
    })),
  };
}
