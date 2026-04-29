import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const DEFAULT_DB_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../db/cortex.db');

function nowIso(clock) {
  return clock().toISOString();
}

function unixSeconds(clock) {
  return Math.floor(clock().getTime() / 1000);
}

function hashValue(value) {
  return createHash('sha1').update(String(value || ''), 'utf8').digest('hex').slice(0, 12);
}

function dateBucket(isoString) {
  return isoString.slice(0, 10).replaceAll('-', '');
}

function toJson(value) {
  return JSON.stringify(value ?? []);
}

function fromJson(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  return JSON.parse(value);
}

function boolFromInt(value) {
  return Boolean(value);
}

function refToId(sourceRef, prefix, fallbackPrefix) {
  const raw = String(sourceRef || '').trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith(`${prefix}:`)) {
    return raw.slice(prefix.length + 1);
  }

  if (fallbackPrefix && raw.startsWith(fallbackPrefix)) {
    return raw;
  }

  return null;
}

export function mapCommandRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    commandId: row.command_id,
    parentCommandId: row.parent_command_id,
    projectId: row.project_id,
    channel: row.channel,
    targetType: row.target_type,
    targetId: row.target_id,
    parsedAction: row.parsed_action,
    instruction: row.instruction,
    contextQuote: row.context_quote,
    anchorBlockId: row.anchor_block_id,
    channelSessionId: row.channel_session_id,
    channelMessageId: row.channel_message_id,
    operatorId: row.operator_id,
    eventKey: row.event_key,
    status: row.status,
    ownerAgent: row.owner_agent,
    claimedBy: row.claimed_by,
    ack: row.ack,
    resultSummary: row.result_summary,
    receiptCount: row.receipt_count ?? 0,
    lastReceiptAt: row.last_receipt_at ?? null,
    inboxItemCount: row.inbox_item_count ?? 0,
    lastInboxItemAt: row.last_inbox_item_at ?? null,
    source: row.source,
    sourceUrl: row.source_url,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDecisionRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    decisionId: row.decision_id,
    projectId: row.project_id,
    signalLevel: row.signal_level,
    blockingLevel: row.blocking_level,
    status: row.status,
    question: row.question,
    context: row.context,
    options: fromJson(row.options_json),
    recommendation: row.recommendation,
    recommendedOption: row.recommended_option,
    whyNow: row.why_now,
    impactScope: row.impact_scope,
    blockingScope: row.impact_scope,
    irreversible: boolFromInt(row.irreversible),
    downstreamContamination: boolFromInt(row.downstream_contamination),
    evidenceRefs: fromJson(row.evidence_refs_json),
    requestedHumanAction: row.requested_human_action,
    dueAt: row.due_at,
    escalateAfter: row.escalate_after,
    ownerAgent: row.owner_agent,
    inboxItemId: row.inbox_item_id,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    selectedOption: row.selected_option,
    idempotencyKey: row.idempotency_key,
    sourceUrl: row.source_url,
    displayTags: fromJson(row.display_tags),
    retrievalTags: fromJson(row.retrieval_tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTaskBriefRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    briefId: row.brief_id,
    projectId: row.project_id,
    title: row.title,
    why: row.why,
    context: row.context,
    what: row.what_text,
    status: row.status,
    ownerAgent: row.owner_agent,
    source: row.source,
    sourceUrl: row.source_url,
    channelSessionId: row.channel_session_id,
    targetType: row.target_type,
    targetId: row.target_id,
    memoryContextRefs: fromJson(row.memory_context_refs),
    idempotencyKey: row.idempotency_key,
    displayTags: fromJson(row.display_tags),
    retrievalTags: fromJson(row.retrieval_tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProjectRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    projectId: row.project_id,
    name: row.name,
    status: row.status,
    rootPageUrl: row.root_page_url,
    reviewWindowNote: row.review_window_note,
    notificationChannel: row.notification_channel,
    notificationTarget: row.notification_target,
    notionReviewPageId: row.notion_review_page_id,
    notionParentPageId: row.notion_parent_page_id,
    notionMemoryPageId: row.notion_memory_page_id,
    notionScanPageId: row.notion_scan_page_id,
    displayTags: fromJson(row.display_tags),
    retrievalTags: fromJson(row.retrieval_tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOutboxRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    channel: row.channel,
    sessionId: row.session_id,
    chatId: row.chat_id,
    text: row.text,
    payload: fromJson(row.payload_json, null),
    priority: row.priority || 'normal',
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}

export function mapRunRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    runId: row.run_id,
    projectId: row.project_id,
    briefId: row.brief_id,
    commandId: row.command_id,
    decisionId: row.decision_id,
    agentName: row.agent_name,
    role: row.role,
    phase: row.phase,
    status: row.status,
    title: row.title,
    summary: row.summary,
    qualityGrade: row.quality_grade,
    anomalyLevel: row.anomaly_level,
    feedbackSource: row.feedback_source,
    idempotencyKey: row.idempotency_key,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCheckpointRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    checkpointId: row.checkpoint_id,
    projectId: row.project_id,
    runId: row.run_id,
    briefId: row.brief_id,
    commandId: row.command_id,
    decisionId: row.decision_id,
    signalLevel: row.signal_level,
    stage: row.stage,
    status: row.status,
    title: row.title,
    summary: row.summary,
    evidence: fromJson(row.evidence_json),
    nextStep: row.next_step,
    qualityGrade: row.quality_grade,
    anomalyLevel: row.anomaly_level,
    feedbackSource: row.feedback_source,
    createdBy: row.created_by,
    memoryCandidateCount: row.memory_candidate_count ?? 0,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapReceiptRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    receiptId: row.receipt_id,
    commandId: row.command_id,
    projectId: row.project_id,
    sessionId: row.session_id,
    status: row.status,
    receiptType: row.receipt_type,
    payload: fromJson(row.payload_json, {}),
    signal: row.signal,
    channel: row.channel,
    target: row.target,
    idempotencyKey: row.idempotency_key,
    parentReceiptId: row.parent_receipt_id,
    createdAt: row.created_at,
  };
}

export function mapMemoryRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    memoryId: row.memory_id,
    projectId: row.project_id,
    layer: row.layer,
    type: row.type,
    title: row.title,
    summary: row.summary,
    status: row.status,
    reviewState: row.review_state,
    confidence: row.confidence,
    freshness: row.freshness,
    nextStep: row.next_step,
    ownerAgent: row.owner_agent,
    sourceCount: row.source_count ?? 0,
    relatedMemory: fromJson(row.related_memory_json),
    metadata: fromJson(row.metadata_json, {}),
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMemorySourceRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    sourceId: row.source_id,
    memoryId: row.memory_id,
    projectId: row.project_id,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    sourceUrl: row.source_url,
    quoteText: row.quote_text,
    summary: row.summary,
    evidence: fromJson(row.evidence_json, {}),
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

export function mapInboxRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    itemId: row.item_id,
    projectId: row.project_id,
    queue: row.queue,
    objectType: row.object_type,
    actionType: row.action_type,
    riskLevel: row.risk_level,
    status: row.status,
    title: row.title,
    summary: row.summary,
    ownerAgent: row.owner_agent,
    sourceRef: row.source_ref,
    sourceUrl: row.source_url,
    assignedTo: row.assigned_to,
    payload: fromJson(row.payload_json, {}),
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

export function mapSuggestionRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    suggestionId: row.suggestion_id,
    projectId: row.project_id,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    documentRef: row.document_ref,
    anchorBlockId: row.anchor_block_id,
    selectedText: row.selected_text,
    proposedText: row.proposed_text,
    reason: row.reason,
    impactScope: row.impact_scope,
    status: row.status,
    ownerAgent: row.owner_agent,
    appliedAt: row.applied_at,
    rejectedReason: row.rejected_reason,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CortexStore {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.dbPath = options.dbPath || DEFAULT_DB_PATH;

    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  close() {
    this.db.close();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS counters (
        counter_key TEXT PRIMARY KEY,
        counter_value INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        root_page_url TEXT,
        review_window_note TEXT,
        notification_channel TEXT,
        notification_target TEXT,
        notion_review_page_id TEXT,
        notion_parent_page_id TEXT,
        notion_memory_page_id TEXT,
        notion_scan_page_id TEXT,
        display_tags TEXT NOT NULL,
        retrieval_tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS milestones (
        milestone_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        contract_status TEXT NOT NULL,
        contract_url TEXT,
        approved_by TEXT,
        approved_at TEXT,
        summary TEXT NOT NULL,
        acceptance_result TEXT NOT NULL,
        artifacts TEXT NOT NULL,
        written_by TEXT,
        idempotency_key TEXT NOT NULL,
        compression_level TEXT,
        display_tags TEXT NOT NULL,
        retrieval_tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS decision_requests (
        decision_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        signal_level TEXT NOT NULL,
        blocking_level TEXT,
        status TEXT NOT NULL,
        question TEXT NOT NULL,
        context TEXT,
        options_json TEXT NOT NULL,
        recommendation TEXT,
        recommended_option TEXT,
        why_now TEXT,
        impact_scope TEXT,
        irreversible INTEGER NOT NULL,
        downstream_contamination INTEGER NOT NULL,
        evidence_refs_json TEXT NOT NULL DEFAULT '[]',
        requested_human_action TEXT,
        due_at TEXT,
        escalate_after TEXT,
        owner_agent TEXT,
        inbox_item_id TEXT,
        decided_by TEXT,
        decided_at TEXT,
        decision_note TEXT,
        selected_option TEXT,
        idempotency_key TEXT NOT NULL,
        source_url TEXT,
        display_tags TEXT NOT NULL,
        retrieval_tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        UNIQUE(project_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS task_briefs (
        brief_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        why TEXT NOT NULL,
        context TEXT NOT NULL,
        what_text TEXT NOT NULL,
        status TEXT NOT NULL,
        owner_agent TEXT,
        source TEXT,
        source_url TEXT,
        channel_session_id TEXT,
        target_type TEXT,
        target_id TEXT,
        memory_context_refs TEXT NOT NULL DEFAULT '[]',
        idempotency_key TEXT NOT NULL,
        display_tags TEXT NOT NULL,
        retrieval_tags TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        UNIQUE(project_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        brief_id TEXT,
        command_id TEXT,
        decision_id TEXT,
        agent_name TEXT,
        role TEXT NOT NULL,
        phase TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        quality_grade TEXT,
        anomaly_level TEXT,
        feedback_source TEXT,
        idempotency_key TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        UNIQUE(project_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        run_id TEXT,
        brief_id TEXT,
        command_id TEXT,
        decision_id TEXT,
        signal_level TEXT,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        next_step TEXT,
        quality_grade TEXT,
        anomaly_level TEXT,
        feedback_source TEXT,
        created_by TEXT,
        memory_candidate_count INTEGER NOT NULL DEFAULT 0,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        UNIQUE(project_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS commands (
        command_id TEXT PRIMARY KEY,
        parent_command_id TEXT,
        project_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        parsed_action TEXT NOT NULL,
        instruction TEXT NOT NULL,
        context_quote TEXT,
        anchor_block_id TEXT,
        channel_session_id TEXT,
        channel_message_id TEXT,
        operator_id TEXT,
        event_key TEXT,
        status TEXT NOT NULL,
        owner_agent TEXT,
        claimed_by TEXT,
        ack TEXT,
        result_summary TEXT,
        receipt_count INTEGER NOT NULL DEFAULT 0,
        last_receipt_at INTEGER,
        inbox_item_count INTEGER NOT NULL DEFAULT 0,
        last_inbox_item_at TEXT,
        source TEXT NOT NULL,
        source_url TEXT,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        UNIQUE(source, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        session_id TEXT,
        chat_id TEXT,
        text TEXT NOT NULL,
        payload_json TEXT,
        priority TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL,
        sent_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_receipts (
        receipt_id TEXT PRIMARY KEY,
        command_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        session_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('delivered', 'completed', 'failed', 'acknowledged', 'read')),
        receipt_type TEXT NOT NULL CHECK(receipt_type IN ('result', 'status_update', 'alert', 'heartbeat')),
        payload_json TEXT NOT NULL,
        signal TEXT CHECK(signal IN ('green', 'yellow', 'red')),
        channel TEXT NOT NULL,
        target TEXT NOT NULL,
        idempotency_key TEXT UNIQUE,
        parent_receipt_id TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(command_id) REFERENCES commands(command_id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_items (
        memory_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        layer TEXT NOT NULL CHECK(layer IN ('base_memory', 'timeline', 'knowledge')),
        type TEXT NOT NULL CHECK(type IN ('decision', 'preference', 'rule', 'incident', 'pattern', 'open_question')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('candidate', 'durable', 'archived', 'rejected')),
        review_state TEXT NOT NULL CHECK(review_state IN ('pending_accept', 'accepted', 'rejected', 'needs_followup')),
        confidence TEXT NOT NULL CHECK(confidence IN ('high', 'medium', 'low')),
        freshness TEXT,
        next_step TEXT,
        owner_agent TEXT,
        source_count INTEGER NOT NULL DEFAULT 0,
        related_memory_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        UNIQUE(project_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS memory_sources (
        source_id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_ref TEXT,
        source_url TEXT,
        quote_text TEXT,
        summary TEXT,
        evidence_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(memory_id) REFERENCES memory_items(memory_id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        UNIQUE(memory_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS inbox_items (
        item_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        queue TEXT NOT NULL CHECK(queue IN ('decide', 'review', 'triage')),
        object_type TEXT NOT NULL CHECK(object_type IN ('memory', 'decision', 'result', 'comment', 'suggestion')),
        action_type TEXT NOT NULL CHECK(action_type IN ('decide', 'review', 'respond', 'assign', 'convert')),
        risk_level TEXT NOT NULL CHECK(risk_level IN ('green', 'yellow', 'red')),
        status TEXT NOT NULL CHECK(status IN ('open', 'snoozed', 'resolved', 'archived')),
        title TEXT NOT NULL,
        summary TEXT,
        owner_agent TEXT,
        source_ref TEXT,
        source_url TEXT,
        assigned_to TEXT,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        UNIQUE(project_id, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS suggestions (
        suggestion_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_ref TEXT,
        document_ref TEXT,
        anchor_block_id TEXT,
        selected_text TEXT,
        proposed_text TEXT NOT NULL,
        reason TEXT,
        impact_scope TEXT,
        status TEXT NOT NULL CHECK(status IN ('proposed', 'accepted', 'rejected', 'superseded')),
        owner_agent TEXT,
        applied_at TEXT,
        rejected_reason TEXT,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        UNIQUE(project_id, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_commands_project_created
      ON commands(project_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_decisions_project_status
      ON decision_requests(project_id, signal_level, status, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_task_briefs_project_status
      ON task_briefs(project_id, status, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_runs_project_status
      ON runs(project_id, status, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_checkpoints_project_created
      ON checkpoints(project_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_outbox_status_created
      ON outbox(status, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_receipts_command
      ON agent_receipts(command_id, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_receipts_project
      ON agent_receipts(project_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_receipts_created
      ON agent_receipts(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_memory_items_project_layer
      ON memory_items(project_id, layer, status, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_memory_sources_memory
      ON memory_sources(memory_id, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_inbox_items_project_queue
      ON inbox_items(project_id, queue, status, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_suggestions_project_status
      ON suggestions(project_id, status, updated_at DESC);
    `);

    const outboxColumns = this.db.prepare(`PRAGMA table_info('outbox')`).all();
    const hasPriorityColumn = outboxColumns.some((column) => column.name === 'priority');
    if (!hasPriorityColumn) {
      this.db.exec(`ALTER TABLE outbox ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';`);
    }

    const commandColumns = this.db.prepare(`PRAGMA table_info('commands')`).all();
    const requiredCommandColumns = [
      {
        name: 'parent_command_id',
        ddl: `ALTER TABLE commands ADD COLUMN parent_command_id TEXT;`,
      },
      {
        name: 'owner_agent',
        ddl: `ALTER TABLE commands ADD COLUMN owner_agent TEXT;`,
      },
      {
        name: 'receipt_count',
        ddl: `ALTER TABLE commands ADD COLUMN receipt_count INTEGER NOT NULL DEFAULT 0;`,
      },
      {
        name: 'last_receipt_at',
        ddl: `ALTER TABLE commands ADD COLUMN last_receipt_at INTEGER;`,
      },
      {
        name: 'inbox_item_count',
        ddl: `ALTER TABLE commands ADD COLUMN inbox_item_count INTEGER NOT NULL DEFAULT 0;`,
      },
      {
        name: 'last_inbox_item_at',
        ddl: `ALTER TABLE commands ADD COLUMN last_inbox_item_at TEXT;`,
      },
    ];
    for (const column of requiredCommandColumns) {
      if (!commandColumns.some((item) => item.name === column.name)) {
        this.db.exec(column.ddl);
      }
    }

    const projectColumns = this.db.prepare(`PRAGMA table_info('projects')`).all();
    const requiredProjectColumns = [
      ['notification_channel', `ALTER TABLE projects ADD COLUMN notification_channel TEXT;`],
      ['notification_target', `ALTER TABLE projects ADD COLUMN notification_target TEXT;`],
      ['notion_review_page_id', `ALTER TABLE projects ADD COLUMN notion_review_page_id TEXT;`],
      ['notion_parent_page_id', `ALTER TABLE projects ADD COLUMN notion_parent_page_id TEXT;`],
      ['notion_memory_page_id', `ALTER TABLE projects ADD COLUMN notion_memory_page_id TEXT;`],
      ['notion_scan_page_id', `ALTER TABLE projects ADD COLUMN notion_scan_page_id TEXT;`],
    ];
    for (const [columnName, sql] of requiredProjectColumns) {
      if (!projectColumns.some((column) => column.name === columnName)) {
        this.db.exec(sql);
      }
    }

    const decisionColumns = this.db.prepare(`PRAGMA table_info('decision_requests')`).all();
    const requiredDecisionColumns = [
      ['context', `ALTER TABLE decision_requests ADD COLUMN context TEXT;`],
      ['recommended_option', `ALTER TABLE decision_requests ADD COLUMN recommended_option TEXT;`],
      ['evidence_refs_json', `ALTER TABLE decision_requests ADD COLUMN evidence_refs_json TEXT NOT NULL DEFAULT '[]';`],
      ['requested_human_action', `ALTER TABLE decision_requests ADD COLUMN requested_human_action TEXT;`],
      ['due_at', `ALTER TABLE decision_requests ADD COLUMN due_at TEXT;`],
      ['inbox_item_id', `ALTER TABLE decision_requests ADD COLUMN inbox_item_id TEXT;`],
      ['decided_by', `ALTER TABLE decision_requests ADD COLUMN decided_by TEXT;`],
      ['decided_at', `ALTER TABLE decision_requests ADD COLUMN decided_at TEXT;`],
      ['decision_note', `ALTER TABLE decision_requests ADD COLUMN decision_note TEXT;`],
      ['selected_option', `ALTER TABLE decision_requests ADD COLUMN selected_option TEXT;`],
    ];
    for (const [columnName, sql] of requiredDecisionColumns) {
      if (!decisionColumns.some((column) => column.name === columnName)) {
        this.db.exec(sql);
      }
    }

    const taskBriefColumns = this.db.prepare(`PRAGMA table_info('task_briefs')`).all();
    if (!taskBriefColumns.some((column) => column.name === 'memory_context_refs')) {
      this.db.exec(`ALTER TABLE task_briefs ADD COLUMN memory_context_refs TEXT NOT NULL DEFAULT '[]';`);
    }

    const checkpointColumns = this.db.prepare(`PRAGMA table_info('checkpoints')`).all();
    if (!checkpointColumns.some((column) => column.name === 'memory_candidate_count')) {
      this.db.exec(`ALTER TABLE checkpoints ADD COLUMN memory_candidate_count INTEGER NOT NULL DEFAULT 0;`);
    }
  }

  nextId(prefix) {
    const bucket = dateBucket(nowIso(this.clock));
    const counterKey = `${prefix}:${bucket}`;
    const row = this.db.prepare('SELECT counter_value FROM counters WHERE counter_key = ?').get(counterKey);
    const nextValue = (row?.counter_value || 0) + 1;

    this.db
      .prepare(`
        INSERT INTO counters (counter_key, counter_value)
        VALUES (?, ?)
        ON CONFLICT(counter_key) DO UPDATE SET counter_value = excluded.counter_value
      `)
      .run(counterKey, nextValue);

    return `${prefix}-${bucket}-${String(nextValue).padStart(3, '0')}`;
  }

  ensureProject(input = {}) {
    const timestamp = nowIso(this.clock);
    const projectId = input.projectId || 'PRJ-cortex';
    const existing = this.db.prepare('SELECT * FROM projects WHERE project_id = ?').get(projectId);

    if (existing) {
      this.db
        .prepare(`
          UPDATE projects
          SET
            name = ?,
            status = ?,
            root_page_url = ?,
            review_window_note = ?,
            notification_channel = ?,
            notification_target = ?,
            notion_review_page_id = ?,
            notion_parent_page_id = ?,
            notion_memory_page_id = ?,
            notion_scan_page_id = ?,
            display_tags = ?,
            retrieval_tags = ?,
            updated_at = ?
          WHERE project_id = ?
        `)
        .run(
          input.name || existing.name,
          input.status || existing.status,
          input.rootPageUrl ?? existing.root_page_url,
          input.reviewWindowNote ?? existing.review_window_note,
          input.notificationChannel ?? existing.notification_channel,
          input.notificationTarget ?? existing.notification_target,
          input.notionReviewPageId ?? existing.notion_review_page_id,
          input.notionParentPageId ?? existing.notion_parent_page_id,
          input.notionMemoryPageId ?? existing.notion_memory_page_id,
          input.notionScanPageId ?? existing.notion_scan_page_id,
          toJson(input.displayTags || fromJson(existing.display_tags)),
          toJson(input.retrievalTags || fromJson(existing.retrieval_tags)),
          timestamp,
          projectId,
        );

      return this.getProject(projectId);
    }

    this.db
      .prepare(`
        INSERT INTO projects (
          project_id, name, status, root_page_url, review_window_note,
          notification_channel, notification_target, notion_review_page_id, notion_parent_page_id,
          notion_memory_page_id, notion_scan_page_id,
          display_tags, retrieval_tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        projectId,
        input.name || projectId,
        input.status || 'active',
        input.rootPageUrl || null,
        input.reviewWindowNote || null,
        input.notificationChannel || null,
        input.notificationTarget || null,
        input.notionReviewPageId || null,
        input.notionParentPageId || null,
        input.notionMemoryPageId || null,
        input.notionScanPageId || null,
        toJson(input.displayTags),
        toJson(input.retrievalTags),
        timestamp,
        timestamp,
      );

    return this.getProject(projectId);
  }

  getProject(projectId) {
    const row = this.db.prepare('SELECT * FROM projects WHERE project_id = ?').get(projectId);
    return mapProjectRow(row);
  }

  listProjects() {
    return this.db
      .prepare('SELECT * FROM projects ORDER BY datetime(updated_at) DESC, project_id ASC')
      .all()
      .map((row) => mapProjectRow(row));
  }

  getCommand(commandId) {
    const row = this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId);
    return mapCommandRow(row);
  }

  createOrGetCommand(input) {
    const timestamp = nowIso(this.clock);
    const commandId = this.nextId('CMD');
    const result = this.db
      .prepare(`
        INSERT INTO commands (
          command_id, parent_command_id, project_id, channel, target_type, target_id, parsed_action,
          instruction, context_quote, anchor_block_id, channel_session_id,
          channel_message_id, operator_id, event_key, status, owner_agent, claimed_by, ack,
          result_summary, source, source_url, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, idempotency_key) DO NOTHING
      `)
      .run(
        commandId,
        input.parentCommandId || null,
        input.projectId,
        input.channel,
        input.targetType || null,
        input.targetId || null,
        input.parsedAction,
        input.instruction,
        input.contextQuote || null,
        input.anchorBlockId || null,
        input.channelSessionId || null,
        input.channelMessageId || null,
        input.operatorId || null,
        input.eventKey || null,
        'new',
        input.ownerAgent || null,
        null,
        null,
        null,
        input.source,
        input.sourceUrl || null,
        input.idempotencyKey,
        timestamp,
        timestamp,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId)
        : this.db
            .prepare('SELECT * FROM commands WHERE source = ? AND idempotency_key = ?')
            .get(input.source, input.idempotencyKey);

    return {
      command: mapCommandRow(row),
      deduped: result.changes === 0,
    };
  }

  claimCommand({ commandId, agentName }) {
    const current = this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId);
    if (!current) {
      throw new Error(`Unknown command ${commandId}`);
    }
    if (current.status !== 'new') {
      throw new Error(`Command ${commandId} cannot be claimed from status ${current.status}`);
    }

    this.db
      .prepare('UPDATE commands SET status = ?, claimed_by = ?, updated_at = ? WHERE command_id = ?')
      .run('claimed', agentName, nowIso(this.clock), commandId);

    return mapCommandRow(this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId));
  }

  startCommand({ commandId, agentName }) {
    const current = this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId);
    if (!current) {
      throw new Error(`Unknown command ${commandId}`);
    }
    if (current.status !== 'claimed' || current.claimed_by !== agentName) {
      throw new Error(`Command ${commandId} must be claimed by ${agentName} before execution starts`);
    }

    this.db.prepare('UPDATE commands SET status = ?, updated_at = ? WHERE command_id = ?').run(
      'executing',
      nowIso(this.clock),
      commandId,
    );

    return mapCommandRow(this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId));
  }

  completeCommand({ commandId, agentName, resultSummary }) {
    const current = this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId);
    if (!current) {
      throw new Error(`Unknown command ${commandId}`);
    }
    if (current.claimed_by !== agentName) {
      throw new Error(`Command ${commandId} is not owned by ${agentName}`);
    }
    if (!['claimed', 'executing'].includes(current.status)) {
      throw new Error(`Command ${commandId} cannot be completed from status ${current.status}`);
    }

    this.db
      .prepare(`
        UPDATE commands
        SET status = ?, ack = ?, result_summary = ?, updated_at = ?
        WHERE command_id = ?
      `)
      .run('done', `ack:${commandId}`, resultSummary, nowIso(this.clock), commandId);

    return mapCommandRow(this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId));
  }

  updateCommandStatus({ commandId, status, ownerAgent, claimedBy, resultSummary, ack, allowMissing = false }) {
    const existing = this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId);
    if (!existing) {
      if (allowMissing) {
        return null;
      }
      throw new Error(`Unknown command ${commandId}`);
    }

    const nextOwnerAgent = ownerAgent === undefined ? existing.owner_agent : ownerAgent;
    const nextClaimedBy = claimedBy === undefined ? existing.claimed_by : claimedBy;
    const nextResultSummary = resultSummary === undefined ? existing.result_summary : resultSummary;
    const nextAck = ack === undefined ? existing.ack : ack;

    this.db
      .prepare(`
        UPDATE commands
        SET status = ?, owner_agent = ?, claimed_by = ?, result_summary = ?, ack = ?, updated_at = ?
        WHERE command_id = ?
      `)
      .run(status, nextOwnerAgent, nextClaimedBy, nextResultSummary, nextAck, nowIso(this.clock), commandId);

    return mapCommandRow(this.db.prepare('SELECT * FROM commands WHERE command_id = ?').get(commandId));
  }

  createOrGetDecisionRequest(input) {
    const timestamp = nowIso(this.clock);
    const decisionId = this.nextId('DR');
    const result = this.db
      .prepare(`
        INSERT INTO decision_requests (
          decision_id, project_id, signal_level, blocking_level, status, question,
          context, options_json, recommendation, recommended_option, why_now,
          impact_scope, irreversible, downstream_contamination, evidence_refs_json,
          requested_human_action, due_at, escalate_after, owner_agent,
          idempotency_key, source_url, display_tags, retrieval_tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, idempotency_key) DO NOTHING
      `)
      .run(
        decisionId,
        input.projectId,
        input.signalLevel,
        input.blockingLevel || null,
        input.status,
        input.question,
        input.context || null,
        toJson(input.options),
        input.recommendation || null,
        input.recommendedOption || null,
        input.whyNow || null,
        input.impactScope || null,
        input.irreversible ? 1 : 0,
        input.downstreamContamination ? 1 : 0,
        toJson(input.evidenceRefs),
        input.requestedHumanAction || null,
        input.dueAt || null,
        input.escalateAfter || null,
        input.ownerAgent || null,
        input.idempotencyKey,
        input.sourceUrl || null,
        toJson(input.displayTags),
        toJson(input.retrievalTags),
        timestamp,
        timestamp,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM decision_requests WHERE decision_id = ?').get(decisionId)
        : this.db
            .prepare('SELECT * FROM decision_requests WHERE project_id = ? AND idempotency_key = ?')
            .get(input.projectId, input.idempotencyKey);

    return {
      decision: mapDecisionRow(row),
      deduped: result.changes === 0,
    };
  }

  listDecisionRequests(filters = {}) {
    const clauses = [];
    const args = [];

    if (filters.projectId) {
      clauses.push('project_id = ?');
      args.push(filters.projectId);
    }
    if (filters.signalLevel) {
      clauses.push('signal_level = ?');
      args.push(filters.signalLevel);
    }
    if (filters.status) {
      clauses.push('status = ?');
      args.push(filters.status);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`
        SELECT *
        FROM decision_requests
        ${whereClause}
        ORDER BY
          CASE signal_level
            WHEN 'red' THEN 0
            WHEN 'yellow' THEN 1
            WHEN 'green' THEN 2
            ELSE 3
          END,
          created_at DESC
      `)
      .all(...args);

    return rows.map(mapDecisionRow);
  }

  updateDecisionStatus({
    decisionId,
    status,
    decidedBy,
    decidedAt,
    decisionNote,
    selectedOption,
    allowMissing = false,
  }) {
    const existing = this.db.prepare('SELECT * FROM decision_requests WHERE decision_id = ?').get(decisionId);
    if (!existing) {
      if (allowMissing) {
        return null;
      }
      throw new Error(`Unknown decision ${decisionId}`);
    }

    const nextStatus = status || existing.status;
    const nextDecidedBy = decidedBy === undefined ? existing.decided_by : decidedBy;
    const nextDecidedAt = decidedAt === undefined ? existing.decided_at : decidedAt;
    const nextDecisionNote = decisionNote === undefined ? existing.decision_note : decisionNote;
    const nextSelectedOption = selectedOption === undefined ? existing.selected_option : selectedOption;

    this.db
      .prepare(`
        UPDATE decision_requests
        SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?, selected_option = ?, updated_at = ?
        WHERE decision_id = ?
      `)
      .run(nextStatus, nextDecidedBy, nextDecidedAt, nextDecisionNote, nextSelectedOption, nowIso(this.clock), decisionId);

    return mapDecisionRow(this.db.prepare('SELECT * FROM decision_requests WHERE decision_id = ?').get(decisionId));
  }

  createOrGetTaskBrief(input) {
    const timestamp = nowIso(this.clock);
    const briefId = this.nextId('TB');
    const result = this.db
      .prepare(`
        INSERT INTO task_briefs (
          brief_id, project_id, title, why, context, what_text, status,
          owner_agent, source, source_url, channel_session_id, target_type,
          target_id, idempotency_key, display_tags, retrieval_tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, idempotency_key) DO NOTHING
      `)
      .run(
        briefId,
        input.projectId,
        input.title,
        input.why,
        input.context,
        input.what,
        input.status,
        input.ownerAgent || null,
        input.source || null,
        input.sourceUrl || null,
        input.channelSessionId || null,
        input.targetType || null,
        input.targetId || null,
        input.idempotencyKey,
        toJson(input.displayTags),
        toJson(input.retrievalTags),
        timestamp,
        timestamp,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM task_briefs WHERE brief_id = ?').get(briefId)
        : this.db
            .prepare('SELECT * FROM task_briefs WHERE project_id = ? AND idempotency_key = ?')
            .get(input.projectId, input.idempotencyKey);

    return {
      brief: mapTaskBriefRow(row),
      deduped: result.changes === 0,
    };
  }

  listTaskBriefs(filters = {}) {
    const clauses = [];
    const args = [];

    if (filters.projectId) {
      clauses.push('project_id = ?');
      args.push(filters.projectId);
    }
    if (filters.status) {
      clauses.push('status = ?');
      args.push(filters.status);
    }
    if (filters.targetType) {
      clauses.push('target_type = ?');
      args.push(filters.targetType);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`
        SELECT *
        FROM task_briefs
        ${whereClause}
        ORDER BY created_at DESC
      `)
      .all(...args);

    return rows.map(mapTaskBriefRow);
  }

  createOrGetRun(input) {
    const timestamp = nowIso(this.clock);
    const runId = this.nextId('RUN');
    const result = this.db
      .prepare(`
        INSERT INTO runs (
          run_id, project_id, brief_id, command_id, decision_id, agent_name, role, phase, status,
          title, summary, quality_grade, anomaly_level, feedback_source, idempotency_key,
          started_at, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, idempotency_key) DO NOTHING
      `)
      .run(
        runId,
        input.projectId,
        input.briefId || null,
        input.commandId || null,
        input.decisionId || null,
        input.agentName || null,
        input.role,
        input.phase,
        input.status,
        input.title,
        input.summary || null,
        input.qualityGrade || null,
        input.anomalyLevel || null,
        input.feedbackSource || null,
        input.idempotencyKey,
        input.startedAt || timestamp,
        input.completedAt || null,
        timestamp,
        timestamp,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId)
        : this.db.prepare('SELECT * FROM runs WHERE project_id = ? AND idempotency_key = ?').get(input.projectId, input.idempotencyKey);

    return {
      run: mapRunRow(row),
      deduped: result.changes === 0,
    };
  }

  updateRun({
    runId,
    status,
    summary,
    qualityGrade,
    anomalyLevel,
    feedbackSource,
    completedAt,
    allowMissing = false,
  }) {
    const existing = this.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId);
    if (!existing) {
      if (allowMissing) {
        return null;
      }
      throw new Error(`Unknown run ${runId}`);
    }

    this.db
      .prepare(`
        UPDATE runs
        SET status = ?, summary = ?, quality_grade = ?, anomaly_level = ?, feedback_source = ?,
            completed_at = ?, updated_at = ?
        WHERE run_id = ?
      `)
      .run(
        status ?? existing.status,
        summary === undefined ? existing.summary : summary,
        qualityGrade === undefined ? existing.quality_grade : qualityGrade,
        anomalyLevel === undefined ? existing.anomaly_level : anomalyLevel,
        feedbackSource === undefined ? existing.feedback_source : feedbackSource,
        completedAt === undefined ? existing.completed_at : completedAt,
        nowIso(this.clock),
        runId,
      );

    return mapRunRow(this.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId));
  }

  listRuns(filters = {}) {
    const clauses = [];
    const args = [];

    if (filters.projectId) {
      clauses.push('project_id = ?');
      args.push(filters.projectId);
    }
    if (filters.runId) {
      clauses.push('run_id = ?');
      args.push(filters.runId);
    }
    if (filters.status) {
      clauses.push('status = ?');
      args.push(filters.status);
    }
    if (filters.role) {
      clauses.push('role = ?');
      args.push(filters.role);
    }
    if (filters.agentName) {
      clauses.push('agent_name = ?');
      args.push(filters.agentName);
    }
    if (filters.commandId) {
      clauses.push('command_id = ?');
      args.push(filters.commandId);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause = Number.isInteger(filters.limit) && filters.limit > 0 ? `LIMIT ${filters.limit}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM runs ${whereClause} ORDER BY updated_at DESC ${limitClause}`.trim())
      .all(...args);

    return rows.map(mapRunRow);
  }

  createOrGetCheckpoint(input) {
    const timestamp = nowIso(this.clock);
    const checkpointId = this.nextId('CP');
    const result = this.db
      .prepare(`
        INSERT INTO checkpoints (
          checkpoint_id, project_id, run_id, brief_id, command_id, decision_id, signal_level,
          stage, status, title, summary, evidence_json, next_step, quality_grade, anomaly_level,
          feedback_source, created_by, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, idempotency_key) DO NOTHING
      `)
      .run(
        checkpointId,
        input.projectId,
        input.runId || null,
        input.briefId || null,
        input.commandId || null,
        input.decisionId || null,
        input.signalLevel || null,
        input.stage,
        input.status,
        input.title,
        input.summary,
        toJson(input.evidence),
        input.nextStep || null,
        input.qualityGrade || null,
        input.anomalyLevel || null,
        input.feedbackSource || null,
        input.createdBy || null,
        input.idempotencyKey,
        timestamp,
        timestamp,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM checkpoints WHERE checkpoint_id = ?').get(checkpointId)
        : this.db
            .prepare('SELECT * FROM checkpoints WHERE project_id = ? AND idempotency_key = ?')
            .get(input.projectId, input.idempotencyKey);

    return {
      checkpoint: mapCheckpointRow(row),
      deduped: result.changes === 0,
    };
  }

  listCheckpoints(filters = {}) {
    const clauses = [];
    const args = [];

    if (filters.projectId) {
      clauses.push('project_id = ?');
      args.push(filters.projectId);
    }
    if (filters.stage) {
      clauses.push('stage = ?');
      args.push(filters.stage);
    }
    if (filters.status) {
      clauses.push('status = ?');
      args.push(filters.status);
    }
    if (filters.signalLevel) {
      clauses.push('signal_level = ?');
      args.push(filters.signalLevel);
    }
    if (filters.runId) {
      clauses.push('run_id = ?');
      args.push(filters.runId);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause = Number.isInteger(filters.limit) && filters.limit > 0 ? `LIMIT ${filters.limit}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM checkpoints ${whereClause} ORDER BY created_at DESC ${limitClause}`.trim())
      .all(...args);

    return rows.map(mapCheckpointRow);
  }

  recordReceipt(input) {
    const createdAt = unixSeconds(this.clock);
    const receiptId = input.receiptId || this.nextId('RCP');
    const result = this.db
      .prepare(`
        INSERT INTO agent_receipts (
          receipt_id, command_id, project_id, session_id, status,
          receipt_type, payload_json, signal, channel, target,
          idempotency_key, parent_receipt_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(idempotency_key) DO NOTHING
      `)
      .run(
        receiptId,
        input.commandId,
        input.projectId,
        input.sessionId || null,
        input.status,
        input.receiptType,
        JSON.stringify(input.payload || {}),
        input.signal || null,
        input.channel,
        input.target,
        input.idempotencyKey || null,
        input.parentReceiptId || null,
        createdAt,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM agent_receipts WHERE receipt_id = ?').get(receiptId)
        : input.idempotencyKey
          ? this.db.prepare('SELECT * FROM agent_receipts WHERE idempotency_key = ?').get(input.idempotencyKey)
          : null;

    if (result.changes > 0) {
      this.db
        .prepare(`
          UPDATE commands
          SET receipt_count = COALESCE(receipt_count, 0) + 1,
              last_receipt_at = ?
          WHERE command_id = ?
        `)
        .run(createdAt, input.commandId);
    }

    return {
      receipt: mapReceiptRow(row),
      deduped: result.changes === 0,
    };
  }

  checkIdempotency(idempotencyKey) {
    if (!idempotencyKey) {
      return null;
    }

    const row = this.db
      .prepare(`
        SELECT receipt_id, created_at
        FROM agent_receipts
        WHERE idempotency_key = ?
      `)
      .get(idempotencyKey);

    if (!row) {
      return null;
    }

    return {
      receiptId: row.receipt_id,
      createdAt: row.created_at,
    };
  }

  getCommandReceipts(commandId) {
    return this.db
      .prepare(`
        SELECT *
        FROM agent_receipts
        WHERE command_id = ?
        ORDER BY created_at ASC
      `)
      .all(commandId)
      .map(mapReceiptRow);
  }

  getLatestReceipt(commandId) {
    return mapReceiptRow(
      this.db
        .prepare(`
          SELECT *
          FROM agent_receipts
          WHERE command_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .get(commandId),
    );
  }

  getReceiptsByProject(projectId, options = {}) {
    const clauses = ['project_id = ?'];
    const args = [projectId];

    if (options.status) {
      clauses.push('status = ?');
      args.push(options.status);
    }

    if (options.since !== undefined && options.since !== null) {
      clauses.push('created_at > ?');
      args.push(Number(options.since));
    }

    const limitClause = Number.isInteger(options.limit) && options.limit > 0 ? `LIMIT ${options.limit}` : 'LIMIT 50';

    return this.db
      .prepare(
        `
          SELECT *
          FROM agent_receipts
          WHERE ${clauses.join(' AND ')}
          ORDER BY created_at DESC
          ${limitClause}
        `.trim(),
      )
      .all(...args)
      .map(mapReceiptRow);
  }

  getMemoryItem(memoryId) {
    return mapMemoryRow(this.db.prepare('SELECT * FROM memory_items WHERE memory_id = ?').get(memoryId));
  }

  listMemorySources(memoryId) {
    return this.db
      .prepare(`
        SELECT *
        FROM memory_sources
        WHERE memory_id = ?
        ORDER BY created_at ASC
      `)
      .all(memoryId)
      .map(mapMemorySourceRow);
  }

  refreshMemorySourceCount(memoryId) {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM memory_sources WHERE memory_id = ?')
      .get(memoryId);

    this.db
      .prepare('UPDATE memory_items SET source_count = ?, updated_at = ? WHERE memory_id = ?')
      .run(row?.count || 0, nowIso(this.clock), memoryId);
  }

  touchMemoryProjectionTargets(memoryId, sources = []) {
    const checkpointIds = new Set();
    const briefIds = new Set();

    for (const source of sources) {
      const checkpointId =
        refToId(source.sourceRef, 'checkpoint', 'CP-') ||
        (source.sourceType === 'checkpoint' ? refToId(source.sourceRef, '', 'CP-') : null);
      const briefId =
        refToId(source.sourceRef, 'task_brief', 'TB-') ||
        refToId(source.sourceRef, 'brief', 'TB-') ||
        (source.sourceType === 'task_brief' ? refToId(source.sourceRef, '', 'TB-') : null);

      if (checkpointId) {
        checkpointIds.add(checkpointId);
      }
      if (briefId) {
        briefIds.add(briefId);
      }
    }

    for (const checkpointId of checkpointIds) {
      this.db
        .prepare(`
          UPDATE checkpoints
          SET memory_candidate_count = COALESCE(memory_candidate_count, 0) + 1,
              updated_at = ?
          WHERE checkpoint_id = ?
        `)
        .run(nowIso(this.clock), checkpointId);
    }

    for (const briefId of briefIds) {
      const row = this.db.prepare('SELECT memory_context_refs FROM task_briefs WHERE brief_id = ?').get(briefId);
      if (!row) {
        continue;
      }

      const refs = new Set(fromJson(row.memory_context_refs));
      refs.add(memoryId);
      this.db
        .prepare('UPDATE task_briefs SET memory_context_refs = ?, updated_at = ? WHERE brief_id = ?')
        .run(JSON.stringify([...refs]), nowIso(this.clock), briefId);
    }
  }

  createOrGetMemorySource(input) {
    const timestamp = nowIso(this.clock);
    const sourceId = this.nextId('MSRC');
    const idempotencyKey =
      input.idempotencyKey ||
      `memory_source:${hashValue(
        JSON.stringify([
          input.memoryId,
          input.sourceType,
          input.sourceRef,
          input.sourceUrl,
          input.quoteText,
          input.summary,
          input.evidence,
        ]),
      )}`;

    const result = this.db
      .prepare(`
        INSERT INTO memory_sources (
          source_id, memory_id, project_id, source_type, source_ref, source_url,
          quote_text, summary, evidence_json, idempotency_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(memory_id, idempotency_key) DO NOTHING
      `)
      .run(
        sourceId,
        input.memoryId,
        input.projectId,
        input.sourceType,
        input.sourceRef || null,
        input.sourceUrl || null,
        input.quoteText || null,
        input.summary || null,
        JSON.stringify(input.evidence || {}),
        idempotencyKey,
        timestamp,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM memory_sources WHERE source_id = ?').get(sourceId)
        : this.db
            .prepare('SELECT * FROM memory_sources WHERE memory_id = ? AND idempotency_key = ?')
            .get(input.memoryId, idempotencyKey);

    return {
      source: mapMemorySourceRow(row),
      deduped: result.changes === 0,
    };
  }

  createOrGetMemoryItem(input) {
    const timestamp = nowIso(this.clock);
    const memoryId = this.nextId('MEM');
    const idempotencyKey =
      input.idempotencyKey ||
      `memory:${hashValue(JSON.stringify([input.projectId, input.layer, input.type, input.title, input.summary]))}`;

    const result = this.db
      .prepare(`
        INSERT INTO memory_items (
          memory_id, project_id, layer, type, title, summary, status,
          review_state, confidence, freshness, next_step, owner_agent,
          source_count, related_memory_json, metadata_json, idempotency_key,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, idempotency_key) DO NOTHING
      `)
      .run(
        memoryId,
        input.projectId,
        input.layer,
        input.type,
        input.title,
        input.summary,
        input.status || 'candidate',
        input.reviewState || 'pending_accept',
        input.confidence || 'medium',
        input.freshness || null,
        input.nextStep || null,
        input.ownerAgent || null,
        0,
        JSON.stringify(input.relatedMemory || []),
        JSON.stringify(input.metadata || {}),
        idempotencyKey,
        timestamp,
        timestamp,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM memory_items WHERE memory_id = ?').get(memoryId)
        : this.db
            .prepare('SELECT * FROM memory_items WHERE project_id = ? AND idempotency_key = ?')
            .get(input.projectId, idempotencyKey);

    const memory = mapMemoryRow(row);
    const sourceResults = [];
    if (memory && Array.isArray(input.sources)) {
      for (const source of input.sources) {
        const sourceResult = this.createOrGetMemorySource({
          memoryId: memory.memoryId,
          projectId: memory.projectId,
          sourceType: source.sourceType,
          sourceRef: source.sourceRef,
          sourceUrl: source.sourceUrl,
          quoteText: source.quoteText,
          summary: source.summary,
          evidence: source.evidence,
          idempotencyKey: source.idempotencyKey,
        });
        sourceResults.push(sourceResult.source);
      }
      this.refreshMemorySourceCount(memory.memoryId);
      this.touchMemoryProjectionTargets(memory.memoryId, sourceResults);
    }

    return {
      memory: this.getMemoryItem(memory.memoryId),
      sources: this.listMemorySources(memory.memoryId),
      deduped: result.changes === 0,
    };
  }

  listMemoryItems(filters = {}) {
    const clauses = [];
    const args = [];

    if (filters.projectId) {
      clauses.push('project_id = ?');
      args.push(filters.projectId);
    }
    if (filters.layer) {
      clauses.push('layer = ?');
      args.push(filters.layer);
    }
    if (filters.status) {
      clauses.push('status = ?');
      args.push(filters.status);
    }
    if (filters.reviewState) {
      clauses.push('review_state = ?');
      args.push(filters.reviewState);
    }
    if (filters.type) {
      clauses.push('type = ?');
      args.push(filters.type);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause = Number.isInteger(filters.limit) && filters.limit > 0 ? `LIMIT ${filters.limit}` : '';
    return this.db
      .prepare(`SELECT * FROM memory_items ${whereClause} ORDER BY updated_at DESC ${limitClause}`.trim())
      .all(...args)
      .map(mapMemoryRow);
  }

  reviewMemoryItem({
    memoryId,
    reviewState,
    status,
    nextStep,
    freshness,
    ownerAgent,
    metadataPatch,
    allowMissing = false,
  }) {
    const existing = this.db.prepare('SELECT * FROM memory_items WHERE memory_id = ?').get(memoryId);
    if (!existing) {
      if (allowMissing) {
        return null;
      }
      throw new Error(`Unknown memory ${memoryId}`);
    }

    let nextStatus = status;
    if (!nextStatus) {
      if (reviewState === 'accepted') {
        nextStatus = existing.status === 'candidate' ? 'durable' : existing.status;
      } else if (reviewState === 'rejected') {
        nextStatus = 'rejected';
      } else {
        nextStatus = existing.status;
      }
    }

    const existingMetadata = fromJson(existing.metadata_json, {});
    const nextMetadata =
      metadataPatch && typeof metadataPatch === 'object'
        ? {
            ...existingMetadata,
            ...metadataPatch,
          }
        : existingMetadata;

    this.db
      .prepare(`
        UPDATE memory_items
        SET review_state = ?, status = ?, next_step = ?, freshness = ?, owner_agent = ?, metadata_json = ?, updated_at = ?
        WHERE memory_id = ?
      `)
      .run(
        reviewState || existing.review_state,
        nextStatus,
        nextStep === undefined ? existing.next_step : nextStep,
        freshness === undefined ? existing.freshness : freshness,
        ownerAgent === undefined ? existing.owner_agent : ownerAgent,
        JSON.stringify(nextMetadata),
        nowIso(this.clock),
        memoryId,
      );

    return this.getMemoryItem(memoryId);
  }

  getInboxItem(itemId) {
    return mapInboxRow(this.db.prepare('SELECT * FROM inbox_items WHERE item_id = ?').get(itemId));
  }

  touchInboxProjectionTargets(inboxItem) {
    const timestamp = nowIso(this.clock);
    const payload = inboxItem.payload || {};
    const commandId =
      refToId(inboxItem.sourceRef, 'command', 'CMD-') ||
      refToId(payload.command_id, '', 'CMD-') ||
      refToId(payload.commandId, '', 'CMD-');
    const decisionId =
      refToId(inboxItem.sourceRef, 'decision', 'DR-') ||
      refToId(payload.decision_id, '', 'DR-') ||
      refToId(payload.decisionId, '', 'DR-');

    if (commandId) {
      this.db
        .prepare(`
          UPDATE commands
          SET inbox_item_count = COALESCE(inbox_item_count, 0) + 1,
              last_inbox_item_at = ?
          WHERE command_id = ?
        `)
        .run(timestamp, commandId);
    }

    if (decisionId && inboxItem.objectType === 'decision') {
      this.db
        .prepare(`
          UPDATE decision_requests
          SET inbox_item_id = ?, updated_at = ?
          WHERE decision_id = ?
        `)
        .run(inboxItem.itemId, timestamp, decisionId);
    }
  }

  createOrGetInboxItem(input) {
    const timestamp = nowIso(this.clock);
    const itemId = this.nextId('INB');
    const idempotencyKey =
      input.idempotencyKey ||
      `inbox:${hashValue(
        JSON.stringify([
          input.projectId,
          input.queue,
          input.objectType,
          input.actionType,
          input.title,
          input.sourceRef,
          input.payload,
        ]),
      )}`;

    const result = this.db
      .prepare(`
        INSERT INTO inbox_items (
          item_id, project_id, queue, object_type, action_type, risk_level,
          status, title, summary, owner_agent, source_ref, source_url,
          assigned_to, payload_json, idempotency_key, created_at, updated_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, idempotency_key) DO NOTHING
      `)
      .run(
        itemId,
        input.projectId,
        input.queue,
        input.objectType,
        input.actionType,
        input.riskLevel || 'green',
        input.status || 'open',
        input.title,
        input.summary || null,
        input.ownerAgent || null,
        input.sourceRef || null,
        input.sourceUrl || null,
        input.assignedTo || null,
        JSON.stringify(input.payload || {}),
        idempotencyKey,
        timestamp,
        timestamp,
        input.resolvedAt || null,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM inbox_items WHERE item_id = ?').get(itemId)
        : this.db
            .prepare('SELECT * FROM inbox_items WHERE project_id = ? AND idempotency_key = ?')
            .get(input.projectId, idempotencyKey);

    const inboxItem = mapInboxRow(row);
    if (result.changes > 0) {
      this.touchInboxProjectionTargets(inboxItem);
    }

    return {
      item: inboxItem,
      deduped: result.changes === 0,
    };
  }

  listInboxItems(filters = {}) {
    const clauses = [];
    const args = [];

    if (filters.projectId) {
      clauses.push('project_id = ?');
      args.push(filters.projectId);
    }
    if (filters.queue) {
      clauses.push('queue = ?');
      args.push(filters.queue);
    }
    if (filters.status) {
      clauses.push('status = ?');
      args.push(filters.status);
    }
    if (filters.objectType) {
      clauses.push('object_type = ?');
      args.push(filters.objectType);
    }
    if (filters.riskLevel) {
      clauses.push('risk_level = ?');
      args.push(filters.riskLevel);
    }
    if (filters.sourceRef) {
      clauses.push('source_ref = ?');
      args.push(filters.sourceRef);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause = Number.isInteger(filters.limit) && filters.limit > 0 ? `LIMIT ${filters.limit}` : '';
    return this.db
      .prepare(`SELECT * FROM inbox_items ${whereClause} ORDER BY created_at DESC ${limitClause}`.trim())
      .all(...args)
      .map(mapInboxRow);
  }

  actInboxItem({ itemId, status, assignedTo, payloadPatch, allowMissing = false }) {
    const existing = this.db.prepare('SELECT * FROM inbox_items WHERE item_id = ?').get(itemId);
    if (!existing) {
      if (allowMissing) {
        return null;
      }
      throw new Error(`Unknown inbox item ${itemId}`);
    }

    const nextPayload =
      payloadPatch && typeof payloadPatch === 'object'
        ? {
            ...fromJson(existing.payload_json, {}),
            ...payloadPatch,
          }
        : fromJson(existing.payload_json, {});

    const nextStatus = status || existing.status;
    const resolvedAt =
      nextStatus === 'resolved' || nextStatus === 'archived'
        ? existing.resolved_at || nowIso(this.clock)
        : null;

    this.db
      .prepare(`
        UPDATE inbox_items
        SET status = ?, assigned_to = ?, payload_json = ?, updated_at = ?, resolved_at = ?
        WHERE item_id = ?
      `)
      .run(
        nextStatus,
        assignedTo === undefined ? existing.assigned_to : assignedTo,
        JSON.stringify(nextPayload),
        nowIso(this.clock),
        resolvedAt,
        itemId,
      );

    return this.getInboxItem(itemId);
  }

  getSuggestion(suggestionId) {
    return mapSuggestionRow(this.db.prepare('SELECT * FROM suggestions WHERE suggestion_id = ?').get(suggestionId));
  }

  createOrGetSuggestion(input) {
    const timestamp = nowIso(this.clock);
    const suggestionId = this.nextId('SUG');
    const idempotencyKey =
      input.idempotencyKey ||
      `suggestion:${hashValue(
        JSON.stringify([
          input.projectId,
          input.sourceType,
          input.sourceRef,
          input.documentRef,
          input.anchorBlockId,
          input.selectedText,
          input.proposedText,
        ]),
      )}`;

    const result = this.db
      .prepare(`
        INSERT INTO suggestions (
          suggestion_id, project_id, source_type, source_ref, document_ref,
          anchor_block_id, selected_text, proposed_text, reason, impact_scope,
          status, owner_agent, applied_at, rejected_reason, idempotency_key,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, idempotency_key) DO NOTHING
      `)
      .run(
        suggestionId,
        input.projectId,
        input.sourceType,
        input.sourceRef || null,
        input.documentRef || null,
        input.anchorBlockId || null,
        input.selectedText || null,
        input.proposedText,
        input.reason || null,
        input.impactScope || null,
        input.status || 'proposed',
        input.ownerAgent || null,
        input.appliedAt || null,
        input.rejectedReason || null,
        idempotencyKey,
        timestamp,
        timestamp,
      );

    const row =
      result.changes > 0
        ? this.db.prepare('SELECT * FROM suggestions WHERE suggestion_id = ?').get(suggestionId)
        : this.db
            .prepare('SELECT * FROM suggestions WHERE project_id = ? AND idempotency_key = ?')
            .get(input.projectId, idempotencyKey);

    return {
      suggestion: mapSuggestionRow(row),
      deduped: result.changes === 0,
    };
  }

  listSuggestions(filters = {}) {
    const clauses = [];
    const args = [];

    if (filters.projectId) {
      clauses.push('project_id = ?');
      args.push(filters.projectId);
    }
    if (filters.status) {
      clauses.push('status = ?');
      args.push(filters.status);
    }
    if (filters.sourceType) {
      clauses.push('source_type = ?');
      args.push(filters.sourceType);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause = Number.isInteger(filters.limit) && filters.limit > 0 ? `LIMIT ${filters.limit}` : '';
    return this.db
      .prepare(`SELECT * FROM suggestions ${whereClause} ORDER BY updated_at DESC ${limitClause}`.trim())
      .all(...args)
      .map(mapSuggestionRow);
  }

  updateSuggestionStatus({ suggestionId, status, rejectedReason, appliedAt, allowMissing = false }) {
    const existing = this.db.prepare('SELECT * FROM suggestions WHERE suggestion_id = ?').get(suggestionId);
    if (!existing) {
      if (allowMissing) {
        return null;
      }
      throw new Error(`Unknown suggestion ${suggestionId}`);
    }

    this.db
      .prepare(`
        UPDATE suggestions
        SET status = ?, rejected_reason = ?, applied_at = ?, updated_at = ?
        WHERE suggestion_id = ?
      `)
      .run(
        status,
        rejectedReason === undefined ? existing.rejected_reason : rejectedReason,
        appliedAt === undefined ? existing.applied_at : appliedAt,
        nowIso(this.clock),
        suggestionId,
      );

    return this.getSuggestion(suggestionId);
  }

  enqueueOutbox(input) {
    const createdAt = unixSeconds(this.clock);
    const result = this.db
      .prepare(`
        INSERT INTO outbox (channel, session_id, chat_id, text, payload_json, priority, status, error, created_at, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.channel || 'hiredcity',
        input.sessionId || null,
        input.chatId || null,
        input.text,
        JSON.stringify(input.payload || null),
        input.priority || 'normal',
        input.status || 'pending',
        null,
        createdAt,
        null,
      );

    return mapOutboxRow(this.db.prepare('SELECT * FROM outbox WHERE id = ?').get(result.lastInsertRowid));
  }

  listOutbox(options = {}) {
    const pending = this.db
      .prepare(`
        SELECT *
        FROM outbox
        WHERE status = ?
        ORDER BY
          CASE priority
            WHEN 'urgent' THEN 0
            ELSE 1
          END,
          created_at ASC
      `)
      .all('pending')
      .map(mapOutboxRow);
    const stats = this.db
      .prepare('SELECT status, COUNT(*) AS count FROM outbox GROUP BY status ORDER BY status ASC')
      .all()
      .map((row) => ({ status: row.status, count: row.count }));

    let messages = null;
    if (options.status || options.sessionId) {
      const clauses = [];
      const args = [];

      if (options.status) {
        clauses.push('status = ?');
        args.push(options.status);
      }

      if (options.sessionId) {
        clauses.push('session_id = ?');
        args.push(options.sessionId);
      }

      const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
      args.push(limit);

      const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      messages = this.db
        .prepare(
          `
            SELECT *
            FROM outbox
            ${whereClause}
            ORDER BY created_at DESC, id DESC
            LIMIT ?
          `.trim(),
        )
        .all(...args)
        .map(mapOutboxRow);
    }

    return {
      pending,
      stats,
      messages,
    };
  }

  getOutbox(id) {
    return mapOutboxRow(this.db.prepare('SELECT * FROM outbox WHERE id = ?').get(id));
  }

  ackOutbox(id) {
    const existing = this.db.prepare('SELECT * FROM outbox WHERE id = ?').get(id);
    if (!existing) {
      throw new Error(`Unknown outbox message ${id}`);
    }

    this.db.prepare('UPDATE outbox SET status = ?, sent_at = ?, error = NULL WHERE id = ?').run(
      'sent',
      unixSeconds(this.clock),
      id,
    );

    return mapOutboxRow(this.db.prepare('SELECT * FROM outbox WHERE id = ?').get(id));
  }

  failOutbox(id, error) {
    const existing = this.db.prepare('SELECT * FROM outbox WHERE id = ?').get(id);
    if (!existing) {
      throw new Error(`Unknown outbox message ${id}`);
    }

    this.db.prepare('UPDATE outbox SET status = ?, error = ? WHERE id = ?').run('failed', error, id);
    return mapOutboxRow(this.db.prepare('SELECT * FROM outbox WHERE id = ?').get(id));
  }

  archiveOutbox(id, note) {
    const existing = this.db.prepare('SELECT * FROM outbox WHERE id = ?').get(id);
    if (!existing) {
      throw new Error(`Unknown outbox message ${id}`);
    }

    const nextNote = note === undefined ? existing.error : note;
    this.db.prepare('UPDATE outbox SET status = ?, error = ? WHERE id = ?').run('archived', nextNote, id);
    return mapOutboxRow(this.db.prepare('SELECT * FROM outbox WHERE id = ?').get(id));
  }

  claimNextCommand(filters = {}) {
    const clauses = ['status = ?'];
    const args = ['new'];

    if (filters.projectId) {
      clauses.push('project_id = ?');
      args.push(filters.projectId);
    }
    if (filters.source) {
      clauses.push('source = ?');
      args.push(filters.source);
    }
    if (filters.targetType) {
      clauses.push('target_type = ?');
      args.push(filters.targetType);
    }
    if (filters.channel) {
      clauses.push('channel = ?');
      args.push(filters.channel);
    }
    if (filters.ownerAgent) {
      if (filters.includeUnassigned) {
        clauses.push('(owner_agent = ? OR owner_agent IS NULL)');
        args.push(filters.ownerAgent);
      } else {
        clauses.push('owner_agent = ?');
        args.push(filters.ownerAgent);
      }
    } else if (filters.onlyUnassigned) {
      clauses.push('owner_agent IS NULL');
    }

    const row = this.db
      .prepare(`
        SELECT *
        FROM commands
        WHERE ${clauses.join(' AND ')}
        ORDER BY created_at ASC
        LIMIT 1
      `)
      .get(...args);

    if (!row) {
      return null;
    }

    return this.claimCommand({
      commandId: row.command_id,
      agentName: filters.agentName,
    });
  }

  listCommands(filters = {}) {
    if (typeof filters === 'string') {
      filters = { projectId: filters };
    }

    const clauses = [];
    const args = [];

    if (filters.projectId) {
      clauses.push('project_id = ?');
      args.push(filters.projectId);
    }
    if (filters.commandId) {
      clauses.push('command_id = ?');
      args.push(filters.commandId);
    }
    if (filters.status) {
      clauses.push('status = ?');
      args.push(filters.status);
    }
    if (filters.source) {
      clauses.push('source = ?');
      args.push(filters.source);
    }
    if (filters.ownerAgent) {
      clauses.push('owner_agent = ?');
      args.push(filters.ownerAgent);
    }
    if (filters.targetType) {
      clauses.push('target_type = ?');
      args.push(filters.targetType);
    }
    if (filters.parsedAction) {
      clauses.push('parsed_action = ?');
      args.push(filters.parsedAction);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause = Number.isInteger(filters.limit) && filters.limit > 0 ? `LIMIT ${filters.limit}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM commands ${whereClause} ORDER BY created_at DESC ${limitClause}`.trim())
      .all(...args);

    return rows.map(mapCommandRow);
  }
}

export function createStore(options = {}) {
  return new CortexStore(options);
}

export { DEFAULT_DB_PATH };
