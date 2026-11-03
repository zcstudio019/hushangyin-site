const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID, randomBytes } = require("node:crypto");
const { hash } = require("@node-rs/argon2");
const { PrismaClient } = require("@prisma/client");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = "http://127.0.0.1:3000",
  p = new PrismaClient({ log: [] }),
  folder = "test-results/v153";
assert.equal(process.env.LOCAL_TEST_MODE, "true");
assert.equal(process.env.SITE_URL, base);
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const evidence = {
    base,
    mode: "实际浏览器 + 原本地 PostgreSQL；未配置密钥、未调用 AI",
    checks: [],
    pageErrors: [],
    screenshots: [],
  },
  userIds = [],
  taskIds = [],
  articleIds = [],
  questionIds = [],
  sourceIds = [],
  contexts = [];
let browser;
const check = (s) => {
  evidence.checks.push(s);
  console.log("PASS: " + s);
};
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
async function context() {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (page) =>
    page.on("pageerror", () => evidence.pageErrors.push("页面未捕获异常")),
  );
  return c;
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const root = await context(),
    op = await context(),
    other = await context(),
    anon = await context();
  async function user(c, role) {
    const password = randomBytes(24).toString("base64url") + "Aa1!";
    const u = await p.adminUser.create({
      data: {
        name: "合成内容验收人员",
        email: randomUUID() + "@example.invalid",
        passwordHash: await hash(password),
        role,
        isActive: true,
      },
    });
    userIds.push(u.id);
    await api(c, "POST", "/api/admin/login/", { email: u.email, password });
    return u;
  }
  const administrator = await user(root, "SUPER_ADMIN");
  const operator = await user(op, "CONTENT_OPERATOR");
  await user(other, "CONTENT_OPERATOR");
  const topic = await p.geoQuestion.findFirst({
    where: {
      OR: [
        { question: { contains: "企业有利润却缺现金流" } },
        { question: { contains: "先融资还是先改善回款" } },
      ],
    },
  });
  assert.ok(topic, "指定知识库问题必须存在");
  evidence.topicId = topic.id;
  evidence.actualTopic = topic.question;
  const before = {
    questions: await p.geoQuestion.count(),
    faqs: await p.faq.count(),
    articles: await p.article.count(),
    tasks: await p.geoGenerationTask.count(),
    leads: await p.lead.count(),
  };
  const page = await op.newPage();
  await page.goto(base + "/admin/geo/generation/");
  await page
    .getByRole("heading", { name: "AI 内容创作工作台", exact: true })
    .waitFor();
  await page.locator("select").first().selectOption(topic.id);
  await page
    .getByText("未找到经过人工审核的相关问答；待审核问答不会作为事实依据。", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "生成文章草稿", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("link", { name: "写作模板与参考资料", exact: true })
      .count(),
    0,
  );
  check("指定真实问题可选择；已审核 FAQ 为零时明确警告；缺失密钥不可生成");
  const k = await api(
    op,
    "GET",
    "/api/admin/geo/generation/?view=knowledge&questionId=" + topic.id,
  );
  assert.equal(k.faqs.length, 0);
  check("原 60 组待审核 FAQ 未作为已核验事实外发");
  const payload = {
    questionId: topic.id,
    templateId: "hsy-financing-default",
    templateVersion: 1,
    articleType: "CASH_FLOW",
    audience: "合成测试读者",
    depth: "STANDARD",
    supplement: "",
    idempotencyKey: randomUUID(),
    approvedNonSensitive: true,
  };
  const missing = await api(
    op,
    "POST",
    "/api/admin/geo/generation/",
    payload,
    503,
  );
  assert.equal(missing.code, "AI_NOT_CONFIGURED");
  assert.equal(await p.geoGenerationTask.count(), before.tasks);
  assert.equal(await p.article.count(), before.articles);
  check("真实 HTTP 503；数据库未创建虚假任务或文章");
  await api(anon, "GET", "/api/admin/geo/generation/", undefined, 401);
  await api(anon, "POST", "/api/admin/geo/generation/", payload, 401);
  await api(
    op,
    "PUT",
    "/api/admin/geo/generation/",
    { kind: "template", data: {} },
    403,
  );
  await api(
    op,
    "POST",
    "/api/admin/geo/generation/",
    payload,
    403,
    "https://invalid.example",
  );
  await api(
    op,
    "POST",
    "/api/admin/geo/generation/",
    { ...payload, supplement: "测".repeat(40000) },
    413,
  );
  check("登录、模板管理权限、跨站请求及请求体大小拦截");
  const task = await p.geoGenerationTask.create({
    data: {
      questionId: topic.id,
      createdById: operator.id,
      creatorSessionVersion: operator.sessionVersion,
      status: "CANCELLED",
      articleType: "CASH_FLOW",
      audience: "合成测试读者",
      depth: "STANDARD",
      templateId: "hsy-financing-default",
      templateVersion: 1,
      providerName: "openai-responses",
      modelName: "not-configured-test",
      inputSnapshot: { fixture: "仅验证取消任务的访问隔离，不调用模型" },
      idempotencyKey: randomUUID(),
    },
  });
  taskIds.push(task.id);
  await api(
    other,
    "GET",
    "/api/admin/geo/generation/?view=task&id=" + task.id,
    undefined,
    404,
  );
  await api(
    other,
    "PATCH",
    "/api/admin/geo/generation/",
    { id: task.id, action: "save" },
    404,
  );
  await api(op, "GET", "/api/admin/geo/generation/?view=task&id=" + task.id);
  await page.goto(base + "/admin/geo/generation/tasks/");
  await page.getByRole("cell", { name: "已取消", exact: true }).waitFor();
  check("任务在 PostgreSQL 持久保存；他人不可枚举读取或操作");
  const settings = await root.newPage();
  await settings.goto(base + "/admin/geo/generation/templates/");
  await settings
    .getByRole("heading", { name: "写作模板与参考资料", exact: true })
    .waitFor();
  await settings
    .getByRole("heading", { name: "权威参考资料", exact: true })
    .waitFor();
  check("系统管理员可查看模板与参考资料维护界面");
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "/admin/geo/generation/");
    await page.locator("select").first().selectOption(topic.id);
    await page
      .getByText("未找到经过人工审核的相关问答；待审核问答不会作为事实依据。", {
        exact: true,
      })
      .waitFor();
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    assert.ok(dimensions.scroll <= dimensions.client + 1, "横向溢出 " + width);
    const path = folder + "/generation-" + width + ".png";
    await page.screenshot({ path, fullPage: true });
    evidence.screenshots.push(path);
  }
  check("375 / 768 / 1024 / 1440 像素真实浏览器无水平溢出");
  // This is manually authored browser-test content, NOT a real AI response.
  const fixtureQuestion = await p.geoQuestion.create({
    data: {
      question: "合成软件验收问题 " + randomUUID(),
      category: "融资规划",
      keywords: [],
      intent: "AWARENESS",
      priority: 3,
      status: "PLANNED",
    },
  });
  questionIds.push(fixtureQuestion.id);
  const catalog = await p.articleSource.create({
    data: {
      title: "合成技术验收资料（不作融资事实依据）",
      sourceUrl:
        "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap",
      excerpt: "仅验证文章、引用段落及站点地图的技术行为。",
      verifiedAt: new Date(),
      verifiedById: administrator.id,
    },
  });
  sourceIds.push(catalog.id);
  const paragraph = "| 项目 | 说明 |\n| --- | --- |\n| 合成 | 软件验证 |";
  const content =
    "## 软件验收\n这是人工编写的软件测试文章，未调用模型。\n\n" +
    paragraph +
    "\n\n## 风险提示\n本页不构成融资建议，应评估还款能力和还款风险。";
  const sources = [
    {
      title: catalog.title,
      url: catalog.sourceUrl,
      checkedAt: catalog.verifiedAt.toISOString().slice(0, 10),
      paragraph,
    },
  ];
  const fixture = await p.article.create({
    data: {
      title: "人工合成创作界面验收文章",
      slug: "v153-ui-" + randomUUID(),
      summary: "本地技术验收，非真实AI生成。",
      content,
      category: "融资规划",
      tags: [],
      sources,
      status: "DRAFT",
      revision: 1,
      aiAssisted: true,
      authorId: operator.id,
      editorId: operator.id,
      contentFormat: "MARKDOWN",
      generationMetadata: {
        model: "人工测试夹具，非真实模型",
        templateVersion: 1,
        verificationItems: ["本次未调用模型，不代表真实AI内容验收。"],
      },
    },
  });
  articleIds.push(fixture.id);
  await p.articleVersion.create({
    data: {
      articleId: fixture.id,
      revision: 1,
      editorId: operator.id,
      snapshot: {
        title: fixture.title,
        slug: fixture.slug,
        summary: fixture.summary,
        content,
        category: fixture.category,
        tags: [],
        sources,
        relatedIds: [],
        authorName: operator.name,
        contentFormat: "MARKDOWN",
        aiAssisted: true,
      },
    },
  });
  await p.articleQuestionRelation.create({
    data: { articleId: fixture.id, questionId: fixtureQuestion.id },
  });
  await p.articleSource.create({
    data: {
      articleId: fixture.id,
      revision: 1,
      catalogId: catalog.id,
      title: catalog.title,
      sourceUrl: catalog.sourceUrl,
      excerpt: catalog.excerpt,
      paragraph,
      verifiedAt: catalog.verifiedAt,
      verifiedById: administrator.id,
    },
  });
  await page.goto(base + "/admin/geo/articles/" + fixture.id + "/");
  assert.equal(
    await page.locator('[name="source-paragraph-0"]').inputValue(),
    paragraph,
  );
  await page.locator('[name="seoTitle"]').fill("合成技术文章搜索标题");
  async function clickPost(pg, name, path, method = "POST") {
    const pending = pg.waitForResponse(
      (r) => r.url() === base + path && r.request().method() === method,
    );
    await pg.getByRole("button", { name, exact: true }).click();
    assert.equal((await pending).status(), 200);
  }
  await clickPost(
    page,
    "保存草稿",
    "/api/admin/geo/articles/" + fixture.id + "/",
    "PATCH",
  );
  await page.reload();
  assert.equal(
    (await p.article.findUniqueOrThrow({ where: { id: fixture.id } })).revision,
    2,
  );
  assert.equal(
    (await p.article.findUniqueOrThrow({ where: { id: fixture.id } }))
      .sources[0].paragraph,
    paragraph,
  );
  await clickPost(
    page,
    "提交审核",
    "/api/admin/geo/articles/" + fixture.id + "/workflow/",
  );
  await api(
    op,
    "POST",
    "/api/admin/geo/articles/" + fixture.id + "/workflow/",
    { action: "publish", revision: 2 },
    403,
  );
  await settings.goto(base + "/admin/geo/articles/" + fixture.id + "/");
  for (const name of [
    "sources",
    "promises",
    "relationships",
    "cases",
    "promotion",
    "privacy",
    "human",
  ])
    await settings.locator(`[name="${name}"]`).check();
  await settings
    .locator('[name="note"]')
    .fill(
      "人工核对这是一篇纯软件技术夹具，不是融资文章或真实模型调用，引用只用于验证技术功能。",
    );
  await clickPost(
    settings,
    "审核通过",
    "/api/admin/geo/articles/" + fixture.id + "/workflow/",
  );
  await settings
    .getByRole("button", { name: "发布到官网", exact: true })
    .waitFor();
  await clickPost(
    settings,
    "发布到官网",
    "/api/admin/geo/articles/" + fixture.id + "/workflow/",
  );
  const publicPage = await anon.newPage();
  const url = base + "/insights/" + fixture.slug + "/";
  await publicPage.goto(url);
  assert.ok((await publicPage.title()).includes("合成技术文章搜索标题"));
  assert.ok(
    (await publicPage.locator("main").innerText()).includes("对应正文："),
  );
  assert.equal(
    (
      await p.geoQuestion.findUniqueOrThrow({
        where: { id: fixtureQuestion.id },
      })
    ).status,
    "ANSWERED",
  );
  assert.ok(
    (await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      url,
    ),
  );
  evidence.manualFixturePublication = {
    articleId: fixture.id,
    url,
    revision: 2,
    questionStatus: "ANSWERED",
    realAi: false,
  };
  await settings
    .getByRole("button", { name: "下线内容", exact: true })
    .waitFor();
  await clickPost(
    settings,
    "下线内容",
    "/api/admin/geo/articles/" + fixture.id + "/workflow/",
  );
  assert.equal((await anon.request.get(url)).status(), 404);
  assert.equal(
    (
      await p.geoQuestion.findUniqueOrThrow({
        where: { id: fixtureQuestion.id },
      })
    ).status,
    "PLANNED",
  );
  assert.ok(
    !(await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      url,
    ),
  );
  check(
    "人工合成技术夹具：真实浏览器编辑多行表格引用 → 独立审核 → 发布 → SSR/搜索元数据/Sitemap → 下线及问题状态回写；不是AI生成验收",
  );
  await cleanupContent();
  assert.equal(await p.geoQuestion.count(), before.questions);
  assert.equal(await p.faq.count(), before.faqs);
  assert.equal(await p.article.count(), before.articles);
  assert.equal(await p.lead.count(), before.leads);
  assert.equal(evidence.pageErrors.length, 0);
  evidence.realAiAcceptance = "未完成：用户要求暂不配置密钥";
  check("原问题、FAQ、文章及线索数量保持，页面无未捕获异常");
}
async function cleanupContent() {
  await p.geoQuestion.updateMany({
    where: { id: { in: questionIds } },
    data: { articleId: null },
  });
  await p.contentReview.deleteMany({
    where: { articleId: { in: articleIds } },
  });
  await p.articleVersion.deleteMany({
    where: { articleId: { in: articleIds } },
  });
  await p.article.deleteMany({ where: { id: { in: articleIds } } });
  await p.articleSource.deleteMany({ where: { id: { in: sourceIds } } });
  await p.geoQuestion.deleteMany({ where: { id: { in: questionIds } } });
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
    evidence.failed = e.message;
  })
  .finally(async () => {
    await p.geoGenerationTask.deleteMany({ where: { id: { in: taskIds } } });
    await cleanupContent();
    await p.adminSession.deleteMany({ where: { adminId: { in: userIds } } });
    await p.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await p.adminUser.deleteMany({ where: { id: { in: userIds } } });
    for (const c of contexts) await c.close();
    await browser?.close();
    await p.$disconnect();
    evidence.syntheticDataCleaned = true;
    fs.writeFileSync(
      folder + "/browser.json",
      JSON.stringify(evidence, null, 2),
    );
  });
