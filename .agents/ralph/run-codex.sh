#!/usr/bin/env bash
# Persist only the final assistant response for Ralph's completion check.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
mkdir -p .ralph
reply_file="${RALPH_LAST_MESSAGE:-$repo_root/.ralph/last-message.txt}"
rm -f -- "$reply_file"
exec codex exec --json --sandbox workspace-write -c 'approval_policy="never"' --ephemeral --output-last-message "$reply_file" -
