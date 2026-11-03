#!/usr/bin/env bash
# Explicit private setup only. No service start, global Node edit, Nginx or database modification.
set -euo pipefail
[[ ${EUID} -eq 0 && ${APPROVE_HSY_PRIVATE_SETUP:-false} == true ]] || { echo 'Requires explicit private setup approval and root.'; exit 1; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
source "$root/deploy/ecs/runtime-common.sh"
hsy_runtime
adopt=false
for dir in /opt/hushangyin /var/lib/hushangyin /var/backups/hushangyin /etc/hushangyin /var/cache/hushangyin; do
  [[ ! -L "$dir" ]] || { echo "Symlink at managed directory rejected: $dir"; exit 1; }
  if [[ -e "$dir" && ! -f "$dir/.hsy-managed" ]]; then
    if [[ "$dir" == /opt/hushangyin && ${APPROVE_HSY_SOURCE_ONLY_ADOPTION:-false} == true ]] && hsy_source_only_adoption "$dir" "$root"; then adopt=true
    else echo "Unmanaged existing path: $dir. Only explicit source-only adoption is supported; nothing has been changed."; exit 1; fi
  fi
  [[ ! -L "$dir/.hsy-managed" ]] || { echo 'Invalid managed marker.'; exit 1; }
done
# All known conflicts are checked before creating users/directories or markers.
for unit in hushangyin-web.service hushangyin-worker.service hushangyin-backup.service hushangyin-backup.timer; do
  destination="/etc/systemd/system/$unit"
  if [[ -e "$destination" || -L "$destination" ]]; then
    [[ ! -L "$destination" ]] && cmp -s "$root/deploy/systemd/$unit" "$destination" || { echo "Existing unit differs: $destination. Review and back up this project old unit separately; not overwritten."; exit 1; }
  fi
done
if [[ -e /etc/hushangyin/runtime.env ]]; then
  [[ ! -L /etc/hushangyin/runtime.env ]] && grep -Fxq "HSY_NODE_BIN=$HSY_NODE_BIN" /etc/hushangyin/runtime.env || { echo 'Existing runtime configuration differs; not overwritten.'; exit 1; }
fi
if [[ -e /etc/hushangyin/backup.key || -L /etc/hushangyin/backup.key ]]; then
  [[ -f /etc/hushangyin/backup.key && ! -L /etc/hushangyin/backup.key && $(stat -c %s /etc/hushangyin/backup.key) == 32 ]] || { echo 'Existing backup key invalid; not replaced.'; exit 1; }
fi
if id hushangyin >/dev/null 2>&1; then
  [[ $(getent passwd hushangyin | cut -d: -f6) == /var/lib/hushangyin && $(id -u hushangyin) != 0 && $(getent passwd hushangyin | cut -d: -f7) == /usr/sbin/nologin ]] || { echo 'Existing user is not this dedicated service account; stop.'; exit 1; }
  [[ $(getent group hushangyin | cut -d: -f3) == "$(id -g hushangyin)" && $(id -g hushangyin) != 0 ]] || { echo 'Dedicated primary group mismatch; no existing account modified.'; exit 1; }
else
  if ! getent group hushangyin >/dev/null; then groupadd --system hushangyin; fi
  [[ $(getent group hushangyin | cut -d: -f3) != 0 ]] || exit 1
  useradd --system --gid hushangyin --home-dir /var/lib/hushangyin --shell /usr/sbin/nologin hushangyin
fi
# Never recursively touch source, existing databases or their ownership.
if [[ "$adopt" == true ]]; then hsy_source_only_adoption /opt/hushangyin "$root" || { echo 'Directory changed after preflight; stop.'; exit 1; }; fi
for dir in /opt/hushangyin /var/lib/hushangyin /var/backups/hushangyin /etc/hushangyin /var/cache/hushangyin; do
  install -d -m 0750 -o root -g hushangyin "$dir"
  if [[ ! -e "$dir/.hsy-managed" ]]; then (umask 022; set -o noclobber; printf 'hushangyin private deployment v1\n' > "$dir/.hsy-managed"); fi
done
for dir in /var/lib/hushangyin /var/backups/hushangyin /var/cache/hushangyin; do chown hushangyin:hushangyin "$dir"; chmod 0700 "$dir"; done
install -d -m 0750 -o root -g hushangyin /opt/hushangyin/releases
if [[ ! -e /etc/hushangyin/runtime.env ]]; then
  (umask 027; set -o noclobber; printf 'HSY_NODE_BIN=%s\n' "$HSY_NODE_BIN" > /etc/hushangyin/runtime.env)
  chown root:hushangyin /etc/hushangyin/runtime.env; chmod 0640 /etc/hushangyin/runtime.env
fi
for unit in hushangyin-web.service hushangyin-worker.service hushangyin-backup.service hushangyin-backup.timer; do
  destination="/etc/systemd/system/$unit"
  [[ -e "$destination" ]] || install -m 0644 "$root/deploy/systemd/$unit" "$destination"
done
if [[ ! -e /etc/hushangyin/backup.key ]]; then
  (umask 077; set -o noclobber; openssl rand 32 > /etc/hushangyin/backup.key)
  chown hushangyin:hushangyin /etc/hushangyin/backup.key; chmod 0600 /etc/hushangyin/backup.key
fi
runuser -u hushangyin -- /bin/bash "$root/deploy/ecs/run-runtime.sh" node --version
echo 'Private paths prepared; source unchanged. No service started. current is created only after a built release and verified private database are ready.'
