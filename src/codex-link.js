function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCodexThreadId(value) {
  const normalized = compact(value).replace(/^codex:\/\/threads\//i, '');
  return /^[0-9a-fA-F-]{12,}$/.test(normalized) ? normalized : '';
}

export function buildCodexThreadUrl(threadId) {
  const normalized = normalizeCodexThreadId(threadId);
  return normalized ? `codex://threads/${normalized}` : '';
}

export function isOpenableActionUrl(value) {
  return /^(codex|https?):\/\//i.test(compact(value));
}

export function resolveCodexActionUrl(input = {}, { env = process.env } = {}) {
  const explicitActionUrl = compact(input.actionUrl || input.action_url || input.openUrl || input.open_url);
  if (isOpenableActionUrl(explicitActionUrl)) {
    return explicitActionUrl;
  }

  const explicitThreadUrl = compact(input.threadUrl || input.thread_url);
  if (isOpenableActionUrl(explicitThreadUrl)) {
    return explicitThreadUrl;
  }

  const threadId =
    normalizeCodexThreadId(input.threadId || input.thread_id) ||
    normalizeCodexThreadId(env.CODEX_THREAD_ID);

  return buildCodexThreadUrl(threadId);
}
