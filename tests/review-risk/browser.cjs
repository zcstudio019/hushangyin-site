const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomBytes, randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const existingGrant = false;

const p = new PrismaClient({ log: [] }),
  base = "http://127.0.0.1:3000",
  folder = "test-results/review-risk",
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
const catalogs = [];
async function makeFaq(A, title, answer) {
  await A.page.goto(base + "/admin/geo/faqs/new/");
  await A.page
    .locator('[name="question"]')
    .fill(title + "（合成验收" + marker + "）");
  await A.page.locator('[name="category"]').selectOption("融资知识");
  await A.page.locator('[name="answer"]').fill(answer);
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
async function review(page, f, level) {
  await page.goto(base + `/admin/geo/faqs/${f.id}/`);
  assert.equal(await page.locator('[name="riskLevel"]').inputValue(), level);
  await page.locator('[name="riskConfirmed"]').check();
  await page
    .locator('[name="note"]')
    .fill(
      "已逐条阅读全文，根据通用金融知识与适用范围作专业判断，不包含审批承诺及客户资料。",
    );
  if (level === "HIGH")
    for (const key of keys) await page.locator(`[name="${key}"]`).check();
}
async function publish(rootPage, anon, f) {
  const path = `/api/admin/geo/faqs/${f.id}/workflow/`;
  await rootPage.goto(base + `/admin/geo/faqs/${f.id}/`);
  await click(rootPage, "发布到官网", path);
  const url = base + `/faqs/${f.id}/`;
  assert.equal((await anon.request.get(url)).status(), 200);
  const publicPage = await anon.newPage();
  const rendered = await publicPage.goto(url);
  assert.equal(rendered.status(), 200);
  assert.ok(
    (await publicPage.locator("main").innerText()).includes(f.question),
  );
  await publicPage.screenshot({
    path: folder + `/public-${f.id}.png`,
    fullPage: true,
  });
  await publicPage.close();
  const text = await (await anon.request.get(url)).text();
  assert.equal(text.includes("internal:"), false);
  assert.ok(
    (await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      url,
    ),
  );
  return url;
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
  const c = JSON.parse(fs.readFileSync(".local-postgres/private.json", "utf8"));
  await login(rootPage, c.adminEmail, c.adminPassword);
  const A = await activate(
    await createStaff(
      rootPage,
      c.adminPassword,
      "CONTENT_OPERATOR",
      "风险作者A",
    ),
  );
  const B = await activate(
    await createStaff(
      rootPage,
      c.adminPassword,
      "CONTENT_REVIEWER",
      "风险审核B",
    ),
  );
  const a = await makeFaq(
    A,
    "什么是银行流水？",
    "银行流水是银行账户一定时期内资金收付的记录，用于了解交易与资金变化。本条仅用于本地虚构验收。",
  );
  const b = await makeFaq(
    A,
    "企业申请经营贷通常需要哪些资料？",
    "一般可先整理主体证照、经营信息及资金需求说明。实际材料范围因业务而异，本条不作审批承诺，仅用于本地验收。",
  );
  const high = await makeFaq(
    A,
    "某银行2026年最新经营贷利率是多少？",
    "目前没有可核验的依据，不提供具体数值或承诺。本条仅验证缺证据应阻止审核，不能作为金融建议。",
  );
  // Use the actual bulk assignment interface for all three versions.
  await rootPage.goto(base + "/admin/geo/reviews/");
  const batch = rootPage.locator("details").filter({
    has: rootPage.locator("summary").filter({ hasText: "批量分配与逐条核验" }),
  });
  await batch.locator("summary").first().click();
  const loaded = rootPage.waitForResponse(
    (r) =>
      r.url() === base + "/api/admin/geo/reviews/batch/" &&
      r.request().method() === "GET",
  );
  await batch
    .getByRole("button", { name: "加载 / 刷新待审核FAQ", exact: true })
    .click();
  await loaded;
  for (const f of [a, b, high]) {
    const row = batch.locator("section.admin-panel").filter({
      has: rootPage.getByRole("heading", { name: f.question, exact: true }),
    });
    await row.getByLabel("仅选择此条用于分配").check();
  }
  await batch.getByLabel("本批共同合格的独立审核人").selectOption(B.user.id);
  const assigned = await click(
    rootPage,
    "分配所选FAQ",
    "/api/admin/geo/reviews/batch/",
  );
  assert.equal(assigned.succeeded, 3);
  for (const f of [a, b, high])
    assert.equal(
      (await p.faq.findUniqueOrThrow({ where: { id: f.id } })).reviewAssigneeId,
      B.user.id,
    );
  check("实际浏览器批量分配三条固定版本，逐条资格及审计生效，未改原FAQ");
  await review(B.page, a, "LOW");
  assert.equal(await B.page.locator('[name="sources"]').count(), 0);
  await B.page.screenshot({
    path: folder + "/low-risk-review.png",
    fullPage: true,
  });
  const ap = `/api/admin/geo/faqs/${a.id}/workflow/`;
  await B.page.locator('[name="note"]').fill("无");
  await B.page.getByRole("button", { name: "审核通过", exact: true }).click();
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "至少10" })
    .waitFor();
  await B.page.locator('[name="note"]').fill(note);
  await B.page.locator('[name="riskConfirmed"]').uncheck();
  await B.page.getByRole("button", { name: "审核通过", exact: true }).click();
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "综合核验" })
    .waitFor();
  await B.page.locator('[name="riskConfirmed"]').check();
  await B.page.route(base + ap, (route) => route.abort("failed"));
  await B.page.getByRole("button", { name: "审核通过", exact: true }).click();
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "网络连接失败" })
    .waitFor();
  await B.page.unroute(base + ap);
  const pending = B.page.waitForResponse(
    (r) => r.url() === base + ap && r.request().method() === "POST",
  );
  let sent = 0;
  B.page.on("request", (r) => {
    if (r.url() === base + ap && r.method() === "POST") sent++;
  });
  await B.page.route(base + ap, async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.continue();
  });
  await B.page
    .getByRole("button", { name: "审核通过", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await B.page
    .getByRole("button", { name: "审核处理中…", exact: true })
    .waitFor();
  assert.equal((await pending).status(), 200);
  assert.equal(sent, 1);
  await B.page.unroute(base + ap);
  check(
    "简化后仍校验说明与综合确认，断网显示错误；真实提交显示处理中且双击仅一次POST",
  );
  await B.page
    .locator('#content-workflow [role="status"]')
    .filter({ hasText: "审核已通过" })
    .waitFor();
  const ar = await p.contentReview.findFirstOrThrow({ where: { faqId: a.id } });
  assert.equal(ar.checklist.riskAssessment.confirmedLevel, "LOW");
  assert.equal(ar.checklist.riskAssessment.evidence.length, 0);
  await B.page.screenshot({
    path: folder + "/basic-approved.png",
    fullPage: true,
  });
  evidence.basic = {
    id: a.id,
    url: await publish(rootPage, anon, a),
    apiStatus: 200,
  };
  check("A基础银行流水定义，无外部URL，专业判断独立审核后授权发布200");
  await review(B.page, b, "MEDIUM");
  assert.equal(await B.page.locator('[name^="riskEvidence-"]').count(), 0);
  await click(B.page, "审核通过", `/api/admin/geo/faqs/${b.id}/workflow/`);
  evidence.practical = { id: b.id, url: await publish(rootPage, anon, b) };
  check("B一般资料准备建议，按专业判断记录通过；未出现统一HTTPS门槛");
  await review(B.page, high, "HIGH");
  const hp = `/api/admin/geo/faqs/${high.id}/workflow/`;
  let requests = 0;
  B.page.on("request", (r) => {
    if (r.method() === "POST" && r.url() === base + hp) requests++;
  });
  await B.page.getByRole("button", { name: "审核通过", exact: true }).click();
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "未经核验" })
    .waitFor();
  assert.equal(requests, 0);
  const responseLower = await api(
    B.c,
    "POST",
    hp,
    {
      action: "approve",
      revision: 1,
      note,
      checklist,
      risk: { level: "LOW", confirmed: true, basis: note, evidence: [] },
    },
    400,
  );
  assert.equal(responseLower.code, "RISK_DOWNGRADE");
  const responseMissing = await api(
    B.c,
    "POST",
    hp,
    {
      action: "approve",
      revision: 1,
      note,
      checklist,
      risk: { level: "HIGH", confirmed: true, basis: note, evidence: [] },
    },
    400,
  );
  assert.equal(responseMissing.code, "EVIDENCE_REQUIRED");
  const responseLegacy = await api(
    B.c,
    "POST",
    hp,
    { action: "approve", revision: 1, note, checklist },
    400,
  );
  assert.equal(responseLegacy.code, "RISK_CONFIRM_REQUIRED");
  assert.equal(await p.contentReview.count({ where: { faqId: high.id } }), 0);
  assert.equal(
    (await anon.request.get(base + `/faqs/${high.id}/`)).status(),
    404,
  );
  evidence.high = { id: high.id, publicStatus: 404, reviewCount: 0 };
  check("C具体银行最新利率缺证据受阻，伪造LOW及旧接口不能绕过，未公开");
  // Internal evidence fixture: technical workflow only, never a fabricated bank product or rate.
  await rootPage.goto(base + "/admin/geo/reviews/");
  await rootPage
    .locator("summary")
    .filter({ hasText: "受控内部产品依据" })
    .click();
  const form = rootPage
    .locator("form")
    .filter({ has: rootPage.locator('[name="reference"]') });
  await form
    .locator('[name="title"]')
    .fill(marker + "-受控技术资料V1（非银行产品）");
  await form
    .locator('[name="reference"]')
    .fill("tests/review-risk/fixtures/internal-evidence.md");
  await form
    .locator('[name="excerpt"]')
    .fill(
      "本地内容系统的审核通过与发布是独立动作；审核通过不会自动公开。本资料仅供技术验收，非金融产品依据。",
    );
  await form
    .locator('[name="checkedAt"]')
    .fill(new Date().toISOString().slice(0, 10));
  await form.locator('input[type="checkbox"][required]').check();
  await form.locator('[name="reauthPassword"]').fill(c.adminPassword);
  const ev = await click(
    rootPage,
    "保存受控内部依据",
    "/api/admin/geo/evidence/",
  );
  catalogs.push(ev.id);
  const d = await makeFaq(
    A,
    "软件审核记录如何核验？",
    "本地内容系统的审核通过与发布是独立动作，审核通过不会自动公开。仅用于本地技术验收，不作金融依据。",
  );
  await B.page.goto(base + `/admin/geo/faqs/${d.id}/`);
  await B.page.locator('[name="riskLevel"]').selectOption("HIGH");
  await B.page.locator('[name="riskConfirmed"]').check();
  for (const k of keys) await B.page.locator(`[name="${k}"]`).check();
  await B.page.locator('[name="note"]').fill(note);
  await B.page
    .locator('[name="riskEvidence-0"]')
    .selectOption("internal:" + ev.id);
  await api(root, "POST", "/api/admin/geo/evidence/", {
    id: ev.id,
    title: marker + "-受控技术资料V1（非银行产品）",
    reference: "tests/review-risk/fixtures/internal-evidence.md",
    excerpt:
      "本地审核通过不会自动公开，须由另一授权发布角色执行发布。本条是更新后的技术验收资料，不是银行产品。",
    checkedAt: new Date().toISOString().slice(0, 10),
    isActive: true,
    reauthPassword: c.adminPassword,
  });
  await click(
    B.page,
    "审核通过",
    `/api/admin/geo/faqs/${d.id}/workflow/`,
    "POST",
    409,
  );
  await B.page
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "页面打开后已更新" })
    .waitFor();
  await B.page.reload();
  await B.page.locator('[name="riskLevel"]').selectOption("HIGH");
  await B.page.locator('[name="riskConfirmed"]').check();
  for (const k of keys) await B.page.locator(`[name="${k}"]`).check();
  await B.page.locator('[name="note"]').fill(note);
  await B.page
    .locator('[name="riskEvidence-0"]')
    .selectOption("internal:" + ev.id);
  check(
    "内部依据绑定页面所见版本，打开页面后资料变动会拒绝审批，刷新重新阅读全文后才能通过",
  );
  await click(B.page, "审核通过", `/api/admin/geo/faqs/${d.id}/workflow/`);
  const dr = await p.contentReview.findFirstOrThrow({ where: { faqId: d.id } });
  assert.equal(dr.checklist.riskAssessment.evidence[0].type, "INTERNAL_BANK");
  await api(root, "POST", "/api/admin/geo/evidence/", {
    id: ev.id,
    title: marker + "-受控技术资料V1（非银行产品）",
    reference: "tests/review-risk/fixtures/internal-evidence.md",
    excerpt:
      "资料适用条款已更新，旧审批不应继续发布。此为技术测试，不是融资产品依据。",
    checkedAt: new Date().toISOString().slice(0, 10),
    isActive: true,
    reauthPassword: c.adminPassword,
  });
  await rootPage.goto(base + `/admin/geo/faqs/${d.id}/`);
  await click(
    rootPage,
    "发布到官网",
    `/api/admin/geo/faqs/${d.id}/workflow/`,
    "POST",
    409,
  );
  await rootPage
    .locator('#content-workflow [role="alert"]')
    .filter({ hasText: "已更新" })
    .waitFor();
  check(
    "受控内部资料无需HTTPS，保存编号/核验人日期/对应条款；资料更新后发布重新校验并拒绝旧审批",
  );
  await api(
    A.c,
    "POST",
    "/api/admin/geo/evidence/",
    {
      title: "无权",
      reference: "X",
      excerpt: "不应有权限",
      checkedAt: new Date().toISOString().slice(0, 10),
      isActive: true,
      reauthPassword: "not-a-real-password",
    },
    403,
  );
  await api(
    A.c,
    "POST",
    "/api/admin/geo/reviews/batch/",
    {
      action: "approve",
      items: [{ id: high.id, revision: 1, basis: note, confirmed: true }],
    },
    403,
  );
  const self = await makeFaq(
    { page: rootPage },
    "独立性技术验收是什么？",
    "这是独立审核权限的合成技术验收内容，不包含客户资料。",
  );
  await api(
    root,
    "POST",
    `/api/admin/geo/faqs/${self.id}/workflow/`,
    {
      action: "approve",
      revision: 1,
      note,
      risk: { level: "LOW", confirmed: true, basis: note, evidence: [] },
    },
    403,
  );
  check("运营账号不能登记内部依据或批量审核，有审核权限的作者仍不能自审");
  const bad = await makeFaq(
    A,
    "不可发布的合成承诺反例",
    "保证放款。这是仅用于合规拦截的虚构测试，禁止公开。",
  );
  const blockedLegacy = await api(
    B.c,
    "POST",
    `/api/admin/geo/faqs/${bad.id}/workflow/`,
    { action: "approve", revision: 1, note, checklist },
    400,
  );
  assert.equal(blockedLegacy.code, "CONTENT_RISK");
  assert.equal(
    (await anon.request.get(base + `/faqs/${bad.id}/`)).status(),
    404,
  );
  check("旧版七项接口同样拦截保证性承诺，不能通过旧契约绕过内容风险检查");
  // Each low-risk row needs its own confirmation and basis; no select-all approval.
  const e = await makeFaq(
    A,
    "资金收付记录是什么？",
    "资金收付记录描述交易收支变化。本条为合成验收。",
  );
  const f = await makeFaq(
    A,
    "交易记录是什么？",
    "交易记录用于记载交易事实。本条为合成验收。",
  );
  await B.page.goto(base + "/admin/geo/reviews/");
  const bb = B.page.locator("details").filter({
    has: B.page.locator("summary").filter({ hasText: "批量分配与逐条核验" }),
  });
  await bb.locator("summary").first().click();
  await bb
    .getByRole("button", { name: "加载 / 刷新待审核FAQ", exact: true })
    .click();
  for (const item of [e, f]) {
    const row = bb.locator("section.admin-panel").filter({
      has: B.page.getByRole("heading", { name: item.question, exact: true }),
    });
    await row.locator("textarea").fill(note);
    await row
      .getByLabel("我已阅读全文并逐条核对真实性、宣传合规、隐私和必要依据")
      .check();
  }
  const batchApproved = await click(
    B.page,
    "提交已逐条核验的低风险FAQ",
    "/api/admin/geo/reviews/batch/",
  );
  assert.equal(batchApproved.succeeded, 2);
  for (const item of [e, f]) {
    assert.equal(
      await p.contentReview.count({
        where: { faqId: item.id, reviewerId: B.user.id },
      }),
      1,
    );
    assert.equal(
      (await p.faq.findUniqueOrThrow({ where: { id: item.id } })).isLive,
      false,
    );
  }
  const blockedBatch = await api(B.c, "POST", "/api/admin/geo/reviews/batch/", {
    action: "approve",
    items: [{ id: high.id, revision: 1, basis: note, confirmed: true }],
  });
  assert.equal(blockedBatch.failed, 1);
  check(
    "实际浏览器逐条填写两条低风险判断后批量审批，每条有审核记录；无批量发布，中高风险批量拒绝",
  );
  for (const width of [375, 768, 1024, 1440]) {
    await B.page.setViewportSize({ width, height: 900 });
    await B.page.goto(base + `/admin/geo/faqs/${high.id}/`);
    assert.equal(
      await B.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  }
  await B.page.screenshot({
    path: folder + "/high-risk-evidence.png",
    fullPage: true,
  });
  assert.deepEqual(evidence.pageErrors, []);
  check("简化审核页面四视口无溢出，页面异常为零，原版本和来源保持");
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
            { resourceId: { in: [...users, ...faqs, ...catalogs] } },
          ],
        },
      });
      await p.articleSource.deleteMany({ where: { id: { in: catalogs } } });
      await p.adminSession.deleteMany({ where: { adminId: { in: users } } });
      await p.adminUser.deleteMany({ where: { id: { in: users } } });
      evidence.syntheticCleaned = true;
    } catch {
      evidence.syntheticCleaned = false;
      process.exitCode = 1;
    }
    for (const ctx of contexts) await ctx.close();
    await browser?.close();
    await p.$disconnect();
    fs.writeFileSync(
      folder + "/result.json",
      JSON.stringify(evidence, null, 2),
    );
  });
