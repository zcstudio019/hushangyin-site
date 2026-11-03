#!/usr/bin/env bash
# Local-only smoke tests: temporary directories, no server installation/service/database operations.
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
node24=${1:?Pass an already SHA256-verified Linux Node24 executable}
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
source "$root/deploy/ecs/runtime-common.sh"
run="$root/deploy/ecs/run-runtime.sh"
export HSY_RUNTIME_CONFIG="$work/runtime.env"
unset HSY_NODE_BIN
printf 'HSY_NODE_BIN=%s\n' "$node24" > "$HSY_RUNTIME_CONFIG"
[[ $(bash "$run" node -p 'process.versions.node.split(".")[0]') == 24 ]]
echo 'PASS configured real Node24'
bash "$run" npm --version
bash "$run" npx --version
echo 'PASS matching bundled npm and npx'
mkdir -p "$work/lifecycle" "$work/cache" "$work/old/bin"
printf '%s\n' '{"scripts":{"check":"node -e \"if(process.versions.node.split(\u0027.\u0027)[0]!==\u002724\u0027)process.exit(1)\""}}' > "$work/lifecycle/package.json"
npm_config_cache="$work/cache" bash "$run" npm --prefix "$work/lifecycle" run check
echo 'PASS npm lifecycle subprocess uses Node24'
[[ $(bash "$run" node -e 'console.log(require("child_process").execFileSync(process.execPath,["-p","process.versions.node.split(\".\")[0]"],{encoding:"utf8"}).trim())') == 24 ]]
echo 'PASS process.execPath children use Node24 (Prisma launcher pattern)'
printf '#!/bin/sh\nprintf "22\\n"\n' > "$work/old/bin/node"; chmod 0755 "$work/old/bin/node"
printf 'HSY_NODE_BIN=%s\n' "$work/old/bin/node" > "$HSY_RUNTIME_CONFIG"
if HSY_NODE_BIN="$work/old/bin/node" bash "$run" node --version > /dev/null 2>&1; then exit 1; fi
echo 'PASS Node22 rejected, no fallback'
printf 'HSY_NODE_BIN=%s\n' "$work/missing/node" > "$HSY_RUNTIME_CONFIG"
if HSY_NODE_BIN="$work/missing/node" bash "$run" npm --version > /dev/null 2>&1; then exit 1; fi
echo 'PASS missing runtime rejected, no system npm'
printf 'HSY_NODE_BIN=$(touch %s)\n' "$work/injected" > "$HSY_RUNTIME_CONFIG"
if bash "$run" node --version >/dev/null 2>&1; then exit 1; fi
[[ ! -e "$work/injected" ]]
echo 'PASS runtime file is parsed, never sourced'
printf 'HSY_NODE_BIN=%s\nHSY_NODE_BIN=%s\n' "$node24" "$node24" > "$HSY_RUNTIME_CONFIG"
if bash "$run" node --version >/dev/null 2>&1; then exit 1; fi
echo 'PASS duplicate configuration rejected'
mkdir -p "$work/adopt/source/.git"
chmod 0755 "$work/adopt"
hsy_source_only_adoption "$work/adopt" "$work/adopt/source"
echo 'PASS root-owned source-only adoption predicate'
chmod 0777 "$work/adopt"
if hsy_source_only_adoption "$work/adopt" "$work/adopt/source"; then exit 1; fi
chmod 0755 "$work/adopt"
touch "$work/adopt/.hidden"
if hsy_source_only_adoption "$work/adopt" "$work/adopt/source"; then exit 1; fi
rm "$work/adopt/.hidden"
mkdir "$work/adopt/releases"
if hsy_source_only_adoption "$work/adopt" "$work/adopt/source"; then exit 1; fi
rmdir "$work/adopt/releases"
if hsy_source_only_adoption "$work/adopt" "$work/elsewhere"; then exit 1; fi
mv "$work/adopt/source" "$work/real-source"; ln -s "$work/real-source" "$work/adopt/source"
if hsy_source_only_adoption "$work/adopt" "$work/adopt/source"; then exit 1; fi
echo 'PASS hidden/unrelated entries, mismatched checkout and source symlink rejected'
mkdir "$work/units"
cp "$root"/deploy/systemd/* "$work/units/"
chmod 0644 "$work"/units/*
systemd-analyze verify "$work"/units/*
echo 'PASS systemd unit static verification (not service startup)'
for script in install-node24.sh prepare-private-paths.sh deploy-preview.sh rollback.sh; do
  if env -u APPROVE_HSY_NODE24_INSTALL -u APPROVE_HSY_PRIVATE_SETUP -u APPROVE_HSY_PREVIEW_DEPLOY -u APPROVE_HSY_APP_ROLLBACK bash "$root/deploy/ecs/$script" > /dev/null 2>&1; then exit 1; fi
done
echo 'PASS all mutating entry points require explicit approval'
echo 'All local runtime/config tests passed. No ECS command executed.'

