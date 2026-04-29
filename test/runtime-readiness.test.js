import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeReadinessReport,
  summarizeManagedProcesses,
  summarizeRuntimeSamples,
} from '../src/runtime-readiness.js';

test('summarizeManagedProcesses separates running and stopped processes', () => {
  const summary = summarizeManagedProcesses([
    { name: 'cortex-server', running: true },
    { name: 'local-notifier', running: false },
  ]);

  assert.equal(summary.totalCount, 2);
  assert.equal(summary.runningCount, 1);
  assert.equal(summary.stoppedCount, 1);
  assert.deepEqual(summary.runningNames, ['cortex-server']);
  assert.deepEqual(summary.stoppedNames, ['local-notifier']);
});

test('summarizeRuntimeSamples reports flapping health and process states', () => {
  const summary = summarizeRuntimeSamples([
    {
      healthOk: true,
      automation: {
        processes: [{ name: 'cortex-server', running: true }],
      },
    },
    {
      healthOk: false,
      automation: {
        processes: [{ name: 'cortex-server', running: false }],
      },
    },
    {
      healthOk: true,
      automation: {
        processes: [{ name: 'cortex-server', running: true }],
      },
    },
  ]);

  assert.equal(summary.totalCount, 3);
  assert.equal(summary.unhealthyCount, 1);
  assert.equal(summary.processFailureCount, 1);
  assert.equal(summary.healthFlapped, true);
  assert.equal(summary.processFlapped, true);
});

test('buildRuntimeReadinessReport returns ready when core checks pass', () => {
  const report = buildRuntimeReadinessReport({
    expectLaunchd: true,
    automation: {
      processes: [
        { name: 'cortex-server', running: true },
        { name: 'executor-multi-agent-handler', running: true },
      ],
    },
    health: { ok: true },
    launchd: {
      installed: true,
      loaded: true,
    },
    projectReview: {
      summary: {
        latest_checkpoint: {
          title: '长稳验证完成',
          signal_level: 'green',
        },
      },
    },
    failedCommands: { commands: [] },
    failedOutbox: { message_count: 0, messages: [] },
    pendingOutbox: { pending_count: 0, pending: [] },
    recentReceipts: { receipts: [{ receipt_id: 'R-1' }] },
    openRedDecisions: { decisions: [] },
    redSmokeRequested: true,
    redSmoke: { ok: true },
    samples: [
      {
        healthOk: true,
        automation: {
          processes: [{ name: 'cortex-server', running: true }],
        },
      },
    ],
  });

  assert.equal(report.ok, true);
  assert.equal(report.status, 'ready');
  assert.deepEqual(report.blocking, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.summary.latest_checkpoint_title, '长稳验证完成');
});

test('buildRuntimeReadinessReport marks blocking and warnings separately', () => {
  const report = buildRuntimeReadinessReport({
    expectLaunchd: true,
    automation: {
      processes: [
        { name: 'cortex-server', running: false },
        { name: 'local-notifier', running: true },
      ],
    },
    health: { ok: false },
    launchd: {
      installed: true,
      loaded: false,
    },
    failedCommands: { commands: [{ command_id: 'CMD-1' }] },
    failedOutbox: { message_count: 1, messages: [{ id: 1 }] },
    pendingOutbox: { pending_count: 2, pending: [{ id: 2 }, { id: 3 }] },
    recentReceipts: { receipts: [] },
    openRedDecisions: { decisions: [{ decision_id: 'DR-1' }] },
    redSmokeRequested: true,
    redSmoke: { ok: false },
    samples: [
      {
        healthOk: false,
        automation: {
          processes: [{ name: 'cortex-server', running: false }],
        },
      },
      {
        healthOk: true,
        automation: {
          processes: [{ name: 'cortex-server', running: true }],
        },
      },
    ],
  });

  assert.equal(report.ok, false);
  assert.equal(report.status, 'blocking');
  assert.ok(report.blocking.includes('cortex_health_unreachable'));
  assert.ok(report.blocking.includes('managed_process_stopped'));
  assert.ok(report.blocking.includes('launchd_not_loaded'));
  assert.ok(report.blocking.includes('local_red_smoke_failed'));
  assert.ok(report.warnings.includes('recent_failed_commands'));
  assert.ok(report.warnings.includes('recent_failed_outbox'));
  assert.ok(report.warnings.includes('open_red_decisions'));
  assert.ok(report.warnings.includes('pending_outbox_present'));
  assert.ok(report.warnings.includes('recent_receipts_missing'));
  assert.ok(report.warnings.includes('health_flapped_during_sampling'));
  assert.ok(report.warnings.includes('process_flapped_during_sampling'));
});
