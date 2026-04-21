import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { assertPanghuRuntimeAllowed } from './panghu-runtime.js';

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function unixSecondsNow() {
  return Math.floor(Date.now() / 1000);
}

async function postDeliveryReceipt({ message, callbackTimeoutMs, logger }) {
  const callbackUrl = message?.payload?.callback_url;
  if (!callbackUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), callbackTimeoutMs);

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outbox_id: message.id,
        status: 'delivered',
        delivered_at: unixSecondsNow(),
        channel: message.channel || '',
        session_id: message.session_id || '',
        ...(message.chat_id ? { chat_id: message.chat_id } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(`delivery callback failed: ${response.status} ${bodyText}`.trim());
    }

    logger.info?.(`[panghu] delivery callback ok -> outbox ${message.id}`);
    return {
      id: message.id,
      status: 'delivered',
      callback_url: callbackUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createPanghuPoller(options = {}) {
  const baseUrl = options.baseUrl || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
  const pollIntervalMs = Number(options.pollIntervalMs || process.env.PANGHU_POLL_INTERVAL_MS || 1500);
  const runtimeConfig = assertPanghuRuntimeAllowed(
    {
      sendMode: options.sendMode,
      sendUrl: options.sendUrl,
      sendCommand: options.sendCommand,
      sendFile: options.sendFile,
      requireRealSender: options.requireRealSender,
      allowDryRun: options.allowDryRun,
    },
    process.env,
  );
  const sendMode = runtimeConfig.sendMode;
  const sendFile =
    runtimeConfig.sendFile || resolve(process.cwd(), 'tmp/panghu-sent-messages.jsonl');
  const sendCommand = runtimeConfig.sendCommand;
  const sendUrl = runtimeConfig.sendUrl;
  const sendToken = options.sendToken || process.env.PANGHU_SEND_TOKEN;
  const autoReceiptMode = options.autoReceiptMode || process.env.PANGHU_AUTO_RECEIPT_MODE || 'delivery';
  const callbackTimeoutMs = Number(options.callbackTimeoutMs || process.env.PANGHU_CALLBACK_TIMEOUT_MS || 5000);
  const logger = options.logger || console;
  const sender = options.sender || createSender({ sendMode, sendFile, sendCommand, sendUrl, sendToken, logger });

  let stopped = false;

  async function pollOnce() {
    const response = await fetch(`${baseUrl}/outbox`);
    if (!response.ok) {
      throw new Error(`Failed to fetch outbox: HTTP ${response.status}`);
    }

    const payload = await response.json();
    const pending = payload.pending || [];
    const handled = [];
    const callbacks = [];

    for (const message of pending) {
      try {
        await sender(message);

        const ackResponse = await fetch(`${baseUrl}/outbox/ack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: message.id }),
        });

        if (!ackResponse.ok) {
          throw new Error(`Failed to ack outbox ${message.id}: HTTP ${ackResponse.status}`);
        }

        handled.push({ id: message.id, status: 'sent' });

        if (autoReceiptMode !== 'off' && message?.payload?.callback_url) {
          try {
            const callbackResult = await postDeliveryReceipt({
              message,
              callbackTimeoutMs,
              logger,
            });
            if (callbackResult) {
              callbacks.push(callbackResult);
            }
          } catch (error) {
            const errorMessage = String(error?.message || error);
            callbacks.push({
              id: message.id,
              status: 'failed',
              callback_url: message.payload.callback_url,
              error: errorMessage,
            });
            logger.error?.(`[panghu] delivery callback failed for outbox ${message.id}: ${errorMessage}`);
          }
        }
      } catch (error) {
        await fetch(`${baseUrl}/outbox/fail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: message.id, error: String(error?.message || error) }),
        });

        handled.push({ id: message.id, status: 'failed', error: String(error?.message || error) });
      }
    }

    return {
      pendingCount: pending.length,
      handled,
      callbacks,
      stats: payload.stats || [],
    };
  }

  async function start() {
    logger.info?.(`[panghu] polling ${baseUrl} every ${pollIntervalMs}ms using ${sendMode} sender`);
    while (!stopped) {
      try {
        await pollOnce();
      } catch (error) {
        logger.error?.('[panghu] poll failed', error);
      }

      if (!stopped) {
        await sleep(pollIntervalMs);
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

export function createSender({ sendMode, sendFile, sendCommand, sendUrl, sendToken, logger }) {
  if (sendMode === 'stdout') {
    return async (message) => {
      logger.log?.(`[panghu] send -> ${message.session_id || message.chat_id || 'unknown'}\n${message.text}`);
      if (message.payload) {
        logger.log?.(`[panghu] payload -> ${JSON.stringify(message.payload)}`);
      }
    };
  }

  if (sendMode === 'file') {
    mkdirSync(dirname(sendFile), { recursive: true });
    return async (message) => {
      appendFileSync(
        sendFile,
        `${JSON.stringify({
          sent_at: new Date().toISOString(),
          ...message,
        })}\n`,
      );
    };
  }

  if (sendMode === 'command') {
    return async (message) =>
      new Promise((resolvePromise, rejectPromise) => {
        const target = message.session_id || message.chat_id || '';
        const payloadJson = JSON.stringify(message.payload || null);
        const child = spawn(sendCommand, {
          shell: true,
          stdio: 'inherit',
          env: {
            ...process.env,
            PANGHU_MESSAGE_ID: String(message.id),
            PANGHU_CHANNEL: message.channel || '',
            PANGHU_SESSION_ID: message.session_id || '',
            PANGHU_CHAT_ID: message.chat_id || '',
            PANGHU_TEXT: message.text || '',
            PANGHU_PAYLOAD_JSON: payloadJson,
            MESSAGE_ID: String(message.id),
            CHANNEL: message.channel || '',
            SESSION_ID: message.session_id || '',
            CHAT_ID: message.chat_id || '',
            TARGET: target,
            TEXT: message.text || '',
            PAYLOAD_JSON: payloadJson,
            CALLBACK_URL: message?.payload?.callback_url || '',
          },
        });

        child.on('exit', (code) => {
          if (code === 0) {
            resolvePromise();
            return;
          }
          rejectPromise(new Error(`send command exited with code ${code}`));
        });
        child.on('error', rejectPromise);
      });
  }

  if (sendMode === 'http') {
    return async (message) => {
      const sessionId = message.session_id || message.chat_id || '';
      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sendToken ? { Authorization: `Bearer ${sendToken}` } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          text: message.text || '',
          token: sendToken || '',
          id: message.id,
          channel: message.channel || '',
          chat_id: message.chat_id || '',
          payload: message.payload || null,
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(`HTTP sender failed: ${response.status} ${bodyText}`.trim());
      }

      logger.info?.(`[panghu] http send ok -> ${message.session_id || message.chat_id || 'unknown'}`);
    };
  }

  throw new Error(`Unsupported PANGHU_SEND_MODE ${sendMode}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const poller = createPanghuPoller();

  process.on('SIGINT', () => {
    poller.stop();
  });

  process.on('SIGTERM', () => {
    poller.stop();
  });

  await poller.start();
}
