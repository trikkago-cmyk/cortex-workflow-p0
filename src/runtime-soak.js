function compact(value) {
  return String(value ?? '').trim();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value) {
  const raw = compact(value).toLowerCase();
  if (raw === 'ready' || raw === 'warning' || raw === 'blocking') {
    return raw;
  }
  return 'blocking';
}

function severityRank(status) {
  switch (normalizeStatus(status)) {
    case 'ready':
      return 0;
    case 'warning':
      return 1;
    default:
      return 2;
  }
}

function tallyStrings(values = []) {
  const counts = new Map();
  for (const value of values) {
    const key = compact(value);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function pickWorseStatus(current, next) {
  return severityRank(next) > severityRank(current) ? normalizeStatus(next) : normalizeStatus(current);
}

export function buildRuntimeSoakReport(runs = [], options = {}) {
  const normalizedRuns = normalizeArray(runs).map((run, index) => {
    const report = run?.report && typeof run.report === 'object' ? run.report : {};
    const status = normalizeStatus(run?.status || report.status || (run?.ok === false ? 'blocking' : 'ready'));
    const blocking = normalizeArray(report.blocking || run?.blocking).map(compact).filter(Boolean);
    const warnings = normalizeArray(report.warnings || run?.warnings).map(compact).filter(Boolean);

    return {
      index: index + 1,
      status,
      generated_at: compact(run?.generated_at || run?.generatedAt || report?.generated_at) || null,
      blocking,
      warnings,
      exit_status: Number.isFinite(run?.exit_status) ? run.exit_status : null,
      summary: report.summary && typeof report.summary === 'object' ? report.summary : {},
    };
  });

  const statusCounts = {
    ready: 0,
    warning: 0,
    blocking: 0,
  };
  const transitions = [];
  let worstStatus = 'ready';
  let previousStatus = null;

  for (const run of normalizedRuns) {
    statusCounts[run.status] += 1;
    worstStatus = pickWorseStatus(worstStatus, run.status);

    if (previousStatus && previousStatus !== run.status) {
      transitions.push({
        index: run.index,
        from: previousStatus,
        to: run.status,
        generated_at: run.generated_at,
      });
    }

    previousStatus = run.status;
  }

  const firstWarning = normalizedRuns.find((run) => run.status === 'warning') || null;
  const firstBlocking = normalizedRuns.find((run) => run.status === 'blocking') || null;
  const latestReady = [...normalizedRuns].reverse().find((run) => run.status === 'ready') || null;
  const blockingFrequency = tallyStrings(normalizedRuns.flatMap((run) => run.blocking));
  const warningFrequency = tallyStrings(normalizedRuns.flatMap((run) => run.warnings));
  const startedAt = compact(options.startedAt) || normalizedRuns[0]?.generated_at || null;
  const finishedAt = compact(options.finishedAt) || normalizedRuns.at(-1)?.generated_at || null;

  const recommendations = [];
  if (worstStatus === 'blocking') {
    recommendations.push('先处理 blocking 原因，再继续长时间 soak。');
  } else if (worstStatus === 'warning') {
    recommendations.push('主链路可继续，但建议先清理 warning 再进入更长时间观察。');
  } else {
    recommendations.push('当前 soak 结果稳定，可继续扩大观察窗口或进入下一轮联调。');
  }

  if (blockingFrequency.length > 0) {
    recommendations.push(`优先看 blocking 次数最高的项：${blockingFrequency[0].code}。`);
  } else if (warningFrequency.length > 0) {
    recommendations.push(`优先看 warning 次数最高的项：${warningFrequency[0].code}。`);
  }

  return {
    ok: worstStatus !== 'blocking',
    status: worstStatus,
    steady_ready: normalizedRuns.length > 0 && statusCounts.ready === normalizedRuns.length,
    started_at: startedAt,
    finished_at: finishedAt,
    summary: {
      total_runs: normalizedRuns.length,
      ready_runs: statusCounts.ready,
      warning_runs: statusCounts.warning,
      blocking_runs: statusCounts.blocking,
      transition_count: transitions.length,
      first_warning_at: firstWarning?.generated_at || null,
      first_blocking_at: firstBlocking?.generated_at || null,
      latest_ready_at: latestReady?.generated_at || null,
      interval_ms: Number.isFinite(options.intervalMs) ? options.intervalMs : null,
    },
    status_counts: statusCounts,
    blocking_frequency: blockingFrequency,
    warning_frequency: warningFrequency,
    transitions,
    latest: normalizedRuns.at(-1) || null,
    recommendations,
    runs: normalizedRuns,
  };
}
