import { buildRuntimeBacklogCleanupPlan } from '../src/runtime-backlog-cleanup.js';
import { loadProjectEnv } from '../src/project-env.js';

loadProjectEnv(process.cwd(), {
  overrideKeys: ['CORTEX_BASE_URL'],
});

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2).replaceAll('-', '_');
    const next = argv[index + 1];
    if (!next || String(next).startsWith('--')) {
      parsed[key] = '1';
      continue;
    }

    parsed[key] = String(next);
    index += 1;
  }

  return parsed;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

async function readJson(response) {
  const body = await response.text();
  return body ? JSON.parse(body) : {};
}

async function requestJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const payload = await readJson(response);
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status} ${pathname}`);
  }
  return payload;
}

async function postJson(baseUrl, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await readJson(response);
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `HTTP ${response.status} ${pathname}`);
  }
  return body;
}

async function collectSnapshot(baseUrl, projectId, limit) {
  const [failedCommands, openRedDecisions, pendingOutbox, failedOutbox] = await Promise.all([
    requestJson(baseUrl, `/commands?project_id=${encodeURIComponent(projectId)}&status=failed&limit=${limit}`),
    requestJson(
      baseUrl,
      `/decisions?project_id=${encodeURIComponent(projectId)}&signal_level=red&status=needs_review`,
    ),
    requestJson(baseUrl, `/outbox?status=pending&limit=${limit}`),
    requestJson(baseUrl, `/outbox?status=failed&limit=${limit}`),
  ]);

  return {
    failedCommands: failedCommands.commands || [],
    openRedDecisions: openRedDecisions.decisions || [],
    pendingOutbox: pendingOutbox.messages || [],
    failedOutbox: failedOutbox.messages || [],
  };
}

async function applyCleanupPlan(baseUrl, plan, actor) {
  const applied = {
    commands: [],
    decisions: [],
    outbox: [],
    errors: [],
  };

  for (const item of plan.actions.commands) {
    try {
      await postJson(baseUrl, '/commands/update-status', {
        command_id: item.id,
        status: 'archived',
        result_summary: item.note,
      });
      applied.commands.push(item);
    } catch (error) {
      applied.errors.push({
        kind: item.kind,
        id: item.id,
        error: String(error?.message || error),
      });
    }
  }

  for (const item of plan.actions.decisions) {
    try {
      await postJson(baseUrl, '/decisions/update-status', {
        decision_id: item.id,
        status: 'archived',
        decided_by: actor,
        decision_note: item.note,
      });
      applied.decisions.push(item);
    } catch (error) {
      applied.errors.push({
        kind: item.kind,
        id: item.id,
        error: String(error?.message || error),
      });
    }
  }

  for (const item of plan.actions.outbox) {
    try {
      await postJson(baseUrl, '/outbox/archive', {
        id: item.id,
        note: item.note,
      });
      applied.outbox.push(item);
    } catch (error) {
      applied.errors.push({
        kind: item.kind,
        id: item.id,
        error: String(error?.message || error),
      });
    }
  }

  return applied;
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.base_url || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
const projectId = args.project || process.env.PROJECT_ID || 'PRJ-cortex';
const limit = Math.max(10, Number(args.limit || process.env.RUNTIME_CLEANUP_LIMIT || 100));
const minimumAgeHours = Math.max(
  1,
  Number(args.max_age_hours || process.env.RUNTIME_CLEANUP_MAX_AGE_HOURS || 168),
);
const apply = normalizeBoolean(args.apply, false);
const actor = args.actor || process.env.RUNTIME_CLEANUP_ACTOR || 'runtime-backlog-cleanup';
const nowIso = new Date().toISOString();

const before = await collectSnapshot(baseUrl, projectId, limit);
const plan = buildRuntimeBacklogCleanupPlan(before, {
  actor,
  minimumAgeHours,
  nowIso,
});

const applied = apply ? await applyCleanupPlan(baseUrl, plan, actor) : null;
const after = apply ? await collectSnapshot(baseUrl, projectId, limit) : before;
const postPlan = buildRuntimeBacklogCleanupPlan(after, {
  actor,
  minimumAgeHours,
  nowIso: new Date().toISOString(),
});

const result = {
  ok: !applied || applied.errors.length === 0,
  mode: apply ? 'apply' : 'dry_run',
  base_url: baseUrl,
  project_id: projectId,
  generated_at: nowIso,
  minimum_age_hours: minimumAgeHours,
  before: {
    failed_commands: before.failedCommands.length,
    open_red_decisions: before.openRedDecisions.length,
    pending_outbox: before.pendingOutbox.length,
    failed_outbox: before.failedOutbox.length,
  },
  plan,
  applied,
  after: {
    failed_commands: after.failedCommands.length,
    open_red_decisions: after.openRedDecisions.length,
    pending_outbox: after.pendingOutbox.length,
    failed_outbox: after.failedOutbox.length,
  },
  remaining_plan: postPlan,
};

console.log(JSON.stringify(result, null, 2));

if (applied && applied.errors.length > 0) {
  process.exitCode = 1;
}
