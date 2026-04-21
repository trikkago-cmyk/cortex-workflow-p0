import { buildRedAlertPayload, formatRedAlertText } from './outbox.js';
import { isLocalNotificationChannel } from './local-notification.js';

export function queueRedDecisionAlert({ store, decision, sessionId, channel = 'hiredcity', chatId = null, payload = {} }) {
  if (!sessionId && !isLocalNotificationChannel(channel)) {
    return null;
  }

  const redAlertPayload = buildRedAlertPayload(decision, payload);
  return store.enqueueOutbox({
    channel,
    sessionId: sessionId || null,
    chatId,
    text: formatRedAlertText(decision),
    payload: redAlertPayload,
    priority: 'urgent',
  });
}
