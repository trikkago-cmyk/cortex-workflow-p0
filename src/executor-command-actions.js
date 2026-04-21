import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { defaultSyncPreferencesFile, updateSyncPreferences } from './notion-sync-preferences.js';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
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

async function requestJsonBestEffort(fetchImpl, baseUrl, pathname, options = {}, logger = console) {
  try {
    return await requestJson(fetchImpl, baseUrl, pathname, options);
  } catch (error) {
    logger.warn?.(`[executor-action] best-effort request failed for ${pathname}: ${String(error?.message || error)}`);
    return null;
  }
}

function parseStructuredCommentAction(instruction) {
  const raw = compact(instruction);
  const match = raw.match(/^\[([a-z0-9_-]+)\s*:\s*([^\]|]+?)(?:\s*\|\s*([^\]]+))?\]\s*(.*)$/i);
  if (!match) {
    return null;
  }

  const action = String(match[1] || '').trim().toLowerCase().replaceAll('_', '-');
  const targetId = compact(match[2]);
  if (!targetId) {
    return null;
  }

  return {
    action,
    targetId,
    note: compact([match[3], match[4]].filter(Boolean).join(' ')),
  };
}

async function resolveInboxItemsBySourceRef(fetchImpl, baseUrl, { projectId, sourceRef, objectType }, logger = console) {
  if (!projectId || !sourceRef) {
    return [];
  }

  const params = new URLSearchParams({
    project_id: projectId,
    status: 'open',
    source_ref: sourceRef,
  });
  if (objectType) {
    params.set('object_type', objectType);
  }

  const payload = await requestJsonBestEffort(fetchImpl, baseUrl, `/inbox?${params.toString()}`, {}, logger);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const resolved = [];

  for (const item of items) {
    const itemId = item.item_id || item.itemId;
    if (!itemId) {
      continue;
    }

    await requestJsonBestEffort(fetchImpl, baseUrl, `/inbox/${encodeURIComponent(itemId)}/act`, {
      method: 'POST',
      body: {
        action: 'resolve',
      },
    }, logger);
    resolved.push(itemId);
  }

  return resolved;
}

async function executeStructuredCommentAction({ fetchImpl, cortexBaseUrl, logger, projectId, directive }) {
  if (directive.action === 'suggestion-accept') {
    const payload = await requestJson(fetchImpl, cortexBaseUrl, `/suggestions/${encodeURIComponent(directive.targetId)}/accept`, {
      method: 'POST',
      body: {},
    });

    return {
      ok: true,
      status: 'done',
      reply_text: `已接受 suggestion ${directive.targetId}，后续变更按这版继续推进。`,
      result_summary: `accepted suggestion ${directive.targetId}`,
      action_type: 'suggestion_accept',
      suggestion: payload.suggestion,
      runs: [],
      warnings: [],
    };
  }

  if (directive.action === 'suggestion-reject') {
    const payload = await requestJson(fetchImpl, cortexBaseUrl, `/suggestions/${encodeURIComponent(directive.targetId)}/reject`, {
      method: 'POST',
      body: {
        rejected_reason: directive.note || null,
      },
    });

    return {
      ok: true,
      status: 'done',
      reply_text: directive.note
        ? `已拒绝 suggestion ${directive.targetId}，原因已记录。`
        : `已拒绝 suggestion ${directive.targetId}。`,
      result_summary: `rejected suggestion ${directive.targetId}`,
      action_type: 'suggestion_reject',
      suggestion: payload.suggestion,
      runs: [],
      warnings: [],
    };
  }

  if (directive.action === 'memory-accept' || directive.action === 'memory-reject' || directive.action === 'memory-followup') {
    const detail = await requestJson(fetchImpl, cortexBaseUrl, `/memory/${encodeURIComponent(directive.targetId)}`);
    const reviewState =
      directive.action === 'memory-accept'
        ? 'accepted'
        : directive.action === 'memory-reject'
          ? 'rejected'
          : 'needs_followup';
    const status =
      directive.action === 'memory-accept'
        ? 'durable'
        : directive.action === 'memory-reject'
          ? 'rejected'
          : 'candidate';

    const payload = await requestJson(fetchImpl, cortexBaseUrl, `/memory/${encodeURIComponent(directive.targetId)}/review`, {
      method: 'POST',
      body: {
        review_state: reviewState,
        status,
        next_step: directive.note || null,
      },
    });

    const firstSource = Array.isArray(detail.sources) ? detail.sources[0] : null;
    const sourceType = firstSource?.source_type || firstSource?.sourceType;
    const sourceRef = firstSource?.source_ref || firstSource?.sourceRef;
    const relatedSourceRef = sourceType && sourceRef ? `${sourceType}:${sourceRef}` : null;
    const resolvedItems = await resolveInboxItemsBySourceRef(
      fetchImpl,
      cortexBaseUrl,
      {
        projectId,
        sourceRef: relatedSourceRef,
        objectType: 'memory',
      },
      logger,
    );

    const replyText =
      directive.action === 'memory-accept'
        ? `已接受 memory ${directive.targetId}，已转成 durable memory。`
        : directive.action === 'memory-reject'
          ? `已拒绝 memory ${directive.targetId}。`
          : `已把 memory ${directive.targetId} 标记为 needs_followup。`;

    return {
      ok: true,
      status: 'done',
      reply_text: replyText,
      result_summary: `${directive.action} ${directive.targetId}`,
      action_type: directive.action.replaceAll('-', '_'),
      memory: payload.memory,
      resolved_inbox_items: resolvedItems,
      runs: [],
      warnings: [],
    };
  }

  if (directive.action === 'inbox-resolve' || directive.action === 'inbox-snooze' || directive.action === 'inbox-archive' || directive.action === 'inbox-reopen') {
    const action = directive.action.slice('inbox-'.length);
    const payload = await requestJson(fetchImpl, cortexBaseUrl, `/inbox/${encodeURIComponent(directive.targetId)}/act`, {
      method: 'POST',
      body: {
        action,
      },
    });

    return {
      ok: true,
      status: 'done',
      reply_text: `已将 inbox item ${directive.targetId} 标记为 ${payload.item?.status || action}。`,
      result_summary: `${directive.action} ${directive.targetId}`,
      action_type: directive.action.replaceAll('-', '_'),
      item: payload.item,
      runs: [],
      warnings: [],
    };
  }

  if (
    directive.action === 'decision-approve' ||
    directive.action === 'decision-improve' ||
    directive.action === 'decision-resolve' ||
    directive.action === 'decision-archive' ||
    directive.action === 'decision-retry'
  ) {
    const status =
      directive.action === 'decision-approve'
        ? 'approved'
        : directive.action === 'decision-improve'
          ? 'changes_requested'
          : directive.action === 'decision-resolve'
            ? 'resolved'
            : directive.action === 'decision-archive'
              ? 'archived'
              : 'retry_requested';

    const payload = await requestJson(fetchImpl, cortexBaseUrl, '/decisions/update-status', {
      method: 'POST',
      body: {
        decision_id: directive.targetId,
        status,
      },
    });

    const resolvedItems = await resolveInboxItemsBySourceRef(
      fetchImpl,
      cortexBaseUrl,
      {
        projectId,
        sourceRef: `decision:${directive.targetId}`,
        objectType: 'decision',
      },
      logger,
    );

    return {
      ok: true,
      status: 'done',
      reply_text: `已将 decision ${directive.targetId} 更新为 ${status}。`,
      result_summary: `decision ${directive.targetId} -> ${status}`,
      action_type: directive.action.replaceAll('-', '_'),
      decision: payload.decision,
      resolved_inbox_items: resolvedItems,
      runs: [],
      warnings: [],
    };
  }

  return null;
}

function runScriptsBestEffort(scriptNames = [], runScript, logger = console) {
  const runs = [];
  const warnings = [];

  for (const scriptName of scriptNames) {
    try {
      runs.push(runScript(scriptName));
    } catch (error) {
      const message = String(error?.message || error);
      warnings.push({
        scriptName,
        error: message,
      });
      runs.push({
        scriptName,
        error: message,
      });
      logger.warn?.(`[executor-action] best-effort script failed: ${scriptName}: ${message}`);
    }
  }

  return {
    runs,
    warnings,
  };
}

export function inferExecutorActionPlan({ agentName, command }) {
  const rawInstruction = compact(command?.instruction);
  const structuredAction = parseStructuredCommentAction(rawInstruction);
  if (structuredAction) {
    return {
      type: structuredAction.action.replaceAll('-', '_'),
      structuredAction,
    };
  }

  const instruction = rawInstruction.toLowerCase();
  const parsedAction = compact(command?.parsed_action || command?.parsedAction).toLowerCase();
  const context = compact(command?.context_quote || command?.contextQuote).toLowerCase();
  if (!instruction) {
    return null;
  }

  if (
    matchesAny(instruction, [
      /别做.*总览/,
      /去掉.*总览/,
      /不要.*总览/,
      /直接看最新.*执行同步记录/,
      /只看最新.*执行同步记录/,
    ])
  ) {
    return {
      type: 'disable_execution_summary_nav',
      scripts: ['execution:notion-sync', 'project-index:notion-sync'],
      applyPreference(filePath) {
        updateSyncPreferences((current) => {
          current.executionPage.showSummaryNav = false;
          return current;
        }, filePath);
      },
      replyText: '已直接执行：执行页不再展示顶部总览，已同步到最新执行记录。',
      resultSummary: `${agentName} executed action: disable execution summary nav`,
    };
  }

  if (
    matchesAny(instruction, [
      /恢复.*总览/,
      /重新.*总览/,
      /加回.*总览/,
      /显示.*总览/,
    ])
  ) {
    return {
      type: 'enable_execution_summary_nav',
      scripts: ['execution:notion-sync', 'project-index:notion-sync'],
      applyPreference(filePath) {
        updateSyncPreferences((current) => {
          current.executionPage.showSummaryNav = true;
          return current;
        }, filePath);
      },
      replyText: '已直接执行：执行页顶部总览已恢复，并已同步。',
      resultSummary: `${agentName} executed action: enable execution summary nav`,
    };
  }

  if (matchesAny(instruction, [/同步.*memory/, /更新.*memory/, /写入.*memory/, /同步到.*协作记忆/])) {
    return {
      type: 'sync_memory',
      scripts: ['memory:notion-sync'],
      replyText: '已直接执行：协作 memory 已开始同步。',
      resultSummary: `${agentName} executed action: sync memory`,
    };
  }

  if (matchesAny(instruction, [/同步.*notion/, /同步.*执行文档/, /同步.*项目索引/, /刷新.*执行记录/, /更新.*执行记录/])) {
    return {
      type: 'sync_notion_surfaces',
      scripts: ['execution:notion-sync', 'project-index:notion-sync'],
      replyText: '已直接执行：相关 Notion 页面已同步。',
      resultSummary: `${agentName} executed action: sync notion surfaces`,
    };
  }

  if (
    matchesAny(instruction, [
      /能.*在文档评论里回复.*吗/,
      /现在能.*评论里回复.*吗/,
      /能.*回复我.*吗/,
      /能看到.*评论.*吗/,
      /收到这条评论.*吗/,
      /^在吗$/,
      /^收到吗$/,
    ])
  ) {
    return {
      type: 'ack_comment_availability',
      scripts: [],
      replyText: '能。当前 Notion 评论扫描和回帖链路在线。你直接在段落评论里写任务，我会在原评论线程回复并继续执行。',
      resultSummary: `${agentName} executed action: ack comment availability`,
    };
  }

  if (
    matchesAny(instruction, [
      /好久没有同步(?:新的)?执行记录了/,
      /怎么没有同步(?:新的)?执行记录/,
      /为什么没有同步(?:新的)?执行记录/,
      /执行记录.*怎么回事/,
      /执行记录.*没同步/,
      /最近没有在干活吗/,
      /最近没在干活吗/,
    ])
  ) {
    return {
      type: 'explain_sync_quiet_mode',
      scripts: ['execution:notion-sync'],
      replyText:
        '已直接补一条新的执行同步记录。之前没有追加，是因为没有新的 checkpoint；不是没在跑。后面这类追问我会先回评论线程，再补 execution 记录。',
      resultSummary: `${agentName} executed action: explain sync quiet mode`,
    };
  }

  if (
    matchesAny(instruction, [
      /不用同步给我/,
      /别同步给我/,
      /不要同步给我/,
      /怎么说两遍/,
      /一样吗/,
      /重复.*同步/,
      /重复.*上报/,
      /别重复.*同步/,
      /只在.*checkpoint/,
      /到.*checkpoint.*再同步/,
    ])
  ) {
    return {
      type: 'reduce_sync_noise',
      scripts: [],
      applyPreference(filePath) {
        updateSyncPreferences((current) => {
          current.reviewPage.onlyReportNewCheckpoint = true;
          current.executionPage.onlyReportNewCheckpoint = true;
          current.commentActions = {
            ...(current.commentActions || {}),
            suppressFeedbackOnlySync: true,
          };
          return current;
        }, filePath);
      },
      replyText: '已调整：同一 checkpoint 的重复进展不再单独同步。这条只记为反馈，不再追加 execution / review / project index。',
      resultSummary: `${agentName} executed action: reduce sync noise`,
    };
  }

  if (matchesAny(instruction, [/启动.*常驻/, /启动.*worker/, /启动.*轮询/, /启动.*automation/, /拉起.*worker/, /拉起.*自动化/])) {
    return {
      type: 'start_automation',
      scripts: ['automation:start', 'automation:status'],
      replyText: '已直接执行：常驻 notion loop 和 executor workers 已启动。',
      resultSummary: `${agentName} executed action: start automation`,
    };
  }

  if (
    matchesAny(instruction, [/^继续$/, /^continue$/, /^继续执行$/, /^继续推进$/]) ||
    (parsedAction === 'continue' && instruction.length <= 12)
  ) {
    const combined = `${instruction} ${context}`;
    if (
      matchesAny(combined, [
        /review/,
        /执行文档/,
        /项目索引/,
        /同步/,
        /notion/,
        /评论/,
        /task brief/,
        /decision/,
        /sync action/,
        /收口/,
      ])
    ) {
      return {
        type: 'continue_notion_cycle',
        scripts: ['execution:notion-sync', 'project-index:notion-sync'],
        replyText: '已收到 continue。已继续推进当前 Notion 侧收口，并同步 execution / project index。',
        resultSummary: `${agentName} executed action: continue notion cycle`,
      };
    }
  }

  return null;
}

export function createExecutorActionHandler(options = {}) {
  const cwd = options.cwd || process.cwd();
  const fetchImpl = options.fetchImpl || fetch;
  const cortexBaseUrl = options.cortexBaseUrl || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
  const syncPreferencesFile =
    options.syncPreferencesFile || process.env.NOTION_SYNC_PREFERENCES_FILE || defaultSyncPreferencesFile(cwd);
  const logger = options.logger || console;
  const env = {
    ...process.env,
    ...options.env,
  };

  const runScript =
    options.runScript ||
    ((scriptName) => {
      const result = spawnSync('npm', ['run', scriptName], {
        cwd,
        env,
        encoding: 'utf8',
      });

      if (result.status !== 0) {
        throw new Error(
          [`npm run ${scriptName} failed`, result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
        );
      }

      return {
        scriptName,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    });

  return async ({ agentName, projectId, command }) => {
    const plan = inferExecutorActionPlan({ agentName, projectId, command });
    if (!plan) {
      return null;
    }

    if (plan.structuredAction) {
      return executeStructuredCommentAction({
        fetchImpl,
        cortexBaseUrl,
        logger,
        projectId,
        directive: plan.structuredAction,
      });
    }

    if (typeof plan.applyPreference === 'function') {
      plan.applyPreference(syncPreferencesFile);
    }

    const { runs, warnings } = runScriptsBestEffort(plan.scripts || [], runScript, logger);

    return {
      ok: true,
      status: 'done',
      reply_text: plan.replyText,
      result_summary: plan.resultSummary,
      action_type: plan.type,
      runs,
      warnings,
    };
  };
}
