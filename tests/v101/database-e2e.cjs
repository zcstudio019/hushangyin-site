const { PrismaClient } = require("@prisma/client");
const { hash } = require("@node-rs/argon2");
const { randomBytes, createHmac } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { setTimeout: pause } = require("node:timers/promises");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const connection = new URL(process.env.TEST_DATABASE_URL || "http://invalid");
assert.ok(
  ["127.0.0.1", "localhost"].includes(connection.hostname) &&
    connection.pathname.endsWith("_test"),
  "Dedicated local *_test database required",
);
const databaseUrl = process.env.TEST_DATABASE_URL;
const run = randomBytes(6).toString("hex"),
  password = randomBytes(24).toString("base64url"),
  secret = randomBytes(48).toString("hex");
const base = "http://127.0.0.1:3002";
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  SITE_URL: base,
  RATE_LIMIT_SECRET: secret,
  CONSULTATIONS_ENABLED: "true",
  NEXT_TELEMETRY_DISABLED: "1",
};
const prisma = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
const leadIds = [],
  actorIds = [],
  emails = [],
  phones = [],
  passed = [];
const key = (value) => createHmac("sha256", secret).update(value).digest("hex");
let server, browser;
function check(name) {
  passed.push(name);
  console.log("PASS: " + name);
}
async function request(
  route,
  { method = "GET", body, cookie, origin = base } = {},
) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  let json;
  try {
    json = await response.json();
  } catch {}
  return { response, json };
}
async function login(email, pass = password) {
  return request("/api/admin/login/", {
    method: "POST",
    body: { email, password: pass },
  });
}
async function start() {
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3002",
    ],
    { env, stdio: "ignore", windowsHide: true },
  );
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/admin/login/")).ok) return;
    } catch {}
    await pause(200);
  }
  throw Error("TEST_SERVER_UNAVAILABLE");
}
async function main() {
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { env, encoding: "utf8", windowsHide: true },
    );
    assert.equal(
      result.status,
      0,
      "Migration deploy failed; connection details suppressed",
    );
  }
  const history =
    await prisma.$queryRaw`SELECT migration_name, finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL`;
  assert.equal(history.length, 1);
  assert.ok(history[0].finished_at);
  check("migration deploy twice and migration history");
  const tables =
    await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
  assert.equal(tables.length, 12);
  const foreignKeys =
    await prisma.$queryRaw`SELECT conname FROM pg_constraint WHERE contype='f'`;
  assert.ok(foreignKeys.length >= 6);
  const indexes =
    await prisma.$queryRaw`SELECT indexname FROM pg_indexes WHERE schemaname='public'`;
  assert.ok(indexes.some((i) => i.indexname === "leads_status_createdAt_idx"));
  const permissions =
    await prisma.$queryRaw`SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`;
  assert.equal(permissions[0].rolsuper, false);
  assert.equal(permissions[0].rolcreatedb, false);
  check("tables, indexes, foreign keys and non-superuser read/write role");
  const adminEmail = `v101-admin-${run}@example.invalid`;
  emails.push(adminEmail);
  for (let i = 0; i < 2; i++) {
    const init = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/create-admin.ts"],
      {
        env: {
          ...env,
          ADMIN_EMAIL: adminEmail,
          ADMIN_NAME: "V101合成管理员",
          ADMIN_PASSWORD: password,
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(init.status, 0, "Administrator bootstrap failed");
  }
  const admin = await prisma.adminUser.findUniqueOrThrow({
    where: { email: adminEmail },
  });
  actorIds.push(admin.id);
  assert.match(admin.passwordHash, /^\$argon2id\$/);
  assert.equal(
    await prisma.adminUser.count({ where: { email: adminEmail } }),
    1,
  );
  for (let i = 0; i < 2; i++) {
    const email = `v101-agent${i}-${run}@example.invalid`;
    emails.push(email);
    const user = await prisma.adminUser.create({
      data: {
        email,
        name: "V101合成业务员",
        passwordHash: await hash(password),
        role: "FINANCING_ADVISOR",
      },
    });
    actorIds.push(user.id);
  }
  check("idempotent administrator initialization and Argon2id storage");
  await start();
  const phone =
    "1990000" +
    String(Number.parseInt(run.slice(0, 6), 16) % 10000).padStart(4, "0");
  phones.push(phone);
  const payload = {
    name: "V101合成咨询",
    phone,
    customerType: "ENTERPRISE",
    financingAmount: "50万元以内",
    hasProperty: true,
    hasCompany: true,
    remark: "V101虚构测试 " + run,
    sourcePage: "/contact/",
    consent: true,
  };
  const first = await request("/api/consultations/", {
    method: "POST",
    body: payload,
  });
  assert.equal(first.response.status, 201);
  leadIds.push(first.json.data.reference);
  const stored = await prisma.lead.findUniqueOrThrow({
    where: { id: leadIds[0] },
    include: { consents: true },
  });
  assert.equal(stored.phone, phone);
  assert.equal(stored.consents.length, 1);
  assert.ok(stored.consents[0].policyVersion);
  assert.equal(stored.remark, payload.remark);
  check("consultation API persists complete lead + consent atomically");
  for (const body of [
    { ...payload, name: "" },
    { ...payload, phone: "123" },
    { ...payload, consent: false },
    { ...payload, remark: "x".repeat(601) },
  ])
    assert.equal(
      (await request("/api/consultations/", { method: "POST", body })).response
        .status,
      400,
    );
  assert.equal(
    (
      await request("/api/consultations/", {
        method: "POST",
        body: { ...payload, remark: "x".repeat(10000) },
      })
    ).response.status,
    413,
  );
  assert.equal((await request("/api/consultations/")).response.status, 405);
  assert.equal(
    (
      await request("/api/consultations/", {
        method: "POST",
        body: payload,
        origin: "https://invalid.example",
      })
    ).response.status,
    403,
  );
  assert.equal(
    (await request("/api/consultations/", { method: "POST", body: payload }))
      .response.status,
    409,
  );
  assert.equal(await prisma.lead.count({ where: { id: { in: leadIds } } }), 1);
  check(
    "required fields, phone, consent, lengths, method, CSRF and duplicate rejection",
  );
  const secondPhone = phone === "19900000000" ? "19900000001" : "19900000000";
  phones.push(secondPhone);
  const concurrent = await Promise.all(
    [1, 2, 3].map(() =>
      request("/api/consultations/", {
        method: "POST",
        body: { ...payload, phone: secondPhone },
      }),
    ),
  );
  assert.equal(concurrent.filter((r) => r.response.status === 201).length, 1);
  for (const r of concurrent)
    if (r.response.status === 201) leadIds.push(r.json.data.reference);
  assert.equal(concurrent.filter((r) => r.response.status === 409).length, 2);
  check("concurrent duplicate submissions create exactly one lead");
  assert.equal((await request("/api/admin/leads/")).response.status, 401);
  assert.equal(
    (
      await request(`/api/admin/leads/${leadIds[0]}/`, {
        method: "PATCH",
        body: { status: "COMPLETED" },
      })
    ).response.status,
    401,
  );
  const logged = await login(adminEmail);
  assert.equal(logged.response.status, 200);
  const cookie = logged.response.headers.get("set-cookie").split(";")[0];
  assert.ok(logged.response.headers.get("set-cookie").includes("HttpOnly"));
  assert.ok(
    logged.response.headers
      .get("set-cookie")
      .toLowerCase()
      .includes("samesite=strict"),
  );
  const list = await request("/api/admin/leads/", { cookie });
  assert.equal(list.response.status, 200);
  assert.ok(
    list.json.data.items
      .find((item) => item.id === leadIds[0])
      .phone.includes("****"),
  );
  assert.equal(
    (await request(`/api/admin/leads/${leadIds[0]}/`, { cookie })).response
      .status,
    200,
  );
  assert.equal(
    (
      await request(`/api/admin/leads/${leadIds[0]}/`, {
        method: "PATCH",
        body: { status: "FOLLOWING" },
        cookie,
      })
    ).response.status,
    200,
  );
  assert.equal(
    (await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[0] } })).status,
    "FOLLOWING",
  );
  check("authenticated masked list, details and persistent status API");
  await prisma.lead.update({
    where: { id: leadIds[0] },
    data: { assignedTo: actorIds[1] },
  });
  const agentLogin = await login(emails[1]),
    otherLogin = await login(emails[2]);
  const agentCookie = agentLogin.response.headers
      .get("set-cookie")
      .split(";")[0],
    otherCookie = otherLogin.response.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await request(`/api/admin/leads/${leadIds[0]}/`, { cookie: agentCookie }))
      .response.status,
    200,
  );
  assert.equal(
    (await request(`/api/admin/leads/${leadIds[0]}/`, { cookie: otherCookie }))
      .response.status,
    404,
  );
  assert.equal(
    (
      await request(`/api/admin/leads/${leadIds[0]}/`, {
        cookie: otherCookie,
        method: "PATCH",
        body: { status: "INVALID" },
      })
    ).response.status,
    404,
  );
  check("AGENT row-level read/write isolation");
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto(base + "/contact/");
  const uiPhone = secondPhone === "19900000002" ? "19900000003" : "19900000002";
  phones.push(uiPhone);
  await page.locator('[name="name"]').fill("V101合成表单");
  await page.locator('[name="phone"]').fill(uiPhone);
  await page.locator('[name="customerType"]').selectOption("ENTERPRISE");
  await page.locator('[name="financingAmount"]').selectOption({ index: 1 });
  await page.locator('[name="consent"]').check();
  let uiRequests = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/consultations"))
      uiRequests++;
  });
  const submitted = page.waitForResponse(
    (r) =>
      r.url().includes("/api/consultations") && r.request().method() === "POST",
  );
  await page.evaluate(() => {
    const form = document.querySelector("#consult-form");
    form.requestSubmit();
    form.requestSubmit();
  });
  const uiResponse = await submitted;
  assert.equal(uiResponse.status(), 201);
  leadIds.push((await uiResponse.json()).data.reference);
  await page.locator(".form-feedback.success").waitFor();
  assert.equal(uiRequests, 1);
  assert.equal(
    await prisma.consent.count({ where: { leadId: leadIds[2] } }),
    1,
  );
  check(
    "browser consultation form succeeds and immediate repeat submit is suppressed",
  );
  await page.goto(base + "/admin/login/");
  await page.locator('[name="email"]').fill(adminEmail);
  await page.locator('[name="password"]').fill(password);
  await page.locator('button[type="submit"],form button').click();
  await page.waitForURL(base + "/admin/dashboard/");
  await page.goto(base + "/admin/leads/");
  await page.locator(`a[href="/admin/leads/${leadIds[0]}/"]`).click();
  await page.locator('select[name="status"]').selectOption("COMPLETED");
  await page.getByRole("button", { name: "保存状态" }).click();
  await page.getByRole("status").filter({ hasText: "状态已更新" }).waitFor();
  await page.reload();
  assert.equal(
    await page.locator('select[name="status"]').inputValue(),
    "COMPLETED",
  );
  assert.equal(
    (await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[0] } })).status,
    "COMPLETED",
  );
  check("browser login → list → detail → update → refresh persistence");
  const audits = await prisma.auditLog.findMany({
    where: { actorId: admin.id },
  });
  for (const action of [
    "ADMIN_BOOTSTRAP",
    "LOGIN",
    "LIST",
    "READ",
    "STATUS_CHANGE",
  ])
    assert.ok(audits.some((item) => item.action === action));
  assert.ok(
    !JSON.stringify(audits.map((item) => item.metadata)).includes(phone),
  );
  check("audit actions recorded without personal data metadata");
  await page.getByRole("button", { name: "登出" }).click();
  await page.waitForURL(base + "/admin/login/");
  assert.equal(
    (await request("/api/admin/logout/", { cookie, method: "POST" })).response
      .status,
    200,
  );
  assert.equal(
    (await request("/api/admin/leads/", { cookie })).response.status,
    401,
  );
  check("logout revokes database session and rejects replay");
  const blocked = `v101-blocked-${run}@example.invalid`;
  emails.push(blocked);
  for (let i = 0; i < 5; i++)
    assert.equal((await login(blocked, "incorrect")).response.status, 401);
  assert.equal((await login(blocked, "incorrect")).response.status, 429);
  check("invalid login errors and persistent account login rate limit");
  const before = performance.now();
  await request("/api/admin/leads/", { cookie: agentCookie });
  const elapsed = Math.round(performance.now() - before);
  assert.ok(elapsed < 2000);
  check("paginated list smoke performance <2s (small synthetic dataset only)");
  await browser.close();
  browser = null;
  server.kill();
  server = null;
  // Restart application, not database, to verify storage across application processes.
  await pause(600);
  await start();
  const persisted = await login(adminEmail);
  const persistedCookie = persisted.response.headers
    .get("set-cookie")
    .split(";")[0];
  assert.equal(
    (
      await request(`/api/admin/leads/${leadIds[0]}/`, {
        cookie: persistedCookie,
      })
    ).json.data.status,
    "COMPLETED",
  );
  check("status survives application process restart");
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(
    "test-results/v101-integration.json",
    JSON.stringify(
      {
        passed: true,
        checks: passed,
        testRun: run,
        listResponseMs: elapsed,
        syntheticLeads: leadIds.length,
      },
      null,
      2,
    ),
  );
}
main()
  .catch((error) => {
    console.error("Integration failed:", error.name, error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) server.kill();
    try {
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: actorIds } },
              { resourceType: "lead", resourceId: { in: leadIds } },
            ],
          },
        });
        await tx.consent.deleteMany({ where: { leadId: { in: leadIds } } });
        await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
        await tx.adminSession.deleteMany({
          where: { adminId: { in: actorIds } },
        });
        await tx.adminUser.deleteMany({ where: { id: { in: actorIds } } });
        await tx.submissionGuard.deleteMany({
          where: {
            key: {
              in: phones.map((phone) =>
                key(JSON.stringify([phone, "ENTERPRISE", "50万元以内"])),
              ),
            },
          },
        });
        await tx.rateLimitBucket.deleteMany({
          where: {
            key: {
              in: [
                "consult:" + key("shared"),
                "login-ip:" + key("shared"),
                ...emails.map((email) => "login-user:" + key(email)),
              ],
            },
          },
        });
      });
      console.log(
        "Exact test-created row IDs and HMAC keys cleaned; other data untouched.",
      );
    } finally {
      await prisma.$disconnect();
    }
  });
