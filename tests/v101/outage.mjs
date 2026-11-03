import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
const root = path.resolve("."),
  data = path.join(root, ".local-postgres/data"),
  ctl = path.join(
    root,
    ".local-postgres/runtime/embedded_postgres/pginstall/bin/pg_ctl.exe",
  );
assert.ok(data.startsWith(root + path.sep));
const url = new URL(process.env.TEST_DATABASE_URL);
assert.equal(url.hostname, "127.0.0.1");
assert.ok(url.pathname.endsWith("_test"));
const prisma = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL,
    log: [],
  }),
  base = "http://127.0.0.1:3003";
const exec = promisify(execFile);
let stopped = false;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3003",
  ],
  {
    env: {
      ...process.env,
      SITE_URL: base,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      CONSULTATIONS_ENABLED: "true",
      RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
    },
    windowsHide: true,
    stdio: "ignore",
  },
);
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + "/contact/")).ok) break;
    } catch {}
    await pause(200);
  }
  const before = await prisma.lead.count();
  await prisma.$disconnect();
  await exec(ctl, ["stop", "-D", data, "-m", "fast", "-w"], {
    windowsHide: true,
    timeout: 20000,
  });
  stopped = true;
  const response = await fetch(base + "/api/consultations/", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "V101合成断库测试",
      phone: "19900009999",
      customerType: "PERSONAL",
      financingAmount: "50万元以内",
      sourcePage: "/contact/",
      consent: true,
    }),
  });
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.equal(
    /postgres|prisma|password|SELECT|INSERT/i.test(JSON.stringify(payload)),
    false,
  );
  await exec(
    ctl,
    [
      "start",
      "-D",
      data,
      "-l",
      path.join(root, ".local-postgres/server.log"),
      "-w",
    ],
    { windowsHide: true, timeout: 20000 },
  );
  stopped = false;
  assert.equal(await prisma.lead.count(), before);
  await fs.writeFile(
    "test-results/v101-outage.json",
    JSON.stringify(
      {
        passed: true,
        actualClusterStopped: true,
        httpStatus: 503,
        noPartialBusinessRows: true,
        restarted: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: actual local PostgreSQL stop → API 503 without internals → restart → no partial lead",
  );
} catch {
  console.error(
    "Database outage integration check failed; no credential details logged.",
  );
  process.exitCode = 1;
} finally {
  if (stopped)
    await exec(
      ctl,
      [
        "start",
        "-D",
        data,
        "-l",
        path.join(root, ".local-postgres/server.log"),
        "-w",
      ],
      { windowsHide: true, timeout: 20000 },
    );
  server.kill();
  await prisma.$disconnect();
}
