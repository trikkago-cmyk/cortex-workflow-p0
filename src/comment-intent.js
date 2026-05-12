function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function stripActionPrefix(value) {
  const raw = compact(value);
  const plainMatch = raw.match(/^\[(continue|improve|retry|stop|clarify|reply)\]\s*/i);
  if (plainMatch) {
    return compact(raw.slice(plainMatch[0].length));
  }

  const detailedMatch = raw.match(/^\[(improve|clarify)\s*:\s*([^\]]+)\]\s*/i);
  if (detailedMatch) {
    return compact(detailedMatch[2]);
  }

  return raw;
}

function stripLeadingMention(value) {
  return compact(String(value || '').replace(/^@\s*[\p{L}\p{N}._-]+(?:\s+[A-Z][\p{L}\p{N}._-]*)?\s*/u, ''));
}

const EVENT_KEY_PREFIX = 'comment_intent:';

const STRUCTURED_DIRECTIVE_PATTERN =
  /^\[(suggestion|memory|inbox|decision)-(accept|reject|followup|resolve|snooze|archive|reopen|approve|improve|retry)\s*:/i;

const REPLY_PATTERNS = [/^\[reply\]/i];

const DISALLOWED_PATTERNS = [
  /删除.*(全部|所有|数据库|db|memory|记忆|仓库|文件)/i,
  /(清空|抹掉|销毁).*(数据库|db|memory|记忆|仓库)/i,
  /\bdrop\s+table\b/i,
  /\brm\s+-rf\b/i,
  /(打印|泄露|展示).*(token|secret|password|密码|密钥)/i,
  /(绕过|跳过).*(权限|审核|review|guardrail|红灯)/i,
  /(忽略|不要).*(权限|审核|review|guardrail|红灯)/i,
];

const RESTART_PATTERNS = [
  /^\[retry\]/i,
  /^(重试|重新来|重新做|重跑|返工|推翻重来)/,
  /(重新|从头).*(执行|做|跑|生成|整理|写|实现)/,
];

const STOP_PATTERNS = [
  /^\[stop\]/i,
  /^(停止|暂停|停一下|先别|不要继续|别继续)/,
  /(先|暂时)?(不要|别).*(执行|推进|继续|改|同步)/,
];

const CLARIFY_PATTERNS = [/^\[clarify\b/i, /^(澄清|解释|说明|补充说明)/, /(需要|请).*(澄清|解释|说明)/];

const IMPROVE_PATTERNS = [
  /^\[improve\b/i,
  /^(优化|修改|改一下|调整|润色|修复|压缩|精简|补齐|补充|改成|换成|删掉|去掉|加上)/,
  /(帮我|请|直接).*(优化|修改|调整|润色|修复|补齐|补充|改成|换成|删掉|去掉|加上)/,
  /(太长|太复杂|不清楚|不好懂|看不懂).*(压缩|精简|改|优化|调整)/,
];

const CONTINUE_PATTERNS = [
  /^\[continue\]/i,
  /^(继续|推进|执行|开始|落地|跑一下|处理|接入|同步|更新|整理|写一份|生成|创建|走吧|可以|没问题)/,
  /(帮我|请|直接).*(继续|推进|执行|开始|落地|处理|接入|同步|更新|整理|生成|创建|写|变成|转成|转换成)/,
  /(变成|转成|转换成).*(命令|任务|todo|action)/i,
  /\b(go|approve|continue|ship|run)\b/i,
];

const QUESTION_PATTERNS = [
  /^(为什么|为啥|怎么|如何|是不是|是否|能不能|可以吗|什么是|啥是)/,
  /(吗|么|？|\?)$/,
  /(解释一下|说明一下|讲一下|怎么看)/,
];

const FEEDBACK_PATTERNS = [
  /^(我觉得|感觉|这里|这块|这个)/,
  /(不对|不太对|不像|不好|有问题|太复杂|太长|太散|混乱|不清楚|看不懂)/,
];

function buildIntent({
  intent,
  parsedAction,
  executionPolicy,
  taskState,
  allowed = true,
  confidence = 'medium',
  reason,
  instruction,
}) {
  const executable = executionPolicy === 'enqueue';
  return {
    intent,
    parsedAction,
    executionPolicy,
    taskState,
    executable,
    allowed,
    confidence,
    reason,
    instruction: stripActionPrefix(instruction),
  };
}

export function classifyCommentIntent(body) {
  const raw = stripLeadingMention(compact(body));
  const text = raw.toLowerCase();

  if (!raw) {
    return buildIntent({
      intent: 'needs_clarification',
      parsedAction: 'clarify',
      executionPolicy: 'inbox_only',
      taskState: 'needs_triage',
      confidence: 'high',
      reason: 'empty_comment',
      instruction: raw,
    });
  }

  if (STRUCTURED_DIRECTIVE_PATTERN.test(raw)) {
    return buildIntent({
      intent: 'structured_directive',
      parsedAction: 'continue',
      executionPolicy: 'enqueue',
      taskState: 'ready_to_execute',
      confidence: 'high',
      reason: 'structured_cortex_directive',
      instruction: raw,
    });
  }

  if (hasAny(raw, REPLY_PATTERNS)) {
    return buildIntent({
      intent: 'thread_reply',
      parsedAction: 'reply',
      executionPolicy: 'log_only',
      taskState: 'logged_reply',
      confidence: 'high',
      reason: 'reply_only_comment',
      instruction: raw,
    });
  }

  if (hasAny(raw, DISALLOWED_PATTERNS)) {
    return buildIntent({
      intent: 'rejected',
      parsedAction: 'stop',
      executionPolicy: 'reject',
      taskState: 'rejected',
      allowed: false,
      confidence: 'high',
      reason: 'unsafe_or_disallowed_instruction',
      instruction: raw,
    });
  }

  if (hasAny(raw, RESTART_PATTERNS)) {
    return buildIntent({
      intent: 'restart_task',
      parsedAction: 'retry',
      executionPolicy: 'enqueue',
      taskState: 'ready_to_execute',
      confidence: 'high',
      reason: 'explicit_restart_instruction',
      instruction: raw,
    });
  }

  if (hasAny(raw, STOP_PATTERNS)) {
    return buildIntent({
      intent: 'control_task',
      parsedAction: 'stop',
      executionPolicy: 'enqueue',
      taskState: 'ready_to_execute',
      confidence: 'high',
      reason: 'explicit_stop_instruction',
      instruction: raw,
    });
  }

  if (hasAny(raw, CLARIFY_PATTERNS)) {
    return buildIntent({
      intent: 'needs_clarification',
      parsedAction: 'clarify',
      executionPolicy: 'inbox_only',
      taskState: 'needs_triage',
      confidence: 'high',
      reason: 'explicit_clarification_request',
      instruction: raw,
    });
  }

  if (hasAny(raw, IMPROVE_PATTERNS)) {
    return buildIntent({
      intent: 'revise_task',
      parsedAction: 'improve',
      executionPolicy: 'enqueue',
      taskState: 'ready_to_execute',
      confidence: 'high',
      reason: 'explicit_revision_instruction',
      instruction: raw,
    });
  }

  if (hasAny(raw, CONTINUE_PATTERNS)) {
    return buildIntent({
      intent: 'continue_task',
      parsedAction: 'continue',
      executionPolicy: 'enqueue',
      taskState: 'ready_to_execute',
      confidence: 'high',
      reason: 'explicit_continue_instruction',
      instruction: raw,
    });
  }

  if (hasAny(raw, QUESTION_PATTERNS) && !hasAny(raw, IMPROVE_PATTERNS) && !hasAny(raw, CONTINUE_PATTERNS)) {
    return buildIntent({
      intent: 'question',
      parsedAction: 'clarify',
      executionPolicy: 'inbox_only',
      taskState: 'needs_triage',
      confidence: text.length <= 80 ? 'high' : 'medium',
      reason: 'question_without_executable_directive',
      instruction: raw,
    });
  }

  if (hasAny(raw, FEEDBACK_PATTERNS)) {
    return buildIntent({
      intent: 'feedback',
      parsedAction: 'clarify',
      executionPolicy: 'inbox_only',
      taskState: 'needs_triage',
      confidence: 'medium',
      reason: 'feedback_without_clear_directive',
      instruction: raw,
    });
  }

  return buildIntent({
    intent: 'needs_clarification',
    parsedAction: 'clarify',
    executionPolicy: 'inbox_only',
    taskState: 'needs_triage',
    confidence: 'low',
    reason: 'no_clear_comment_intent',
    instruction: raw,
  });
}

export function commentIntentMetadata(intent) {
  return {
    comment_intent: intent.intent,
    comment_task_state: intent.taskState,
    comment_execution_policy: intent.executionPolicy,
    comment_executable: intent.executable,
    comment_allowed: intent.allowed,
    comment_confidence: intent.confidence,
    comment_reason: intent.reason,
  };
}

export function encodeCommentIntentEventKey(intent) {
  return `${EVENT_KEY_PREFIX}${JSON.stringify(commentIntentMetadata(intent))}`;
}

export function parseCommentIntentEventKey(value) {
  const raw = compact(value);
  if (!raw.startsWith(EVENT_KEY_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.slice(EVENT_KEY_PREFIX.length));
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      comment_intent: compact(parsed.comment_intent) || null,
      comment_task_state: compact(parsed.comment_task_state) || null,
      comment_execution_policy: compact(parsed.comment_execution_policy) || null,
      comment_executable: Boolean(parsed.comment_executable),
      comment_allowed: parsed.comment_allowed !== false,
      comment_confidence: compact(parsed.comment_confidence) || null,
      comment_reason: compact(parsed.comment_reason) || null,
    };
  } catch {
    return null;
  }
}

export function commandStatusFromCommentIntent(intent) {
  if (intent.executionPolicy === 'enqueue') {
    return 'new';
  }

  if (intent.executionPolicy === 'reject') {
    return 'cancelled';
  }

  return 'archived';
}

export function signalLevelFromCommentIntent(intent) {
  if (intent.executionPolicy === 'enqueue') {
    return 'green';
  }

  if (intent.executionPolicy === 'log_only') {
    return 'green';
  }

  return 'yellow';
}
