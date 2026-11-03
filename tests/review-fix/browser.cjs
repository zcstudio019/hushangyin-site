const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomBytes, randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client"),
  { hash } = require("@node-rs/argon2");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const p = new PrismaClient({ log: [] }),
  base = "http://127.0.0.1:3000",
  folder = "test-results/review-fix",
  run = randomUUID(),
  marker = "审核合成验收-" + run;
assert.equal(process.env.LOCAL_TEST_MODE, "true");
assert.equal(process.env.SITE_URL, base);
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const ids = { users: [], faqs: [], questions: [], articles: [] },
  contexts = [],
  evidence = { base, checks: [], pageErrors: [], aiCalled: false };
let browser;
const checked = (s) => {
  console.log("PASS: " + s);
  evidence.checks.push(s);
};
async function api(c, method, path, data, status = 200) {
  const r = await c.request.fetch(base + path, {
    method,
    headers: { Origin: base },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(r.status(), status, method + " " + path + " " + r.status());
  const j = await r.json();
  return r.status() < 300 ? j.data : j.error;
}
async function click(pg, name, path, method = "POST", status = 200) {
  const response = pg.waitForResponse(
    (r) => r.url() === base + path && r.request().method() === method,
  );
  await pg.getByRole("button", { name, exact: true }).click();
  const r = await response;
  assert.equal(r.status(), status, path);
  return (await r.json()).data;
}
async function actor(role) {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (pg) =>
    pg.on("pageerror", () => evidence.pageErrors.push("浏览器未捕获异常")),
  );
  const password = randomBytes(24).toString("base64url") + "Aa1!";
  const u = await p.adminUser.create({
    data: {
      name: role === "SUPER_ADMIN" ? "合成独立审核员" : "合成内容人员",
      email: randomUUID() + "@example.invalid",
      passwordHash: await hash(password),
      role,
    },
  });
  ids.users.push(u.id);
  const page = await c.newPage();
  await page.goto(base + "/admin/login/");
  await page.locator('[name="email"]').fill(u.email);
  await page.locator('[name="password"]').fill(password);
  await click(page, "登录", "/api/admin/login/");
  await page.waitForURL(base + "/admin/dashboard/");
  return { c, page, user: u };
}
const source =
  "Next.js官方技术文档（仅软件验收，不作融资事实依据） | https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap | " +
  new Date().toISOString().slice(0, 10);
async function approve(page, kind, id) {
  await page.goto(base + `/admin/geo/${kind}/${id}/`);
  for (const k of [
    "sources",
    "promises",
    "relationships",
    "cases",
    "promotion",
    "privacy",
    "human",
  ])
    await page.locator(`[name="${k}"]`).check();
  await page
    .locator('[name="note"]')
    .fill(
      "已人工核对这是一条明确标记的合成软件验收内容，不包含真实融资产品或客户信息。",
    );
  await click(page, "审核通过", `/api/admin/geo/${kind}/${id}/workflow/`);
  await page.getByRole("button", { name: "发布到官网", exact: true }).waitFor();
}
async function clean() {
  await p.geoQuestion.updateMany({
    where: { id: { in: ids.questions } },
    data: { articleId: null },
  });
  await p.contentReview.deleteMany({
    where: {
      OR: [{ articleId: { in: ids.articles } }, { faqId: { in: ids.faqs } }],
    },
  });
  await p.faqVersion.deleteMany({ where: { faqId: { in: ids.faqs } } });
  await p.faq.deleteMany({ where: { id: { in: ids.faqs } } });
  await p.articleVersion.deleteMany({
    where: { articleId: { in: ids.articles } },
  });
  await p.geoQuestion.deleteMany({ where: { id: { in: ids.questions } } });
  await p.article.deleteMany({ where: { id: { in: ids.articles } } });
  await p.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: ids.users } },
        {
          resourceId: { in: [...ids.faqs, ...ids.articles, ...ids.questions] },
        },
      ],
    },
  });
  await p.adminSession.deleteMany({ where: { adminId: { in: ids.users } } });
  await p.adminUser.deleteMany({ where: { id: { in: ids.users } } });
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const op = await actor("CONTENT_OPERATOR"),
    root = await actor("SUPER_ADMIN"),
    advisor = await actor("FINANCING_ADVISOR");
  const anon = await browser.newContext();
  contexts.push(anon);
  const publicPage = await anon.newPage();
  checked("内容运营、独立超级管理员及顾问均通过实际浏览器登录，未修改原账号");
  await op.page.goto(base + "/admin/geo/faqs/new/");
  await op.page
    .locator('[name="question"]')
    .fill(marker + "：如何理解软件验收？");
  await op.page.locator('[name="category"]').selectOption("融资知识");
  await op.page
    .locator('[name="answer"]')
    .fill("这是虚构软件流程说明，不是融资建议。请评估还款能力与还款风险。");
  await op.page.locator('[name="sources"]').fill(source);
  const faq = await click(
    op.page,
    "保存草稿",
    "/api/admin/geo/faqs/",
    "POST",
    201,
  );
  ids.faqs.push(faq.id);
  await op.page.waitForURL(base + `/admin/geo/faqs/${faq.id}/`);
  const url = base + "/faqs/" + faq.id + "/";
  evidence.faqUrl = url;
  evidence.faqId = faq.id;
  assert.equal((await anon.request.get(url)).status(), 404);
  await click(op.page, "提交审核", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  await op.page
    .getByText("当前账号没有审核权限，请联系超级管理员。", { exact: true })
    .waitFor();
  await api(
    op.c,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
    { action: "publish", revision: 1 },
    403,
  );
  await api(advisor.c, "GET", "/api/admin/geo/reviews/", undefined, 403);
  await api(anon, "GET", "/api/admin/geo/reviews/", undefined, 401);
  await api(
    op.c,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
    { action: "approve", revision: 1 },
    403,
  );
  checked(
    "FAQ草稿/待审核不公开，作者不能发布，顾问与匿名审核API被拒绝，权限提示清楚",
  );
  await root.page.goto(
    base + "/admin/geo/reviews/?type=faqs&q=" + encodeURIComponent(marker),
  );
  const task = root.page.getByRole("row").filter({ hasText: faq.question });
  await task.getByRole("link", { name: "查看与审核" }).click();
  await root.page
    .locator('[name="note"]')
    .fill("合成验收驳回：请明确补充本条仅用于软件验证，不作为融资依据。");
  await click(root.page, "退回修改", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  await op.page.reload();
  await op.page
    .getByRole("heading", { name: "已驳回：请修改后重新提交" })
    .waitFor();
  await api(
    op.c,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
    { action: "submit", revision: 2 },
    409,
  );
  await op.page
    .locator('[name="answer"]')
    .fill(
      "已根据人工审核意见修改：仅用于软件验证，不作融资依据。应评估还款能力与还款风险。",
    );
  await click(op.page, "保存草稿", `/api/admin/geo/faqs/${faq.id}/`, "PATCH");
  await op.page.reload();
  await click(op.page, "提交审核", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  checked("统一审核中心找到任务，驳回原因可见，必须保存修改后才能重新提交");
  await approve(root.page, "faqs", faq.id);
  assert.equal((await anon.request.get(url)).status(), 404);
  await click(
    root.page,
    "发布到官网",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
  );
  await publicPage.goto(url);
  assert.equal(await publicPage.locator("main h1").textContent(), faq.question);
  assert.equal(
    await publicPage.locator('link[rel="canonical"]').getAttribute("href"),
    url,
  );
  const ld = JSON.parse(
    await publicPage
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent(),
  );
  assert.equal(ld["@type"], "FAQPage");
  assert.ok(
    (await publicPage.locator("main").innerText()).includes("融资风险提示"),
  );
  assert.ok(
    (await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      url,
    ),
  );
  const live = await p.faq.findUniqueOrThrow({ where: { id: faq.id } });
  assert.equal(live.publishedRevision, 3);
  assert.equal(live.isLive, true);
  await publicPage.goto(
    base + "/faqs/?category=" + encodeURIComponent("融资知识"),
  );
  await publicPage
    .getByRole("link", { name: faq.question, exact: true })
    .first()
    .waitFor();
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  contexts.push(nojs);
  const html = await nojs.newPage();
  await html.goto(url);
  assert.ok(
    (await html.locator("main").innerText()).includes("仅用于软件验证"),
  );
  checked(
    "独立人工批准后单独发布，公开SSR/分类/独立URL/Canonical/JSON-LD/Sitemap正确",
  );
  await op.page.goto(base + `/admin/geo/faqs/${faq.id}/`);
  await op.page
    .locator('[name="answer"]')
    .fill("未审核的第二版本，只是软件验收修订。应评估还款风险。");
  await click(op.page, "保存草稿", `/api/admin/geo/faqs/${faq.id}/`, "PATCH");
  await publicPage.goto(url);
  assert.ok(
    !(await publicPage.locator("main").innerText()).includes(
      "未审核的第二版本",
    ),
  );
  await api(
    root.c,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
    { action: "publish", revision: 4 },
    409,
  );
  await op.page.reload();
  await click(op.page, "提交审核", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  await approve(root.page, "faqs", faq.id);
  await click(
    root.page,
    "发布到官网",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
  );
  await publicPage.reload();
  assert.ok(
    (await publicPage.locator("main").innerText()).includes("未审核的第二版本"),
  );
  assert.equal(
    (await p.faq.findUniqueOrThrow({ where: { id: faq.id } }))
      .publishedRevision,
    4,
  );
  assert.ok((await p.faqVersion.count({ where: { faqId: faq.id } })) >= 4);
  checked(
    "编辑产生新草稿且原公开快照不变；未审核发布失败不改变线上内容；重新审核后替换同一URL",
  );
  for (const width of [375, 768, 1024, 1440]) {
    for (const [pg, route] of [
      [root.page, "/admin/geo/reviews/?q=" + encodeURIComponent(marker)],
      [op.page, `/admin/geo/faqs/${faq.id}/`],
      [op.page, "/admin/geo/questions/"],
      [publicPage, "/faqs/"],
      [publicPage, "/faqs/" + faq.id + "/"],
    ]) {
      await pg.setViewportSize({ width, height: 900 });
      await pg.goto(base + route);
      assert.equal(
        await pg.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        route + " " + width,
      );
    }
  }
  await root.page.goto(
    base + "/admin/geo/reviews/?q=" + encodeURIComponent(marker),
  );
  await root.page.screenshot({ path: folder + "/reviews.png", fullPage: true });
  checked("审核/编辑/问题库/问答列表/详情共20个视口检查无横向溢出");
  await root.page.goto(base + `/admin/geo/faqs/${faq.id}/`);
  await click(root.page, "下线内容", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  assert.equal((await anon.request.get(url)).status(), 404);
  assert.ok(
    !(await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      url,
    ),
  );
  const reviews = await p.contentReview.findMany({ where: { faqId: faq.id } });
  assert.equal(reviews.length, 3);
  assert.ok(reviews.every((r) => r.reviewerId === root.user.id));
  assert.ok(
    (await p.auditLog.count({
      where: { resourceId: faq.id, action: "CONTENT_PUBLISH" },
    })) >= 2,
  );
  checked(
    "FAQ下线返回404并移出Sitemap，审核决定/原因/版本/人/时间与发布审计持久保存",
  );
  await op.page.goto(base + "/admin/geo/questions/new/");
  await op.page
    .locator('[name="question"]')
    .fill(marker + "：内部问题如何转成文章？");
  await op.page.locator('[name="category"]').selectOption("融资知识");
  const q = await click(
    op.page,
    "保存问题",
    "/api/admin/geo/questions/",
    "POST",
    201,
  );
  ids.questions.push(q.id);
  await op.page.waitForURL(base + `/admin/geo/questions/${q.id}/`);
  const qp = {
    question: q.question,
    category: q.category,
    keywords: q.keywords,
    intent: q.intent,
    priority: q.priority,
    status: "ANSWERED",
    articleId: null,
  };
  await api(op.c, "PATCH", `/api/admin/geo/questions/${q.id}/`, qp, 400);
  await op.page
    .getByRole("link", { name: "从此问题创建文章", exact: true })
    .click();
  await op.page.waitForURL(/\/admin\/geo\/articles\/new\/\?questionId=/);
  assert.equal(
    await op.page.locator('[name="title"]').inputValue(),
    q.question,
  );
  await op.page.locator('[name="slug"]').fill("review-fix-" + run);
  await op.page
    .locator('[name="summary"]')
    .fill("这是一篇人工软件验收文章，非AI生成。");
  await op.page
    .locator('[name="content"]')
    .fill(
      "## 软件验收\n仅验证内部问题转成文章的流程，不包含真实业务资料。\n\n## 风险提示\n本页不构成融资建议，应评估还款能力与还款风险。",
    );
  await op.page.locator('[name="sources"]').fill(source);
  const a = await click(
    op.page,
    "保存草稿",
    "/api/admin/geo/articles/",
    "POST",
    201,
  );
  ids.articles.push(a.id);
  await op.page.waitForURL(base + `/admin/geo/articles/${a.id}/`);
  assert.equal(
    (await p.geoQuestion.findUniqueOrThrow({ where: { id: q.id } })).status,
    "PLANNED",
  );
  assert.equal(
    (await p.geoQuestion.findUniqueOrThrow({ where: { id: q.id } })).articleId,
    a.id,
  );
  await click(op.page, "提交审核", `/api/admin/geo/articles/${a.id}/workflow/`);
  await approve(root.page, "articles", a.id);
  await click(
    root.page,
    "发布到官网",
    `/api/admin/geo/articles/${a.id}/workflow/`,
  );
  assert.equal(
    (await p.geoQuestion.findUniqueOrThrow({ where: { id: q.id } })).status,
    "ANSWERED",
  );
  await op.page.goto(base + `/admin/geo/questions/${q.id}/`);
  await op.page
    .getByRole("link", { name: "查看公开文章", exact: true })
    .waitFor();
  assert.ok((await op.page.locator("main").innerText()).includes("已解答"));
  const articleUrl = base + "/insights/" + a.slug + "/";
  assert.equal((await anon.request.get(articleUrl)).status(), 200);
  evidence.articleUrl = articleUrl;
  evidence.questionId = q.id;
  checked("内部选题→人工文章草稿关联→独立审核发布→已解答回写→关联文章可查看");
  await root.page
    .getByRole("button", { name: "下线内容", exact: true })
    .waitFor();
  await click(
    root.page,
    "下线内容",
    `/api/admin/geo/articles/${a.id}/workflow/`,
  );
  assert.equal(
    (await p.geoQuestion.findUniqueOrThrow({ where: { id: q.id } })).status,
    "PLANNED",
  );
  await api(
    op.c,
    "PATCH",
    `/api/admin/geo/questions/${q.id}/`,
    { ...qp, articleId: a.id },
    400,
  );
  await api(op.c, "PATCH", `/api/admin/geo/questions/${q.id}/`, {
    ...qp,
    status: "ARCHIVED",
    articleId: a.id,
  });
  await api(op.c, "PATCH", `/api/admin/geo/questions/${q.id}/`, {
    ...qp,
    status: "OPEN",
    articleId: a.id,
  });
  assert.equal(
    (await p.geoQuestion.findUniqueOrThrow({ where: { id: q.id } })).status,
    "PLANNED",
  );
  assert.ok(
    (await p.auditLog.count({
      where: { resourceId: q.id, action: "QUESTION_STATUS_CHANGE" },
    })) >= 5,
  );
  checked("文章下线回算、禁止伪造已解答、归档恢复与状态变更历史均真实入库");
  const own = await api(
    root.c,
    "POST",
    "/api/admin/geo/faqs/",
    {
      question: marker + "：审核员自己的选题？",
      answer: "合成验收说明，不涉及真实融资建议。",
      category: "融资知识",
      articleId: null,
      sources: [],
    },
    201,
  );
  ids.faqs.push(own.id);
  await api(root.c, "POST", `/api/admin/geo/faqs/${own.id}/workflow/`, {
    action: "submit",
    revision: 1,
  });
  await root.page.goto(base + `/admin/geo/faqs/${own.id}/`);
  await root.page
    .getByText(
      "此版本由你参与创作、编辑、导入或提交，不能自审。请分配另一位有权限的独立审核人员。",
      { exact: true },
    )
    .waitFor();
  const denied = await api(
    root.c,
    "POST",
    `/api/admin/geo/faqs/${own.id}/workflow/`,
    { action: "approve", revision: 1 },
    403,
  );
  assert.equal(denied.code, "INDEPENDENT_REVIEW");
  assert.ok(
    (await p.auditLog.count({
      where: { resourceId: own.id, action: "CONTENT_POLICY_DENIED" },
    })) > 0,
  );
  checked("超级管理员仍不能自审；前端明确原因，服务端也拒绝");
  assert.equal(evidence.pageErrors.length, 0);
  evidence.status = "真实浏览器流程已通过；仅本地虚构内容，未调用AI";
}
main()
  .catch((e) => {
    console.error(e.message);
    evidence.failed = e.message;
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await clean();
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
