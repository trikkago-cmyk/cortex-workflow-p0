import { sendMacOSNotification, buildNotificationPayload, isLocalNotificationChannel } from './local-notification.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response) {
  const raw = await response.text();
  return raw ? JSON.parse(raw) : {};
}

async function requestJson(fetchImpl, baseUrl, pathname, { method = 'GET', body } = {}) {
  const response = await fetchImpl(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await readJson(response);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status} ${pathname}`);
  }

  return payload;
}

export function createLocalNotificationPoller(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const sendNotification = options.sendNotification || sendMacOSNotification;
  const baseUrl = options.baseUrl || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
  const pollIntervalMs = Number(options.pollIntervalMs || process.env.LOCAL_NOTIFICATION_POLL_INTERVAL_MS || 1000);
  const logger = options.logger || console;
  let stopped = false;

  async function pollOnce() {
    const payload = await requestJson(fetchImpl, baseUrl, '/outbox?status=pending&limit=20');
    const pending = Array.isArray(payload.pending) ? payload.pending : [];
    const targets = pending.filter((message) => isLocalNotificationChannel(message.channel));

    if (targets.length === 0) {
      return {
        delivered: 0,
        skipped: pending.length,
      };
    }

    for (const message of targets) {
      try {
        await sendNotification(buildNotificationPayload(message));
        await requestJson(fetchImpl, baseUrl, '/outbox/ack', {
          method: 'POST',
          body: { id: message.id },
        });
      } catch (error) {
        const errorMessage = String(error?.message || error);
        logger.error?.(`[local-notifier] failed to deliver outbox ${message.id}: ${errorMessage}`);
        await requestJson(fetchImpl, baseUrl, '/outbox/fail', {
          method: 'POST',
          body: {
            id: message.id,
            error: errorMessage,
          },
        });
      }
    }

    return {
      delivered: targets.length,
      skipped: pending.length - targets.length,
    };
  }

  async function start() {
    logger.info?.(`[local-notifier] polling ${baseUrl} every ${pollIntervalMs}ms`);
    while (!stopped) {
      try {
        const result = await pollOnce();
        if (result.delivered === 0) {
          await sleep(pollIntervalMs);
        }
      } catch (error) {
        logger.error?.('[local-notifier] poll failed', error);
        if (!stopped) {
          await sleep(pollIntervalMs);
        }
      }
    }
  }

  function stop() {
    stopped = true;
  }

  return {
    pollOnce,
    start,
    stop,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const poller = createLocalNotificationPoller();
  poller.start();
}

