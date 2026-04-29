import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeBacklogCleanupPlan } from '../src/runtime-backlog-cleanup.js';

test('buildRuntimeBacklogCleanupPlan archives historical smoke residue conservatively', () => {
  const plan = buildRuntimeBacklogCleanupPlan(
    {
      failedCommands: [
        {
          command_id: 'CMD-20260415-152',
          status: 'failed',
          instruction:
            '[Codex Smoke 2026-04-15T03:17:16.177Z] 请验证这条 Notion comment 可以进入 Cortex 命令队列，并由 agent 回复同一 discussion。',
          result_summary: 'fetch failed',
          created_at: '2026-04-15T06:51:43.382Z',
        },
        {
          command_id: 'CMD-20260429-999',
          status: 'failed',
          instruction: '真实生产问题，暂时不要自动归档',
          result_summary: 'worker crashed just now',
          created_at: '2026-04-29T10:00:00.000Z',
        },
      ],
      openRedDecisions: [
        {
          decision_id: 'DR-20260415-005',
          signal_level: 'red',
          status: 'needs_review',
          question: '红灯直达测试：立即查看应打开当前 Codex 对话',
          why_now: '本地通知链路 smoke 验证',
          created_at: '2026-04-15T03:43:43.233Z',
        },
      ],
      pendingOutbox: [
        {
          id: 19,
          status: 'pending',
          text: '🔴 需要你拍板',
          payload: {
            type: 'red_alert',
            projectId: 'PRJ-cortex',
            decisionId: 'DR-20260415-005',
          },
          created_at: '2026-04-15T03:43:50.000Z',
        },
        {
          id: 27,
          status: 'pending',
          text: 'handoff smoke project',
          payload: {
            project_id: 'PRJ-cortex-smoke-handoff',
          },
          created_at: '2026-04-27T01:00:00.000Z',
        },
      ],
      failedOutbox: [
        {
          id: 12,
          status: 'failed',
          text: 'legacy callback test',
          error: 'stale callback_url via dead public tunnel; superseded by direct Red Lobbi HTTP sender plan',
          payload: {
            project_id: 'PRJ-cortex-e2e-live',
          },
          created_at: '2026-04-04T10:20:01.000Z',
        },
      ],
    },
    {
      actor: 'runtime-backlog-cleanup',
      nowIso: '2026-04-29T12:00:00.000Z',
      minimumAgeHours: 24,
    },
  );

  assert.equal(plan.summary.commandsToArchive, 1);
  assert.equal(plan.summary.decisionsToArchive, 1);
  assert.equal(plan.summary.outboxToArchive, 3);
  assert.equal(plan.actions.commands[0].id, 'CMD-20260415-152');
  assert.equal(plan.actions.decisions[0].id, 'DR-20260415-005');
  assert.deepEqual(
    plan.actions.outbox.map((item) => item.id).sort((left, right) => left - right),
    [12, 19, 27],
  );
  assert.match(plan.actions.commands[0].note, /\[cleanup:runtime-backlog-cleanup\]/);
});

test('buildRuntimeBacklogCleanupPlan leaves recent non-smoke failures untouched', () => {
  const plan = buildRuntimeBacklogCleanupPlan(
    {
      failedCommands: [
        {
          command_id: 'CMD-20260429-001',
          status: 'failed',
          instruction: '真实任务失败，等待修复',
          result_summary: 'just failed five minutes ago',
          created_at: '2026-04-29T11:55:00.000Z',
        },
      ],
      openRedDecisions: [
        {
          decision_id: 'DR-20260429-001',
          signal_level: 'red',
          status: 'needs_review',
          question: '是否切换正式供应商？',
          why_now: '合同今天到期',
          created_at: '2026-04-29T11:55:00.000Z',
        },
      ],
      pendingOutbox: [
        {
          id: 99,
          status: 'pending',
          text: '真实待发送消息',
          payload: {
            project_id: 'PRJ-cortex',
          },
          created_at: '2026-04-29T11:55:00.000Z',
        },
      ],
      failedOutbox: [],
    },
    {
      nowIso: '2026-04-29T12:00:00.000Z',
      minimumAgeHours: 24,
    },
  );

  assert.equal(plan.summary.totalActions, 0);
  assert.deepEqual(plan.actions.commands, []);
  assert.deepEqual(plan.actions.decisions, []);
  assert.deepEqual(plan.actions.outbox, []);
});

test('buildRuntimeBacklogCleanupPlan can archive stale pending red alerts and handoffs on later passes', () => {
  const plan = buildRuntimeBacklogCleanupPlan(
    {
      failedCommands: [],
      openRedDecisions: [],
      pendingOutbox: [
        {
          id: 19,
          status: 'pending',
          text: '🔴 需要你拍板\n\n项目：PRJ-cortex\n决策：是否开始 P0 人工验收？',
          payload: {
            type: 'red_alert',
            projectId: 'PRJ-cortex',
            decisionId: 'DR-20260415-001',
          },
          created_at: '2026-04-15T03:43:50.000Z',
        },
        {
          id: 22,
          status: 'pending',
          text: '[Cortex Handoff -> agent-ext-e2e] 外部 agent 验收',
          payload: {
            kind: 'external_agent_handoff',
            project_id: 'PRJ-cortex',
            handoff_agent: 'agent-ext-e2e',
            command_id: 'CMD-20260415-044',
          },
          created_at: '2026-04-15T03:43:55.000Z',
        },
      ],
      failedOutbox: [],
    },
    {
      nowIso: '2026-04-29T12:00:00.000Z',
      minimumAgeHours: 24,
    },
  );

  assert.equal(plan.summary.outboxToArchive, 2);
  assert.deepEqual(
    plan.actions.outbox.map((item) => item.id).sort((left, right) => left - right),
    [19, 22],
  );
});
