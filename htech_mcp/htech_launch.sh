#!/bin/sh
set -eu

if [ "${1:-}" != new ]; then
  printf 'Expected the new Actual instance\n' >&2
  exit 2
fi

htech_repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
htech_bridge_root=/Users/edyhourany/.local/share/actual-mcp-bridge
htech_sync_file=/Users/edyhourany/.config/actual-mcp/new.sync-id

if [ ! -s "$htech_sync_file" ]; then
  printf 'Missing new Actual Sync ID\n' >&2
  exit 1
fi

ACTUAL_SERVER_URL=https://actual.hourany.tech
ACTUAL_BUDGET_SYNC_ID=$(cat "$htech_sync_file")
if ! ACTUAL_PASSWORD=$(security find-generic-password -a edyhourany -s actual-mcp-new -w 2>/dev/null); then
  printf 'Missing new Actual Keychain password\n' >&2
  exit 1
fi
MCP_BRIDGE_DATA_DIR="$htech_bridge_root/data/new-htech"
mkdir -p "$MCP_BRIDGE_DATA_DIR"
HTECH_ACTUAL_API_ENTRY="$htech_repo_root/packages/api/dist/index.js"
HTECH_ORIGINAL_MCP_ENTRY="$htech_bridge_root/node_modules/actual-mcp-server/bin/actual-mcp-server.js"
if ! grep -q '^Object.defineProperty(exports' "$HTECH_ACTUAL_API_ENTRY" 2>/dev/null; then
  (cd "$htech_repo_root" && yarn workspace @actual-app/api build >&2)
fi
export ACTUAL_SERVER_URL ACTUAL_BUDGET_SYNC_ID ACTUAL_PASSWORD MCP_BRIDGE_DATA_DIR
export HTECH_ACTUAL_API_ENTRY HTECH_ORIGINAL_MCP_ENTRY

exec /Users/edyhourany/.nvm/versions/node/v22.20.0/bin/node "$htech_repo_root/htech_mcp/htech_proxy.ts"
