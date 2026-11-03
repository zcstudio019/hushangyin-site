#!/usr/bin/env bash
# Read-only metadata. Do NOT print environment, process arguments, private keys, crontab commands or full nginx configs.
set -uo pipefail
export LC_ALL=C
section(){ printf '\n## %s\n' "$1"; }
section 'Host and current load (one snapshot is NOT a capacity approval)'
date -Is; uname -srm; nproc; uptime
free -m; df -hT / /opt /var 2>/dev/null
command -v vmstat >/dev/null && vmstat 1 5
ps -eo pid,comm,pcpu,pmem,rss --sort=-rss | head -n 16
section 'Node/npm/OpenSSL/SQLite tools'
for tool in node npm openssl sqlite3; do command -v "$tool" || true; done
# Global version is intentionally read-only; it is never used to deploy this application.
/usr/bin/node --version 2>/dev/null || true
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
if [[ -f "$here/run-runtime.sh" ]]; then
  bash "$here/run-runtime.sh" node --version || true
  bash "$here/run-runtime.sh" npm --version || true
fi
openssl version 2>/dev/null || true
section 'Listening ports (no process arguments)'
ss -lntup 2>/dev/null || true
section 'Services and timers (no EnvironmentFile contents)'
systemctl list-units --type=service --state=running --no-pager 2>/dev/null || true
systemctl list-timers --all --no-pager 2>/dev/null || true
section 'Nginx installed sites and target-domain conflicts'
nginx -v 2>&1 || true
find /etc/nginx/sites-enabled /etc/nginx/conf.d -maxdepth 1 -type f -o -type l 2>/dev/null || true
grep -RInE '^[[:space:]]*(server_name|listen|ssl_certificate)[[:space:]]' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true
printf 'Target-domain occurrence (review wildcard server_name separately):\n'
grep -RIlF 'hushangyin.linhongtech.com' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null || true
section 'Docker resource metadata (never inspect environment)'
if command -v docker >/dev/null; then docker ps --format '{{.Names}} | {{.Image}} | {{.Ports}}' 2>/dev/null || true; docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' 2>/dev/null || true; fi
section 'Existing scheduled-job/backup paths (names only)'
find /etc/cron.d /var/backups -maxdepth 1 -mindepth 1 -printf '%f\n' 2>/dev/null || true
section 'Public certificate metadata only'
if command -v openssl >/dev/null; then while IFS= read -r cert; do printf 'Certificate: %s\n' "$cert"; openssl x509 -in "$cert" -noout -dates -subject -ext subjectAltName 2>/dev/null || true; done < <(find -L /etc/letsencrypt/live -maxdepth 2 -name fullchain.pem 2>/dev/null); fi
section 'Candidate private directories and filesystem'
for dir in /opt/hushangyin /var/lib/hushangyin /var/backups/hushangyin /etc/hushangyin; do if [[ -e "$dir" ]]; then stat -c '%n %U:%G %a' "$dir"; df -hT "$dir"; else printf '%s does not exist; not created\n' "$dir"; fi; done
id hushangyin 2>/dev/null || true
section 'DNS and local firewall (not the ECS security group)'
getent ahostsv4 hushangyin.linhongtech.com 2>/dev/null || true
command -v ufw >/dev/null && ufw status 2>/dev/null || true
printf '\nUNVERIFIED: ECS security-group rules, ICP/business qualifications, peak business load, certificate ownership/renewal, restore drill. Review in Alibaba console; no cloud API was called.\n'
printf 'Do not conclude 2vCPU/4GiB is sufficient from this snapshot. Collect peak-period load and run isolated pre-release load tests. No service/config/DNS was modified.\n'
