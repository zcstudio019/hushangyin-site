FROM ubuntu:22.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl openssl libssl3 xz-utils util-linux \
    && rm -rf /var/lib/apt/lists/*

COPY node24-checksums.txt /tmp/node24-checksums.txt
RUN set -eu; \
    archive=node-v24.22.2-linux-x64.tar.xz; \
    cd /tmp; \
    curl --fail --silent --show-error --proto '=https' --retry 3 \
      -O "https://nodejs.org/dist/v24.22.2/$archive"; \
    awk -v archive="$archive" '$2 == archive { print; found++ } END { if (found != 1) exit 1 }' \
      node24-checksums.txt > node24.sha256; \
    sha256sum --strict --check node24.sha256; \
    mkdir /opt/node24; \
    tar -xJf "$archive" -C /opt/node24 --strip-components=1; \
    rm "$archive" node24.sha256 node24-checksums.txt

ENV PATH="/opt/node24/bin:${PATH}" \
    CI=true NEXT_TELEMETRY_DISABLED=1 SITE_URL=http://127.0.0.1:3120 \
    PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x DATABASE_PROVIDER=sqlite \
    AI_GENERATION_ENABLED=false AI_EXTERNAL_TRANSMISSION_APPROVED=false GEO_WORKER_ENABLED=false \
    CONSULTATIONS_ENABLED=false PRODUCTION_CONSULTATIONS_APPROVED=false \
    ANALYTICS_ENABLED=false ANALYTICS_PRODUCTION_APPROVED=false MYSQL_PRODUCTION_APPROVED=false LOCAL_TEST_MODE=false
