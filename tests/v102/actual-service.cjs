const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { randomBytes, createHmac } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { PrismaClient } = require("@prisma/client");
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const base = "http://127.0.0.1:3000",
  root = process.cwd(),
  folder = "test-results/v102";
const database = new URL(process.env.DATABASE_URL);
assert.equal(process.env.LOCAL_TEST_MODE, "true");
assert.equal(process.env.CONSULTATIONS_ENABLED, "true");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
assert.equal(process.env.SITE_URL, base);
const prisma = new PrismaClient({ log: [] }),
  exec = promisify(execFile);
const data = path.join(root, ".local-postgres/data"),
  ctl = path.join(
    root,
    ".local-postgres/runtime/embedded_postgres/pginstall/bin/pg_ctl.exe",
  );
const run = randomBytes(6).toString("hex"),
  marker = "V102合成-" + run;
const phone =
  "1990000" + String(parseInt(run.slice(0, 6), 16) % 10000).padStart(4, "0");
const hash = (phone) =>
  createHmac("sha256", process.env.RATE_LIMIT_SECRET)
    .update(JSON.stringify([phone, "ENTERPRISE", "100—300万元"]))
    .digest("hex");
let browser,
  id,
  stopped = false,
  completed = false;
const evidence = {
  environment: { base, database: database.pathname.slice(1), localTest: true },
  testMarker: marker,
  checks: {},
};
async function cleanup(leadId, testMarker) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  assert.equal(lead.name, testMarker);
  assert.ok(testMarker.startsWith("V102合成-"));
  await prisma.$transaction(async (tx) => {
    await tx.consent.deleteMany({ where: { leadId } });
    await tx.auditLog.deleteMany({
      where: { resourceType: "lead", resourceId: leadId },
    });
    await tx.lead.delete({ where: { id: leadId } });
    await tx.submissionGuard.deleteMany({ where: { key: hash(lead.phone) } });
  });
}
async function fill(page, currentPhone = phone) {
  await page.locator('[name="name"]').fill(marker);
  await page.locator('[name="phone"]').fill(currentPhone);
  await page.locator('[name="customerType"]').selectOption("ENTERPRISE");
  await page.locator('[name="financingAmount"]').selectOption("100—300万元");
  await page.locator('[name="hasProperty"]').selectOption("yes");
  await page.locator('[name="hasCompany"]').selectOption("no");
  await page
    .locator('[name="remark"]')
    .fill("V1.0.2虚构验收数据，请勿联系；" + run);
  await page.locator('[name="consent"]').check();
}
async function restartDatabase() {
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
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  if (process.argv.includes("--cleanup")) {
    const previous = JSON.parse(
      fs.readFileSync(folder + "/result.json", "utf8"),
    );
    await cleanup(previous.leadId, previous.testMarker);
    previous.retainedForReview = false;
    previous.cleaned = true;
    fs.writeFileSync(
      folder + "/result.json",
      JSON.stringify(previous, null, 2),
    );
    console.log("Only the verified synthetic acceptance record was cleaned.");
    return;
  }
  const response = await fetch(base + "/contact/");
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("x-hushangyin-app"),
    "platform/" + require("../../package.json").version,
  );
  evidence.appVersion = response.headers.get("x-hushangyin-app");
  const redirect = await fetch("http://127.0.0.1:8080/contact/", {
    redirect: "manual",
  });
  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get("location"), base + "/contact/");
  evidence.checks.legacyRedirect = true;
  browser = await chromium.launch({
    executablePath:
      process.env.BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", () => errors.push("browser error"));
  await page.goto("http://127.0.0.1:8080/contact/");
  assert.equal(page.url(), base + "/contact/");
  assert.equal(
    await page.locator("#consult-form").getAttribute("data-submission"),
    "api",
  );
  assert.equal(await page.locator('script[src="/assets/site.js"]').count(), 0);
  assert.ok(
    !(await page.locator(".form-note").textContent()).includes("演示版本"),
  );
  evidence.contactUrl = page.url();
  await fill(page);
  const submitted = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/consultations/" &&
      r.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').click();
  const posted = await submitted;
  assert.equal(posted.status(), 201);
  const result = await posted.json();
  id = result.data.reference;
  evidence.leadId = id;
  evidence.post = {
    url: posted.url(),
    method: posted.request().method(),
    status: posted.status(),
  };
  await page
    .locator(".form-feedback.success")
    .filter({ hasText: "咨询需求已成功提交" })
    .waitFor();
  await page
    .locator("#consult-form")
    .screenshot({ path: folder + "/submission.png" });
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id },
    include: { consents: true },
  });
  assert.equal(lead.name, marker);
  assert.equal(lead.phone, phone);
  assert.equal(lead.customerType, "ENTERPRISE");
  assert.equal(lead.financingAmount, "100—300万元");
  assert.equal(lead.hasProperty, true);
  assert.equal(lead.hasCompany, false);
  assert.equal(lead.consents.length, 1);
  assert.equal(lead.consents[0].leadId, id);
  evidence.checks.databaseAndConsent = true;
  await fill(page);
  const duplicate = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/consultations/" &&
      r.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').click();
  assert.equal((await duplicate).status(), 409);
  await page
    .locator(".form-feedback")
    .filter({ hasText: "重复提交" })
    .waitFor();
  assert.equal(await page.locator(".form-feedback.success").count(), 0);
  evidence.checks.duplicateRejected = true;
  const credentials = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  await page.goto(base + "/admin/");
  await page.waitForURL(base + "/admin/login/");
  await page.locator('[name="email"]').fill(credentials.adminEmail);
  await page.locator('[name="password"]').fill(credentials.adminPassword);
  await page.locator("form button").click();
  await page.waitForURL(base + "/admin/dashboard/");
  await page.goto(base + "/admin/leads/");
  await page.locator(`a[href="/admin/leads/${id}/"]`).click();
  await page.waitForURL(base + `/admin/leads/${id}/`);
  evidence.adminDetailUrl = page.url();
  const detail = await page.locator(".lead-details").innerText();
  assert.ok(detail.includes("企业客户") && detail.includes("100—300万元"));
  const entries = await page
    .locator(".lead-details")
    .evaluate((dl) =>
      Object.fromEntries(
        [...dl.children].map((div) => [
          div.querySelector("dt").textContent,
          div.querySelector("dd").textContent,
        ]),
      ),
    );
  assert.equal(entries["是否有房产"], "是");
  assert.equal(entries["是否有企业"], "否");
  evidence.checks.adminReadCorrectFields = true;
  await page.locator('[name="status"]').selectOption("FOLLOWING");
  const updated = page.waitForResponse(
    (r) =>
      r.url() === base + `/api/admin/leads/${id}/` &&
      r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "保存状态" }).click();
  assert.equal((await updated).status(), 200);
  await page.getByRole("status").filter({ hasText: "状态已更新" }).waitFor();
  await page.reload();
  assert.equal(await page.locator('[name="status"]').inputValue(), "FOLLOWING");
  assert.equal(
    (await prisma.lead.findUniqueOrThrow({ where: { id } })).status,
    "FOLLOWING",
  );
  const audit = await prisma.auditLog.findFirst({
    where: { resourceType: "lead", resourceId: id, action: "STATUS_CHANGE" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(audit.metadata.status, "FOLLOWING");
  evidence.auditId = audit.id;
  evidence.statusAfterReload = "FOLLOWING";
  evidence.checks.auditAndPersistence = true;
  await page.locator("main").screenshot({ path: folder + "/admin-detail.png" });
  await page.getByRole("button", { name: "登出" }).click();
  await page.waitForURL(base + "/admin/login/");
  const anonymous = await browser.newContext();
  const publicPage = await anonymous.newPage();
  await publicPage.goto(base + `/admin/leads/${id}/`);
  await publicPage.waitForURL(base + "/admin/login/");
  assert.equal(
    (await anonymous.request.get(base + `/api/admin/leads/${id}/`)).status(),
    401,
  );
  await anonymous.close();
  evidence.checks.unauthorizedBlocked = true;
  if (process.argv.includes("--with-outage")) {
    await page.goto(base + "/contact/");
    const failurePhone =
      phone === "19900003002" ? "19900003003" : "19900003002";
    await fill(page, failurePhone);
    await prisma.$disconnect();
    await exec(ctl, ["stop", "-D", data, "-m", "fast", "-w"], {
      windowsHide: true,
      timeout: 20000,
    });
    stopped = true;
    try {
      const failed = page.waitForResponse(
        (r) =>
          r.url() === base + "/api/consultations/" &&
          r.request().method() === "POST",
      );
      await page.locator('button[type="submit"]').click();
      const failure = await failed;
      assert.equal(failure.status(), 503);
      const body = await failure.json();
      assert.equal(
        /Prisma|postgres|password|INSERT|SELECT/.test(JSON.stringify(body)),
        false,
      );
      await page
        .locator(".form-feedback")
        .filter({ hasText: "服务暂不可用" })
        .waitFor();
      assert.equal(await page.locator(".form-feedback.success").count(), 0);
      await page
        .locator("#consult-form")
        .screenshot({ path: folder + "/failure.png" });
      evidence.failure = {
        method: "POST",
        status: 503,
        successShown: false,
        realDatabaseStopped: true,
      };
    } finally {
      await restartDatabase();
    }
    assert.equal(
      await prisma.lead.count({ where: { name: marker, phone: failurePhone } }),
      0,
    );
    assert.equal(
      (await prisma.lead.findUniqueOrThrow({ where: { id } })).status,
      "FOLLOWING",
    );
    evidence.checks.databaseRecovery = true;
  }
  assert.deepEqual(errors, []);
  evidence.uncaughtBrowserErrors = 0;
  evidence.retainedForReview = process.argv.includes("--keep-synthetic");
  evidence.outcome = "已完成真实业务闭环";
  evidence.finishedAt = new Date().toISOString();
  fs.writeFileSync(folder + "/result.json", JSON.stringify(evidence, null, 2));
  completed = true;
  console.log(
    "PASS: actual 3000 browser POST 201 → PostgreSQL + consent → admin read → FOLLOWING refresh + audit → permissions and error feedback",
  );
}
main()
  .catch((error) => {
    console.error(
      "Actual-service verification failed:",
      error.name,
      error.message,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (stopped) await restartDatabase();
    if (browser) await browser.close();
    if (id && (!completed || !process.argv.includes("--keep-synthetic")))
      await cleanup(id, marker);
    await prisma.$disconnect();
  });
