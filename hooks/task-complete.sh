#!/bin/bash

set -euo pipefail

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ] || [ "${3:-}" = "" ]; then
  cat >&2 <<'EOF'
Usage:
  bash hooks/task-complete.sh <command_id> <signal> <summary> [details] [metrics_json] [status] [receipt_type]

Example:
  bash hooks/task-complete.sh CMD-20260402-008 green "任务已完成" "处理了 2 条记录" '{"processed":2}'
EOF
  exit 1
fi

COMMAND_ID="$1"
SIGNAL="$2"
SUMMARY="$3"
DETAILS="${4:-}"
METRICS_JSON="${5:-}"
STATUS_INPUT="${6:-}"
RECEIPT_TYPE_INPUT="${7:-}"

CORTEX_BASE_URL="${CORTEX_BASE_URL:-http://127.0.0.1:19100}"
CALLBACK_URL="${CALLBACK_URL:-}"
PROJECT_ID="${PROJECT_ID:-PRJ-cortex}"
SESSION_ID="${SESSION_ID:-your-target@example.com}"
CHANNEL="${CHANNEL:-hiredcity}"
TARGET="${TARGET:-your-target@example.com}"
AGENT_NAME="${AGENT_NAME:-agent-panghu}"
REPLY_TEXT="${REPLY_TEXT:-}"
NEXT_STEP="${NEXT_STEP:-}"
ARTIFACTS_JSON="${ARTIFACTS_JSON:-[]}"
DECISION_CONTEXT_JSON="${DECISION_CONTEXT_JSON:-null}"

if [ -z "$METRICS_JSON" ]; then
  METRICS_JSON='{}'
fi

if [ -z "$CALLBACK_URL" ]; then
  CALLBACK_URL="${CORTEX_BASE_URL}/webhook/agent-receipt"
fi

if [[ "$SIGNAL" != "green" && "$SIGNAL" != "yellow" && "$SIGNAL" != "red" ]]; then
  echo "Invalid signal: $SIGNAL. Must be one of: green|yellow|red" >&2
  exit 1
fi

if [ -z "$STATUS_INPUT" ]; then
  if [ "$SIGNAL" = "red" ]; then
    STATUS="failed"
  else
    STATUS="completed"
  fi
else
  STATUS="$STATUS_INPUT"
fi

if [ -z "$RECEIPT_TYPE_INPUT" ]; then
  if [ "$SIGNAL" = "red" ] || [ "$STATUS" = "failed" ]; then
    RECEIPT_TYPE="alert"
  elif [ "$STATUS" = "acknowledged" ] || [ "$STATUS" = "read" ] || [ "$STATUS" = "delivered" ]; then
    RECEIPT_TYPE="status_update"
  else
    RECEIPT_TYPE="result"
  fi
else
  RECEIPT_TYPE="$RECEIPT_TYPE_INPUT"
fi

DATE_BUCKET="$(date +%Y%m%d)"
COMMAND_SUFFIX="${COMMAND_ID: -8}"
IDEMPOTENCY_KEY="panghu-${DATE_BUCKET}-${COMMAND_SUFFIX}-${RECEIPT_TYPE}"
TIMESTAMP="$(date -Iseconds)"

REQUEST_BODY="$(
COMMAND_ID="$COMMAND_ID" \
PROJECT_ID="$PROJECT_ID" \
SESSION_ID="$SESSION_ID" \
STATUS="$STATUS" \
RECEIPT_TYPE="$RECEIPT_TYPE" \
SUMMARY="$SUMMARY" \
DETAILS="$DETAILS" \
SIGNAL="$SIGNAL" \
CHANNEL="$CHANNEL" \
TARGET="$TARGET" \
TIMESTAMP="$TIMESTAMP" \
IDEMPOTENCY_KEY="$IDEMPOTENCY_KEY" \
METRICS_JSON="$METRICS_JSON" \
AGENT_NAME="$AGENT_NAME" \
REPLY_TEXT="$REPLY_TEXT" \
NEXT_STEP="$NEXT_STEP" \
ARTIFACTS_JSON="$ARTIFACTS_JSON" \
DECISION_CONTEXT_JSON="$DECISION_CONTEXT_JSON" \
python3 - <<'PY'
import json
import os

command_id = os.environ["COMMAND_ID"]
project_id = os.environ["PROJECT_ID"]
session_id = os.environ["SESSION_ID"]
status = os.environ["STATUS"]
receipt_type = os.environ["RECEIPT_TYPE"]
summary = os.environ["SUMMARY"]
details = os.environ["DETAILS"]
signal = os.environ["SIGNAL"]
channel = os.environ["CHANNEL"]
target = os.environ["TARGET"]
timestamp = os.environ["TIMESTAMP"]
idempotency_key = os.environ["IDEMPOTENCY_KEY"]
metrics_json = os.environ["METRICS_JSON"]
agent_name = os.environ["AGENT_NAME"]
reply_text = os.environ["REPLY_TEXT"]
next_step = os.environ["NEXT_STEP"]
artifacts_json = os.environ["ARTIFACTS_JSON"]
decision_context_json = os.environ["DECISION_CONTEXT_JSON"]

try:
    metrics = json.loads(metrics_json)
except Exception:
    metrics = {"raw": metrics_json}

try:
    artifacts = json.loads(artifacts_json)
    if not isinstance(artifacts, list):
        artifacts = [artifacts]
except Exception:
    artifacts = [artifacts_json] if artifacts_json else []

try:
    decision_context = json.loads(decision_context_json)
except Exception:
    decision_context = {"raw": decision_context_json} if decision_context_json and decision_context_json != "null" else None

payload = {
    "command_id": command_id,
    "project_id": project_id,
    "session_id": session_id,
    "agent_name": agent_name,
    "status": status,
    "receipt_type": receipt_type,
    "payload": {
        "summary": summary,
        "details": details,
        "metrics": metrics,
        "artifacts": artifacts,
    },
    "signal": signal,
    "channel": channel,
    "target": target,
    "timestamp": timestamp,
    "idempotency_key": idempotency_key,
}

if decision_context is not None:
    payload["payload"]["decision_context"] = decision_context

if reply_text:
    payload["reply_text"] = reply_text

if next_step:
    payload["next_step"] = next_step

print(json.dumps(payload, ensure_ascii=False))
PY
)"

curl -sS -X POST "${CALLBACK_URL}" \
  -H "Content-Type: application/json" \
  -d "${REQUEST_BODY}"
