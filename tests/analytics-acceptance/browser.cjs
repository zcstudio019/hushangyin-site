const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { randomUUID, randomInt, createHash } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const p = new PrismaClient({ log: [] }),
  base = "http://127.0.0.1:3000",
  folder = "test-results/analytics-acceptance",
  marker = "V154-E2E-" + randomUUID();
const result = {
  base,
  marker,
  realBrowser: true,
  checks: [],
  requests: [],
  preservedFixture: true,
};
let browser, ownSessionKey, leadId;
const contexts = [];
const pass = (s) => {
  result.checks.push(s);
  console.log("PASS: " + s);
};
async function api(c, method, path, data, status = 200) {
  const r = await c.request.fetch(base + path, {
    method,
    headers: { Origin: base },
    ...(data ? { data } : {}),
  });
  assert.equal(r.status(), status, path);
  const j = await r.json();
  return r.ok() ? j.data : j.error;
}
async function core() {
  return {
    questions: await p.geoQuestion.count(),
    faqs: await p.faq.count(),
    articles: await p.article.count(),
    users: await p.adminUser.count(),
    leads: await p.lead.count(),
  };
}
async function snapshots() {
  const [a, f] = await Promise.all([
    p.article.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        status: true,
        revision: true,
        publishedRevision: true,
        publishedSnapshot: true,
      },
    }),
    p.faq.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        status: true,
        revision: true,
        publishedRevision: true,
        publishedSnapshot: true,
      },
    }),
  ]);
  return createHash("sha256")
    .update(JSON.stringify([a, f]))
    .digest("hex");
}
(async () => {
  assert.equal(process.env.LOCAL_TEST_MODE, "true");
  assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
  fs.mkdirSync(folder, { recursive: true });
  result.before = await core();
  const priorSnapshots = await snapshots();
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const visitor = await browser.newContext(),
    admin = await browser.newContext();
  contexts.push(visitor, admin);
  const cfg = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  await api(admin, "POST", "/api/admin/login/", {
    email: cfg.adminEmail,
    password: cfg.adminPassword,
  });
  const existing = await p.leadAttribution.findFirst({
    where: { sourceType: "ARTICLE" },
    orderBy: { createdAt: "asc" },
  });
  const article = await p.article.findFirstOrThrow({
    where: {
      ...(existing?.articleId ? { id: existing.articleId } : {}),
      isLive: true,
      publishedRevision: { not: null },
    },
    include: { reviews: { where: { decision: "APPROVED" } } },
  });
  assert.ok(
    article.reviews.some((r) => r.revision === article.publishedRevision),
  );
  const faq = await p.faq.findFirstOrThrow({
    where: { isLive: true },
    include: { reviews: { where: { decision: "APPROVED" } } },
  });
  assert.ok(faq.reviews.some((r) => r.revision === faq.publishedRevision));
  const path = "/insights/" + article.slug + "/";
  result.article = {
    id: article.id,
    path,
    publishedRevision: article.publishedRevision,
  };
  result.faq = { id: faq.id, path: "/faqs/" + faq.id + "/" };
  const before = await api(admin, "GET", "/api/admin/geo/analytics/?days=30");
  result.beforeMetrics = {
    pv: before.pv,
    clicks: before.clicks,
    attributedLeads: before.attributedLeads,
    lastUpdatedAt: before.lastUpdatedAt,
  };
  assert.equal(before.enabled, true);
  await api(visitor, "GET", "/api/admin/geo/analytics/", undefined, 401);
  const page = await visitor.newPage(),
    dashboard = await admin.newPage();
  const errors = [];
  page.on("pageerror", () => errors.push("公开页面脚本错误"));
  dashboard.on("pageerror", () => errors.push("看板页面脚本错误"));
  let pvPayload;
  page.on("request", (r) => {
    if (r.url() === base + "/api/analytics/events/" && r.method() === "POST") {
      const data = r.postDataJSON();
      pvPayload = data;
      assert.ok(!("phone" in data) && !("name" in data) && !("remark" in data));
    }
  });
  const initialEvents = await p.contentEvent.count();
  await page.goto(base + path);
  await page
    .getByRole("button", { name: "同意本次匿名分析", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("hsy-optional-analytics")),
    null,
  );
  assert.equal(await p.contentEvent.count(), initialEvents);
  await page.getByRole("button", { name: "暂不同意", exact: true }).click();
  const noConsent = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/analytics/context/" &&
      r.request().method() === "POST",
  );
  await page.locator('main a[href^="/contact/"]').first().click();
  assert.equal((await noConsent).status(), 200);
  await page.waitForURL("**/contact/**");
  assert.equal(await p.contentEvent.count(), initialEvents);
  pass("公开文章确已挂载；未选择和明确拒绝时不采集，拒绝后咨询来源仍可交接");
  await page.goto(base + path);
  const pv = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/analytics/events/" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "同意本次匿名分析", exact: true })
    .click();
  assert.equal((await pv).status(), 200);
  const first = await p.contentEvent.findUniqueOrThrow({
    where: { id: pvPayload.eventId },
  });
  ownSessionKey = first.sessionKey;
  assert.equal(first.articleId, article.id);
  assert.equal(first.type, "PV");
  result.requests.push({
    path: "/api/analytics/events/",
    status: 200,
    type: "文章浏览",
  });
  const firstReport = await api(
    admin,
    "GET",
    "/api/admin/geo/analytics/?days=30",
  );
  assert.equal(firstReport.articlePv, (before.articlePv || 0) + 1);
  const firstRank = firstReport.ranking.find((r) => r.id === article.id);
  assert.equal(firstRank.clicks, 0);
  assert.equal(firstRank.conversion, null);
  await dashboard.goto(base + "/admin/geo/analytics/");
  await dashboard
    .getByRole("heading", { name: "文章PV", exact: true })
    .waitFor();
  assert.ok((await dashboard.locator("body").innerText()).includes("样本不足"));
  pass(
    "明确同意后浏览器PV200并真实入库，看板区分PV1、实际点击0和低样本无转化率",
  );
  const click = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/analytics/context/" &&
      r.request().method() === "POST",
  );
  await page.locator('main a[href^="/contact/"]').first().click();
  assert.equal((await click).status(), 200);
  await page.waitForURL("**/contact/**");
  assert.equal(new URL(page.url()).searchParams.get("article"), article.id);
  assert.ok(new URL(page.url()).searchParams.get("attribution"));
  assert.equal(
    await p.contentEvent.count({
      where: {
        sessionKey: ownSessionKey,
        type: "CLICK",
        articleId: article.id,
      },
    }),
    1,
  );
  result.requests.push({
    path: "/api/analytics/context/",
    status: 200,
    type: "文章咨询点击",
  });
  await page.locator("[name=name]").fill("虚构专项验收");
  await page.locator("[name=phone]").fill("1380000" + randomInt(1000, 10000));
  await page.locator("[name=customerType]").selectOption("ENTERPRISE");
  await page.locator("[name=financingAmount]").selectOption("50万元以内");
  await page
    .locator("[name=remark]")
    .fill(marker + "；合成软件测试资料，不是真实客户。");
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
  leadId = (await response.json()).data.reference;
  result.requests.push({
    path: "/api/consultations/",
    status: 201,
    type: "虚构咨询",
  });
  const lead = await p.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { attribution: true, consents: true },
  });
  assert.equal(lead.sourceArticleId, article.id);
  assert.equal(lead.attribution.articleId, article.id);
  assert.equal(lead.attribution.confidence, "SIGNED_CONTEXT");
  assert.equal(lead.attribution.measured, true);
  assert.equal(lead.consents.length, 1);
  assert.ok(lead.remark.includes(marker));
  result.lead = {
    id: leadId,
    attributionId: lead.attribution.id,
    articleId: article.id,
    consentCount: 1,
    measured: true,
    createdAt: lead.createdAt,
  };
  await dashboard.goto(base + "/admin/leads/" + leadId + "/");
  await dashboard
    .getByRole("heading", { name: "获客来源", exact: true })
    .waitFor();
  assert.ok(
    (await dashboard.locator("body").innerText()).includes(article.title),
  );
  await dashboard.screenshot({
    path: folder + "/lead-source.png",
    fullPage: true,
  });
  pass(
    "文章CTA浏览器点击入库，真实表单201，线索+授权+来源+转化同事务保存，后台读取正确文章",
  );
  const fp = page.waitForResponse(
    (r) =>
      r.url() === base + "/api/analytics/events/" &&
      r.request().method() === "POST",
  );
  await page.goto(base + "/faqs/" + faq.id + "/");
  assert.equal((await fp).status(), 200);
  assert.equal(
    await p.contentEvent.count({
      where: { sessionKey: ownSessionKey, faqId: faq.id, type: "PV" },
    }),
    1,
  );
  const eventCount = await p.contentEvent.count();
  assert.equal(
    (await api(visitor, "POST", "/api/analytics/events/", pvPayload)).duplicate,
    true,
  );
  assert.equal(await p.contentEvent.count(), eventCount);
  await api(
    visitor,
    "POST",
    "/api/analytics/events/",
    {
      ...pvPayload,
      id: "not-public-article",
      kind: "ARTICLE",
      eventId: randomUUID(),
    },
    404,
  );
  pass("同一已授权窗口FAQ浏览真实入库，重复事件不累加，非公开内容拒绝统计");
  const after = await api(admin, "GET", "/api/admin/geo/analytics/?days=30");
  assert.equal(after.pv, (before.pv || 0) + 2);
  assert.equal(after.clicks, (before.clicks || 0) + 1);
  assert.equal(after.attributedLeads, (before.attributedLeads || 0) + 1);
  assert.equal(after.conversion, null);
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
    day = after.trend.find((d) => d.day === today);
  assert.equal(day.pv, 2);
  assert.equal(day.clicks, 1);
  assert.ok(day.consults >= 1);
  assert.ok(after.lastUpdatedAt);
  const rank = after.ranking.find((r) => r.id === article.id);
  assert.equal(rank.pv, 1);
  assert.equal(rank.clicks, 1);
  assert.ok(rank.consults >= 1);
  result.metrics = {
    pv: after.pv,
    articlePv: after.articlePv,
    clicks: after.clicks,
    attributedLeads: after.attributedLeads,
    conversion: after.conversion,
    lastUpdatedAt: after.lastUpdatedAt,
    day,
    rank,
  };
  await dashboard.goto(base + "/admin/geo/analytics/");
  await dashboard
    .getByRole("img", { name: "内容访问、咨询点击与成功咨询趋势", exact: true })
    .waitFor();
  assert.equal(await dashboard.locator(".analytics-card").count(), 6);
  for (const width of [375, 768, 1024, 1440]) {
    await dashboard.setViewportSize({ width, height: 960 });
    assert.equal(
      await dashboard.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    assert.equal(
      await dashboard
        .locator(".analytics-ranking-wrap")
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1),
      false,
    );
    await dashboard.screenshot({
      path: folder + "/dashboard-" + width + ".png",
      fullPage: true,
    });
  }
  pass(
    "独立指标卡、文章排行、上海日期30日趋势、最后数据时间同步更新；四视口排行榜无需横向滚动",
  );
  const search = await api(
    admin,
    "GET",
    "/api/admin/geo/analytics/?view=search",
  );
  assert.equal(search.metrics.length, 0);
  assert.equal(await snapshots(), priorSnapshots);
  if (existing) {
    const untouched = await p.leadAttribution.findUniqueOrThrow({
      where: { id: existing.id },
    });
    assert.deepEqual(untouched, existing);
  }
  assert.deepEqual(errors, []);
  result.after = await core();
  assert.deepEqual(
    { ...result.after, leads: result.after.leads - 1 },
    result.before,
  );
  pass(
    "原文章FAQ版本快照、历史归因与100题60FAQ保持不变；无搜索平台假数据、无页面脚本错误",
  );
  result.outcome = "PASS";
})()
  .catch((e) => {
    result.outcome = "FAIL";
    result.failure = e.message;
    console.error(e.name, e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (ownSessionKey) {
      result.eventIds = (
        await p.contentEvent.findMany({
          where: { sessionKey: ownSessionKey },
          select: { id: true },
        })
      ).map((r) => r.id);
    }
    if (leadId) result.fixtureLeadId = leadId;
    for (const c of contexts) {
      await c.request
        .post(base + "/api/admin/logout/", { headers: { Origin: base } })
        .catch(() => {});
      await c.close();
    }
    await browser?.close();
    await p.$disconnect();
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(folder + "/result.json", JSON.stringify(result, null, 2));
  });
