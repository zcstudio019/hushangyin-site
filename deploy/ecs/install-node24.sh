#!/usr/bin/env bash
# Optional USER-EXECUTED installer. No apt, global symlinks, npm globals, profile or service edits.
set -euo pipefail
[[ ${EUID} -eq 0 && ${APPROVE_HSY_NODE24_INSTALL:-false} == true ]] || { echo 'Root and explicit Node24 installation approval required.'; exit 1; }
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
version=v24.22.2
case $(uname -m) in x86_64) arch=x64;; aarch64|arm64) arch=arm64;; *) echo 'Unsupported CPU architecture.'; exit 1;; esac
prefix=${HSY_NODE_INSTALL_DIR:-/opt/node24}
[[ "$prefix" =~ ^/opt/node24([a-zA-Z0-9._-]*)$ && ! -L "$prefix" ]] || { echo 'Only a dedicated /opt/node24* directory is allowed.'; exit 1; }
archive="node-$version-linux-$arch.tar.xz"
expected=$(awk -v name="$archive" '$2==name {print $1}' "$here/node24-checksums.txt")
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || exit 1
if [[ -e "$prefix" ]]; then
  [[ -d "$prefix" && -f "$prefix/.hsy-node24-managed" && $(cat "$prefix/.hsy-node24-managed") == "$archive $expected" && $("$prefix/bin/node" --version) == "$version" ]] || { echo 'Existing Node directory is not this verified installation; refusing overwrite.'; exit 1; }
  echo 'Matching managed Node24 already exists. No change made.'; exit 0
fi
command -v curl >/dev/null; command -v sha256sum >/dev/null; command -v tar >/dev/null
umask 022
work=$(mktemp -d /opt/.hsy-node24-install.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
url="https://nodejs.org/dist/$version"
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 "$url/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
official=$(awk -v name="$archive" '$2==name {print $1}' "$work/SHASUMS256.txt")
[[ "$official" == "$expected" ]] || { echo 'Official checksum differs from reviewed pin; stop for review.'; exit 1; }
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 "$url/$archive" -o "$work/$archive"
(cd "$work"; printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --strict -)
tar -xJf "$work/$archive" -C "$work" --no-same-owner
extracted="$work/node-$version-linux-$arch"
[[ $("$extracted/bin/node" --version) == "$version" ]] || exit 1
"$extracted/bin/node" "$extracted/lib/node_modules/npm/bin/npm-cli.js" --version
printf '%s %s\n' "$archive" "$expected" > "$extracted/.hsy-node24-managed"
chown -R root:root "$extracted"
chmod -R go-w "$extracted"
# -T and no-clobber: never place this tree inside an existing target or replace one.
mv -Tn -- "$extracted" "$prefix"
[[ ! -e "$extracted" ]] || { echo 'Destination appeared concurrently; refused.'; exit 1; }
echo "Verified independent Node installed at $prefix. System Node/npm and services unchanged."
