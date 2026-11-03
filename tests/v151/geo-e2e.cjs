const fs = require("node:fs");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { PrismaClient } = require(
  process.env.DATABASE_PROVIDER === "sqlite"
    ? "@hsy/sqlite-client"
    : "@prisma/client",
);
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const base = process.env.TEST_URL || "http://127.0.0.1:3000",
  folder =
    (process.env.DATABASE_PROVIDER === "sqlite"
      ? "test-results/v16/"
      : "test-results/") + "v151",
  run = randomBytes(6).toString("hex"),
  marker = "V151合成-" + run;
assert.equal(process.env.SITE_URL, base);
assert.equal(process.env.LOCAL_TEST_MODE, "true");
if (process.env.DATABASE_PROVIDER === "sqlite")
  assert.ok(
    process.env.DATABASE_URL.startsWith("file:") &&
      process.env.LOCAL_TEST_MODE === "true",
  );
else assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const p = new PrismaClient({ log: [] }),
  users = [],
  departments = [],
  articles = [],
  faqs = [],
  questions = [],
  leads = [],
  contexts = [];
const evidence = { run, base, checks: [], pageErrors: [] };
let browser;
const check = (s) => {
  console.log("PASS: " + s);
  evidence.checks.push(s);
};
async function ctx() {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (page) =>
    page.on("pageerror", () => evidence.pageErrors.push("uncaught error")),
  );
  return c;
}
async function api(c, method, path, data, status = 200) {
  const r = await c.request.fetch(base + path, {
    method,
    headers: { Origin: base },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(
    r.status(),
    status,
    method + " " + path + " status " + r.status(),
  );
  const j = await r.json();
  if (status < 300) assert.equal(j.ok, true);
  return j.data || j.error;
}
const login = (c, email, password) =>
  api(c, "POST", "/api/admin/login/", { email, password });
async function clickPost(page, name, path, status = 200) {
  const response = page.waitForResponse(
    (r) => r.url() === base + path && r.request().method() === "POST",
  );
  await page.getByRole("button", { name, exact: true }).click();
  const r = await response;
  assert.equal(r.status(), status);
  return (await r.json()).data;
}
const reviewKeys = [
    "sources",
    "promises",
    "relationships",
    "cases",
    "promotion",
    "privacy",
    "human",
  ],
  checks = Object.fromEntries(reviewKeys.map((k) => [k, true]));
const sources = [
  {
    title: "Next.js官方文档：Sitemap技术约定（仅合成系统测试）",
    url: "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap",
    checkedAt: new Date().toISOString().slice(0, 10),
  },
];
async function reviewBrowser(page, kind, id) {
  await page.goto(base + `/admin/geo/${kind}/${id}/`);
  if (kind === "faqs") await page.locator('[name="riskConfirmed"]').check();
  else for (const k of reviewKeys) await page.locator(`[name="${k}"]`).check();
  await page
    .locator('[name="note"]')
    .fill("已人工检查本条合成系统测试内容，无金融产品或审批承诺，无客户资料。");
  await clickPost(page, "审核通过", `/api/admin/geo/${kind}/${id}/workflow/`);
  await page.getByRole("button", { name: "发布到官网", exact: true }).waitFor();
  await clickPost(page, "发布到官网", `/api/admin/geo/${kind}/${id}/workflow/`);
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  const preservationBaseline = {
    leads: await p.lead.findMany({ select: { id: true } }),
    users: await p.adminUser.findMany({
      select: { id: true, role: true, passwordHash: true },
    }),
    departments: await p.department.findMany({ select: { id: true } }),
  };
  browser = await chromium.launch({
    executablePath:
      process.env.BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const root = await ctx(),
    op = await ctx(),
    anon = await ctx(),
    advisor = await ctx();
  const credentials = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  await login(root, credentials.adminEmail, credentials.adminPassword);
  const reauth = { reauthPassword: credentials.adminPassword };
  const dept = await api(
    root,
    "POST",
    "/api/admin/departments/",
    { name: marker, isActive: true, ...reauth },
    201,
  );
  departments.push(dept.id);
  async function employee(c, role, label, deptId) {
    const u = await api(
      root,
      "POST",
      "/api/admin/users/",
      {
        name: marker + "-" + label,
        email: `geo-${run}-${label}@example.test`,
        role,
        departmentId: deptId,
        isActive: true,
        ...reauth,
      },
      201,
    );
    users.push(u.user.id);
    const final = randomBytes(20).toString("hex") + "-G7!";
    await login(c, u.user.email, u.initialPassword);
    await api(c, "PATCH", "/api/admin/profile/", {
      oldPassword: u.initialPassword,
      newPassword: final,
      confirmation: final,
    });
    return { ...u.user, password: final };
  }
  const operator = await employee(op, "CONTENT_OPERATOR", "editor", null),
    agent = await employee(advisor, "FINANCING_ADVISOR", "advisor", dept.id);
  await login(advisor, agent.email, agent.password);
  const page = await op.newPage();
  await page.goto(base + "/admin/login/");
  await page.locator('[name="email"]').fill(operator.email);
  await page.locator('[name="password"]').fill(operator.password);
  await page.locator("form button").click();
  await page.waitForURL(base + "/admin/dashboard/");
  await page.getByRole("link", { name: "GEO内容中心", exact: true }).click();
  await page.waitForURL(base + "/admin/geo/");
  check("content operator browser login and actual GEO dashboard");
  await api(op, "GET", "/api/admin/leads/", undefined, 403);
  await api(advisor, "GET", "/api/admin/geo/articles/", undefined, 403);
  await api(anon, "GET", "/api/admin/geo/articles/", undefined, 401);
  check(
    "existing RBAC blocks customer data from content operators and GEO data from advisors/anonymous",
  );
  await page.goto(base + "/admin/geo/questions/new/");
  await page.locator('[name="question"]').fill(marker + "：系统测试问题");
  await page.locator('[name="category"]').selectOption("融资规划");
  await page.locator('[name="keywords"]').fill("合成,流程");
  await page.locator('[name="intent"]').selectOption("PREPARATION");
  await page.locator('[name="priority"]').selectOption("1");
  const question = await clickPost(
    page,
    "保存问题",
    "/api/admin/geo/questions/",
    201,
  );
  questions.push(question.id);
  await page.waitForURL(base + `/admin/geo/questions/${question.id}/`);
  check(
    "browser question creation with category, keywords, intent and priority",
  );
  const csv =
    'question,category,keywords,intent,priority,status\n"' +
    marker +
    '：CSV,问题一",融资规划,合成|系统,AWARENESS,2,OPEN\n' +
    marker +
    "：CSV问题二,融资风险与合规,合成,DECISION,3,OPEN";
  await page.goto(base + "/admin/geo/questions/");
  const csvForm = page.getByTestId("questions-csv-import");
  await csvForm.locator("summary").click();
  await csvForm.getByRole("radio", { name: "粘贴文本", exact: true }).check();
  await csvForm.locator("textarea").fill(csv);
  await clickPost(page, "解析与预览", "/api/admin/geo/questions/import/", 200);
  await csvForm.getByRole("checkbox").check();
  const imported = await clickPost(
    page,
    "确认导入",
    "/api/admin/geo/questions/import/",
    201,
  );
  assert.equal(imported.count, 2);
  questions.push(
    ...(
      await p.geoQuestion.findMany({
        where: { question: { startsWith: marker + "：CSV" } },
        select: { id: true },
      })
    ).map((q) => q.id),
  );
  const count = await p.geoQuestion.count();
  const skipped = await api(
    op,
    "POST",
    "/api/admin/geo/questions/import/",
    { csv },
    201,
  );
  assert.equal(skipped.count, 0);
  assert.equal(skipped.skippedCount, 2);
  assert.equal(await p.geoQuestion.count(), count);
  check(
    "actual CSV browser preview/confirm import and duplicate skip without overwrite",
  );
  const slug = "geo-test-" + run,
    title = marker + "：内容流程验收（非金融建议）",
    summary = "本页仅为系统流程合成测试，不构成融资产品、利率或授信建议。";
  const content =
    '## 测试说明\n本页仅验证内容运营系统，不包含真实客户信息。\n\n### 安全渲染\n- 人工保存草稿\n- 人工审核\n\n1. 检查内容\n2. 发布测试\n\n| 项目 | 说明 |\n| --- | --- |\n| 类型 | 合成测试 |\n\n> 内容为合成测试，不构成融资建议。\n\n[知识库](/insights/)\n\n<img src=x onerror="window.__geoXss=1">\n\n[危险链接](javascript:alert(1))';
  await page.goto(base + "/admin/geo/articles/new/");
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="slug"]').fill(slug);
  await page.locator('[name="summary"]').fill(summary);
  await page.locator('[name="category"]').selectOption("融资规划");
  await page.locator('[name="tags"]').fill("合成测试,流程验证");
  await page.locator('[name="content"]').fill(content);
  await page
    .locator('[name="sources"]')
    .fill(
      sources.map((s) => `${s.title} | ${s.url} | ${s.checkedAt}`).join("\n"),
    );
  await page.locator('[name="aiAssisted"]').check();
  const article = await clickPost(
    page,
    "保存草稿",
    "/api/admin/geo/articles/",
    201,
  );
  articles.push(article.id);
  await page.waitForURL(base + `/admin/geo/articles/${article.id}/`);
  evidence.article = {
    id: article.id,
    url: base + `/insights/${slug}/`,
    title,
  };
  const publicUrl = base + `/insights/${slug}/`,
    preview = await op.newPage();
  assert.equal((await anon.request.get(publicUrl)).status(), 404);
  await preview.goto(base + `/admin/geo/articles/${article.id}/preview/`);
  assert.equal(
    await preview.locator('img[onerror],a[href^="javascript:"]').count(),
    0,
  );
  assert.equal(await preview.evaluate(() => window.__geoXss), undefined);
  await preview.locator("h1").filter({ hasText: title }).waitFor();
  const anonPreview = await anon.request.get(
    base + `/admin/geo/articles/${article.id}/preview/`,
    { maxRedirects: 0 },
  );
  assert.ok([303, 307].includes(anonPreview.status()));
  check(
    "draft browser preview authenticated and raw HTML/unsafe links do not execute",
  );
  await clickPost(
    page,
    "提交审核",
    `/api/admin/geo/articles/${article.id}/workflow/`,
  );
  let current = await api(op, "GET", `/api/admin/geo/articles/${article.id}/`);
  const articlePayload = {
    title,
    slug,
    summary,
    content,
    category: "融资规划",
    tags: ["合成测试"],
    sources,
    relatedIds: [],
    aiAssisted: true,
    revision: current.revision,
  };
  await api(
    op,
    "PATCH",
    `/api/admin/geo/articles/${article.id}/`,
    articlePayload,
    409,
  );
  await api(
    op,
    "POST",
    `/api/admin/geo/articles/${article.id}/workflow/`,
    {
      action: "approve",
      revision: current.revision,
      checklist: checks,
      note: "普通运营人员不应拥有审核权限。",
    },
    403,
  );
  await api(
    root,
    "POST",
    `/api/admin/geo/articles/${article.id}/workflow/`,
    { action: "publish", revision: current.revision },
    409,
  );
  await api(
    root,
    "POST",
    `/api/admin/geo/articles/${article.id}/workflow/`,
    {
      action: "approve",
      revision: current.revision,
      checklist: { ...checks, privacy: false },
      note: "必须完成所有人工安全核验后通过。",
    },
    400,
  );
  check(
    "pending edit lock, reviewer privilege, complete checklist and publish-before-approval gates",
  );
  const reviewPage = await root.newPage();
  await reviewBrowser(reviewPage, "articles", article.id);
  await api(
    op,
    "POST",
    `/api/admin/geo/articles/${article.id}/workflow/`,
    { action: "publish", revision: current.revision },
    403,
  );
  check(
    "actual browser submit → independent human checklist approval → authorized publish",
  );
  const own = await api(
    root,
    "POST",
    "/api/admin/geo/articles/",
    { ...articlePayload, slug: "geo-self-" + run },
    201,
  );
  articles.push(own.id);
  await api(root, "POST", `/api/admin/geo/articles/${own.id}/workflow/`, {
    action: "submit",
    revision: own.revision,
  });
  await api(
    root,
    "POST",
    `/api/admin/geo/articles/${own.id}/workflow/`,
    {
      action: "approve",
      revision: own.revision,
      checklist: checks,
      note: "同一编辑人员不得审核自己的版本。",
    },
    403,
  );
  const expired = await api(
    op,
    "POST",
    "/api/admin/geo/articles/",
    {
      ...articlePayload,
      slug: "geo-expired-" + run,
      sources: [
        { ...sources[0], checkedAt: "2020-01-01", validUntil: "2020-01-02" },
      ],
    },
    201,
  );
  articles.push(expired.id);
  await api(op, "POST", `/api/admin/geo/articles/${expired.id}/workflow/`, {
    action: "submit",
    revision: expired.revision,
  });
  await api(
    root,
    "POST",
    `/api/admin/geo/articles/${expired.id}/workflow/`,
    {
      action: "approve",
      revision: expired.revision,
      checklist: checks,
      note: "合成测试：过期的来源不应允许通过。",
    },
    400,
  );
  check(
    "independent reviewer and source effective-date gates cannot be bypassed",
  );
  const publicPage = await anon.newPage();
  await publicPage.goto(publicUrl);
  await publicPage.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(await publicPage.title(), title + "｜沪上银融资知识");
  assert.equal(
    await publicPage
      .locator('meta[name="description"]')
      .getAttribute("content"),
    summary,
  );
  assert.equal(
    await publicPage.locator('link[rel="canonical"]').getAttribute("href"),
    publicUrl,
  );
  assert.equal(
    await publicPage.locator('img[onerror],a[href^="javascript:"]').count(),
    0,
  );
  assert.equal(await publicPage.evaluate(() => window.__geoXss), undefined);
  assert.equal(await publicPage.locator(".geo-prose table").count(), 1);
  assert.equal(await publicPage.locator(".geo-prose blockquote").count(), 1);
  const ld = JSON.parse(
    await publicPage
      .locator('script[type="application/ld+json"]')
      .last()
      .textContent(),
  );
  assert.ok(
    ld.some(
      (s) =>
        s["@type"] === "Article" &&
        s.datePublished &&
        s.author.name === operator.name,
    ),
  );
  await publicPage.screenshot({
    path: folder + "/published.png",
    fullPage: true,
  });
  await publicPage.goto(base + "/insights/");
  await publicPage.locator(`a[href="/insights/${slug}/"]`).waitFor();
  assert.ok(
    (await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      publicUrl,
    ),
  );
  const alias = await anon.request.get(base + "/knowledge/", {
    maxRedirects: 0,
  });
  assert.equal(alias.status(), 308);
  assert.equal(
    new URL(alias.headers().location, base).href,
    base + "/insights/",
  );
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await nojs.newPage();
  await staticPage.goto(publicUrl);
  assert.ok((await staticPage.locator("main").innerText()).includes(summary));
  await nojs.close();
  check(
    "published SSR, index, canonical/title/description/Article JSON-LD, immediate sitemap and knowledge alias",
  );
  await page.goto(base + "/admin/geo/faqs/new/");
  await page.locator('[name="question"]').fill(marker + "：这是金融承诺吗？");
  await page
    .locator('[name="answer"]')
    .fill("不是。本条是合成系统测试，不涉及授信、放款或审批承诺。");
  await page.locator('[name="category"]').selectOption("融资风险与合规");
  await page.locator('[name="articleId"]').selectOption(article.id);
  await page
    .locator('[name="sources"]')
    .fill(
      sources.map((s) => `${s.title} | ${s.url} | ${s.checkedAt}`).join("\n"),
    );
  const faq = await clickPost(page, "保存草稿", "/api/admin/geo/faqs/", 201);
  faqs.push(faq.id);
  await page.waitForURL(base + `/admin/geo/faqs/${faq.id}/`);
  await clickPost(page, "提交审核", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  await reviewBrowser(reviewPage, "faqs", faq.id);
  await publicPage.goto(publicUrl);
  await publicPage
    .getByText(marker + "：这是金融承诺吗？", { exact: true })
    .waitFor();
  assert.ok(
    (
      await publicPage
        .locator('script[type="application/ld+json"]')
        .last()
        .textContent()
    ).includes("FAQPage"),
  );
  check("real FAQ draft/review/publish and linked public FAQ rendering");
  await api(op, "PATCH", `/api/admin/geo/questions/${question.id}/`, {
    question: question.question,
    category: "融资规划",
    keywords: ["合成"],
    intent: "PREPARATION",
    priority: 1,
    status: "ANSWERED",
    articleId: article.id,
  });
  check("question associates real article and supports status updates");
  // Article CTA really reaches the existing consultation form and PostgreSQL.
  await publicPage.locator("[data-article-cta]").click();
  await publicPage.waitForURL("**/contact/?article=*");
  const contact = new URL(publicPage.url());
  contact.searchParams.set("utm_source", "geo-local");
  contact.searchParams.set("utm_campaign", "v151-" + run);
  await publicPage.goto(contact.href);
  await publicPage.locator('[name="name"]').fill(marker);
  await publicPage
    .locator('[name="phone"]')
    .fill(
      "1990000" +
        String(parseInt(run.slice(0, 6), 16) % 10000).padStart(4, "0"),
    );
  await publicPage.locator('[name="customerType"]').selectOption("PERSONAL");
  await publicPage
    .locator('[name="financingAmount"]')
    .selectOption("50万元以内");
  await publicPage.locator('[name="consent"]').check();
  const consulted = await clickPost(
    publicPage,
    "提交咨询需求 ↗",
    "/api/consultations/",
    201,
  );
  leads.push(consulted.reference);
  await publicPage.locator(".form-feedback.success").waitFor();
  const lead = await p.lead.findUniqueOrThrow({
    where: { id: consulted.reference },
    include: { consents: true },
  });
  assert.equal(lead.sourceArticleId, article.id);
  assert.equal(lead.sourcePage, "/insights/" + slug + "/");
  // Signed CTA context is authoritative; URL parameters added afterwards must not override it.
  assert.equal(lead.sourceParameters.utm_source, undefined);
  const attribution = await p.leadAttribution.findUniqueOrThrow({
    where: { leadId: lead.id },
  });
  assert.equal(attribution.confidence, "SIGNED_CONTEXT");
  assert.equal(attribution.articleId, article.id);
  assert.equal(lead.consents.length, 1);
  evidence.consultation = {
    status: 201,
    reference: lead.id,
    sourceArticleId: article.id,
  };
  await api(op, "GET", `/api/admin/leads/${lead.id}/`, undefined, 403);
  await reviewPage.goto(base + `/admin/leads/${lead.id}/`);
  assert.ok(
    (await reviewPage.locator(".lead-details").innerText()).includes(
      article.id,
    ),
  );
  const invalid = {
    name: marker,
    phone: "19900000000",
    customerType: "PERSONAL",
    financingAmount: "50万元以内",
    sourcePage: "/contact/",
    consent: true,
  };
  await api(
    anon,
    "POST",
    "/api/consultations/",
    { ...invalid, sourceArticleId: "c000000000000000000000000" },
    400,
  );
  await api(
    anon,
    "POST",
    "/api/consultations/",
    { ...invalid, sourceParameters: { utm_source: "19900000000" } },
    400,
  );
  check(
    "article CTA → actual consultation POST201 → same lead/consent transaction and validated attribution, admin readable only",
  );
  current = await api(op, "GET", `/api/admin/geo/articles/${article.id}/`);
  const changed = await api(
    op,
    "PATCH",
    `/api/admin/geo/articles/${article.id}/`,
    {
      ...articlePayload,
      title: title + "（修订）",
      content: "## 修订草稿\n" + content,
      revision: current.revision,
    },
  );
  await publicPage.goto(publicUrl);
  assert.equal(await publicPage.locator("h1").textContent(), title);
  await api(
    op,
    "PATCH",
    `/api/admin/geo/articles/${article.id}/`,
    articlePayload,
    409,
  );
  await api(op, "POST", `/api/admin/geo/articles/${article.id}/workflow/`, {
    action: "submit",
    revision: changed.revision,
  });
  await reviewBrowser(reviewPage, "articles", article.id);
  await publicPage.goto(publicUrl);
  assert.equal(
    await publicPage.locator("h1").textContent(),
    title + "（修订）",
  );
  check(
    "editing keeps old published snapshot, stale versions rejected, changes require re-review before replacement",
  );
  const restored = await api(
    op,
    "POST",
    `/api/admin/geo/articles/${article.id}/workflow/`,
    { action: "restore", revision: changed.revision, version: 1 },
  );
  await api(
    root,
    "POST",
    `/api/admin/geo/articles/${article.id}/workflow/`,
    { action: "publish", revision: restored.revision },
    409,
  );
  const restoredArticle = await api(
    op,
    "GET",
    `/api/admin/geo/articles/${article.id}/`,
  );
  assert.equal(restoredArticle.title, title);
  assert.equal(restoredArticle.status, "DRAFT");
  await api(
    op,
    "PATCH",
    `/api/admin/geo/articles/${article.id}/`,
    { ...articlePayload, slug: slug + "-changed", revision: restored.revision },
    409,
  );
  check(
    "history restore creates a new draft, invalidates approval and preserves stable public URL",
  );
  await api(op, "POST", `/api/admin/geo/articles/${article.id}/workflow/`, {
    action: "submit",
    revision: restored.revision,
  });
  await api(root, "POST", `/api/admin/geo/articles/${article.id}/workflow/`, {
    action: "reject",
    revision: restored.revision,
    note: "合成验收：退回当前恢复版本，后续仍需重新编辑和审核。",
  });
  const rejected = await api(
    op,
    "GET",
    `/api/admin/geo/articles/${article.id}/`,
  );
  assert.equal(rejected.status, "DRAFT");
  await api(
    op,
    "POST",
    `/api/admin/geo/articles/${article.id}/workflow/`,
    { action: "submit", revision: rejected.revision },
    409,
  );
  const resaved = await api(
    op,
    "PATCH",
    `/api/admin/geo/articles/${article.id}/`,
    {
      title: rejected.title,
      slug: rejected.slug,
      summary: rejected.summary,
      content: rejected.content + "\n\n已根据合成审核意见修订。",
      category: rejected.category,
      tags: rejected.tags,
      sources: rejected.sources,
      relatedIds: rejected.relatedFrom.map((r) => r.toId),
      aiAssisted: rejected.aiAssisted,
      revision: rejected.revision,
    },
  );
  await api(op, "POST", `/api/admin/geo/articles/${article.id}/workflow/`, {
    action: "submit",
    revision: resaved.revision,
  });
  await api(op, "POST", `/api/admin/geo/articles/${article.id}/workflow/`, {
    action: "withdraw",
    revision: resaved.revision,
  });
  check("reject and withdraw preserve version history and return to draft");
  for (const width of [375, 768, 1024, 1440])
    for (const route of [
      "/admin/geo/",
      "/admin/geo/articles/",
      "/admin/geo/questions/",
      "/admin/geo/faqs/",
      `/admin/geo/articles/${article.id}/`,
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + route);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        route + " " + width,
      );
    }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/admin/geo/");
  await page.screenshot({ path: folder + "/dashboard.png", fullPage: true });
  check("20 actual GEO page viewport checks at375/768/1024/1440");
  const f = await api(op, "GET", `/api/admin/geo/faqs/${faq.id}/`);
  await api(root, "POST", `/api/admin/geo/faqs/${faq.id}/workflow/`, {
    action: "offline",
    revision: f.revision,
  });
  await publicPage.goto(publicUrl);
  assert.equal(
    await publicPage
      .getByText(marker + "：这是金融承诺吗？", { exact: true })
      .count(),
    0,
  );
  const final = await api(op, "GET", `/api/admin/geo/articles/${article.id}/`);
  await api(root, "POST", `/api/admin/geo/articles/${article.id}/workflow/`, {
    action: "offline",
    revision: final.revision,
  });
  assert.equal((await anon.request.get(publicUrl)).status(), 404);
  assert.ok(
    !(await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      publicUrl,
    ),
  );
  await api(op, "PATCH", `/api/admin/geo/questions/${question.id}/`, {
    question: question.question,
    category: "融资规划",
    keywords: [],
    intent: "AWARENESS",
    priority: 3,
    status: "ARCHIVED",
    articleId: article.id,
  });
  check(
    "FAQ and article offline hide public content and immediately remove sitemap URL; question archive",
  );
  const logs = await p.auditLog.findMany({
    where: { resourceId: article.id },
    select: { action: true },
  });
  for (const a of [
    "ARTICLE_SAVE",
    "CONTENT_SUBMIT",
    "CONTENT_APPROVE",
    "CONTENT_PUBLISH",
    "ARTICLE_RESTORE",
    "CONTENT_REJECT",
    "CONTENT_WITHDRAW",
    "CONTENT_OFFLINE",
  ])
    assert.ok(
      logs.some((l) => l.action === a),
      a,
    );
  check(
    "versioned content workflow publication and offline audits persist in database",
  );
  const before = preservationBaseline;
  for (const l of before.leads)
    assert.ok(await p.lead.findUnique({ where: { id: l.id } }));
  for (const u of before.users) {
    const now = await p.adminUser.findUniqueOrThrow({ where: { id: u.id } });
    assert.ok(
      now.passwordHash === u.passwordHash,
      "original password hash remains unchanged",
    );
    assert.equal(now.role, u.role);
  }
  for (const d of before.departments)
    assert.ok(await p.department.findUnique({ where: { id: d.id } }));
  const legacy = require("../../src/features/content/legacy-pages.json");
  for (const [path, old] of Object.entries(legacy).filter(
    ([k]) => k.startsWith("/insights/") && k != "/insights/",
  )) {
    const a = await p.article.findUniqueOrThrow({
      where: { slug: path.split("/")[2] },
    });
    assert.equal(a.publishedSnapshot.legacyHtml, old.html);
    assert.equal((await anon.request.get(base + path)).status(), 200);
  }
  check(
    "all pre-existing users/roles/passwords/leads/departments and four original article bodies/URLs preserved",
  );
  assert.deepEqual(evidence.pageErrors, []);
  evidence.outcome = "PASS";
}
main()
  .catch((e) => {
    console.error("GEO verification failed:", e.name, e.message);
    evidence.outcome = "FAIL";
    evidence.failure = e.name;
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await p.$transaction(async (tx) => {
        await tx.consent.deleteMany({ where: { leadId: { in: leads } } });
        await tx.lead.deleteMany({
          where: { id: { in: leads }, name: marker },
        });
        await tx.contentReview.deleteMany({
          where: {
            OR: [{ articleId: { in: articles } }, { faqId: { in: faqs } }],
          },
        });
        await tx.articleVersion.deleteMany({
          where: { articleId: { in: articles } },
        });
        await tx.articleRelation.deleteMany({
          where: {
            OR: [{ fromId: { in: articles } }, { toId: { in: articles } }],
          },
        });
        await tx.geoQuestion.deleteMany({
          where: { id: { in: questions }, question: { startsWith: marker } },
        });
        await tx.faqVersion.deleteMany({ where: { faqId: { in: faqs } } });
        await tx.faq.deleteMany({
          where: { id: { in: faqs }, question: { startsWith: marker } },
        });
        await tx.article.deleteMany({
          where: {
            id: { in: articles },
            title: { startsWith: marker },
          },
        });
        await tx.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: users } },
              {
                resourceId: {
                  in: [
                    ...users,
                    ...departments,
                    ...articles,
                    ...faqs,
                    ...questions,
                    ...leads,
                  ],
                },
              },
            ],
          },
        });
        await tx.adminUser.deleteMany({
          where: { id: { in: users }, email: { startsWith: "geo-" + run } },
        });
        await tx.department.deleteMany({
          where: { id: { in: departments }, name: marker },
        });
      });
      evidence.syntheticCleaned = true;
    } catch {
      evidence.syntheticCleaned = false;
      process.exitCode = 1;
    }
    for (const c of contexts) await c.close();
    if (browser) await browser.close();
    await p.$disconnect();
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(
      folder + "/result.json",
      JSON.stringify(evidence, null, 2),
    );
  });
