#!/usr/bin/env bash
# Run from reviewed source; use only a verified, already extracted Linux artifact.
set -Eeuo pipefail
umask 077
die() { printf '%s\n' "$*" >&2; exit 1; }
base=/opt/hushangyin
etc=/etc/hushangyin
web=hushangyin-web.service
stage=preflight
switching=false
snapshot=''
failure() {
  local status=$?
  trap - EXIT
  if (( status != 0 )); then
    printf 'Production operation failed during %s (exit %s).\n' "$stage" "$status" >&2
    if [[ "$switching" == true ]]; then
      if systemctl stop "$web" &&
        install_env "$snapshot/app.env" app.env &&
        install_env "$snapshot/backup.env" backup.env &&
        activate "$old" && systemctl restart "$web" && health; then
        echo 'Previous application and environment restored. SQLite was not overwritten.' >&2
      else
        systemctl stop "$web" || true
        echo "Automatic rollback incomplete. Keep ingress private; recover using $snapshot." >&2
      fi
    fi
  fi
  exit "$status"
}
trap failure EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
[[ $EUID == 0 && ${APPROVE_HSY_PRODUCTION_DEPLOY:-false} == true ]] ||
  die 'Root and explicit production operation approval required.'
[[ $# == 2 && ( $1 == init-db || $1 == deploy ) ]] ||
  die 'Usage: deploy-production.sh {init-db|deploy} /opt/hushangyin/releases/<production-release>'
action=$1
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$here/runtime-common.sh"
hsy_runtime
[[ $(uname -m) == x86_64 && $(uname -s) == Linux ]] || die 'Linux x64 required.'
for dir in "$base" "$base/releases" "$etc"; do
  [[ -d "$dir" && ! -L "$dir" && $(stat -c %u "$dir") == 0 ]] ||
    die 'Invalid managed directory.'
  mode=$(stat -c %a "$dir")
  (( (8#$mode & 0022) == 0 )) || die 'Managed directory must be root controlled.'
done
[[ -f "$base/.hsy-managed" && ! -L "$base/.hsy-managed" ]] || die 'Managed installation required.'
exec 9>"$base/.production-deploy.lock"
flock -n 9 || die 'Another production operation is running.'
release=$(realpath -e -- "$2")
[[ "$(dirname -- "$release")" == "$base/releases" && -d "$release" && "$release" == "$2" ]] ||
  die 'Pass a canonical, direct child of the managed releases directory.'
[[ -z $(find "$release" ! -type l \( ! -uid 0 -o -perm /022 \) -print -quit) ]] ||
  die 'Release tree must be root owned and non-writable by group/others.'
cd -- "$release"
as_service() {
  runuser -u hushangyin -- env -i PATH="$PATH" HOME=/var/lib/hushangyin \
    NEXT_TELEMETRY_DISABLED=1 "$HSY_NODE_BIN" "$@"
}
stage='Linux artifact validation'
as_service --input-type=module - "$release" <<'JS'
import fs from "node:fs";
import assert from "node:assert/strict";
import { verifyTree } from "./deploy/ci/package-release.mjs";
const root = process.argv[2];
verifyTree(root, { allowManagedCache: true });
const m = JSON.parse(fs.readFileSync("RELEASE_MANIFEST.json", "utf8"));
assert.ok(m.purpose === "production" && m.siteUrl === "https://hushangyin.linhongtech.com" &&
  m.platform === "linux" && m.arch === "x64" && m.node === process.versions.node &&
  m.prismaBinaryTarget === "debian-openssl-3.0.x" &&
  m.includesDatabase === false && m.includesSecrets === false, "Verified production artifact required");
JS
stage='production environment validation'
app=$etc/production.app.env
backup=$etc/production.backup.env
as_service "$here/production-check.mjs" config "$app" "$backup"
stage='worker isolation'
[[ $(systemctl show -p ActiveState --value hushangyin-worker.service) =~ ^(inactive|failed)$ ]] ||
  die 'Stop the project worker before proceeding.'
case "$(systemctl is-enabled hushangyin-worker.service 2>/dev/null || true)" in
  disabled|masked) ;;
  *) die 'Worker must remain disabled or masked.' ;;
esac
schema_ready() {
  local schema=prisma/sqlite/schema.prisma cli=node_modules/prisma/build/index.js
  as_service --env-file="$app" scripts/db-tool.mjs validate sqlite &&
    as_service --env-file="$app" "$cli" migrate status --schema "$schema" &&
    as_service --env-file="$app" "$cli" migrate diff --from-schema-datasource "$schema" \
      --to-schema-datamodel "$schema" --exit-code >/dev/null
}
if [[ "$action" == init-db ]]; then
  [[ ${APPROVE_HSY_EMPTY_PRODUCTION_DB:-false} == true ]] || die 'Explicit empty database initialization approval required.'
  stage='new empty production SQLite initialization'
  as_service "$here/production-check.mjs" new-db
  as_service --env-file="$app" scripts/db-tool.mjs deploy sqlite
  as_service "$here/production-check.mjs" wal
  schema_ready || die 'Fresh database schema validation failed. Keep the files for diagnosis.'
  echo 'Empty production SQLite initialized. Create a production administrator before activation.'
  exit 0
fi
stage='schema validation and migration stop gate'
as_service "$here/production-check.mjs" database
schema_ready ||
  die 'Migration pending, history differs or schema drift detected. Activation stopped; rehearse separately on a restored copy.'
stage='current release and service ownership'
old=$(realpath -e -- "$base/current")
[[ -L "$base/current" && "$(dirname -- "$old")" == "$base/releases" && -f "$old/.next/BUILD_ID" ]] ||
  die 'A valid existing managed release is required for rollback.'
unit=$(systemctl show -p FragmentPath --value "$web")
[[ "$unit" == /etc/systemd/system/hushangyin-web.service &&
   -z $(systemctl show -p DropInPaths --value "$web") ]] &&
  cmp -s "$unit" "$release/deploy/systemd/hushangyin-web.service" ||
  die 'Unexpected web service configuration; review manually.'
systemctl is-active --quiet "$web"
group=$(systemctl show -p ControlGroup --value "$web")
listeners=$(ss -H -lntp '( sport = :3120 )')
[[ -n "$group" && -n "$listeners" ]] || die 'Existing managed listener required.'
while IFS= read -r listener; do
  [[ $(awk '{print $4}' <<< "$listener") == 127.0.0.1:3120 ]] || die 'Non-loopback listener on port 3120.'
  pids=$(grep -oE 'pid=[0-9]+' <<< "$listener" | cut -d= -f2 | sort -u)
  [[ -n "$pids" ]] || die 'Unknown listener owner.'
  while IFS= read -r pid; do
    awk -F: '{print $NF}' "/proc/$pid/cgroup" | grep -Fxq "$group" || die 'Unrelated port owner.'
  done <<< "$pids"
done <<< "$listeners"
for file in "$etc/app.env" "$etc/backup.env"; do
  [[ -f "$file" && ! -L "$file" && $(stat -c '%u:%a' "$file") == 0:640 ]] ||
    die 'Existing active environment must be a root-owned regular 0640 file.'
done
stage='consistent encrypted production backup'
[[ -d /var/backups/hushangyin/production &&
   $(realpath -e /var/backups/hushangyin/production) == /var/backups/hushangyin/production &&
   $(stat -c '%U:%a' /var/backups/hushangyin/production) == hushangyin:700 ]] ||
  die 'Create the dedicated private production backup directory first.'
as_service --env-file="$backup" scripts/sqlite-backup.mjs
stage='rollback snapshot and cache preparation'
snapshot=$(mktemp -d "$etc/rollback-production.XXXXXXXX")
install -m 0600 "$etc/app.env" "$snapshot/app.env"
install -m 0600 "$etc/backup.env" "$snapshot/backup.env"
printf '%s\n' "$old" > "$snapshot/release"
[[ -d /var/cache/hushangyin && ! -L /var/cache/hushangyin ]] || die 'Invalid cache directory.'
runuser -u hushangyin -- mkdir -p -m 0700 /var/cache/hushangyin/production
[[ $(realpath -e /var/cache/hushangyin/production) == /var/cache/hushangyin/production &&
   $(stat -c '%U:%a' /var/cache/hushangyin/production) == hushangyin:700 ]] ||
  die 'Invalid production cache directory.'
if [[ ! -L .next/cache ]]; then ln -s /var/cache/hushangyin/production .next/cache; fi

install_env() {
  local temp
  temp=$(mktemp "$etc/.production-env.XXXXXXXX") &&
    install -o root -g hushangyin -m 0640 "$1" "$temp" &&
    mv -Tf "$temp" "$etc/$2"
}
activate() {
  local temp
  temp=$(mktemp -d "$base/.production-switch.XXXXXXXX") &&
    ln -s "$1" "$temp/current" &&
    mv -Tf "$temp/current" "$base/current" &&
    rmdir "$temp"
}
health() {
  local body
  for ((attempt=0; attempt<30; attempt++)); do
    if body=$(curl -fsS --max-time 2 http://127.0.0.1:3120/api/health/ 2>/dev/null) &&
      [[ "$body" == '{"status":"ready"}' ]]; then return 0; fi
    sleep 1
  done
  return 1
}
stage='service cutover'
switching=true
systemctl stop "$web"
install_env "$app" app.env
install_env "$backup" backup.env
activate "$release"
systemctl restart "$web"
stage='production health and origin'
health
robots=$(curl -fsS --max-time 5 http://127.0.0.1:3120/robots.txt)
grep -Fxq 'Sitemap: https://hushangyin.linhongtech.com/sitemap.xml' <<< "$robots"
switching=false
printf 'Production ready on loopback. Rollback snapshot: %s\n' "$snapshot"
echo 'Nginx was not changed. Complete private HTTPS acceptance before opening ingress.'
