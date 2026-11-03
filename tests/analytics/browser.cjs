const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { randomUUID, randomBytes, randomInt, createHmac } = require("node:crypto");
const { PrismaClient } = require(
  process.env.DATABASE_PROVIDER === "sqlite"
    ? "@hsy/sqlite-client"
    : "@prisma/client",
);
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = process.env.TEST_URL || "http://127.0.0.1:3000",
  p = new PrismaClient({ log: [] }),
  users = [],
  articles = [],
  faqs = [],
  leads = [],
  guards = [],
  contexts = [],
  folder =
    (process.env.DATABASE_PROVIDER === "sqlite"
      ? "test-results/v16/"
      : "test-results/") + "analytics";
const evidence = {
  base,
  environment: "现有本地开发服务和真实数据库；Edge真实页面",
  checks: [],
  requests: [],
  realAiCalled: false,
};
const syntheticPhones = Array.from(
  { length: 3 },
  () => "1380000" + randomInt(1000, 10000),
);
let browser;
const pass = (s) => {
  evidence.checks.push(s);
  console.log("PASS: " + s);
};
async function api(c, method, path, data, status = 200) {
  const r = await c.request.fetch(base + path, {
    method,
    headers: { Origin: base },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(r.status(), status, path + " HTTP " + r.status());
  const j = await r.json();
  return r.ok() ? j.data : j.error;
}
async function ctx() {
  const c = await browser.newContext();
  contexts.push(c);
  return c;
}
async function counts() {
  return {
    questions: await p.geoQuestion.count(),
    faqs: await p.faq.count(),
    articles: await p.article.count(),
    versions: await p.articleVersion.count(),
    users: await p.adminUser.count(),
    leads: await p.lead.count(),
    events: await p.contentEvent.count(),
    metrics: await p.contentDailyMetric.count(),
    attributions: await p.leadAttribution.count(),
  };
}
async function postButton(page, label, path) {
  const wait = page.waitForResponse(
    (r) => r.url() === base + path && r.request().method() === "POST",
  );
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: label, exact: true }).click();
  const r = await wait;
  assert.equal(r.status(), 200);
  return (await r.json()).data;
}
(async () => {
  assert.equal(process.env.LOCAL_TEST_MODE, "true");
  if (process.env.DATABASE_PROVIDER === "sqlite")
    assert.ok(
      process.env.DATABASE_URL.startsWith("file:") &&
        process.env.LOCAL_TEST_MODE === "true",
    );
  else assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
  fs.mkdirSync(folder, { recursive: true });
  evidence.before = await counts();
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const root = await ctx(),
    op = await ctx(),
    reviewer = await ctx(),
    anon = await ctx(),
    other = await ctx();
  const cfg = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  await api(root, "POST", "/api/admin/login/", {
    email: cfg.adminEmail,
    password: cfg.adminPassword,
  });
  async function employee(c, role) {
    const a = await api(
      root,
      "POST",
      "/api/admin/users/",
      {
        name: "虚构归因验收人员",
        email: randomUUID() + "@example.invalid",
        role,
        departmentId: null,
        isActive: true,
        reauthPassword: cfg.adminPassword,
      },
      201,
    );
    users.push(a.user.id);
    await api(c, "POST", "/api/admin/login/", {
      email: a.user.email,
      password: a.initialPassword,
    });
    const password = randomBytes(20).toString("hex") + "Aa1!";
    await api(c, "PATCH", "/api/admin/profile/", {
      oldPassword: a.initialPassword,
      newPassword: password,
      confirmation: password,
    });
    await api(c, "POST", "/api/admin/login/", {
      email: a.user.email,
      password,
    });
  }
  await employee(op, "CONTENT_OPERATOR");
  await employee(reviewer, "CONTENT_REVIEWER");
  const reportPath = "/api/admin/geo/analytics/";
  const before = await api(root, "GET", reportPath);
  evidence.emptyPv = before.pv;
  await api(anon, "GET", reportPath, undefined, 401);
  await api(reviewer, "GET", reportPath, undefined, 403);
  await api(op, "GET", reportPath);
  await api(
    op,
    "POST",
    reportPath,
    {
      action: "connection",
      data: {
        platform: "GOOGLE",
        label: "拒绝测试",
        siteUrl: "https://example.invalid/",
        isActive: true,
      },
    },
    403,
  );
  await api(op, "GET", "/api/admin/leads/", undefined, 403);
  pass("聚合报表权限与客户明细分离；匿名、独立审核员和运营越权配置拒绝");
  const suffix = randomUUID().slice(0, 8),
    risk = {
      level: "LOW",
      confirmed: true,
      basis:
        "本地软件验收，内容仅为通用信息整理与还款风险提示，不涉及具体产品、利率或客户。",
      evidence: [],
    };
  const article = await api(
    op,
    "POST",
    "/api/admin/geo/articles/",
    {
      title: "本地归因验收-" + suffix,
      slug: "analytics-" + suffix,
      summary: "本地软件验收使用的通用资料整理提醒。",
      content:
        "## 整理信息\n\n咨询前可梳理资金用途、回款安排和还款能力。\n\n## 风险提示\n\n融资存在还款风险，审批以金融机构决定为准，不保证贷款获批。",
      category: "融资风险与合规",
      tags: [],
      sources: [],
      relatedIds: [],
      aiAssisted: false,
    },
    201,
  );
  articles.push(article.id);
  const articlePath = "/insights/" + article.slug + "/",
    flow = "/api/admin/geo/articles/" + article.id + "/workflow/";
  const session = await api(anon, "POST", "/api/analytics/session/", {
    consent: true,
    policyVersion: "2026-11-02-analytics-v1",
  });
  await api(
    anon,
    "POST",
    "/api/analytics/events/",
    {
      kind: "ARTICLE",
      id: article.id,
      type: "PV",
      eventId: randomUUID(),
      analyticsToken: session.token,
    },
    404,
  );
  await api(op, "POST", flow, { action: "submit", revision: article.revision });
  await api(
    op,
    "POST",
    flow,
    {
      action: "approve",
      revision: article.revision,
      note: risk.basis,
      risk,
      checklist: {
        sources: true,
        promises: true,
        relationships: true,
        cases: true,
        promotion: true,
        privacy: true,
        human: true,
      },
    },
    403,
  );
  await api(reviewer, "POST", flow, {
    action: "approve",
    revision: article.revision,
    note: risk.basis,
    risk,
    checklist: {
      sources: true,
      promises: true,
      relationships: true,
      cases: true,
      promotion: true,
      privacy: true,
      human: true,
    },
  });
  const rp = await root.newPage();
  await rp.goto(base + "/admin/geo/articles/" + article.id + "/");
  await postButton(rp, "发布到官网", flow);
  evidence.article = { id: article.id, path: articlePath };
  pass("真实文章创建、独立审核和浏览器授权发布；未发布内容拒绝计数");
  const page = await anon.newPage();
  let pvPayload;
  page.on("request", (r) => {
    if (r.url() === base + "/api/analytics/events/" && r.method() === "POST")
      pvPayload = r.postDataJSON();
  });
  await page.goto(base + articlePath);
  await page
    .getByRole("button", { name: "同意本次匿名分析", exact: true })
    .waitFor();
  assert.equal(
    await p.contentEvent.count({ where: { articleId: article.id } }),
    0,
  );
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  const pvWait = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/analytics/events/" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "同意本次匿名分析", exact: true })
    .click();
  assert.equal((await pvWait).status(), 200);
  await api(anon, "POST", "/api/analytics/events/", pvPayload);
  assert.equal(
    await p.contentEvent.count({
      where: { articleId: article.id, type: "PV" },
    }),
    1,
  );
  assert.equal(
    (
      await anon.request.post(base + "/api/analytics/events/", {
        headers: { Origin: "https://example.invalid" },
        data: pvPayload,
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await anon.request.post(base + "/api/analytics/events/", {
        headers: { Origin: base, "User-Agent": "Googlebot" },
        data: { ...pvPayload, eventId: randomUUID() },
      })
    ).status(),
    200,
  );
  assert.equal(
    await p.contentEvent.count({
      where: { articleId: article.id, type: "PV" },
    }),
    1,
  );
  pass(
    "同意前无访问事件或存储；主动授权后真实PV200，重复上报与已知机器人不重复计数、跨源拒绝",
  );
  const cta = page.locator('main a[href^="/contact/"]').first();
  assert.ok(await cta.count());
  const clickWait = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/analytics/context/" &&
      r.request().method() === "POST",
  );
  await cta.click();
  assert.equal((await clickWait).status(), 200);
  await page.waitForURL("**/contact/**");
  assert.ok(new URL(page.url()).searchParams.get("attribution"));
  await page.locator("[name=name]").fill("虚构归因验收");
  await page.locator("[name=phone]").fill(syntheticPhones[0]);
  await page.locator("[name=customerType]").selectOption("ENTERPRISE");
  await page.locator("[name=financingAmount]").selectOption("50万元以内");
  await page.locator("[name=consent]").check();
  const submitted = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/consultations/" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "提交咨询需求 ↗", exact: true })
    .click();
  const response = await submitted;
  assert.equal(response.status(), 201);
  const lead = (await response.json()).data.reference;
  leads.push(lead);
  const savedLead = await p.lead.findUniqueOrThrow({
    where: { id: lead },
    include: { attribution: true, consents: true },
  });
  guards.push(savedLead.phone);
  assert.equal(savedLead.attribution.articleId, article.id);
  assert.equal(savedLead.attribution.measured, true);
  assert.equal(savedLead.attribution.confidence, "SIGNED_CONTEXT");
  assert.equal(savedLead.consents.length, 1);
  await page
    .getByText("咨询需求已成功提交，沪上银工作人员将与您联系。", {
      exact: true,
    })
    .waitFor();
  evidence.requests.push(
    { path: "/api/analytics/events/", status: 200 },
    { path: "/api/analytics/context/", status: 200 },
    { path: "/api/consultations/", status: 201 },
  );
  evidence.lead = {
    id: lead,
    articleId: article.id,
    confidence: savedLead.attribution.confidence,
    consentCount: 1,
  };
  await rp.goto(base + "/admin/leads/" + lead + "/");
  await rp.getByRole("heading", { name: "获客来源", exact: true }).waitFor();
  assert.ok((await rp.locator("body").innerText()).includes(article.title));
  await rp.screenshot({ path: folder + "/lead-source.png", fullPage: true });
  const report = await api(root, "GET", reportPath);
  const rank = report.ranking.find((r) => r.id === article.id);
  assert.equal(rank.pv, 1);
  assert.equal(rank.clicks, 1);
  assert.equal(rank.consults, 1);
  assert.equal(rank.conversion, null);
  assert.equal(rank.lowSample, true);
  evidence.ranking = rank;
  await rp.goto(base + "/admin/geo/analytics/");
  await rp
    .getByRole("heading", { name: "GEO效果与咨询归因", exact: true })
    .waitFor();
  await rp.screenshot({ path: folder + "/dashboard.png", fullPage: true });
  pass(
    "浏览器文章→点击→咨询201→真实线索/授权/归因→后台获客来源→PV1点击1咨询1，低样本转化提示",
  );
  const direct = await api(
    other,
    "POST",
    "/api/consultations/",
    {
      name: "虚构直接访问",
      phone: syntheticPhones[1],
      customerType: "PERSONAL",
      financingAmount: "50万元以内",
      sourcePage: "/contact/",
      consent: true,
    },
    201,
  );
  leads.push(direct.reference);
  guards.push(syntheticPhones[1]);
  assert.equal(
    (
      await p.leadAttribution.findUniqueOrThrow({
        where: { leadId: direct.reference },
      })
    ).sourceType,
    "DIRECT",
  );
  const faq = await api(
    op,
    "POST",
    "/api/admin/geo/faqs/",
    {
      question: "本地问答归因验收-" + suffix,
      answer:
        "这是本地软件测试问答。咨询前可梳理信息，并关注还款风险；不保证获批。",
      category: "融资风险与合规",
      articleId: null,
      sources: [],
    },
    201,
  );
  faqs.push(faq.id);
  const ff = "/api/admin/geo/faqs/" + faq.id + "/workflow/";
  await api(op, "POST", ff, { action: "submit", revision: faq.revision });
  await api(reviewer, "POST", ff, {
    action: "approve",
    revision: faq.revision,
    note: risk.basis,
    risk,
    checklist: {
      sources: true,
      promises: true,
      relationships: true,
      cases: true,
      promotion: true,
      privacy: true,
      human: true,
    },
  });
  await api(root, "POST", ff, { action: "publish", revision: faq.revision });
  await page.goto(base + "/faqs/" + faq.id + "/");
  const fw = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/analytics/events/" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "同意本次匿名分析", exact: true })
    .count()
    .then(async (n) => {
      if (n)
        await page
          .getByRole("button", { name: "同意本次匿名分析", exact: true })
          .click();
    });
  assert.equal((await fw).status(), 200);
  const fc = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/analytics/context/" &&
      r.request().method() === "POST",
  );
  await page.locator('main a[href^="/contact/"]').first().click();
  assert.equal((await fc).status(), 200);
  await page.waitForURL("**/contact/**");
  const q = new URL(page.url());
  const fLead = await api(
    anon,
    "POST",
    "/api/consultations/",
    {
      name: "虚构问答来源",
      phone: syntheticPhones[2],
      customerType: "PERSONAL",
      financingAmount: "50万元以内",
      sourcePage: "/contact/",
      sourceFaqId: faq.id,
      attributionToken: q.searchParams.get("attribution"),
      consent: true,
    },
    201,
  );
  leads.push(fLead.reference);
  guards.push(syntheticPhones[2]);
  const fa = await p.leadAttribution.findUniqueOrThrow({
    where: { leadId: fLead.reference },
  });
  assert.equal(fa.faqId, faq.id);
  assert.equal(fa.articleId, null);
  evidence.faq = { id: faq.id, leadId: fLead.reference };
  pass("FAQ真实访问和独立归因，直接访问不强行归因文章");
  const search = await api(root, "GET", reportPath + "?view=search");
  assert.equal(search.metrics.length, 0);
  await rp.goto(base + "/admin/geo/analytics/search/");
  assert.ok((await rp.locator("body").innerText()).includes("暂无"));
  await rp.goto(base + "/admin/geo/visibility/");
  await rp
    .getByRole("heading", { name: "GEO可见性人工观察", exact: true })
    .waitFor();
  for (const width of [375, 768, 1024, 1440]) {
    await rp.setViewportSize({ width, height: 900 });
    await rp.goto(base + "/admin/geo/analytics/");
    assert.equal(
      await rp.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "报表横向溢出 " + width,
    );
  }
  pass("搜索平台无假曝光、人工观察空状态，四视口后台无页面横向溢出");
  await api(root, "POST", flow, {
    action: "offline",
    revision: article.revision,
  });
  assert.equal((await anon.request.get(base + articlePath)).status(), 404);
  await api(
    anon,
    "POST",
    "/api/analytics/events/",
    { ...pvPayload, kind: "ARTICLE", id: article.id, eventId: randomUUID() },
    404,
  );
  pass("下线仍沿用原授权工作流，公开404且不接受新访问事件");
  evidence.outcome = "PASS";
})()
  .catch((e) => {
    evidence.outcome = "FAIL";
    evidence.failure = e.message;
    console.error(e.name, e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await p.contentEvent.deleteMany({
        where: {
          OR: [{ articleId: { in: articles } }, { faqId: { in: faqs } }],
        },
      });
      await p.contentDailyMetric.deleteMany({
        where: {
          OR: [{ articleId: { in: articles } }, { faqId: { in: faqs } }],
        },
      });
      const ownLeads = await p.lead.findMany({
        where: { id: { in: leads } },
        select: { phone: true, customerType: true, financingAmount: true },
      });
      const ownGuardKeys = ownLeads.map((l) =>
        createHmac("sha256", process.env.RATE_LIMIT_SECRET)
          .update(JSON.stringify([l.phone, l.customerType, l.financingAmount]))
          .digest("hex"),
      );
      await p.submissionGuard.deleteMany({
        where: { key: { in: ownGuardKeys } },
      });
      await p.consent.deleteMany({ where: { leadId: { in: leads } } });
      await p.lead.deleteMany({ where: { id: { in: leads } } });
      await p.contentReview.deleteMany({
        where: {
          OR: [{ articleId: { in: articles } }, { faqId: { in: faqs } }],
        },
      });
      await p.articleSource.deleteMany({
        where: { articleId: { in: articles } },
      });
      await p.articleVersion.deleteMany({
        where: { articleId: { in: articles } },
      });
      await p.faqVersion.deleteMany({ where: { faqId: { in: faqs } } });
      await p.article.deleteMany({ where: { id: { in: articles } } });
      await p.faq.deleteMany({ where: { id: { in: faqs } } });
      await p.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: users } },
            { resourceId: { in: [...articles, ...faqs, ...users, ...leads] } },
          ],
        },
      });
      await p.adminSession.deleteMany({ where: { adminId: { in: users } } });
      await p.adminUser.deleteMany({ where: { id: { in: users } } });
      evidence.after = await counts();
      assert.deepEqual(evidence.after, evidence.before);
      evidence.syntheticCleaned = true;
    } catch (e) {
      evidence.cleanupError = e.message;
      process.exitCode = 1;
    }
    for (const c of contexts) {
      await c.request
        .post(base + "/api/admin/logout/", { headers: { Origin: base } })
        .catch(() => {});
      await c.close();
    }
    await browser?.close();
    await p.$disconnect();
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      folder + "/result.json",
      JSON.stringify(evidence, null, 2),
    );
  });
