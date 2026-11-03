const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { randomUUID, randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = "http://127.0.0.1:3000",
  folder = "test-results/article-version",
  p = new PrismaClient({ log: [] });
assert.equal(process.env.LOCAL_TEST_MODE, "true");
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const users = [],
  articles = [],
  faqs = [],
  references = [],
  contexts = [],
  evidence = { base, checks: [], pageErrors: [], realAiCalled: false };
let browser;
const pass = (s) => {
  evidence.checks.push(s);
  console.log("PASS: " + s);
};
async function ctx() {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (page) =>
    page.on("pageerror", () => evidence.pageErrors.push("页面异常")),
  );
  return c;
}
async function api(c, method, path, data, status = 200) {
  const r = await c.request.fetch(base + path, {
    method,
    headers: { Origin: base },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(r.status(), status, path);
  const j = await r.json();
  return r.ok() ? j.data : j.error;
}
async function click(page, name, path, status = 200) {
  const wait = page.waitForResponse(
    (r) => r.url() === base + path && r.request().method() === "POST",
  );
  await page.getByRole("button", { name, exact: true }).click();
  const r = await wait;
  assert.equal(r.status(), status);
  return r.json();
}
const checklist = Object.fromEntries(
  [
    "sources",
    "promises",
    "relationships",
    "cases",
    "promotion",
    "privacy",
    "human",
  ].map((k) => [k, true]),
);
(async () => {
  fs.mkdirSync(folder, { recursive: true });
  const baseline = {
    questions: await p.geoQuestion.count(),
    faqs: await p.faq.count(),
    articles: await p.article.count(),
    versions: await p.articleVersion.count(),
    users: await p.adminUser.count(),
    leads: await p.lead.count(),
  };
  evidence.before = baseline;
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const root = await ctx(),
    op = await ctx(),
    reviewer = await ctx(),
    anon = await ctx(),
    cfg = JSON.parse(fs.readFileSync(".local-postgres/private.json", "utf8"));
  await api(root, "POST", "/api/admin/login/", {
    email: cfg.adminEmail,
    password: cfg.adminPassword,
  });
  async function employee(c, role) {
    const u = await api(
      root,
      "POST",
      "/api/admin/users/",
      {
        name: "虚构文章版本验收人员",
        email: randomUUID() + "@example.invalid",
        role,
        departmentId: null,
        isActive: true,
        reauthPassword: cfg.adminPassword,
      },
      201,
    );
    users.push(u.user.id);
    await api(c, "POST", "/api/admin/login/", {
      email: u.user.email,
      password: u.initialPassword,
    });
    const next = randomBytes(20).toString("hex") + "Aa1!";
    await api(c, "PATCH", "/api/admin/profile/", {
      oldPassword: u.initialPassword,
      newPassword: next,
      confirmation: next,
    });
    await api(c, "POST", "/api/admin/login/", {
      email: u.user.email,
      password: next,
    });
  }
  await employee(op, "CONTENT_OPERATOR");
  await employee(reviewer, "CONTENT_REVIEWER");
  const faq = await api(
    op,
    "POST",
    "/api/admin/geo/faqs/",
    {
      question: "软件验收知识说明" + randomUUID().slice(0, 8),
      answer: "仅为本地版本测试使用的软件说明，不是金融事实或贷款建议。",
      category: "融资风险与合规",
      articleId: null,
      sources: [],
    },
    201,
  );
  faqs.push(faq.id);
  await api(op, "POST", `/api/admin/geo/faqs/${faq.id}/workflow/`, {
    action: "submit",
    revision: faq.revision,
  });
  await api(reviewer, "POST", `/api/admin/geo/faqs/${faq.id}/workflow/`, {
    action: "approve",
    revision: faq.revision,
    note: "核对本条仅为软件测试说明，没有实际金融数据。",
    risk: {
      level: "LOW",
      confirmed: true,
      basis: "本条仅为本地软件验收说明，不含金融数据和客户信息。",
      evidence: [],
    },
  });
  const ref = await api(root, "PUT", "/api/admin/geo/generation/", {
    kind: "reference",
    data: {
      title: "Next.js Sitemap约定（本地软件测试依据）",
      sourceUrl:
        "https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap",
      excerpt:
        "Sitemap可列出网站的公开网址。仅核验本地软件元数据流程，不支持任何利率或贷款条件。",
      verified: true,
      validUntil: null,
      isActive: true,
    },
  });
  references.push(ref.id);
  const paragraph =
    "本条是虚构融资科普流程验收，融资准备应考虑还款能力及还款风险；不提供产品条件或利率。";
  const data = {
    title: "本地文章版本测试" + randomUUID().slice(0, 8),
    slug: "version-" + randomUUID().slice(0, 8),
    summary: "本条仅验证软件保存、审核和发布，不是金融建议。",
    content:
      "## 核验说明\n" +
      paragraph +
      "\n\n不应将咨询服务描述为保证获批或保证放款。",
    category: "融资风险与合规",
    tags: [],
    sources: [
      {
        title: ref.title,
        url: ref.sourceUrl,
        checkedAt: ref.verifiedAt.slice(0, 10),
        paragraph,
      },
    ],
    relatedIds: [],
    aiAssisted: true,
  };
  const a = await api(op, "POST", "/api/admin/geo/articles/", data, 201);
  articles.push(a.id);
  // Deterministic metadata fixture on this synthetic test article only; no AI call and no workflow state mutation.
  await p.article.update({
    where: { id: a.id },
    data: {
      generationMetadata: {
        model: "本地确定性夹具（非真实AI）",
        templateVersion: 1,
      },
    },
  });
  await p.articleFaqRelation.create({
    data: {
      articleId: a.id,
      faqId: faq.id,
      revision: faq.revision,
      evidenceMode: "approved",
    },
  });
  const path = `/admin/geo/articles/${a.id}/`,
    flow = `/api/admin/geo/articles/${a.id}/workflow/`,
    savePath = `/api/admin/geo/articles/${a.id}/`;
  const page = await op.newPage(),
    old = await op.newPage();
  await page.goto(base + path);
  await old.goto(base + path);
  const original = await page.locator("[name=content]").inputValue();
  await page
    .locator("[name=content]")
    .fill(original + "\n\n新增本地保存说明，不影响原有内容。");
  assert.equal(
    await page
      .getByRole("button", { name: "提交审核", exact: true })
      .isDisabled(),
    true,
  );
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route("**" + savePath, async (route) => {
    if (route.request().method() === "PATCH") await gate;
    await route.continue();
  });
  const saved = page.waitForResponse(
    (r) => r.url() === base + savePath && r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "提交审核", exact: true })
      .isDisabled(),
    true,
  );
  release();
  const sr = await saved;
  assert.equal(sr.status(), 200);
  const current = (await sr.json()).data;
  await page
    .locator("#content-workflow")
    .getByText(/版本 2/)
    .waitFor();
  assert.equal(current.revision, 2);
  const version = await p.articleVersion.findUniqueOrThrow({
    where: { articleId_revision: { articleId: a.id, revision: 2 } },
  });
  assert.equal(version.snapshot.content, current.content);
  assert.equal(version.snapshot.revision, undefined);
  pass(
    "修改未保存及保存中阻止审核；实际PATCH保存版本2，前端同步，版本行与正文快照一致",
  );
  const stale = await click(old, "提交审核", flow, 409);
  assert.equal(stale.error.code, "STALE_VERSION");
  await old.getByText(/服务器已是版本2/).waitFor();
  await old
    .locator("[name=content]")
    .fill(original + "\n保留在旧页面的未保存输入。");
  const failedSave = old.waitForResponse(
    (r) => r.url() === base + savePath && r.request().method() === "PATCH",
  );
  await old.getByRole("button", { name: "保存草稿", exact: true }).click();
  assert.equal((await failedSave).status(), 409);
  assert.ok(
    (await old.locator("[name=content]").inputValue()).includes("旧页面"),
  );
  await old
    .getByRole("button", { name: "查看服务器最新版本差异", exact: true })
    .click();
  await old.getByText(/服务器版本2/).waitFor();
  pass(
    "两个实际浏览器页面的过期保存和审核被拒绝；本地输入保留，可查看服务器差异",
  );
  await page
    .getByRole("button", {
      name: "重新执行事实核验（已保存版本）",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "提交审核", exact: true }).waitFor();
  const text = await page
    .locator("aside")
    .filter({
      has: page.getByRole("heading", {
        name: "生成溯源与事实核验",
        exact: true,
      }),
    })
    .innerText();
  assert.ok(!text.includes("FAQ_CHANGED"));
  assert.ok(!text.includes("已变更或失去审核资格"));
  assert.ok(!text.includes("删除保证"));
  await click(page, "提交审核", flow);
  const repeated = await api(op, "POST", flow, {
    action: "submit",
    revision: 2,
  });
  assert.equal(repeated.alreadySubmitted, true);
  assert.equal(
    (await p.article.findUnique({ where: { id: a.id } })).status,
    "IN_REVIEW",
  );
  assert.equal(
    await p.auditLog.count({
      where: { resourceId: a.id, action: "CONTENT_SUBMIT" },
    }),
    1,
  );
  pass(
    "专业判断FAQ与否定承诺不误报；真实提交转为待审核，相同版本重复提交幂等且仅一条提交审计",
  );
  const own = await api(
    op,
    "POST",
    flow,
    {
      action: "approve",
      revision: 2,
      note: "本条只测试软件流程并已逐项核对来源。",
      checklist,
    },
    403,
  );
  assert.ok(own.code);
  const rp = await reviewer.newPage();
  await rp.goto(base + path);
  for (const key of Object.keys(checklist))
    await rp.locator(`[name=${key}]`).check();
  if (await rp.locator("[name=riskConfirmed]").count())
    await rp.locator("[name=riskConfirmed]").check();
  const evidenceSelects = rp.locator("select[name^=riskEvidence-]");
  for (let i = 0, n = await evidenceSelects.count(); i < n; i++)
    await evidenceSelects.nth(i).selectOption("public:0");
  await rp
    .locator("[name=note]")
    .fill("逐项核验本条软件测试的来源和公开范围，不代表实际金融事实。");
  await click(rp, "审核通过", flow);
  const rootPage = await root.newPage();
  await rootPage.goto(base + path);
  await click(rootPage, "发布到官网", flow);
  const publicResult = await anon.request.get(
    base + "/insights/" + a.slug + "/",
  );
  assert.equal(publicResult.status(), 200);
  assert.ok(
    (await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      a.slug,
    ),
  );
  pass(
    "独立审核员实际浏览器通过，授权发布后公开页面200及Sitemap可见，运营不能自审",
  );
  // A FAQ publication does not invalidate the same reviewed version; new unpublished edits keep its old published evidence.
  await api(root, "POST", `/api/admin/geo/faqs/${faq.id}/workflow/`, {
    action: "publish",
    revision: faq.revision,
  });
  await rootPage.reload();
  assert.ok(
    !(await rootPage.locator("aside").first().innerText()).includes(
      "已变更或失去审核资格",
    ),
  );
  const nextFaq = await api(op, "PATCH", `/api/admin/geo/faqs/${faq.id}/`, {
    question: faq.question,
    answer: faq.answer + " 这是一条尚未审核的新增说明。",
    category: faq.category,
    articleId: null,
    sources: [],
    revision: faq.revision,
  });
  await rootPage.reload();
  assert.equal(
    (await p.article.findUnique({ where: { id: a.id } })).revision,
    2,
  );
  await api(root, "POST", `/api/admin/geo/faqs/${faq.id}/workflow/`, {
    action: "offline",
    revision: nextFaq.revision,
  });
  await rootPage.reload();
  let panel = rootPage.locator("aside").filter({
    has: rootPage.getByRole("heading", {
      name: "生成溯源与事实核验",
      exact: true,
    }),
  });
  assert.equal(await panel.getByText(/已变更或失去审核资格/).count(), 1);
  assert.ok((await panel.innerText()).includes(faq.question));
  await rootPage
    .getByRole("button", {
      name: "重新执行事实核验（已保存版本）",
      exact: true,
    })
    .click();
  await panel.getByText(/已变更或失去审核资格/).waitFor();
  assert.equal(await panel.getByText(/已变更或失去审核资格/).count(), 1);
  pass(
    "同版本FAQ发布及新草稿不错误失效；真正失去公开版本时列出具体FAQ且重复核验不追加重复项",
  );
  await api(root, "POST", flow, { action: "offline", revision: 2 });
  // Browser-only 503 injection is explicitly not a real database outage.
  await old.reload();
  await old.locator("[name=content]").fill(original + "\n保留异常场景输入。");
  await old.route("**" + savePath, async (route) => {
    if (route.request().method() === "PATCH")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { code: "SERVICE_UNAVAILABLE", message: "服务暂不可用" },
        }),
      });
    await route.continue();
  });
  await old.getByRole("button", { name: "保存草稿", exact: true }).click();
  await old.getByText(/服务或数据库连接暂不可用/).waitFor();
  assert.ok(
    (await old.locator("[name=content]").inputValue()).includes("异常场景"),
  );
  pass("浏览器注入503显示明确错误并保留输入，不冒充实际断库");
  if (fs.existsSync(folder + "/reproduction.json")) {
    const originalRecord = JSON.parse(
      fs.readFileSync(folder + "/reproduction.json", "utf8"),
    );
    const originalArticle = await p.article.findUnique({
      where: { id: originalRecord.id },
      select: { revision: true, status: true },
    });
    if (originalArticle) {
      const result = await api(
        root,
        "GET",
        `/api/admin/geo/articles/${originalRecord.id}/facts/`,
      );
      assert.equal(result.revision, originalArticle.revision);
      assert.ok(!result.findings.some((f) => f.code === "GUARANTEE"));
      evidence.originalRetest = {
        id: originalRecord.id,
        revision: originalArticle.revision,
        status: originalArticle.status,
        readOnly: true,
        remaining: result.findings.map((f) => ({
          code: f.code,
          severity: f.severity,
        })),
      };
      pass("原故障草稿只读重核验，符合风险分级新规则，未代替作者提交或修改");
    }
  }
  await page.screenshot({ path: folder + "/workflow.png", fullPage: true });
  assert.deepEqual(evidence.pageErrors, []);
  evidence.outcome = "PASS";
  evidence.article = { id: a.id, submitRevision: 2, publicStatus: 200 };
})()
  .catch((e) => {
    console.error(e.name, e.message);
    evidence.outcome = "FAIL";
    evidence.failure = e.message;
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await p.contentReview.deleteMany({
        where: {
          OR: [{ articleId: { in: articles } }, { faqId: { in: faqs } }],
        },
      });
      await p.articleSource.deleteMany({
        where: { articleId: { in: articles } },
      });
      await p.articleFaqRelation.deleteMany({
        where: { articleId: { in: articles } },
      });
      await p.articleVersion.deleteMany({
        where: { articleId: { in: articles } },
      });
      await p.article.deleteMany({ where: { id: { in: articles } } });
      await p.faqVersion.deleteMany({ where: { faqId: { in: faqs } } });
      await p.faq.deleteMany({ where: { id: { in: faqs } } });
      await p.articleSource.deleteMany({ where: { id: { in: references } } });
      await p.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: users } },
            {
              resourceId: {
                in: [...users, ...articles, ...faqs, ...references],
              },
            },
          ],
        },
      });
      await p.adminSession.deleteMany({ where: { adminId: { in: users } } });
      await p.adminUser.deleteMany({ where: { id: { in: users } } });
      evidence.syntheticCleaned = true;
      evidence.after = {
        questions: await p.geoQuestion.count(),
        faqs: await p.faq.count(),
        articles: await p.article.count(),
        versions: await p.articleVersion.count(),
        users: await p.adminUser.count(),
        leads: await p.lead.count(),
      };
      assert.deepEqual(evidence.after, evidence.before);
    } catch (e) {
      evidence.syntheticCleaned = false;
      console.error("清理或数量核对失败", e.message);
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
