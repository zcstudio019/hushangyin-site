const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { randomUUID, randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = "http://127.0.0.1:3000",
  p = new PrismaClient({ log: [] }),
  folder = "test-results/ai-config",
  users = [],
  contexts = [];
let browser;
const evidence = {
  base,
  checks: [],
  realModelCalled: false,
  realGenerationVerified: false,
  pageErrors: [],
};
const pass = (s) => {
  evidence.checks.push(s);
  console.log("PASS: " + s);
};
async function ctx() {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (page) =>
    page.on("pageerror", () => evidence.pageErrors.push("浏览器未捕获异常")),
  );
  return c;
}
async function api(c, method, path, data, status = 200, origin = base) {
  const r = await c.request.fetch(base + path, {
    method,
    headers: { Origin: origin },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(r.status(), status, path);
  const j = await r.json();
  return status < 300 ? j.data : j.error;
}
(async () => {
  fs.mkdirSync(folder, { recursive: true });
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const root = await ctx(),
    anon = await ctx(),
    op = await ctx(),
    page = await root.newPage();
  const privateConfig = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  await page.goto(base + "/admin/login/");
  await page.locator('[name="email"]').fill(privateConfig.adminEmail);
  await page.locator('[name="password"]').fill(privateConfig.adminPassword);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(base + "/admin/dashboard/");
  await page.goto(base + "/admin/geo/generation/");
  const panel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "模型连接状态", exact: true }),
  });
  await panel.getByText("密钥：尚未配置 API 密钥", { exact: true }).waitFor();
  assert.ok((await panel.innerText()).includes("gpt-6-sol"));
  assert.ok(
    (await panel.innerText()).includes(
      "https://maimai.it.com/v1/chat/completions",
    ),
  );
  const status = await api(
    root,
    "GET",
    "/api/admin/geo/generation/connection/",
  );
  assert.equal(status.keyConfigured, false);
  assert.equal(status.model, "gpt-6-sol");
  assert.equal("apiKey" in status, false);
  pass("实际后台显示指定网关和模型、缺少密钥；返回白名单配置，不返回Key");
  await api(
    anon,
    "GET",
    "/api/admin/geo/generation/connection/",
    undefined,
    401,
  );
  await api(
    anon,
    "POST",
    "/api/admin/geo/generation/connection/",
    { confirmedCost: true },
    401,
  );
  await api(
    root,
    "POST",
    "/api/admin/geo/generation/connection/",
    { confirmedCost: false },
    400,
  );
  await api(
    root,
    "POST",
    "/api/admin/geo/generation/connection/",
    { confirmedCost: true },
    403,
    "https://invalid.example",
  );
  pass("连接测试执行服务端登录、CSRF和费用确认校验");
  await panel.getByRole("checkbox").check();
  const reply = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/admin/geo/generation/connection/" &&
      r.request().method() === "POST",
  );
  await panel
    .getByRole("button", { name: "测试模型连接", exact: true })
    .click();
  const r = await reply;
  assert.equal(r.status(), 200);
  const data = (await r.json()).data;
  assert.equal(data.result.connected, false);
  assert.equal(data.result.code, "KEY_MISSING");
  await panel.getByRole("checkbox").waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".geo-check input")?.checked,
  );
  assert.equal(await panel.getByRole("checkbox").isChecked(), false);
  await panel.getByText(/最近测试：.*尚未配置 API 密钥/).waitFor();
  await page.reload();
  const after = await api(root, "GET", "/api/admin/geo/generation/connection/");
  assert.equal(after.latest.result.code, "KEY_MISSING");
  pass(
    "真实浏览器点击返回KEY_MISSING而非成功，最近结果真实审计持久化；没有模型调用",
  );
  const u = await api(
    root,
    "POST",
    "/api/admin/users/",
    {
      name: "模型配置虚构运营",
      email: randomUUID() + "@example.invalid",
      role: "CONTENT_OPERATOR",
      departmentId: null,
      isActive: true,
      reauthPassword: privateConfig.adminPassword,
    },
    201,
  );
  users.push(u.user.id);
  await api(op, "POST", "/api/admin/login/", {
    email: u.user.email,
    password: u.initialPassword,
  });
  const pw = randomBytes(20).toString("hex") + "Aa1!";
  await api(op, "PATCH", "/api/admin/profile/", {
    oldPassword: u.initialPassword,
    newPassword: pw,
    confirmation: pw,
  });
  await api(op, "POST", "/api/admin/login/", {
    email: u.user.email,
    password: pw,
  });
  await api(op, "GET", "/api/admin/geo/generation/connection/");
  await api(
    op,
    "POST",
    "/api/admin/geo/generation/connection/",
    { confirmedCost: true },
    403,
  );
  await api(op, "GET", "/api/admin/leads/", undefined, 403);
  pass("内容运营可看非敏感状态但不能测试或读取客户线索，管理测试权未扩散");
  const opPage = await op.newPage();
  await opPage.goto(base + "/admin/geo/generation/");
  assert.equal(
    await opPage
      .getByRole("button", { name: "测试模型连接", exact: true })
      .count(),
    0,
  );
  await opPage
    .getByText("仅具有生成管理权限的人员可以测试连接，请联系超级管理员。", {
      exact: true,
    })
    .waitFor();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  }
  await page.screenshot({
    path: folder + "/missing-key-status.png",
    fullPage: true,
  });
  assert.deepEqual(evidence.pageErrors, []);
  pass("真实后台四视口无溢出，控制台未捕获异常为零；不伪造AI连接或文章生成");
  evidence.outcome = "PASS";
})()
  .catch((e) => {
    console.error(e.name, e.message);
    evidence.outcome = "FAIL";
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await p.auditLog.deleteMany({
        where: {
          OR: [{ actorId: { in: users } }, { resourceId: { in: users } }],
        },
      });
      await p.adminSession.deleteMany({ where: { adminId: { in: users } } });
      await p.adminUser.deleteMany({ where: { id: { in: users } } });
      evidence.syntheticCleaned = true;
    } catch {
      evidence.syntheticCleaned = false;
      process.exitCode = 1;
    }
    for (const c of contexts) await c.close();
    await browser?.close();
    await p.$disconnect();
    fs.writeFileSync(
      folder + "/result.json",
      JSON.stringify(evidence, null, 2),
    );
  });
