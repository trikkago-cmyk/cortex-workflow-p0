import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultAgentRegistryFile, loadAgentRegistry } from './agent-registry.js';
import { createExecutorActionHandler } from './executor-command-actions.js';

function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeTitle(text, maxLength = 48) {
  const normalized = compact(text);
  if (!normalized) {
    return '未命名任务';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function defaultRecommendationForArchitect(instruction) {
  const text = compact(instruction);
  if (/(schema|索引|权限|安全|线上|污染|不可逆|重建)/i.test(text)) {
    return '建议先暂停不可逆动作，按稳定优先和分层清晰原则补齐决策，再继续执行。';
  }
  return '建议先登记为架构待决策项，按稳定优先和分层清晰原则在 review 窗口统一收口。';
}

function defaultRecommendationForEvaluator(instruction) {
  const text = compact(instruction);
  if (/(线上|事故|污染|权限|安全|泄露|严重回归)/i.test(text)) {
    return '建议立即升级为红灯异常，先止损、保留证据，再决定下一步。';
  }
  if (/(回归|异常|漂移|质量|验收|评测|eval|指标)/i.test(text)) {
    return '建议先登记为质量 checkpoint，在 review 面板统一看结论和后续动作。';
  }
  return '建议先记录为评估 checkpoint，补齐质量判断与证据。';
}

function inferImpactScope(instruction = '') {
  const text = compact(instruction);
  if (/(schema|索引|数据|污染)/i.test(text)) return 'data';
  if (/(权限|安全|secret|token)/i.test(text)) return 'security';
  if (/(部署|上线|发布|deploy)/i.test(text)) return 'deploy';
  if (/(跨模块|架构|分层|召回|链路|标签)/i.test(text)) return 'cross_module';
  return 'module';
}

function inferEvaluatorSignal(instruction = '') {
  const text = compact(instruction);
  if (/(线上|事故|污染|权限|安全|泄露|严重回归|high risk|critical)/i.test(text)) {
    return 'red';
  }
  if (/(回归|异常|漂移|质量|验收|评测|eval|指标|监控|归因)/i.test(text)) {
    return 'yellow';
  }
  return 'green';
}

function inferQualityGrade(instruction = '') {
  const text = compact(instruction);
  if (/(失败|异常|回归|漂移|缺失|问题|风险)/i.test(text)) {
    return 'needs_review';
  }
  if (/(验收|通过|稳定|完成|ok|pass)/i.test(text)) {
    return 'pass';
  }
  return 'draft';
}

function inferAnomalyLevel(instruction = '') {
  const text = compact(instruction);
  if (/(线上|事故|污染|权限|安全|严重回归|critical|high)/i.test(text)) {
    return 'high';
  }
  if (/(异常|回归|漂移|风险|warning|warn)/i.test(text)) {
    return 'medium';
  }
  return 'low';
}

function inferArchitectSignal(instruction = '') {
  return /(schema|索引重建|权限|安全|线上事故|数据污染|不可逆|整体切换)/i.test(compact(instruction))
    ? 'red'
    : 'yellow';
}

function inferExecutionRole(agentName = '', handlerKind = '') {
  const name = compact(agentName).toLowerCase();
  const kind = compact(handlerKind).toLowerCase();

  if (name === 'agent-router' || kind === 'router') {
    return 'orchestrator';
  }
  if (name === 'agent-pm' || kind === 'pm') {
    return 'planner';
  }
  if (name === 'agent-evaluator' || kind === 'evaluator') {
    return 'evaluator';
  }
  if (name === 'agent-architect' || kind === 'architect') {
    return 'generator';
  }
  if (name === 'agent-notion-worker' || kind.includes('shared')) {
    return 'executor';
  }
  return 'executor';
}

function inferExecutionPhase(agentName = '', handlerKind = '') {
  const name = compact(agentName).toLowerCase();
  const kind = compact(handlerKind).toLowerCase();

  if (name === 'agent-router' || kind === 'router') {
    return 'route';
  }
  if (name === 'agent-pm' || kind === 'pm') {
    return 'plan';
  }
  if (name === 'agent-evaluator' || kind === 'evaluator') {
    return 'evaluate';
  }
  if (name === 'agent-architect' || kind === 'architect') {
    return 'design';
  }
  return 'execute';
}

function resolveCodexSessionId(agentConfig = {}) {
  return compact(
    agentConfig?.extraEnv?.CODEX_SESSION_ID ||
      agentConfig?.extraEnv?.CODEX_THREAD_ID ||
      agentConfig?.extraEnv?.codex_session_id ||
      agentConfig?.extraEnv?.codex_thread_id,
  );
}

function resolveCodexThreadName(agentConfig = {}) {
  return compact(
    agentConfig?.extraEnv?.CODEX_THREAD_NAME ||
      agentConfig?.extraEnv?.codex_thread_name,
  );
}

function resolveCodexBoundProjectId(agentConfig = {}) {
  return compact(agentConfig?.projectId || agentConfig?.project_id);
}

function resolveCodexResumeProjectContext({ projectId, command, agentConfig = {} } = {}) {
  const boundProjectId = resolveCodexBoundProjectId(agentConfig);
  const commandProjectId = compact(projectId || command?.project_id || command?.projectId);
  const effectiveProjectId = boundProjectId || commandProjectId || 'PRJ-cortex';
  return {
    boundProjectId,
    commandProjectId,
    effectiveProjectId,
    projectMismatch:
      Boolean(boundProjectId && commandProjectId) && boundProjectId !== commandProjectId,
  };
}

function isCodexResumeAvailabilityProbe(command = {}) {
  const instruction = compact(command?.instruction)?.toLowerCase() || '';
  const source = compact(command?.source)?.toLowerCase() || '';
  const commandId = compact(command?.command_id || command?.commandId)?.toLowerCase() || '';

  return (
    (source === 'manual' || source === 'manual_row' || commandId.includes('live')) &&
    /只回复[:：]/.test(instruction) &&
    instruction.includes('online') &&
    instruction.includes('不要运行命令') &&
    instruction.includes('不要改文件')
  );
}

function isCodexResumeExecutionSourceAllowed(command = {}) {
  const source = compact(command?.source)?.toLowerCase() || '';
  if (!source) {
    return false;
  }

  return source === 'notion_comment';
}

function buildCodexResumeProbeSummary({ agentName, sessionId, threadName, projectContext }) {
  return [
    `${agentName} connect probe ok`,
    `绑定项目：${projectContext.effectiveProjectId}`,
    threadName ? `绑定会话：${threadName}` : null,
    `session：${sessionId}`,
    projectContext.projectMismatch ? `已忽略错误项目归属：${projectContext.commandProjectId}` : null,
  ]
    .filter(Boolean)
    .join('；');
}

function buildCodexResumePrompt({ agentName, projectId, command, agentConfig = {} }) {
  const prefix = compact(agentConfig?.extraEnv?.CODEX_RESUME_PROMPT_PREFIX);
  const threadName = resolveCodexThreadName(agentConfig);
  const instruction = compact(command?.instruction);
  const contextQuote = compact(command?.context_quote || command?.contextQuote);
  const sourceUrl = compact(command?.source_url || command?.sourceUrl);
  const commandId = compact(command?.command_id || command?.commandId);
  const projectContext = resolveCodexResumeProjectContext({
    projectId,
    command,
    agentConfig,
  });

  return [
    prefix || null,
    `你现在作为 Cortex 中的 ${agentName} 执行 agent 工作。`,
    threadName ? `当前绑定会话：${threadName}` : null,
    '请直接在你当前会话与工作目录里处理下面这条任务，不要只停留在口头计划。',
    '',
    `项目：${projectContext.effectiveProjectId}`,
    projectContext.projectMismatch
      ? `命令归属：${projectContext.commandProjectId}（已按 agent 绑定项目 ${projectContext.effectiveProjectId} 处理）`
      : null,
    commandId ? `命令ID：${commandId}` : null,
    command?.source ? `来源：${command.source}` : null,
    sourceUrl ? `来源链接：${sourceUrl}` : null,
    contextQuote ? `上下文引用：${contextQuote}` : null,
    '',
    `任务：${instruction || '未提供任务描述'}`,
    '',
    '执行要求：',
    '1. 如果这是绿灯事项，直接执行并返回结果。',
    '2. 如果遇到必须人工拍板的红灯风险，明确以 RED: 开头说明原因，不要越过高风险步骤。',
    '3. 完成后只返回简洁结果，优先包含：做了什么、产物路径或链接、是否还有阻塞。',
    '4. 不要复述整段背景，不要输出多余寒暄。',
  ]
    .filter(Boolean)
    .join('\n');
}

function runCodexResumeCommand({
  sessionId,
  prompt,
  logger = console,
  codexBin = process.env.CODEX_BIN || 'codex',
  cwd = process.cwd(),
}) {
  const outputDir = mkdtempSync(join(tmpdir(), 'cortex-codex-resume-'));
  const outputFile = join(outputDir, 'last-message.txt');
  const args = ['exec', '--color', 'never', '--skip-git-repo-check', '-o', outputFile, 'resume', sessionId, prompt];

  const result = spawnSync(codexBin, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });

  const lastMessage = existsSync(outputFile) ? readFileSync(outputFile, 'utf8').trim() : '';
  rmSync(outputDir, { recursive: true, force: true });

  if (result.status !== 0) {
    const stderr = compact(result.stderr);
    const stdout = compact(result.stdout);
    throw new Error(
      compact(
        [
          `codex exec resume failed for session ${sessionId}`,
          stderr ? `stderr: ${stderr}` : null,
          stdout ? `stdout: ${stdout}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
      ) || `codex exec resume failed for session ${sessionId}`,
    );
  }

  if (!lastMessage) {
    logger.warn?.(`[executor-handler] codex resume returned empty output for ${sessionId}`);
  }

  return lastMessage || '已完成，但目标会话没有返回结果摘要。';
}

function buildFallbackExecutorResponse(agentName, command = {}) {
  const instruction = compact(command?.instruction);

  if (compact(agentName).toLowerCase() === 'agent-notion-worker' && command?.source === 'notion_comment') {
    return {
      ok: true,
      status: 'done',
      reply_text: '已收到，这条 Notion 评论已经成功回流到 Cortex 执行链路，后续会继续按当前路由推进。',
      result_summary: `${agentName} acknowledged notion comment ${instruction || 'empty instruction'}`,
    };
  }

  return {
    ok: true,
    status: 'done',
    reply_text: `已收到，${agentName} 暂无专属 handler，已记录这条任务。`,
    result_summary: `${agentName} has no specialized handler for ${instruction || 'empty instruction'}`,
  };
}

export function inferRouterTarget(command = {}) {
  const haystack = compact([command.instruction, command.context_quote, command.contextQuote].filter(Boolean).join(' '));
  if (/^\[(memory|suggestion|inbox|decision)-[a-z0-9_-]+\s*:/i.test(haystack)) {
    return 'agent-notion-worker';
  }
  if (/(架构|分层|schema|索引|召回|RAG|标签|依赖|接口|architecture|数据)/i.test(haystack)) {
    return 'agent-architect';
  }
  if (/(prd|需求|用户故事|验收|brief|why|context|what|产品|roadmap|评审|direct action|闭环|执行方案|任务简报)/i.test(haystack)) {
    return 'agent-pm';
  }
  if (/(评测|质量|回归|异常|漂移|eval|quality|监控|归因|指标)/i.test(haystack)) {
    return 'agent-evaluator';
  }
  if (/(notion|评论|同步|review|memory|工作台|执行文档|项目索引|目录)/i.test(haystack)) {
    return 'agent-notion-worker';
  }
  return 'agent-pm';
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
    logger.warn?.(`[executor-handler] best-effort request failed for ${pathname}: ${String(error?.message || error)}`);
    return null;
  }
}

function createRunScript({ cwd, env }) {
  return (scriptName) => {
    const result = spawnSync('npm', ['run', scriptName], {
      cwd,
      env,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      throw new Error([`npm run ${scriptName} failed`, result.stdout, result.stderr].filter(Boolean).join('\n').trim());
    }

    return {
      scriptName,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  };
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
      logger.warn?.(`[executor-handler] best-effort script failed: ${scriptName}: ${message}`);
    }
  }

  return {
    runs,
    warnings,
  };
}

export function createRouterHandler(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const cortexBaseUrl = options.cortexBaseUrl || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';

  return async ({ agentName, command }) => {
    const targetAgent = inferRouterTarget(command);
    const payload = await requestJson(fetchImpl, cortexBaseUrl, '/commands/derive', {
      method: 'POST',
      body: {
        parent_command_id: command.command_id || command.commandId,
        owner_agent: targetAgent,
        agent_name: agentName,
        reason: 'router_delegate',
      },
    });

    return {
      ok: true,
      status: 'done',
      reply_text: null,
      result_summary: `${agentName} delegated to ${targetAgent} via ${payload.command.command_id || payload.command.commandId}`,
      delegated_command_id: payload.command.command_id || payload.command.commandId,
      delegated_owner_agent: targetAgent,
    };
  };
}

export function createPmHandler(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const cortexBaseUrl = options.cortexBaseUrl || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
  const runScript = options.runScript || createRunScript({ cwd: options.cwd || process.cwd(), env: { ...process.env, ...options.env } });
  const logger = options.logger || console;

  return async ({ agentName, projectId, command }) => {
    const payload = await requestJson(fetchImpl, cortexBaseUrl, '/task-briefs', {
      method: 'POST',
      body: {
        project_id: projectId,
        title: `PM 跟进：${summarizeTitle(command.instruction)}`,
        why: `来自 Notion 评论的 PM 跟进任务：${compact(command.instruction)}`,
        context: compact(
          [
            command.context_quote || command.contextQuote ? `引用：${command.context_quote || command.contextQuote}` : null,
            command.source_url || command.sourceUrl ? `来源：${command.source_url || command.sourceUrl}` : null,
          ]
            .filter(Boolean)
            .join('；'),
        ) || '来自 Notion 评论',
        what: compact(command.instruction),
        status: 'draft',
        owner_agent: agentName,
        source: command.source,
        source_url: command.source_url || command.sourceUrl,
        target_type: command.target_type || command.targetType,
        target_id: command.target_id || command.targetId,
        idempotency_key: `pm-brief:${command.command_id || command.commandId}`,
      },
    });

    const { runs, warnings } = runScriptsBestEffort(['review:notion-sync', 'project-index:notion-sync'], runScript, logger);
    return {
      ok: true,
      status: 'done',
      reply_text: `已转成 PM 任务简报 ${payload.brief.brief_id || payload.brief.briefId}，后续按 brief 推进。`,
      result_summary: `${agentName} created task brief ${payload.brief.brief_id || payload.brief.briefId}`,
      brief_id: payload.brief.brief_id || payload.brief.briefId,
      checkpoint: {
        stage: 'plan',
        status: payload.brief.status || 'draft',
        title: payload.brief.title || `PM 跟进：${summarizeTitle(command.instruction)}`,
        summary: `已生成任务简报 ${payload.brief.brief_id || payload.brief.briefId}，方向信息已显式化为 Why / Context / What。`,
        next_step: '方向确认后，按 brief 继续推进执行。',
        signal_level: 'green',
        quality_grade: 'draft',
        anomaly_level: 'low',
        feedback_source: command.source || 'notion_comment',
        evidence: [command.instruction, command.context_quote || command.contextQuote].filter(Boolean),
      },
      runs,
      warnings,
    };
  };
}

export function createArchitectHandler(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const cortexBaseUrl = options.cortexBaseUrl || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
  const runScript = options.runScript || createRunScript({ cwd: options.cwd || process.cwd(), env: { ...process.env, ...options.env } });
  const logger = options.logger || console;
  const notificationTarget =
    options.notificationTarget || process.env.NOTIFICATION_TARGET || process.env.CORTEX_NOTIFICATION_TARGET || '';
  const notificationChannel =
    options.notificationChannel || process.env.NOTIFICATION_CHANNEL || process.env.CORTEX_NOTIFICATION_CHANNEL || '';

  return async ({ agentName, projectId, command }) => {
    const signalLevel = inferArchitectSignal(command.instruction);
    const payload = await requestJson(fetchImpl, cortexBaseUrl, '/decisions', {
      method: 'POST',
      body: {
        project_id: projectId,
        signal_level: signalLevel,
        question: compact(command.instruction),
        recommendation: defaultRecommendationForArchitect(command.instruction),
        why_now: compact(command.context_quote || command.contextQuote) || '来自 Notion 评论',
        impact_scope: inferImpactScope(command.instruction),
        irreversible: signalLevel === 'red',
        downstream_contamination: signalLevel === 'red',
        owner_agent: agentName,
        source_url: command.source_url || command.sourceUrl,
        ...(signalLevel === 'red' && notificationTarget ? { session_id: notificationTarget } : {}),
        ...(signalLevel === 'red' && notificationChannel ? { channel: notificationChannel } : {}),
      },
    });

    const { runs, warnings } = runScriptsBestEffort(['review:notion-sync', 'project-index:notion-sync'], runScript, logger);
    const decisionId = payload.decision.decision_id || payload.decision.decisionId;
    return {
      ok: true,
      status: 'done',
      reply_text:
        signalLevel === 'red'
          ? `已登记为红灯架构决策 ${decisionId}，并按红灯链路继续处理。`
          : `已登记为黄灯架构决策 ${decisionId}，review 时统一看。`,
      result_summary: `${agentName} created ${signalLevel} decision ${decisionId}`,
      decision_id: decisionId,
      signal_level: signalLevel,
      quality_grade: signalLevel === 'red' ? 'needs_review' : 'draft',
      anomaly_level: signalLevel === 'red' ? 'high' : 'medium',
      checkpoint: {
        stage: 'design',
        status: signalLevel === 'red' ? 'blocked' : 'needs_review',
        title: `架构决策 ${decisionId}`,
        summary:
          signalLevel === 'red'
            ? `已登记红灯架构决策 ${decisionId}，等待立即拍板。`
            : `已登记黄灯架构决策 ${decisionId}，等待 review 窗口统一处理。`,
        next_step:
          signalLevel === 'red'
            ? '等待红灯拍板，回复前不越过不可逆步骤。'
            : '继续推进其他安全工作，review 窗口统一收口。',
        signal_level: signalLevel,
        quality_grade: signalLevel === 'red' ? 'needs_review' : 'draft',
        anomaly_level: signalLevel === 'red' ? 'high' : 'medium',
        feedback_source: command.source || 'notion_comment',
        evidence: [command.instruction, command.context_quote || command.contextQuote].filter(Boolean),
      },
      runs,
      warnings,
    };
  };
}

export function createEvaluatorHandler(options = {}) {
  const runScript = options.runScript || createRunScript({ cwd: options.cwd || process.cwd(), env: { ...process.env, ...options.env } });
  const logger = options.logger || console;

  return async ({ agentName, command }) => {
    const signalLevel = inferEvaluatorSignal([command.instruction, command.context_quote || command.contextQuote].filter(Boolean).join(' '));
    const qualityGrade = inferQualityGrade([command.instruction, command.context_quote || command.contextQuote].filter(Boolean).join(' '));
    const anomalyLevel = inferAnomalyLevel([command.instruction, command.context_quote || command.contextQuote].filter(Boolean).join(' '));
    const { runs, warnings } = runScriptsBestEffort(['review:notion-sync', 'project-index:notion-sync'], runScript, logger);

    return {
      ok: true,
      status: 'done',
      reply_text:
        signalLevel === 'red'
          ? '已登记为红灯质量异常 checkpoint，建议你尽快拍板。'
          : signalLevel === 'yellow'
            ? '已登记为黄灯评估 checkpoint，review 时统一看结论。'
            : '已登记为绿灯评估 checkpoint，后续按结论继续推进。',
      result_summary: `${agentName} recorded ${signalLevel} evaluation checkpoint`,
      signal_level: signalLevel,
      quality_grade: qualityGrade,
      anomaly_level: anomalyLevel,
      checkpoint: {
        stage: 'evaluate',
        status: signalLevel === 'red' ? 'blocked' : signalLevel === 'yellow' ? 'needs_review' : 'passed',
        title: `质量评估：${summarizeTitle(command.instruction)}`,
        summary: defaultRecommendationForEvaluator(command.instruction),
        next_step:
          signalLevel === 'red'
            ? '立即 review，先处理异常与止损。'
            : signalLevel === 'yellow'
              ? '保留结论与证据，review 窗口统一决策。'
              : '按当前验收口径继续推进下一步执行。',
        signal_level: signalLevel,
        quality_grade: qualityGrade,
        anomaly_level: anomalyLevel,
        feedback_source: command.source || 'notion_comment',
        evidence: [command.instruction, command.context_quote || command.contextQuote].filter(Boolean),
      },
      runs,
      warnings,
    };
  };
}

export function createCodexResumeHandler(options = {}) {
  const logger = options.logger || console;
  const agentConfigMap = options.agentConfigMap || new Map();
  const runCodexResume = options.runCodexResume || runCodexResumeCommand;

  return async ({ agentName, projectId, command }) => {
    const agentConfig = agentConfigMap.get(agentName) || {};
    const sessionId = resolveCodexSessionId(agentConfig);
    if (!sessionId) {
      throw new Error(`agent ${agentName} missing CODEX_SESSION_ID`);
    }
    const threadName = resolveCodexThreadName(agentConfig);
    const projectContext = resolveCodexResumeProjectContext({
      projectId,
      command,
      agentConfig,
    });

    if (isCodexResumeAvailabilityProbe(command)) {
      const probeSummary = buildCodexResumeProbeSummary({
        agentName,
        sessionId,
        threadName,
        projectContext,
      });
      return {
        ok: true,
        status: 'done',
        reply_text: command?.source === 'notion_comment' ? probeSummary : null,
        result_summary: probeSummary,
        codex_session_id: sessionId,
        codex_thread_name: threadName,
        codex_result: probeSummary,
        skipped_resume: true,
        effective_project_id: projectContext.effectiveProjectId,
      };
    }

    if (!isCodexResumeExecutionSourceAllowed(command)) {
      const blockedSummary = [
        `${agentName} skipped Codex resume`,
        `来源 ${compact(command?.source) || 'unknown'} 未在允许名单`,
        `绑定项目：${projectContext.effectiveProjectId}`,
        threadName ? `绑定会话：${threadName}` : null,
        `session：${sessionId}`,
      ]
        .filter(Boolean)
        .join('；');

      return {
        ok: true,
        status: 'done',
        reply_text: command?.source === 'notion_comment' ? blockedSummary : null,
        result_summary: blockedSummary,
        codex_session_id: sessionId,
        codex_thread_name: threadName,
        codex_result: blockedSummary,
        skipped_resume: true,
        resume_blocked_reason: 'source_not_allowed',
        effective_project_id: projectContext.effectiveProjectId,
      };
    }

    const finalMessage = await runCodexResume({
      sessionId,
      prompt: buildCodexResumePrompt({
        agentName,
        projectId,
        command,
        agentConfig,
      }),
      logger,
      cwd: process.cwd(),
    });

    return {
      ok: true,
      status: 'done',
      reply_text: command?.source === 'notion_comment' ? finalMessage : null,
      result_summary: `${agentName} resumed Codex session ${sessionId}`,
      codex_session_id: sessionId,
      codex_thread_name: resolveCodexThreadName(agentConfig),
      codex_result: finalMessage,
    };
  };
}

export function createMultiAgentExecutor(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const cortexBaseUrl = options.cortexBaseUrl || process.env.CORTEX_BASE_URL || 'http://127.0.0.1:19100';
  const logger = options.logger || console;
  const sharedActionHandler = createExecutorActionHandler({
    cwd: options.cwd || process.cwd(),
    fetchImpl,
    cortexBaseUrl,
    env: { ...process.env, ...options.env },
    runScript: options.runScript,
    syncPreferencesFile: options.syncPreferencesFile || process.env.NOTION_SYNC_PREFERENCES_FILE,
  });

  const registryFile =
    options.agentRegistryFile || process.env.AGENT_REGISTRY_FILE || defaultAgentRegistryFile(options.cwd || process.cwd());
  const registry = options.agentRegistry || loadAgentRegistry(registryFile);
  const agentConfigMap = new Map(registry.agents.map((agent) => [agent.agentName, agent]));
  const agentRoleMap = new Map(
    registry.agents.map((agent) => [agent.agentName, inferExecutionRole(agent.agentName, agent.handlerKind)]),
  );
  const agentPhaseMap = new Map(
    registry.agents.map((agent) => [agent.agentName, inferExecutionPhase(agent.agentName, agent.handlerKind)]),
  );
  const handlerFactories = new Map([
    ['router', () => createRouterHandler(options)],
    ['pm', () => createPmHandler(options)],
    ['architect', () => createArchitectHandler(options)],
    ['evaluator', () => createEvaluatorHandler(options)],
    ['shared_actions', () => sharedActionHandler],
    ['shared-actions', () => sharedActionHandler],
    ['shared', () => sharedActionHandler],
    ['notion_worker', () => sharedActionHandler],
    ['notion-worker', () => sharedActionHandler],
    ['codex_resume', () => createCodexResumeHandler({ ...options, agentConfigMap })],
    ['codex-resume', () => createCodexResumeHandler({ ...options, agentConfigMap })],
  ]);
  const factoryCache = new Map();
  const handlers = {};

  for (const agent of registry.agents.filter((entry) => entry.enabled && entry.handlerKind)) {
    if (!handlerFactories.has(agent.handlerKind)) {
      continue;
    }

    if (!factoryCache.has(agent.handlerKind)) {
      factoryCache.set(agent.handlerKind, handlerFactories.get(agent.handlerKind)());
    }

    handlers[agent.agentName] = factoryCache.get(agent.handlerKind);
  }

  if (Object.keys(handlers).length === 0) {
    handlers['agent-router'] = createRouterHandler(options);
    handlers['agent-pm'] = createPmHandler(options);
    handlers['agent-architect'] = createArchitectHandler(options);
    handlers['agent-evaluator'] = createEvaluatorHandler(options);
    handlers['agent-notion-worker'] = sharedActionHandler;
  }

  async function recordExecutionTrace({ agentName, projectId, command, role, phase, result, error, runId }) {
    const commandId = command.command_id || command.commandId;
    if (!runId) {
      return;
    }
    if (error) {
      await requestJsonBestEffort(fetchImpl, cortexBaseUrl, '/runs/update-status', {
        method: 'POST',
        body: {
          run_id: runId,
          status: 'failed',
          summary: String(error?.message || error),
          anomaly_level: 'high',
          feedback_source: command.source,
          completed_at: new Date().toISOString(),
        },
      }, logger);

      await requestJsonBestEffort(fetchImpl, cortexBaseUrl, '/checkpoints', {
        method: 'POST',
        body: {
          project_id: projectId,
          run_id: runId,
          command_id: commandId,
          stage: phase,
          status: 'failed',
          title: `${agentName} 执行失败`,
          summary: String(error?.message || error),
          signal_level: 'red',
          quality_grade: 'needs_review',
          anomaly_level: 'high',
          feedback_source: command.source,
          created_by: agentName,
          evidence: [command.instruction, command.context_quote || command.contextQuote].filter(Boolean),
          idempotency_key: `checkpoint:${runId}:failed`,
        },
      }, logger);
      return;
    }

    await requestJsonBestEffort(fetchImpl, cortexBaseUrl, '/runs/update-status', {
      method: 'POST',
      body: {
        run_id: runId,
        status: result.status === 'done' ? 'completed' : 'running',
        summary: result.result_summary || result.reply_text || null,
        quality_grade: result.quality_grade,
        anomaly_level: result.anomaly_level,
        feedback_source: command.source,
        completed_at: result.status === 'done' ? new Date().toISOString() : null,
      },
    }, logger);

    const explicitCheckpoint = result.checkpoint;
    const shouldAutoCheckpoint =
      !explicitCheckpoint &&
      ['agent-pm', 'agent-architect', 'agent-evaluator'].includes(agentName) &&
      result.status === 'done';

    if (!explicitCheckpoint && !shouldAutoCheckpoint) {
      return;
    }

    const checkpoint = explicitCheckpoint || {
      stage: phase,
      status: 'completed',
      title: `${agentName} 执行完成`,
      summary: result.result_summary || result.reply_text || `${agentName} completed ${commandId || 'command'}`,
      next_step: null,
      signal_level: null,
      quality_grade: result.quality_grade || null,
      anomaly_level: result.anomaly_level || null,
      feedback_source: command.source || null,
      evidence: [command.instruction, command.context_quote || command.contextQuote].filter(Boolean),
    };

    await requestJsonBestEffort(fetchImpl, cortexBaseUrl, '/checkpoints', {
      method: 'POST',
      body: {
        project_id: projectId,
        run_id: runId,
        brief_id: result.brief_id || null,
        command_id: commandId,
        decision_id: result.decision_id || null,
        signal_level: checkpoint.signal_level || result.signal_level || null,
        stage: checkpoint.stage,
        status: checkpoint.status,
        title: checkpoint.title,
        summary: checkpoint.summary,
        evidence: checkpoint.evidence || [],
        next_step: checkpoint.next_step || null,
        quality_grade: checkpoint.quality_grade || result.quality_grade || null,
        anomaly_level: checkpoint.anomaly_level || result.anomaly_level || null,
        feedback_source: checkpoint.feedback_source || command.source || null,
        created_by: agentName,
        idempotency_key: `checkpoint:${runId}:final`,
      },
    }, logger);
  }

  return async ({ agentName, projectId, command }) => {
    const role = agentRoleMap.get(agentName) || inferExecutionRole(agentName);
    const phase = agentPhaseMap.get(agentName) || inferExecutionPhase(agentName);
    const commandId = command.command_id || command.commandId;
    const runPayload = await requestJsonBestEffort(fetchImpl, cortexBaseUrl, '/runs', {
      method: 'POST',
      body: {
        project_id: projectId,
        command_id: commandId,
        agent_name: agentName,
        role,
        phase,
        status: 'running',
        title: summarizeTitle(command.instruction || `${agentName} ${phase}`),
        summary: compact(command.instruction || command.context_quote || command.contextQuote || ''),
        feedback_source: command.source,
        idempotency_key: `run:${commandId || 'manual'}:${agentName}:${phase}`,
      },
    }, logger);
    const runId = runPayload?.run?.run_id || runPayload?.run?.runId || null;

    const shared = await sharedActionHandler({ agentName, projectId, command });
    if (shared) {
      await recordExecutionTrace({ agentName, projectId, command, role, phase, result: shared, runId });
      return shared;
    }

    const agentHandler = handlers[agentName];
    if (agentHandler) {
      try {
        const result = await agentHandler({ agentName, projectId, command });
        if (result) {
          await recordExecutionTrace({ agentName, projectId, command, role, phase, result, runId });
          return result;
        }
      } catch (error) {
        await recordExecutionTrace({ agentName, projectId, command, role, phase, error, runId });
        throw error;
      }
    }

    const fallback = buildFallbackExecutorResponse(agentName, command);
    await recordExecutionTrace({ agentName, projectId, command, role, phase, result: fallback, runId });
    return fallback;
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function createExecutorMultiAgentServer(options = {}) {
  const logger = options.logger || console;
  const execute = options.execute || createMultiAgentExecutor(options);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, { ok: true, service: 'executor-multi-agent-handler' });
      }

      if (req.method === 'POST' && req.url?.startsWith('/handle')) {
        const body = await readJsonBody(req);
        const pathAgentName = req.url.split('/').filter(Boolean)[1] || null;
        const agentName = pathAgentName || body.agent_name;
        const result = await execute({
          agentName,
          projectId: body.project_id,
          command: body.command || {},
        });
        logger.info?.(`[executor-handler] handled ${body.command?.command_id || 'unknown-command'} for ${agentName || 'unknown-agent'}`);
        return sendJson(res, 200, result);
      }

      return sendJson(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      logger.error?.('[executor-handler] request failed', error);
      return sendJson(res, 500, {
        ok: false,
        error: String(error?.message || error),
      });
    }
  });

  return {
    server,
    close() {
      return new Promise((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }
          resolvePromise();
        });
      });
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.EXECUTOR_HANDLER_PORT || 3010);
  const host = process.env.EXECUTOR_HANDLER_HOST || '127.0.0.1';
  const app = createExecutorMultiAgentServer();

  app.server.listen(port, host, () => {
    console.log(`executor-multi-agent-handler listening on http://${host}:${port}`);
  });

  process.on('SIGINT', async () => {
    await app.close().catch(() => {});
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await app.close().catch(() => {});
    process.exit(0);
  });
}
