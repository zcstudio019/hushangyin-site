#!/usr/bin/env bash
set -euo pipefail

source_archive=$(realpath "${1:?Source archive required}")
output=$(realpath -m "${2:?Artifact directory required}")
[[ ${GITHUB_SHA:-} =~ ^[a-f0-9]{40}$ && ${GITHUB_RUN_ID:-} =~ ^[a-zA-Z0-9_-]+$ ]]
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
mkdir "$scratch/image" "$scratch/candidate"
cp "$here/../ecs/node24-checksums.txt" "$scratch/image/"
cp "$source_archive" "$scratch/source.tar"
image="hushangyin-preview-ci:$GITHUB_RUN_ID"
filename="hushangyin-preview-${GITHUB_SHA:0:12}-$GITHUB_RUN_ID.tar.gz"

echo 'Runner OpenSSL inventory (read only)'
openssl version
ldconfig -p | awk '$1 ~ /^libssl\.so\.(1\.1|3)$/'
find /usr/lib/x86_64-linux-gnu /lib/x86_64-linux-gnu -maxdepth 1 \
  -name 'libssl.so.*' -printf '%p -> %l\n'

docker build --platform linux/amd64 -f "$here/Dockerfile" -t "$image" "$scratch/image"
docker run --rm --platform linux/amd64 \
  --mount "type=bind,source=$scratch/source.tar,target=/source.tar,readonly" \
  --mount "type=bind,source=$scratch/candidate,target=/candidate" \
  --env GITHUB_SHA --env GITHUB_RUN_ID --env HSY_ARTIFACT_DIR=/candidate \
  --workdir /build "$image" bash -euc '
    tar -xf /source.tar
    openssl version
    ldconfig -p | awk '\''$1 ~ /^libssl\.so\./ { print; if ($1 == "libssl.so.3") found=1; else unexpected=1 } END { exit (!found || unexpected) }'\''
    test -z "$(find /usr/lib/x86_64-linux-gnu /lib/x86_64-linux-gnu -maxdepth 1 -name "libssl.so.*" ! -name "libssl.so.3" -print)"
    node deploy/ci/preflight.mjs
    node --test deploy/ci/package.test.mjs
    npm ci --include=dev --no-audit --no-fund
    DEBUG=prisma:get-platform node deploy/ci/prisma-engines.mjs prepare
    npm run build
    node deploy/ci/prisma-engines.mjs check
    node deploy/ci/package-release.mjs
  '

test -s "$scratch/candidate/$filename"
docker run --rm --platform linux/amd64 --network none \
  --mount "type=bind,source=$scratch/source.tar,target=/source.tar,readonly" \
  --mount "type=bind,source=$scratch/candidate,target=/candidate,readonly" \
  --env "HSY_PARENT_NETWORK=$(readlink /proc/self/ns/net)" \
  --env "HSY_CANDIDATE=$filename" --workdir /verify "$image" bash -euc '
    tar -xf /source.tar deploy/ci
    archive="/candidate/$HSY_CANDIDATE"
    node deploy/ci/smoke-release.mjs "$archive"
    node deploy/ci/prisma-readonly.mjs "$archive" "$HSY_PARENT_NETWORK"
  '

mkdir -p "$output"
test ! -e "$output/$filename"
test ! -e "$output/$filename.sha256"
cp "$scratch/candidate/$filename" "$output/$filename"
(
  cd "$output"
  sha256sum "$filename" > "$filename.sha256"
  sha256sum --check "$filename.sha256"
)
if [[ -n ${GITHUB_OUTPUT:-} ]]; then
  printf 'archive=%s\nchecksum=%s\nfilename=%s\n' \
    "$output/$filename" "$output/$filename.sha256" "$filename" >> "$GITHUB_OUTPUT"
fi
