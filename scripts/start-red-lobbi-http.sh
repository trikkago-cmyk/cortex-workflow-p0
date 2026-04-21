#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SEND_URL="${1:-${PANGHU_SEND_URL:-}}"
SEND_TOKEN="${2:-${PANGHU_SEND_TOKEN:-}}"

if [ -z "$SEND_URL" ]; then
  cat >&2 <<'EOF'
Usage:
  bash scripts/start-red-lobbi-http.sh <send_url> [bearer_token]

Example:
  bash scripts/start-red-lobbi-http.sh http://192.168.0.10:3030/send-hi your-token
EOF
  exit 1
fi

cd "$PROJECT_ROOT"

export PANGHU_SEND_MODE="http"
export PANGHU_SEND_URL="$SEND_URL"

if [ -n "$SEND_TOKEN" ]; then
  export PANGHU_SEND_TOKEN="$SEND_TOKEN"
fi

echo "[panghu-http] starting automation with ${PANGHU_SEND_URL}"
npm run automation:start
npm run automation:status
