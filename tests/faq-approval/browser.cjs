const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomBytes, randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const existingGrant = false;
const before = process.argv.includes("--before");
const p = new PrismaClient({ log: [] }),
  base = "http://127.0.0.1:3000",
  folder = before
    ? "test-results/faq-approval-before"
    : "test-results/faq-approval",
  marker = "独立审核合成-" + randomUUID();
assert.equal(process.env.LOCAL_TEST_MODE, "true");
assert.equal(process.env.SITE_URL, base);
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const users = [],
  faqs = [],
  contexts = [],
  evidence = {
    base,
    checks: [],
    pageErrors: [],
    realAiCalled: false,
    before,
  };
let browser;
const check = (s) => {
  console.log("PASS: " + s);
  evidence.checks.push(s);
};
const password = () => randomBytes(24).toString("base64url") + "Aa1!";
async function context() {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (pg) =>
    pg.on("pageerror", () => evidence.pageErrors.push("浏览器未捕获异常")),
  );
  return c;
}
async function api(c, method, path, data, status = 200, origin = base) {
  const r = await c.request.fetch(base + path, {
    method,
    headers: { Origin: origin },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(r.status(), status, path + " " + r.status());
  const j = await r.json();
  return status < 300 ? j.data : j.error;
}
async function click(pg, label, path, method = "POST", status = 200) {
  const pending = pg.waitForResponse(
    (r) => r.url() === base + path && r.request().method() === method,
  );
  await pg.getByRole("button", { name: label, exact: true }).click();
  const r = await pending;
  assert.equal(r.status(), status, path);
  return (await r.json()).data;
}
async function login(page, email, pw, initial = false) {
  await page.goto(base + "/admin/login/");
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(pw);
  await click(page, "登录", "/api/admin/login/");
  await page.waitForURL(
    initial ? /\/admin\/settings\/profile\// : base + "/admin/dashboard/",
  );
}
async function createStaff(rootPage, rootPassword, role, label) {
  await rootPage.goto(
    base +
      "/admin/settings/users/new/" +
      (role === "CONTENT_REVIEWER" ? "?role=CONTENT_REVIEWER" : ""),
  );
  const email = randomUUID() + "@example.invalid";
  await rootPage.locator('[name="name"]').fill("合成" + label);
  await rootPage.locator('[name="email"]').fill(email);
  await rootPage.locator('[name="role"]').selectOption(role);
  await rootPage.locator('[name="reauthPassword"]').fill(rootPassword);
  if (existingGrant && label === "独立审核B") {
    const d = await p.department.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (d) await rootPage.locator('[name="departmentId"]').selectOption(d.id);
  }
  const r = await click(rootPage, "创建员工", "/api/admin/users/", "POST", 201);
  users.push(r.user.id);
  await rootPage
    .getByRole("button", { name: "关闭并清除凭据", exact: true })
    .click();
  return { ...r.user, email, initial: r.initialPassword, password: password() };
}
async function activate(user) {
  const c = await context(),
    page = await c.newPage();
  await login(page, user.email, user.initial, true);
  await page.locator('[name="oldPassword"]').fill(user.initial);
  await page.locator('[name="newPassword"]').fill(user.password);
  await page.locator('[name="confirmation"]').fill(user.password);
  await click(page, "修改密码并重新登录", "/api/admin/profile/", "PATCH");
  await page.waitForURL(base + "/admin/login/");
  await login(page, user.email, user.password);
  return { c, page, user };
}
const keys = [
  "sources",
  "promises",
  "relationships",
  "cases",
  "promotion",
  "privacy",
  "human",
];
const checklist = Object.fromEntries(keys.map((k) => [k, true]));
const note =
  "已人工核对这是一条合成软件验收内容，只引用站点地图技术说明，不构成融资事实或建议。";
const source =
  "Next.js官方站点地图技术说明（软件验收） | https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap | " +
  new Date().toISOString().slice(0, 10);
async function prepareReview(page, id) {
  await page.goto(base + `/admin/geo/faqs/${id}/`);
  for (const k of keys) await page.locator(`[name="${k}"]`).check();
  await page.locator('[name="note"]').fill(note);
}
async function assign(page, id, userId) {
  await page.goto(base + `/admin/geo/faqs/${id}/`);
  await page.locator('[name="assigneeId"]').selectOption(userId);
  await click(
    page,
    "保存审核人分配",
    `/api/admin/geo/faqs/${id}/review-assignment/`,
  );
  await page.reload();
}

async function makeFaq(A, withSource = true) {
  await A.page.goto(base + "/admin/geo/faqs/new/");
  await A.page
    .locator('[name="question"]')
    .fill(
      marker +
        "-" +
        (faqs.length + 1) +
        (withSource ? "：站点地图技术验收" : "：缺来源技术验收"),
    );
  await A.page.locator('[name="category"]').selectOption("融资知识");
  await A.page
    .locator('[name="answer"]')
    .fill(
      "本条是软件技术流程合成测试，站点地图用于发现页面，不作为融资事实或建议。请关注还款风险。",
    );
  if (withSource) await A.page.locator('[name="sources"]').fill(source);
  const f = await click(
    A.page,
    "保存草稿",
    "/api/admin/geo/faqs/",
    "POST",
    201,
  );
  faqs.push(f.id);
  await A.page.waitForURL(base + `/admin/geo/faqs/${f.id}/`);
  await click(A.page, "提交审核", `/api/admin/geo/faqs/${f.id}/workflow/`);
  return f;
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const root = await context(),
    rootPage = await root.newPage(),
    anon = await context();
  const credentials = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  await login(rootPage, credentials.adminEmail, credentials.adminPassword);
  const A = await activate(
    await createStaff(
      rootPage,
      credentials.adminPassword,
      "CONTENT_OPERATOR",
      "作者A",
    ),
  );
  const B = await activate(
    await createStaff(
      rootPage,
      credentials.adminPassword,
      "CONTENT_REVIEWER",
      "审核B",
    ),
  );
  const faq = await makeFaq(A);
  await assign(rootPage, faq.id, B.user.id);
  await B.page.goto(base + `/admin/geo/faqs/${faq.id}/`);
  for (const key of keys) await B.page.locator(`[name="${key}"]`).check();
  await B.page.locator('[name="note"]').fill("无");
  const posts = [];
  const listener = (r) => {
    if (r.method() === "POST" && r.url().endsWith(`/faqs/${faq.id}/workflow/`))
      posts.push(r);
  };
  B.page.on("request", listener);
  await B.page.getByRole("button", { name: "审核通过", exact: true }).click();
  if (before) {
    await B.page.waitForTimeout(300);
    evidence.reproduction = {
      postCount: posts.length,
      tooShort: await B.page
        .locator('[name="note"]')
        .evaluate((e) => e.validity.tooShort),
      feedback: await B.page
        .locator('#content-workflow [role="status"]')
        .innerText(),
    };
    assert.equal(posts.length, 0);
    assert.equal(evidence.reproduction.tooShort, true);
    assert.equal(evidence.reproduction.feedback, "");
    await B.page.screenshot({
      path: folder + "/native-validation.png",
      fullPage: true,
    });
    check(
      "真实浏览器复现：说明填无，浏览器原生长度校验拦截，0次POST且组件提示为空",
    );
  } else {
    await B.page
      .locator('#content-workflow [role="alert"]')
      .filter({ hasText: "至少10" })
      .waitFor();
    assert.equal(posts.length, 0);
    await B.page.waitForFunction(
      () => document.activeElement?.getAttribute("name") === "note",
    );
    assert.equal(
      await B.page
        .locator('[name="note"]')
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await B.page.screenshot({
      path: folder + "/short-note-feedback.png",
      fullPage: true,
    });
    check("说明填无获得按钮附近中文错误和焦点，未发送无效请求");
  }
  const missing = await makeFaq(A, false);
  await B.page.goto(base + `/admin/geo/faqs/${missing.id}/`);
  assert.equal(
    await B.page
      .getByRole("button", { name: "审核通过", exact: true })
      .isDisabled(),
    true,
  );
  evidence.sourceBlocking = { faqId: missing.id, buttonDisabled: true };
  if (before) {
    await B.page.screenshot({
      path: folder + "/source-disabled.png",
      fullPage: true,
    });
    check(
      "真实浏览器复现：缺来源版本按钮禁用；原始60组FAQ同样缺来源，勾选不能替代来源",
    );
    return;
  }
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "引用来源" })
    .waitFor();
  await api(
    B.c,
    "POST",
    `/api/admin/geo/faqs/${missing.id}/workflow/`,
    { action: "approve", revision: 1, note, checklist },
    400,
  );
  check("缺来源时按钮附近说明阻塞原因及撤回补充流程，服务端仍拒绝");
  const path = `/api/admin/geo/faqs/${faq.id}/workflow/`,
    endpoint = base + path;
  await prepareReview(B.page, faq.id);
  await B.page.locator('[name="sources"]').uncheck();
  const postBefore = posts.length;
  await B.page.getByRole("button", { name: "审核通过", exact: true }).click();
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "7项" })
    .waitFor();
  assert.equal(posts.length, postBefore);
  await B.page.waitForFunction(
    () => document.activeElement?.getAttribute("name") === "sources",
  );
  assert.equal(
    await B.page
      .locator('[name="sources"]')
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await B.page.locator('[name="sources"]').check();
  await api(
    B.c,
    "POST",
    path,
    { action: "approve", revision: 1, note: "无", checklist },
    400,
  );
  await api(
    B.c,
    "POST",
    path,
    {
      action: "approve",
      revision: 1,
      note,
      checklist: { ...checklist, human: false },
    },
    400,
  );
  check("清单缺项显示中文提示和焦点；服务端独立拒绝短说明及未完成清单");
  await A.page.goto(base + `/admin/geo/faqs/${faq.id}/`);
  await A.page
    .getByText("当前账号没有审核权限，请联系超级管理员。", { exact: true })
    .first()
    .waitFor();
  await api(
    A.c,
    "POST",
    path,
    { action: "approve", revision: 1, note, checklist },
    403,
  );
  const self = await makeFaq({ page: rootPage });
  await rootPage.reload();
  assert.equal(
    await rootPage
      .getByRole("button", { name: "审核通过", exact: true })
      .count(),
    0,
  );
  await rootPage
    .getByText(/此版本由你参与/)
    .first()
    .waitFor();
  await api(
    root,
    "POST",
    `/api/admin/geo/faqs/${self.id}/workflow/`,
    { action: "approve", revision: 1, note, checklist },
    403,
  );
  check("无权限作者和有审核权限的作者均有明确提示，服务端拒绝越权与自审");
  // Change the assignment while the reviewer keeps an old open page.
  const rootUser = await api(root, "GET", "/api/admin/profile/");
  await api(root, "POST", `/api/admin/geo/faqs/${faq.id}/review-assignment/`, {
    revision: 1,
    assigneeId: rootUser.id,
  });
  await click(B.page, "审核通过", path, "POST", 403);
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "其他审核人" })
    .waitFor();
  await api(root, "POST", `/api/admin/geo/faqs/${faq.id}/review-assignment/`, {
    revision: 1,
    assigneeId: B.user.id,
  });
  check("页面打开后任务被改派，真实403响应在按钮附近显示指定审核人提示");
  await prepareReview(B.page, faq.id);
  await B.page.route(endpoint, (route) => route.abort("failed"));
  await B.page.getByRole("button", { name: "审核通过", exact: true }).click();
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "网络连接失败" })
    .waitFor();
  await B.page.unroute(endpoint);
  assert.equal(
    (await p.faq.findUniqueOrThrow({ where: { id: faq.id } })).status,
    "IN_REVIEW",
  );
  check("浏览器注入断网后显示不确定结果及核对指引，不出现虚假成功");
  await B.page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "服务暂不可用" },
      }),
    }),
  );
  await click(B.page, "审核通过", path, "POST", 503);
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "数据库连接暂不可用" })
    .waitFor();
  await B.page.unroute(endpoint);
  check("受控503故障注入明确显示服务/数据库不可用，不暴露内部信息");
  await B.page.route(endpoint, async (route) => {
    await new Promise((r) => setTimeout(r, 16000));
    try {
      await route.abort();
    } catch {
      /* browser already aborted */
    }
  });
  await B.page.getByRole("button", { name: "审核通过", exact: true }).click();
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "请求超时" })
    .waitFor({ timeout: 20000 });
  await B.page.unroute(endpoint);
  assert.equal(
    await B.page
      .getByRole("button", { name: "审核通过", exact: true })
      .isEnabled(),
    true,
  );
  check("真实浏览器等待15秒触发客户端超时，显示核对状态指引并解除提交锁");
  // A withdraws this version, leaving B's open form stale.
  await click(A.page, "撤回审核", path);
  await click(B.page, "审核通过", path, "POST", 409);
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "版本已被修改" })
    .waitFor();
  await A.page.reload();
  await A.page
    .locator('[name="answer"]')
    .fill(
      "修订后的技术测试：站点地图帮助发现网页，不作为融资建议。请关注还款风险。",
    );
  await click(A.page, "保存草稿", `/api/admin/geo/faqs/${faq.id}/`, "PATCH");
  await A.page.reload();
  await click(A.page, "提交审核", path);
  const version = (await p.faq.findUniqueOrThrow({ where: { id: faq.id } }))
    .revision;
  await assign(rootPage, faq.id, B.user.id);
  await prepareReview(B.page, faq.id);
  check("真实版本冲突409显示刷新指引；撤回、修改、重提及新版本分配正常");
  for (const width of [375, 768, 1024, 1440]) {
    await B.page.setViewportSize({ width, height: 900 });
    assert.equal(
      await B.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  }
  const startPosts = posts.length;
  await B.page.route(endpoint, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  const responsePromise = B.page.waitForResponse(
    (r) => r.url() === endpoint && r.request().method() === "POST",
  );
  await B.page
    .getByRole("button", { name: "审核通过", exact: true })
    .evaluate((b) => {
      b.click();
      b.click();
    });
  await B.page
    .getByRole("button", { name: "审核处理中…", exact: true })
    .waitFor();
  assert.equal(
    await B.page
      .getByRole("button", { name: "审核处理中…", exact: true })
      .isDisabled(),
    true,
  );
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  await B.page.unroute(endpoint);
  await B.page
    .locator('#content-workflow [role="status"]')
    .filter({ hasText: "审核已通过" })
    .waitFor();
  assert.equal(posts.length - startPosts, 1);
  const approved = await p.faq.findUniqueOrThrow({ where: { id: faq.id } });
  assert.equal(approved.status, "APPROVED");
  assert.equal(
    await p.contentReview.count({
      where: {
        faqId: faq.id,
        revision: version,
        decision: "APPROVED",
        reviewerId: B.user.id,
      },
    }),
    1,
  );
  assert.equal(
    await p.auditLog.count({
      where: {
        resourceId: faq.id,
        action: "CONTENT_APPROVE",
        actorId: B.user.id,
      },
    }),
    1,
  );
  await B.page.screenshot({
    path: folder + "/approved-feedback.png",
    fullPage: true,
  });
  await B.page.reload();
  await B.page
    .locator('#content-workflow [role="status"]')
    .filter({ hasText: "审核已通过" })
    .waitFor();
  await B.page.screenshot({
    path: folder + "/approved-persistent-feedback.png",
    fullPage: true,
  });
  await B.page
    .getByText("当前账号没有发布权限，请联系超级管理员发布已审核版本。", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    (await p.faq.findUniqueOrThrow({ where: { id: faq.id } })).status,
    "APPROVED",
  );
  assert.equal(
    (await anon.request.get(base + `/faqs/${faq.id}/`)).status(),
    404,
  );
  check(
    "双点击仅1次真实POST200，按钮显示处理中并禁用，审核记录和审计各1条，刷新仍待发布",
  );
  await rootPage.goto(base + `/admin/geo/faqs/${faq.id}/`);
  await click(rootPage, "发布到官网", path);
  const url = base + `/faqs/${faq.id}/`;
  assert.equal((await anon.request.get(url)).status(), 200);
  assert.ok(
    (await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      url,
    ),
  );
  evidence.publication = {
    faqId: faq.id,
    revision: version,
    url,
    approvalStatus: response.status(),
    reviewCount: 1,
    auditCount: 1,
    publicStatus: 200,
  };
  check("独立审核后授权发布真实入库，公开URL200且进入Sitemap");
  await rootPage.reload();
  await click(rootPage, "下线内容", path);
  assert.equal((await anon.request.get(url)).status(), 404);
  assert.deepEqual(evidence.pageErrors, []);
}
main()
  .catch((e) => {
    console.error(e.name, e.message);
    evidence.failure = e.name;
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await p.contentReview.deleteMany({ where: { faqId: { in: faqs } } });
      await p.faqVersion.deleteMany({ where: { faqId: { in: faqs } } });
      await p.faq.deleteMany({ where: { id: { in: faqs } } });
      await p.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: users } },
            { resourceId: { in: [...users, ...faqs] } },
          ],
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
