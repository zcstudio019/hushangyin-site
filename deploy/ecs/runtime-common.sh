#!/usr/bin/env bash
# Sourced by deployment tools. Never changes system PATH/profile or installs software.
hsy_runtime() {
  local config=${HSY_RUNTIME_CONFIG:-/etc/hushangyin/runtime.env} key value configured=''
  if [[ -e "$config" ]]; then
    [[ -f "$config" && ! -L "$config" ]] || { echo 'Invalid runtime configuration.' >&2; return 1; }
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
      [[ -z "$key" || "$key" == \#* ]] && continue
      [[ "$key" == HSY_NODE_BIN && -z "$configured" && "$value" =~ ^/[a-zA-Z0-9_./-]+/node$ ]] || { echo 'runtime.env accepts one absolute HSY_NODE_BIN only; do not use shell expressions.' >&2; return 1; }
      configured=$value
    done < "$config"
  fi
  if [[ -n "$configured" && -n ${HSY_NODE_BIN:-} && "$configured" != "$HSY_NODE_BIN" ]]; then
    echo 'HSY_NODE_BIN conflicts with runtime.env; use one consistent runtime configuration.' >&2; return 1
  fi
  HSY_NODE_BIN=${HSY_NODE_BIN:-${configured:-/opt/node24/bin/node}}
  [[ "$HSY_NODE_BIN" =~ ^/[a-zA-Z0-9_./-]+/node$ && -x "$HSY_NODE_BIN" ]] || { echo 'Independent Node.js executable missing; expected /opt/node24/bin/node or configured HSY_NODE_BIN.' >&2; return 1; }
  local major
  major=$("$HSY_NODE_BIN" -p 'process.versions.node.split(".")[0]') || return 1
  [[ "$major" == 24 ]] || { echo 'Hushangyin requires independent Node.js 24; system Node is not a fallback.' >&2; return 1; }
  # Subprocess shebangs (npm lifecycle, Prisma engines/tools) also resolve the same Node.
  export HSY_NODE_BIN
  export PATH="$(dirname -- "$HSY_NODE_BIN"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
}

# Read-only, narrow adoption predicate; rejects symlinks, hidden siblings and unrelated trees.
hsy_source_only_adoption() {
  local base=$1 source=$2 entries mode
  [[ -d "$base" && ! -L "$base" && -d "$base/source" && ! -L "$base/source" ]] || return 1
  [[ $(stat -c '%u' "$base") == 0 && $(realpath -- "$base/source") == "$(realpath -- "$source")" ]] || return 1
  mode=$(stat -c %a "$base") || return 1
  (( (8#$mode & 0022) == 0 )) || return 1
  [[ -d "$source/.git" || -f "$source/.git" ]] || return 1
  entries=$(find "$base" -mindepth 1 -maxdepth 1 -printf '%f\n') || return 1
  [[ "$entries" == source ]]
}
