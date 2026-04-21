#!/bin/bash

set -euo pipefail

SESSION_ID="${1:-${SESSION_ID:-}}"
TEXT="${2:-${TEXT:-}}"

if [ -z "$SESSION_ID" ] || [ -z "$TEXT" ]; then
  echo "[send-hi] Error: session_id and text required" >&2
  exit 1
fi

OPENCLAW_CHANNEL="${OPENCLAW_CHANNEL:-hi}"
OPENCLAW_ACCOUNT="${OPENCLAW_ACCOUNT:-}"
OPENCLAW_REPLY_TO="${OPENCLAW_REPLY_TO:-}"
OPENCLAW_THREAD_ID="${OPENCLAW_THREAD_ID:-}"
OPENCLAW_JSON="${OPENCLAW_JSON:-0}"

if [ -n "${OPENCLAW_BIN:-}" ]; then
  OPENCLAW_CMD=("${OPENCLAW_BIN}")
elif command -v openclaw >/dev/null 2>&1; then
  OPENCLAW_CMD=("openclaw")
elif [ -f "/Applications/QClaw.app/Contents/Resources/openclaw/node_modules/openclaw/openclaw.mjs" ]; then
  OPENCLAW_CMD=("node" "/Applications/QClaw.app/Contents/Resources/openclaw/node_modules/openclaw/openclaw.mjs")
elif [ -f "/Applications/OpenClaw.app/Contents/Resources/openclaw/node_modules/openclaw/openclaw.mjs" ]; then
  OPENCLAW_CMD=("node" "/Applications/OpenClaw.app/Contents/Resources/openclaw/node_modules/openclaw/openclaw.mjs")
else
  echo "[send-hi] Error: openclaw CLI not found" >&2
  exit 1
fi

ARGS=("message" "send" "--channel" "$OPENCLAW_CHANNEL" "--target" "$SESSION_ID" "--message" "$TEXT")

if [ -n "$OPENCLAW_ACCOUNT" ]; then
  ARGS+=("--account" "$OPENCLAW_ACCOUNT")
fi

if [ -n "$OPENCLAW_REPLY_TO" ]; then
  ARGS+=("--reply-to" "$OPENCLAW_REPLY_TO")
fi

if [ -n "$OPENCLAW_THREAD_ID" ]; then
  ARGS+=("--thread-id" "$OPENCLAW_THREAD_ID")
fi

if [ "$OPENCLAW_JSON" = "1" ]; then
  ARGS+=("--json")
fi

"${OPENCLAW_CMD[@]}" "${ARGS[@]}"
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "[send-hi] Success: $SESSION_ID"
else
  echo "[send-hi] Failed: $SESSION_ID (exit $EXIT_CODE)" >&2
fi

exit $EXIT_CODE
