// Actual isolated Next process, deliberately unusable SQLite path. No customer records.
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = "http://127.0.0.1:3107";
assert.equal(process.env.DATABASE_PROVIDER, "sqlite");
assert.equal(process.env.LOCAL_TEST_MODE, "true");
const invalid = path.resolve(
  ".local-postgres/v16/absent-parent-unavailable/database.sqlite",
);
assert.equal(fs.existsSync(path.dirname(invalid)), false);
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3107",
  ],
  {
    env: {
      ...process.env,
      DATABASE_URL: "file:" + invalid.replaceAll("\\", "/"),
      SITE_URL: base,
      AI_API_KEY: "",
      CONSULTATIONS_ENABLED: "true",
    },
    stdio: "ignore",
    windowsHide: true,
  },
);
(async () => {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(base + "/api/health/");
      assert.equal(response.status, 503);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  assert.equal(ready, true);
  const response = await fetch(base + "/api/consultations/", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "隔离故障测试非客户",
      phone: "13800000000",
      customerType: "PERSONAL",
      financingAmount: "50万元以内",
      sourcePage: "/contact/",
      consent: true,
    }),
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  assert.equal(JSON.stringify(body).includes("database.sqlite"), false);
  assert.equal(fs.existsSync(invalid), false);
  const evidence = {
    actualNextProcess: true,
    provider: "sqlite",
    healthStatus: 503,
    consultationStatus: 503,
    noFalseSuccess: true,
    noDatabaseDetails: true,
    noFileCreated: true,
  };
  fs.mkdirSync("test-results/v16", { recursive: true });
  fs.writeFileSync(
    "test-results/v16/unavailable.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
})()
  .catch(() => {
    console.error("SQLite故障关闭测试未通过；未输出请求或数据库详情。");
    process.exitCode = 1;
  })
  .finally(() => child.kill());
