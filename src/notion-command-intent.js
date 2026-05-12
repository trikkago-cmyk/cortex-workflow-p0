function compact(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ACTION_ALIASES = new Map([
  ['approve', 'approve'],
  ['approved', 'approve'],
  ['accept', 'approve'],
  ['accepted', 'approve'],
  ['reject', 'reject'],
  ['rejected', 'reject'],
  ['request_changes', 'request_changes'],
  ['request-changes', 'request_changes'],
  ['changes_requested', 'request_changes'],
  ['change_request', 'request_changes'],
  ['revise', 'request_changes'],
  ['block', 'block'],
  ['blocked', 'block'],
  ['continue', 'continue'],
  ['go', 'continue'],
]);

const TARGET_ALIASES = new Map([
  ['decision', 'decision'],
  ['decision_request', 'decision'],
  ['decision-request', 'decision'],
  ['dr', 'decision'],
  ['memory', 'memory'],
  ['memory_item', 'memory'],
  ['memory-item', 'memory'],
  ['mem', 'memory'],
  ['command', 'command'],
  ['cmd', 'command'],
  ['thread', 'thread'],
  ['workflow', 'workflow'],
]);

function normalizeAction(value) {
  return ACTION_ALIASES.get(compact(value).toLowerCase()) || null;
}

function normalizeTargetType(value) {
  return TARGET_ALIASES.get(compact(value).toLowerCase()) || null;
}

function parseTargetSpec(value) {
  const raw = compact(value);
  if (!raw) {
    return {
      targetType: null,
      targetId: null,
    };
  }

  const match = raw.match(/^([a-zA-Z_-]+)\s*:\s*([^\s]+)$/);
  if (match) {
    return {
      targetType: normalizeTargetType(match[1]),
      targetId: compact(match[2]) || null,
    };
  }

  if (/^DR-/i.test(raw)) {
    return {
      targetType: 'decision',
      targetId: raw,
    };
  }

  if (/^MEM-/i.test(raw)) {
    return {
      targetType: 'memory',
      targetId: raw,
    };
  }

  if (/^CMD-/i.test(raw)) {
    return {
      targetType: 'command',
      targetId: raw,
    };
  }

  return {
    targetType: null,
    targetId: raw,
  };
}

function objectValue(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || null;
}

function stringValue(...values) {
  for (const value of values) {
    const normalized = compact(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function parseBodyDirective(body) {
  const raw = compact(body);
  const match = raw.match(/^\[(approve|reject|request_changes|request-changes|block|continue)\s*(?::\s*([^\]]+))?\]\s*(.*)$/i);
  if (!match) {
    return null;
  }

  const target = parseTargetSpec(match[2]);
  return {
    action: normalizeAction(match[1]),
    targetType: target.targetType,
    targetId: target.targetId,
    note: compact(match[3]) || null,
    instruction: compact(match[3]) || null,
    source: 'comment_directive',
  };
}

export function parseStructuredNotionCommand(body = {}) {
  const payload = objectValue(
    body.command_intent,
    body.commandIntent,
    body.structured_intent,
    body.structuredIntent,
    body.intent && typeof body.intent === 'object' ? body.intent : null,
  );
  const directive = parseBodyDirective(body.body);
  const source = payload ? 'payload' : directive?.source || null;
  const rawAction = payload
    ? stringValue(payload.action, payload.intent, payload.command, body.action, body.command_action, body.commandAction)
    : directive?.action;
  const action = normalizeAction(rawAction);

  if (!action) {
    return null;
  }

  const target = payload
    ? parseTargetSpec(
        stringValue(
          payload.target,
          payload.target_ref,
          payload.targetRef,
          body.target_ref,
          body.targetRef,
        ),
      )
    : {
        targetType: directive.targetType,
        targetId: directive.targetId,
      };
  const targetType = normalizeTargetType(
    payload
      ? stringValue(
          payload.target_type,
          payload.targetType,
          payload.object_type,
          payload.objectType,
          body.command_target_type,
          body.commandTargetType,
        )
      : target.targetType,
  ) || target.targetType;
  const targetId =
    (payload
      ? stringValue(
          payload.target_id,
          payload.targetId,
          payload.object_id,
          payload.objectId,
          body.command_target_id,
          body.commandTargetId,
        )
      : directive.targetId) || target.targetId;
  const note = payload
    ? stringValue(payload.note, payload.reason, payload.comment, payload.instruction, body.command_note, body.commandNote)
    : directive.note;
  const instruction = payload
    ? stringValue(payload.instruction, payload.body, payload.note, body.body)
    : directive.instruction;
  const memoryScope = compact(payload?.memory_scope || payload?.memoryScope || body.memory_scope || body.memoryScope).toLowerCase();

  return {
    action,
    targetType,
    targetId,
    note,
    instruction,
    memoryScope: ['global', 'project', 'both'].includes(memoryScope) ? memoryScope : null,
    source,
    raw: payload || directive,
  };
}

export function decisionStatusFromStructuredAction(action) {
  if (action === 'approve' || action === 'continue') {
    return 'approved';
  }
  if (action === 'reject') {
    return 'stopped';
  }
  if (action === 'request_changes') {
    return 'changes_requested';
  }
  if (action === 'block') {
    return 'needs_review';
  }
  return null;
}

export function memoryReviewFromStructuredAction(action) {
  if (action === 'approve') {
    return {
      reviewState: 'accepted',
      status: 'durable',
    };
  }
  if (action === 'reject') {
    return {
      reviewState: 'rejected',
      status: 'rejected',
    };
  }
  if (action === 'request_changes' || action === 'block') {
    return {
      reviewState: 'needs_followup',
      status: 'candidate',
    };
  }
  return null;
}
