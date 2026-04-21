import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { queueRedDecisionAlert } from '../src/adapter.js';
import { createStore } from '../src/store.js';
import { buildNotificationPayload, isLocalNotificationChannel, sendMacOSNotification } from '../src/local-notification.js';
import { createLocalNotificationPoller } from '../src/local-notification-poller.js';
import { buildCodexThreadUrl } from '../src/codex-link.js';

function createFakeChild(exitCode = 0) {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.unref = () => {};
  queueMicrotask(() => {
    child.emit('close', exitCode);
  });
  return child;
}

test('local notification channel is recognized and can queue without session target', () => {
  const store = createStore({ dbPath: ':memory:' });
  store.ensureProject({
    projectId: 'PRJ-cortex',
    name: 'Cortex',
  });

  const queued = queueRedDecisionAlert({
    store,
    decision: {
      projectId: 'PRJ-cortex',
      decisionId: 'DR-001',
      question: '是否立即切换到新链路？',
      recommendation: '先停住，等待拍板',
      impactScope: 'cross_module',
      irreversible: true,
    },
    channel: 'local_notification',
  });

  assert.equal(isLocalNotificationChannel('local_notification'), true);
  assert.equal(queued.channel, 'local_notification');
  assert.equal(queued.sessionId, null);
  store.close();
});

test('buildNotificationPayload converts red alert payload into macOS notification content', () => {
  const payload = buildNotificationPayload({
    text: 'fallback',
    payload: {
      projectId: 'PRJ-cortex',
      decisionId: 'DR-001',
      question: '热点池服务不可用，怎么处理？',
      recommendation: '建议等待 5 分钟后重试',
      impact: 'module',
    },
  });

  assert.match(payload.title, /PRJ-cortex/);
  assert.match(payload.subtitle, /DR-001/);
  assert.match(payload.body, /热点池服务不可用/);
  assert.match(payload.body, /等待 5 分钟后重试/);
});

test('buildNotificationPayload exposes actionable Codex thread link for red alerts', () => {
  const threadId = '019d0a77-f353-7bd2-9acd-8e80f38606dd';
  const payload = buildNotificationPayload({
    text: 'fallback',
    payload: {
      type: 'red_alert',
      projectId: 'PRJ-cortex',
      decisionId: 'DR-003',
      question: '需要立即查看当前工作对话吗？',
      recommendation: '建议直接进入对应线程',
      thread_id: threadId,
    },
  });

  assert.equal(payload.actionUrl, buildCodexThreadUrl(threadId));
  assert.equal(payload.actionLabel, '立即查看');
  assert.equal(payload.requiresAction, true);
});

test('sendMacOSNotification launches follow-up dialog for actionable red alerts', async () => {
  const invocations = [];
  const spawnImpl = (command, args, options) => {
    invocations.push({ command, args, options });
    return createFakeChild();
  };

  const result = await sendMacOSNotification(
    {
      title: '🔴 Cortex 红灯 · PRJ-cortex',
      subtitle: '决策 DR-004',
      body: '问题：需要直接打开当前工作对话',
      actionUrl: 'codex://threads/019d0a77-f353-7bd2-9acd-8e80f38606dd',
      actionLabel: '立即查看',
      requiresAction: true,
    },
    { spawnImpl },
  );

  assert.equal(invocations.length, 2);
  assert.match(invocations[0].args[1], /display notification/);
  assert.match(invocations[1].args[1], /display dialog/);
  assert.match(invocations[1].args[1], /open location "codex:\/\/threads\/019d0a77-f353-7bd2-9acd-8e80f38606dd"/);
  assert.equal(invocations[1].options.detached, true);
  assert.equal(result.actionOffered, true);
});

test('local notification poller delivers matching outbox messages and acks them', async () => {
  const store = createStore({ dbPath: ':memory:' });
  store.ensureProject({
    projectId: 'PRJ-cortex',
    name: 'Cortex',
  });
  const queued = store.enqueueOutbox({
    channel: 'local_notification',
    sessionId: null,
    text: 'red alert',
    payload: {
      projectId: 'PRJ-cortex',
      decisionId: 'DR-002',
      question: '是否继续执行？',
      recommendation: '建议先停住',
    },
    priority: 'urgent',
  });

  const seen = [];
  const poller = createLocalNotificationPoller({
    baseUrl: 'http://cortex.test',
    fetchImpl: async (url, options = {}) => {
      if (url === 'http://cortex.test/outbox?status=pending&limit=20') {
        return new Response(
          JSON.stringify({
            ok: true,
            pending: store.listOutbox({ status: 'pending', limit: 20 }).pending,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url === 'http://cortex.test/outbox/ack') {
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify(store.ackOutbox(body.id)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'http://cortex.test/outbox/fail') {
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify(store.failOutbox(body.id, body.error)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`unexpected url ${url}`);
    },
    sendNotification: async (notification) => {
      seen.push(notification);
      return { ok: true };
    },
    logger: { error() {} },
  });

  const result = await poller.pollOnce();
  assert.equal(result.delivered, 1);
  assert.equal(seen.length, 1);
  assert.equal(store.getOutbox(queued.id).status, 'sent');
  store.close();
});
