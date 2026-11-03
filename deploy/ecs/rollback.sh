#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID} -eq 0 && ${APPROVE_HSY_APP_ROLLBACK:-false} == true ]] || exit 1
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$here/runtime-common.sh"
hsy_runtime
if systemctl is-active --quiet hushangyin-worker.service; then echo "Pause only this project worker in an approved maintenance window before rollback."; exit 1; fi
target=$(realpath -- "${1:?Pass the reviewed previous release directory}")
[[ "$target" == /opt/hushangyin/releases/* && -f "$target/.next/BUILD_ID" && -f /opt/hushangyin/.hsy-managed ]] || exit 1
echo 'Only application code will roll back. Verify schema backward compatibility before continuing; no data is deleted/restored.'
ln -s "$target" /opt/hushangyin/current.rollback
mv -Tf /opt/hushangyin/current.rollback /opt/hushangyin/current
systemctl restart hushangyin-web.service
curl -fsS http://127.0.0.1:3120/api/health/ >/dev/null
echo 'Application rollback health check passed. Worker and database are unchanged.'
