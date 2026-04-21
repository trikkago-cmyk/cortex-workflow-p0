import { normalizeCodexThreadId, resolveCodexActionUrl } from './codex-link.js';

export function buildRedAlertPayload(decision, options = {}) {
  const threadId = normalizeCodexThreadId(options.threadId || options.thread_id);
  const actionUrl = resolveCodexActionUrl({
    actionUrl: options.actionUrl || options.action_url,
    threadUrl: options.threadUrl || options.thread_url,
    threadId,
  });

  return {
    type: 'red_alert',
    projectId: decision.projectId,
    decisionId: decision.decisionId,
    question: decision.question,
    recommendation: decision.recommendation,
    impact: decision.impactScope,
    thread_id: threadId || undefined,
    action_url: actionUrl || undefined,
    action_label: actionUrl ? '立即查看' : undefined,
    urgency:
      decision.irreversible || ['data', 'security', 'deploy'].includes(decision.impactScope) ? 'high' : 'normal',
  };
}

export function formatRedAlertText(decision) {
  return [
    '🔴 需要你拍板',
    '',
    `项目：${decision.projectId}`,
    `决策：${decision.question}`,
    `推荐：${decision.recommendation || '待补充'}`,
    `影响：${decision.impactScope || 'module'}`,
    '',
    '回复 approve_1 / approve_2 / improve <说明> / stop',
  ].join('\n');
}
