#!/usr/bin/env bash
# Never inspect the combined log: it contains the input prompt's marker.
set -euo pipefail
[[ $# -eq 1 && -f "$1" ]] || exit 1
grep -Eq '^[[:space:]]*<promise>COMPLETE</promise>[[:space:]]*$' "$1"
