#!/usr/bin/env bash
# Exercise the production orchestrator without touching real paths, processes or databases.
set -euo pipefail
[[ $EUID == 0 ]]
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
base=$scratch/app
etc=$scratch/etc
release=$base/releases/prod
old=$base/releases/preview
mkdir -p "$release/deploy/systemd" "$release/.next" "$old/.next" "$etc/systemd/system" \
  "$scratch/cache/production" "$scratch/backups/production" "$scratch/bin" "$scratch/proc/123"
touch "$base/.hsy-managed" "$release/.next/BUILD_ID" "$old/.next/BUILD_ID"
touch "$release/deploy/systemd/hushangyin-web.service" "$etc/systemd/system/hushangyin-web.service"
printf '0::/test.slice/web.service\n' > "$scratch/proc/123/cgroup"
ln -s "$old" "$base/current"
sed -e "s|/opt/hushangyin|$base|g" -e "s|/etc/hushangyin|$etc|g" \
  -e "s|/etc/systemd|$etc/systemd|g" -e "s|/proc/\$pid|$scratch/proc/\$pid|g" \
  -e "s|/var/cache/hushangyin|$scratch/cache|g" -e "s|/var/backups/hushangyin|$scratch/backups|g" \
  "$here/../ecs/deploy-production.sh" > "$scratch/deploy-production.sh"
printf 'hsy_runtime() { HSY_NODE_BIN=node; }\n' > "$scratch/runtime-common.sh"
cat > "$scratch/bin/stub" <<'SH'
#!/usr/bin/env bash
case ${0##*/} in
  stat)
    if [[ $2 == %U:%a ]]; then echo hushangyin:700; else exec /usr/bin/stat "$@"; fi ;;
  install)
    if [[ $1 == -o ]]; then shift 4; fi
    exec /usr/bin/install "$@" ;;
  runuser)
    case "$*" in
      *'migrate status'*) echo status >> "$TRACE"; exit "${STATUS_FAIL:-0}" ;;
      *'db-tool.mjs deploy'*) echo migrate >> "$TRACE" ;;
      *'sqlite-backup.mjs'*) echo backup >> "$TRACE" ;;
      *'new-db'*) echo new-db >> "$TRACE" ;;
    esac ;;
  systemctl)
    case "$1 $2" in
      'show -p')
        case $3 in
          ActiveState) echo inactive ;;
          FragmentPath) echo "$ETC/systemd/system/hushangyin-web.service" ;;
          ControlGroup) echo /test.slice/web.service ;;
        esac ;;
      'is-enabled hushangyin-worker.service') echo disabled ;;
      'is-active --quiet') ;;
      *)
        echo "$1" >> "$TRACE"
        if [[ $1 == restart && ${RESTART_FAIL:-0} == 1 && $(readlink "$BASE/current") == "$RELEASE" ]]; then exit 1; fi ;;
    esac ;;
  ss) echo 'LISTEN 0 511 127.0.0.1:3120 0.0.0.0:* users:(("node",pid=123,fd=1))' ;;
  curl)
    if [[ $* == *robots.txt ]]; then
      if [[ ${ORIGIN_FAIL:-0} == 1 ]]; then echo preview; else echo 'Sitemap: https://hushangyin.linhongtech.com/sitemap.xml'; fi
    else printf '{"status":"ready"}'; fi ;;
  sleep) ;;
esac
SH
chmod +x "$scratch/bin/stub"
for command in stat install runuser systemctl ss curl sleep; do ln -s stub "$scratch/bin/$command"; done
export PATH="$scratch/bin:$PATH" TRACE="$scratch/trace" ETC="$etc" BASE="$base" RELEASE="$release"
export APPROVE_HSY_PRODUCTION_DEPLOY=true
for file in app.env backup.env; do
  printf 'preview\n' > "$etc/$file"
  printf 'production\n' > "$etc/production.$file"
  chmod 0640 "$etc/$file" "$etc/production.$file"
done
run() {
  : > "$TRACE"
  bash "$scratch/deploy-production.sh" "$1" "$release" > "$scratch/log" 2>&1
}
preview_unchanged() {
  [[ $(readlink "$base/current") == "$old" &&
    $(cat "$etc/app.env") == preview && $(cat "$etc/backup.env") == preview ]]
}
if run init-db; then exit 1; fi
[[ ! -s "$TRACE" ]]
APPROVE_HSY_EMPTY_PRODUCTION_DB=true run init-db
[[ $(cat "$TRACE") == $'new-db\nmigrate\nstatus' ]]
preview_unchanged
echo 'PASS empty database initialization needs separate approval and leaves preview active'
if STATUS_FAIL=1 run deploy; then exit 1; fi
[[ $(cat "$TRACE") == status ]]
preview_unchanged
echo 'PASS migration gate stops before backup or activation'
for failure in RESTART_FAIL ORIGIN_FAIL; do
  if env "$failure=1" bash "$scratch/deploy-production.sh" deploy "$release" > "$scratch/log" 2>&1; then exit 1; fi
  grep -Fq 'Previous application and environment restored' "$scratch/log"
  preview_unchanged
done
echo 'PASS restart and origin failures roll back link and both environments'
run deploy
[[ $(cat "$TRACE") == $'status\nbackup\nstop\nrestart' ]]
[[ $(readlink "$base/current") == "$release" &&
  $(cat "$etc/app.env") == production && $(cat "$etc/backup.env") == production ]]
echo 'PASS verified production activation backs up before changing the running service'
