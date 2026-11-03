#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$here/runtime-common.sh"
hsy_runtime
tool=${1:?Choose node, npm or npx}; shift
case "$tool" in
  node) exec "$HSY_NODE_BIN" "$@" ;;
  npm|npx)
    actual=$(readlink -f -- "$HSY_NODE_BIN")
    cli="$(dirname -- "$actual")/../lib/node_modules/npm/bin/${tool}-cli.js"
    [[ -f "$cli" ]] || { echo 'Matching bundled npm/npx is missing; refusing system npm.' >&2; exit 1; }
    exec "$HSY_NODE_BIN" "$cli" "$@"
    ;;
  *) echo 'Choose node, npm or npx.' >&2; exit 1 ;;
esac
