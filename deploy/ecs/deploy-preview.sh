#!/usr/bin/env bash
# Existing Linux-built release only. Never uploads, changes DNS, enables public Nginx or resets a DB.
set -euo pipefail
[[ ${EUID} -eq 0 && ${APPROVE_HSY_PREVIEW_DEPLOY:-false} == true ]] || { echo 'Explicit preview deployment approval required.'; exit 1; }
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$here/runtime-common.sh"
hsy_runtime
release=$(realpath -- "${1:?Pass an existing /opt/hushangyin/releases/<version> directory}")
[[ "$release" == /opt/hushangyin/releases/* && -f "$release/.next/BUILD_ID" && -f /opt/hushangyin/.hsy-managed ]] || exit 1
shopt -s nullglob
for private in "$release"/.env "$release"/.env.* "$release"/.local-postgres "$release"/backups; do [[ "$private" == "$release/.env.example" ]] && continue; [[ ! -e "$private" && ! -L "$private" ]] || { echo 'Release contains private local material; refused.'; exit 1; }; done
[[ -f /etc/hushangyin/app.env && -f /etc/hushangyin/backup.env ]] || { echo 'Private configuration missing.'; exit 1; }
if systemctl is-active --quiet hushangyin-worker.service; then echo "Stop only this project worker through an approved maintenance window before deployment."; exit 1; fi
# Refuse a listener from any other service, even if it happens to expose /api/health/.
listeners=$(ss -H -lntp '( sport = :3120 )')
if [[ -n "$listeners" ]]; then
  group=$(systemctl show --property=ControlGroup --value hushangyin-web.service)
  [[ -n "$group" ]] && systemctl is-active --quiet hushangyin-web.service || { echo '3120 is already used outside the active Hushangyin service.'; exit 1; }
  pids=$(printf '%s\n' "$listeners" | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
  [[ -n "$pids" ]] || { echo 'Cannot identify port owner; refused.'; exit 1; }
  while IFS= read -r pid; do awk -F: '{print $NF}' "/proc/$pid/cgroup" | grep -Fxq "$group" || { echo 'Port 3120 is owned by another service; refused.'; exit 1; }; done <<< "$pids"
fi
cd -- "$release"
# Only flags/paths are checked; values never printed. Prod intake/analysis must remain closed.
runuser -u hushangyin -- /bin/bash "$release/deploy/ecs/run-runtime.sh" node --env-file=/etc/hushangyin/app.env -e '
const fs=require("fs"),path=require("path");if(Number(process.versions.node.split(".")[0])!==24)throw Error("Node24 required");
if(process.env.DATABASE_PROVIDER!=="sqlite"||!/^file:\/var\/lib\/hushangyin\//.test(process.env.DATABASE_URL||""))throw Error("Private SQLite required");
if(process.env.PRODUCTION_CONSULTATIONS_APPROVED==="true"||process.env.ANALYTICS_PRODUCTION_APPROVED==="true")throw Error("Public approval is outside this preview script");
if(process.env.PORT!=="3120")throw Error("Dedicated preview port 3120 required");
const {parseEnv}=require("node:util"); const backup=parseEnv(fs.readFileSync("/etc/hushangyin/backup.env","utf8")); if(backup.DATABASE_URL!==process.env.DATABASE_URL)throw Error("Backup and app must reference the same preview database");
const u=new URL(process.env.SITE_URL);if(process.env.LOCAL_TEST_MODE!=="true"||!["127.0.0.1","localhost"].includes(u.hostname))throw Error("Only private loopback preview allowed");
if(!fs.existsSync(process.env.DATABASE_URL.slice(5).split("?")[0]))throw Error("Import and verify preview database first");
for(const name of [".next/BUILD_ID","scripts/start-platform.mjs","deploy/ecs/run-runtime.sh","deploy/ecs/runtime-common.sh"])fs.accessSync(name,fs.constants.R_OK);
const databasePath=fs.realpathSync(process.env.DATABASE_URL.slice(5).split("?")[0]);
if(!databasePath.startsWith("/var/lib/hushangyin/"))throw Error("Database symlink escaped private directory");
fs.accessSync(databasePath,fs.constants.R_OK|fs.constants.W_OK);
fs.accessSync(path.dirname(databasePath),fs.constants.R_OK|fs.constants.W_OK|fs.constants.X_OK);
if((fs.statSync(databasePath).mode&0o077)!==0||fs.statSync(databasePath).uid!==process.getuid())throw Error("Database must be owned by service user with mode 0600");
for(const name of ["/etc/hushangyin/app.env","/etc/hushangyin/backup.env","/etc/hushangyin/runtime.env"])if((fs.statSync(name).mode&0o027)!==0)throw Error("Private environment file permissions too broad");
if((process.env.SESSION_SECRET||"").length<32||(process.env.RATE_LIMIT_SECRET||"").length<32)throw Error("Secure configuration missing");'
if [[ -e /opt/hushangyin/current && ! -L /opt/hushangyin/current ]]; then echo 'Current is not a managed symlink.'; exit 1; fi
old=$(readlink -f /opt/hushangyin/current || true)
[[ -z "$old" || "$old" == /opt/hushangyin/releases/* ]] || exit 1
runuser -u hushangyin -- /bin/bash "$release/deploy/ecs/run-runtime.sh" node --env-file=/etc/hushangyin/backup.env scripts/sqlite-backup.mjs
runuser -u hushangyin -- /bin/bash "$release/deploy/ecs/run-runtime.sh" node --env-file=/etc/hushangyin/app.env scripts/db-tool.mjs deploy sqlite
if [[ -d .next/cache && ! -L .next/cache ]]; then rmdir .next/cache || { echo 'Build cache must be empty or already shared; no recursive removal performed.'; exit 1; }; fi
[[ -L .next/cache ]] || ln -s /var/cache/hushangyin .next/cache
ln -s "$release" /opt/hushangyin/current.next
mv -Tf /opt/hushangyin/current.next /opt/hushangyin/current
systemctl daemon-reload
systemctl restart hushangyin-web.service
healthy=false
for attempt in {1..20}; do if curl -fsS http://127.0.0.1:3120/api/health/ >/dev/null; then healthy=true; break; fi; sleep 1; done
if [[ "$healthy" != true ]]; then
  if [[ -n "$old" ]]; then ln -s "$old" /opt/hushangyin/current.rollback; mv -Tf /opt/hushangyin/current.rollback /opt/hushangyin/current; systemctl restart hushangyin-web.service; else systemctl stop hushangyin-web.service; fi
  echo 'Preview health failed. Application symlink reverted when possible; database was NOT restored/reset.'; exit 1
fi
if [[ -n "$old" ]]; then ln -sfn "$old" /opt/hushangyin/previous; fi
echo 'Private preview ready on loopback 3120. No DNS, firewall, public Nginx or worker was changed. Manual acceptance still required.'
