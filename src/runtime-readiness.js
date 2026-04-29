function compact(value) {
  return String(value ?? '').trim();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildCheck(name, status, detail, meta = undefined) {
  return {
    name,
    status,
    detail,
    ...(meta ? { meta } : {}),
  };
}

export function summarizeManagedProcesses(processes = []) {
  const normalized = normalizeArray(processes);
  const running = normalized.filter((processState) => processState?.running === true);
  const stopped = normalized.filter((processState) => processState && processState.running !== true);

  return {
    totalCount: normalized.length,
    runningCount: running.length,
    stoppedCount: stopped.length,
    runningNames: running.map((processState) => processState.name).filter(Boolean),
    stoppedNames: stopped.map((processState) => processState.name).filter(Boolean),
  };
}

export function summarizeRuntimeSamples(samples = []) {
  const normalized = normalizeArray(samples);
  const healthFailures = normalized.filter((sample) => sample?.healthOk !== true);
  const processFailures = normalized.filter((sample) => {
    const summary = summarizeManagedProcesses(sample?.automation?.processes || []);
    return summary.stoppedCount > 0;
  });

  return {
    totalCount: normalized.length,
    healthyCount: normalized.length - healthFailures.length,
    unhealthyCount: healthFailures.length,
    processHealthyCount: normalized.length - processFailures.length,
    processFailureCount: processFailures.length,
    healthFlapped:
      normalized.length > 1 &&
      healthFailures.length > 0 &&
      healthFailures.length < normalized.length,
    processFlapped:
      normalized.length > 1 &&
      processFailures.length > 0 &&
      processFailures.length < normalized.length,
  };
}

function messageCount(payload, fallbackKeys = []) {
  if (!payload || typeof payload !== 'object') {
    return 0;
  }

  for (const key of fallbackKeys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.length;
    }
  }

  return 0;
}

export function buildRuntimeReadinessReport(snapshot = {}) {
  const processSummary = summarizeManagedProcesses(snapshot.automation?.processes || []);
  const sampleSummary = summarizeRuntimeSamples(snapshot.samples || []);
  const expectLaunchd = Boolean(snapshot.expectLaunchd);
  const healthOk = snapshot.health?.ok === true;
  const redSmokeRequested = snapshot.redSmokeRequested === true;
  const redSmokeOk = redSmokeRequested ? snapshot.redSmoke?.ok === true : null;
  const failedCommandsCount = messageCount(snapshot.failedCommands, ['commands']);
  const failedOutboxCount = messageCount(snapshot.failedOutbox, ['message_count', 'pending_count', 'messages', 'pending']);
  const pendingOutboxCount = messageCount(snapshot.pendingOutbox, ['message_count', 'pending_count', 'messages', 'pending']);
  const recentReceiptsCount = messageCount(snapshot.recentReceipts, ['receipts']);
  const openRedDecisionsCount = messageCount(snapshot.openRedDecisions, ['decisions']);
  const launchdInstalled = snapshot.launchd?.installed === true;
  const launchdLoaded = snapshot.launchd?.loaded === true;

  const checks = [];
  const blocking = [];
  const warnings = [];

  if (healthOk) {
    checks.push(buildCheck('cortex_health', 'pass', 'Cortex /health 可访问'));
  } else {
    checks.push(buildCheck('cortex_health', 'fail', 'Cortex /health 不可访问或返回非 ok'));
    blocking.push('cortex_health_unreachable');
  }

  if (processSummary.stoppedCount === 0) {
    checks.push(
      buildCheck(
        'managed_processes',
        'pass',
        `全部 ${processSummary.totalCount} 个受管进程都在运行`,
      ),
    );
  } else {
    checks.push(
      buildCheck(
        'managed_processes',
        'fail',
        `有 ${processSummary.stoppedCount} 个受管进程未运行`,
        { stopped: processSummary.stoppedNames },
      ),
    );
    blocking.push('managed_process_stopped');
  }

  if (expectLaunchd) {
    if (!launchdInstalled) {
      checks.push(buildCheck('launchd', 'fail', '要求验证 launchd，但当前未安装 plist'));
      blocking.push('launchd_not_installed');
    } else if (!launchdLoaded) {
      checks.push(buildCheck('launchd', 'fail', 'launchd 已安装，但当前未 loaded'));
      blocking.push('launchd_not_loaded');
    } else {
      checks.push(buildCheck('launchd', 'pass', 'launchd 已安装且处于 loaded 状态'));
    }
  } else if (launchdInstalled) {
    checks.push(
      buildCheck(
        'launchd',
        launchdLoaded ? 'pass' : 'warn',
        launchdLoaded ? 'launchd 已安装并 loaded' : 'launchd 已安装，但当前未 loaded',
      ),
    );
    if (!launchdLoaded) {
      warnings.push('launchd_not_loaded');
    }
  } else {
    checks.push(buildCheck('launchd', 'info', '当前未要求 launchd 验证'));
  }

  if (redSmokeRequested) {
    if (redSmokeOk) {
      checks.push(buildCheck('local_red_smoke', 'pass', '本地红灯通知 smoke 通过'));
    } else {
      checks.push(buildCheck('local_red_smoke', 'fail', '本地红灯通知 smoke 失败'));
      blocking.push('local_red_smoke_failed');
    }
  } else {
    checks.push(buildCheck('local_red_smoke', 'info', '本次未执行本地红灯通知 smoke'));
  }

  if (sampleSummary.totalCount > 1) {
    const sampleStatus =
      sampleSummary.unhealthyCount === 0 && sampleSummary.processFailureCount === 0 ? 'pass' : 'warn';
    checks.push(
      buildCheck(
        'runtime_sampling',
        sampleStatus,
        `连续采样 ${sampleSummary.totalCount} 次，health 失败 ${sampleSummary.unhealthyCount} 次，进程失败 ${sampleSummary.processFailureCount} 次`,
      ),
    );
    if (sampleSummary.unhealthyCount > 0) {
      warnings.push('health_flapped_during_sampling');
    }
    if (sampleSummary.processFailureCount > 0) {
      warnings.push('process_flapped_during_sampling');
    }
  }

  if (failedCommandsCount > 0) {
    checks.push(buildCheck('failed_commands', 'warn', `最近有 ${failedCommandsCount} 条失败 command`));
    warnings.push('recent_failed_commands');
  } else {
    checks.push(buildCheck('failed_commands', 'pass', '最近失败 command = 0'));
  }

  if (failedOutboxCount > 0) {
    checks.push(buildCheck('failed_outbox', 'warn', `最近有 ${failedOutboxCount} 条 failed outbox`));
    warnings.push('recent_failed_outbox');
  } else {
    checks.push(buildCheck('failed_outbox', 'pass', '最近 failed outbox = 0'));
  }

  if (openRedDecisionsCount > 0) {
    checks.push(buildCheck('open_red_decisions', 'warn', `当前仍有 ${openRedDecisionsCount} 条 red 决策待拍板`));
    warnings.push('open_red_decisions');
  } else {
    checks.push(buildCheck('open_red_decisions', 'pass', '当前没有待拍板 red 决策'));
  }

  if (recentReceiptsCount > 0) {
    checks.push(buildCheck('recent_receipts', 'pass', `最近找到 ${recentReceiptsCount} 条 receipt`));
  } else {
    checks.push(buildCheck('recent_receipts', 'warn', '最近没有看到 receipt'));
    warnings.push('recent_receipts_missing');
  }

  if (pendingOutboxCount > 0) {
    checks.push(buildCheck('pending_outbox', 'warn', `当前仍有 ${pendingOutboxCount} 条 pending outbox`));
    warnings.push('pending_outbox_present');
  } else {
    checks.push(buildCheck('pending_outbox', 'pass', '当前没有 pending outbox'));
  }

  const latestCheckpoint =
    snapshot.projectReview?.summary?.latest_checkpoint ||
    snapshot.projectReview?.summary?.latestCheckpoint ||
    null;

  const status = blocking.length > 0 ? 'blocking' : warnings.length > 0 ? 'warning' : 'ready';

  return {
    ok: status !== 'blocking',
    status,
    checks,
    blocking,
    warnings,
    summary: {
      managed_process_total: processSummary.totalCount,
      managed_process_running: processSummary.runningCount,
      managed_process_stopped: processSummary.stoppedCount,
      failed_commands: failedCommandsCount,
      failed_outbox: failedOutboxCount,
      pending_outbox: pendingOutboxCount,
      open_red_decisions: openRedDecisionsCount,
      recent_receipts: recentReceiptsCount,
      samples: sampleSummary.totalCount,
      unhealthy_samples: sampleSummary.unhealthyCount,
      process_failure_samples: sampleSummary.processFailureCount,
      launchd_expected: expectLaunchd,
      launchd_installed: launchdInstalled,
      launchd_loaded: launchdLoaded,
      red_smoke_requested: redSmokeRequested,
      red_smoke_ok: redSmokeOk,
      latest_checkpoint_title: compact(latestCheckpoint?.title) || null,
      latest_checkpoint_signal:
        compact(latestCheckpoint?.signal_level || latestCheckpoint?.signalLevel) || null,
    },
    processSummary,
    sampleSummary,
  };
}

export function buildRuntimeReadinessSnapshotMetadata(snapshot = {}) {
  return {
    generated_at: compact(snapshot.generatedAt) || null,
    project_id: compact(snapshot.projectId) || null,
    base_url: compact(snapshot.baseUrl) || null,
    samples: normalizeNumber(snapshot.samples?.length || snapshot.sampleCount, 0),
  };
}
