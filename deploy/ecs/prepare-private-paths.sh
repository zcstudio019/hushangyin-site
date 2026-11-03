#!/usr/bin/env bash
# Reviewed template, not executed by Codex. Does not start services, install Nginx or alter existing sites.
set -euo pipefail
[[ ${EUID} -eq 0 && ${APPROVE_HSY_PRIVATE_SETUP:-false} == true ]] || { echo 'Requires explicit private setup approval and root.'; exit 1; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
for dir in /opt/hushangyin /var/lib/hushangyin /var/backups/hushangyin /etc/hushangyin /var/cache/hushangyin; do
  if [[ -e "$dir" && ! -f "$dir/.hsy-managed" ]]; then echo "Unmanaged existing path: $dir. Stop without modifying it."; exit 1; fi
done
if id hushangyin >/dev/null 2>&1; then
  [[ $(getent passwd hushangyin | cut -d: -f6) == /var/lib/hushangyin ]] || { echo 'Existing user is not this dedicated service account; stop.'; exit 1; }
else useradd --system --home-dir /var/lib/hushangyin --shell /usr/sbin/nologin hushangyin; fi
for dir in /opt/hushangyin /var/lib/hushangyin /var/backups/hushangyin /etc/hushangyin /var/cache/hushangyin; do install -d -m 0750 -o root -g hushangyin "$dir"; : > "$dir/.hsy-managed"; done
for dir in /var/lib/hushangyin /var/backups/hushangyin /var/cache/hushangyin; do chown hushangyin:hushangyin "$dir"; chmod 0700 "$dir"; done
install -d -m 0750 -o root -g hushangyin /opt/hushangyin/releases
exclusive(){ if [[ -e "$2" ]]; then cmp -s "$1" "$2" || { echo "Existing file differs: $2; not overwritten."; exit 1; }; else install -m 0644 "$1" "$2"; fi; }
for unit in hushangyin-web.service hushangyin-worker.service hushangyin-backup.service hushangyin-backup.timer; do exclusive "$root/deploy/systemd/$unit" "/etc/systemd/system/$unit"; done
if [[ ! -e /etc/hushangyin/backup.key ]]; then (umask 077; set -o noclobber; openssl rand 32 > /etc/hushangyin/backup.key); chown hushangyin:hushangyin /etc/hushangyin/backup.key; chmod 0600 /etc/hushangyin/backup.key; fi
echo 'Private directories and dedicated unit files prepared. No service was started. Fill reviewed private env files; import an isolated preview database; then review deploy-preview.sh.'
