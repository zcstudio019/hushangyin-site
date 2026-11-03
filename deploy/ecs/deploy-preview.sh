#!/usr/bin/env bash
# Existing Linux-built release only. Never uploads, changes DNS, enables public Nginx or resets a DB.
set -euo pipefail
[[ ${EUID} -eq 0 && ${APPROVE_HSY_PREVIEW_DEPLOY:-false} == true ]] || { echo 'Explicit preview deployment approval required.'; exit 1; }
release=$(realpath -- "${1:?Pass an existing /opt/hushangyin/releases/<version> directory}")
[[ "$release" == /opt/hushangyin/releases/* && -f "$release/.next/BUILD_ID" && -f /opt/hushangyin/.hsy-managed ]] || exit 1
shopt -s nullglob
for private in .env .env.* .local-postgres backups; do [[ "$private" == .env.example ]] && continue; [[ ! -e "$release/$private" ]] || { echo 'Release contains private local material; refused.'; exit 1; }; done
[[ -f /etc/hushangyin/app.env && -f /etc/hushangyin/backup.env ]] || { echo 'Private configuration missing.'; exit 1; }
if systemctl is-active --quiet hushangyin-worker.service; then echo "Stop only this project worker through an approved maintenance window before deployment."; exit 1; fi
cd -- "$release"
# Only flags/paths are checked; values never printed. Prod intake/analysis must remain closed.
runuser -u hushangyin -- /usr/bin/node --env-file=/etc/hushangyin/app.env -e '
const fs=require("fs");if(Number(process.versions.node.split(".")[0])<24)throw Error("Node24 required");
if(process.env.DATABASE_PROVIDER!=="sqlite"||!/^file:\/var\/lib\/hushangyin\//.test(process.env.DATABASE_URL||""))throw Error("Private SQLite required");
if(process.env.PRODUCTION_CONSULTATIONS_APPROVED==="true"||process.env.ANALYTICS_PRODUCTION_APPROVED==="true")throw Error("Public approval is outside this preview script");
if(process.env.PORT!=="3120")throw Error("Dedicated preview port 3120 required");
const {parseEnv}=require("node:util"); const backup=parseEnv(fs.readFileSync("/etc/hushangyin/backup.env","utf8")); if(backup.DATABASE_URL!==process.env.DATABASE_URL)throw Error("Backup and app must reference the same preview database");
const u=new URL(process.env.SITE_URL);if(process.env.LOCAL_TEST_MODE!=="true"||!["127.0.0.1","localhost"].includes(u.hostname))throw Error("Only private loopback preview allowed");
if(!fs.existsSync(process.env.DATABASE_URL.slice(5).split("?")[0]))throw Error("Import and verify preview database first");
if((process.env.SESSION_SECRET||"").length<32||(process.env.RATE_LIMIT_SECRET||"").length<32)throw Error("Secure configuration missing");'
if [[ -e /opt/hushangyin/current && ! -L /opt/hushangyin/current ]]; then echo 'Current is not a managed symlink.'; exit 1; fi
old=$(readlink -f /opt/hushangyin/current || true)
[[ -z "$old" || "$old" == /opt/hushangyin/releases/* ]] || exit 1
runuser -u hushangyin -- /usr/bin/node --env-file=/etc/hushangyin/backup.env scripts/sqlite-backup.mjs
runuser -u hushangyin -- /usr/bin/node --env-file=/etc/hushangyin/app.env scripts/db-tool.mjs deploy sqlite
if [[ -d .next/cache && ! -L .next/cache ]]; then rmdir .next/cache || { echo 'Build cache must be empty or already shared; no recursive removal performed.'; exit 1; }; fi
[[ -L .next/cache ]] || ln -s /var/cache/hushangyin .next/cache
ln -s "$release" /opt/hushangyin/current.next
mv -Tf /opt/hushangyin/current.next /opt/hushangyin/current
systemctl daemon-reload
systemctl restart hushangyin-web.service
healthy=false
for attempt in {1..20}; do if curl -fsS http://127.0.0.1:3120/api/health/ >/dev/null; then healthy=true; break; fi; sleep 1; done
if [[ "$healthy" != true ]]; then
  if [[ -n "$old" ]]; then ln -s "$old" /opt/hushangyin/current.rollback; mv -Tf /opt/hushangyin/current.rollback /opt/hushangyin/current; systemctl restart hushangyin-web.service; fi
  echo 'Preview health failed. Application symlink reverted when possible; database was NOT restored/reset.'; exit 1
fi
if [[ -n "$old" ]]; then ln -sfn "$old" /opt/hushangyin/previous; fi
echo 'Private preview ready on loopback 3120. No DNS, firewall, public Nginx or worker was changed. Manual acceptance still required.'
