function normalizeMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return 'custom_agent';
  }

  if (['custom_agent', 'custom-agent', 'custom'].includes(raw)) {
    return 'custom_agent';
  }

  if (['legacy_polling', 'legacy-polling', 'polling', 'legacy'].includes(raw)) {
    return 'legacy_polling';
  }

  return raw;
}

export function notionCollaborationMode(env = process.env) {
  return normalizeMode(env.NOTION_COLLAB_MODE || env.NOTION_ASYNC_MODE || 'custom_agent');
}

export function notionCommentPollingEnabled(env = process.env) {
  const explicit = String(env.NOTION_COMMENT_POLL_ENABLE ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(explicit)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(explicit)) {
    return false;
  }

  return notionCollaborationMode(env) === 'legacy_polling';
}
