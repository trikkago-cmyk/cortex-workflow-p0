import { notionCollaborationMode } from './notion-collaboration-mode.js';

const LEGACY_NOTION_API_SCRIPTS = new Set([
  'review:notion-sync',
  'execution:notion-sync',
  'project-index:notion-sync',
  'memory:notion-sync',
  'notion:sync-all',
]);

function normalizeWriteMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return '';
  }

  if (['custom_agent_mcp', 'custom-agent-mcp', 'custom_agent', 'custom-agent', 'mcp', 'disabled', 'off'].includes(raw)) {
    return 'custom_agent_mcp';
  }

  if (['legacy_api', 'legacy-api', 'legacy_sync', 'legacy-sync', 'token_sync', 'token-sync', 'internal_integration'].includes(raw)) {
    return 'legacy_api';
  }

  return raw;
}

export function notionWriteMode(env = process.env) {
  const explicit = normalizeWriteMode(
    env.NOTION_WRITE_MODE ||
      env.CORTEX_NOTION_WRITE_MODE ||
      env.NOTION_LOCAL_WRITE_MODE ||
      env.NOTION_SYNC_WRITE_MODE,
  );

  if (explicit) {
    return explicit;
  }

  return notionCollaborationMode(env) === 'legacy_polling' ? 'legacy_api' : 'custom_agent_mcp';
}

export function notionLegacyApiWritesEnabled(env = process.env) {
  return notionWriteMode(env) === 'legacy_api';
}

export function isLegacyNotionApiWriteScript(scriptName = '') {
  return LEGACY_NOTION_API_SCRIPTS.has(String(scriptName || '').trim());
}
