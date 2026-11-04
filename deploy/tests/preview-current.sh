#!/usr/bin/env bash
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo 'Run this isolated test as root to exercise the deployment entry point.' >&2; exit 1; }
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
app="$scratch/app"
config="$scratch/config"
mkdir -p "$app/releases/v1/.next" "$app/releases/v2/.next" "$app/releases/unbuilt" "$config" "$scratch/bin" "$scratch/outside/.next"
touch "$app/.hsy-managed" "$app/releases/v1/.next/BUILD_ID" "$app/releases/v2/.next/BUILD_ID" "$scratch/outside/.next/BUILD_ID" "$config/app.env" "$config/backup.env"
# Exercise the real entry point with only its deployment paths relocated.
sed -e "s|/opt/hushangyin|$app|g" -e "s|/etc/hushangyin|$config|g" \
    -e "s|/var/cache/hushangyin|$scratch/cache|g" \
    "$here/../ecs/deploy-preview.sh" > "$scratch/deploy-preview.sh"
printf 'hsy_runtime() { :; }\n' > "$scratch/runtime-common.sh"
cat > "$scratch/bin/stub" <<'EOF'
#!/usr/bin/env bash
case ${0##*/} in
  runuser)
    case "$*" in
      *scripts/sqlite-backup.mjs*) echo backup >> "$TRACE"; exit "${BACKUP_STATUS:-0}" ;;
      *scripts/db-tool.mjs*) echo migration >> "$TRACE" ;;
    esac
    ;;
  systemctl)
    if [[ $1 == is-active ]]; then exit 1; fi
    echo "$1" >> "$TRACE"
    ;;
  curl) exit "${HEALTH_STATUS:-0}" ;;
  ss|sleep) ;;
esac
EOF
chmod +x "$scratch/bin/stub"
for command in runuser systemctl curl ss sleep; do
  ln -s stub "$scratch/bin/$command"
done
export PATH="$scratch/bin:$PATH" TRACE="$scratch/trace" APPROVE_HSY_PREVIEW_DEPLOY=true
run_preview() {
  : > "$TRACE"
  bash "$scratch/deploy-preview.sh" "$app/releases/$1" > "$scratch/log" 2>&1
}
expect_rejection() {
  if run_preview v2; then echo 'Expected deployment rejection' >&2; exit 1; fi
  grep -Fq "$1" "$scratch/log"
  [[ ! -s "$TRACE" ]]
}

# GNU readlink -f returns a path even when the last component is absent.
[[ $(readlink -f "$app/current") == "$app/current" ]]
run_preview v1
[[ $(readlink "$app/current") == "$app/releases/v1" && ! -e "$app/previous" && ! -L "$app/previous" ]]
[[ $(cat "$TRACE") == $'backup\nmigration\ndaemon-reload\nrestart' ]]
grep -Fq 'Private preview ready' "$scratch/log"
echo 'PASS first deployment starts without a previous release'

ln -sfn releases/v1 "$app/current"
run_preview v2
[[ $(readlink "$app/current") == "$app/releases/v2" && $(readlink "$app/previous") == "$app/releases/v1" ]]
if HEALTH_STATUS=1 run_preview v1; then echo 'Expected health check failure' >&2; exit 1; fi
[[ $(readlink "$app/current") == "$app/releases/v2" ]]
[[ $(cat "$TRACE") == $'backup\nmigration\ndaemon-reload\nrestart\nrestart' ]]
grep -Fq 'Preview health failed' "$scratch/log"
echo 'PASS repeated deployment records the old release and restores it on failed health check'

ln -sfn "$app/releases/missing" "$app/current"
expect_rejection 'broken or unresolvable symlink'
ln -sfn "$scratch/outside" "$app/current"
expect_rejection 'outside the managed releases directory'
ln -sfn "$app/releases/unbuilt" "$app/current"
expect_rejection 'does not point to a built release directory'
unlink "$app/current"
touch "$app/current"
expect_rejection 'exists and is not a symlink'
echo 'PASS broken, outside, unbuilt and non-symlink current paths are rejected before backup'

unlink "$app/current"
if BACKUP_STATUS=23 run_preview v1; then echo 'Expected backup failure' >&2; exit 1; fi
grep -Fq 'Preview deployment failed during SQLite backup (exit 23).' "$scratch/log"
[[ $(cat "$TRACE") == backup && ! -e "$app/current" && ! -L "$app/current" ]]
echo 'PASS backup failure reports stage and exit status before migration or activation'
