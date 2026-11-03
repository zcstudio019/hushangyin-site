#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
for file in deploy/ecs/*.sh; do bash -n "$file"; done
printf 'All deployment shell syntax checks passed. No deployment executed.\n'
command -v systemd-analyze || true
command -v nginx || true
