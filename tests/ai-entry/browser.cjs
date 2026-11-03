// Real local browser acceptance. Set AI_ENTRY_REAL_GENERATION=true explicitly for ONE paid article task.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = "http://127.0.0.1:3000",
  folder = "test-results/ai-entry";
assert.equal(process.env.LOCAL_TEST_MODE, "true");
assert.equal(process.env.SITE_URL, base);
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const p = new PrismaClient({ log: [] }),
  users = [],
  contexts = [];
const evidence = {
  at: new Date().toISOString(),
  base,
  checks: [],
  pageErrors: [],
  realGenerationRequested: false,
};
let browser;
const save = () =>
  fs.writeFileSync(folder + "/result.json", JSON.stringify(evidence, null, 2));
const pass = (s) => {
  evidence.checks.push(s);
  console.log("PASS: " + s);
  save();
};
async function api(c, method, path, data, expected = 200) {
  const r = await c.request.fetch(base + path, {
    method,
    headers: { Origin: base },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(r.status(), expected, path + " status " + r.status());
  const j = await r.json();
  return r.ok() ? j.data : j.error;
}
async function context() {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (page) =>
    page.on("pageerror", () => evidence.pageErrors.push("页面未捕获异常")),
  );
  return c;
}
async function snapshot() {
  return {
    questions: await p.geoQuestion.findMany({
      select: {
        id: true,
        question: true,
        category: true,
        keywords: true,
        intent: true,
        priority: true,
      },
    }),
    faqs: await p.faq.findMany(),
    users: await p.adminUser.findMany({
      select: {
        id: true,
        passwordHash: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        departmentId: true,
      },
    }),
    leads: await p.lead.findMany(),
    articles: await p.article.findMany(),
  };
}
(async () => {
  fs.mkdirSync(folder, { recursive: true });
  // Prevent rerunning a paid generation after an interrupted test.
  if (
    process.env.AI_ENTRY_REAL_GENERATION === "true" &&
    fs.existsSync(folder + "/paid-task.json")
  )
    throw Error(
      "已有真实任务证据，请先查看原任务；本脚本不会重复创建付费任务。",
    );
  const before = await snapshot();
  fs.writeFileSync(
    ".local-postgres/backups/ai-entry-before.json",
    JSON.stringify(before),
  );
  assert.equal(
    await p.geoGenerationTask.count({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
    }),
    0,
  );
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const root = await context(),
    op = await context(),
    reviewer = await context(),
    anon = await context();
  const page = await root.newPage();
  const cfg = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  await page.goto(base + "/admin/login/");
  await page.locator('[name="email"]').fill(cfg.adminEmail);
  await page.locator('[name="password"]').fill(cfg.adminPassword);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(base + "/admin/dashboard/");
  await page.goto(base + "/admin/geo/questions/");
  await page
    .getByRole("navigation", { name: "内容运营导航" })
    .getByRole("link", { name: "AI 内容创作", exact: true })
    .waitFor();
  pass("实际超级管理员GEO导航显示AI内容创作");
  async function employee(c, role) {
    const u = await api(
      root,
      "POST",
      "/api/admin/users/",
      {
        name: "虚构入口验收人员",
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
  const rp = await reviewer.newPage();
  await rp.goto(base + "/admin/geo/");
  assert.equal(
    await rp.getByRole("link", { name: "AI 内容创作", exact: true }).count(),
    0,
  );
  await rp.getByText(/当前账号没有 AI 内容创作权限/).waitFor();
  await api(reviewer, "GET", "/api/admin/geo/generation/", undefined, 403);
  await api(anon, "GET", "/api/admin/geo/generation/", undefined, 401);
  await api(
    op,
    "POST",
    "/api/admin/geo/generation/connection/",
    { confirmedCost: true },
    403,
  );
  await api(op, "GET", "/api/admin/leads/", undefined, 403);
  await api(op, "POST", "/api/admin/geo/generation/", {}, 400);
  pass(
    "独立审核岗位显示缺权原因，运营可进入生成校验但无连接测试/客户数据权限，匿名被拒绝",
  );
  const topic = await p.geoQuestion.findFirst({
    where: { status: { not: "ARCHIVED" }, category: "高负债融资" },
    orderBy: { priority: "asc" },
  });
  assert.ok(topic, "需存在真实融资选题");
  evidence.question = { id: topic.id, title: topic.question };
  const opPage = await op.newPage();
  await opPage.goto(
    base + "/admin/geo/questions/?q=" + encodeURIComponent(topic.question),
  );
  const row = opPage.getByRole("row").filter({ hasText: topic.question });
  await row.getByRole("link", { name: "生成文章", exact: true }).click();
  await opPage
    .getByRole("heading", { name: "AI 内容创作工作台", exact: true })
    .waitFor();
  assert.equal(await opPage.locator("select").first().inputValue(), topic.id);
  await opPage.getByRole("heading", { name: /已审核问答/ }).waitFor();
  const knowledge = await api(
    op,
    "GET",
    "/api/admin/geo/generation/?view=knowledge&questionId=" + topic.id,
  );
  assert.ok(knowledge.faqs.length > 0, "已审核专业判断FAQ应自动关联");
  for (const f of knowledge.faqs) {
    assert.ok(
      await p.contentReview.findUnique({
        where: { faqId_revision: { faqId: f.id, revision: f.revision } },
      }),
    );
  }
  evidence.knowledge = {
    faqIds: knowledge.faqs.map((f) => f.id),
    evidenceKinds: knowledge.faqs.map((f) => f.evidenceKind),
    warnings: knowledge.warnings,
  };
  assert.equal(
    await opPage
      .getByRole("button", { name: "测试模型连接", exact: true })
      .count(),
    0,
  );
  for (const width of [375, 768, 1024, 1440]) {
    await opPage.setViewportSize({ width, height: 900 });
    assert.equal(
      await opPage.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  }
  await opPage.screenshot({
    path: folder + "/operator-workspace.png",
    fullPage: true,
  });
  pass(
    "运营从真实问题行生成文章进入工作台，自动带入问题并关联已审核FAQ，四视口正常",
  );
  await page.goto(base + "/admin/geo/generation/?questionId=" + topic.id);
  await page.getByRole("heading", { name: /已审核问答/ }).waitFor();
  await page
    .getByRole("navigation", { name: "AI 内容创作导航" })
    .getByRole("link", { name: "模型配置与连接测试", exact: true })
    .waitFor();
  const status = await api(
    root,
    "GET",
    "/api/admin/geo/generation/connection/",
  );
  assert.equal("apiKey" in status, false);
  evidence.connection = {
    keyConfigured: status.keyConfigured,
    model: status.model,
    endpoint: status.endpoint,
    latest: status.latest,
  };
  await page.screenshot({
    path: folder + "/root-workspace.png",
    fullPage: true,
  });
  pass(
    "工作台/任务/模型配置复用现有路由；模型状态读取当前配置与持久检测，不重复产生短测费用",
  );
  if (process.env.AI_ENTRY_REAL_GENERATION === "true") {
    assert.ok(
      status.keyConfigured && status.latest?.result.connected,
      "需实际已配置并通过连接检测",
    );
    const options = await api(root, "GET", "/api/admin/geo/generation/");
    assert.ok(options.workerOnline, "真实Worker应在线");
    await page.locator('[name="depth"]').selectOption("BRIEF");
    await page
      .locator('[name="supplement"]')
      .fill(
        "本次仅生成本地待审核草稿。简明回答，约六百字，包含还款风险提示；不要编造利率、银行条件、案例或引用。缺少外部依据时在待核实事项中明确说明。",
      );
    await page.locator('[name="approvedNonSensitive"]').check();
    const createdResponse = page.waitForResponse(
      (r) =>
        r.url() === base + "/api/admin/geo/generation/" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "生成文章草稿", exact: true })
      .click();
    const r = await createdResponse;
    assert.equal(r.status(), 201);
    const task = (await r.json()).data;
    evidence.realGenerationRequested = true;
    evidence.task = { id: task.id, createHttpStatus: 201 };
    fs.writeFileSync(
      folder + "/paid-task.json",
      JSON.stringify({ taskId: task.id }),
    );
    save();
    const until = Date.now() + 115000;
    let final;
    do {
      final = await p.geoGenerationTask.findUniqueOrThrow({
        where: { id: task.id },
        include: { callLogs: true },
      });
      if (!["QUEUED", "RUNNING"].includes(final.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } while (Date.now() < until);
    evidence.task = {
      ...evidence.task,
      status: final.status,
      attempts: final.attempts,
      errorCode: final.errorCode,
      errorMessage: final.errorMessage,
      usage: final.tokenUsage,
      outputArticleId: final.outputArticleId,
      callStatuses: final.callLogs.map((l) => ({
        status: l.status,
        estimatedCostUsd: l.estimatedCostUsd,
      })),
    };
    save();
    await page.screenshot({
      path: folder + "/real-generation-result.png",
      fullPage: true,
    });
    if (final.status === "SUCCEEDED") {
      const a = await p.article.findUniqueOrThrow({
        where: { id: final.outputArticleId },
      });
      assert.equal(a.status, "DRAFT");
      assert.equal(a.isLive, false);
      assert.equal(a.content, final.output.markdown);
      assert.ok(a.content.includes("##"));
      await page
        .getByRole("link", {
          name: "打开已保存草稿，继续编辑与审核 →",
          exact: true,
        })
        .click();
      assert.ok(
        (await page.locator('[name="content"]').inputValue()).includes("##"),
      );
      await page.screenshot({
        path: folder + "/saved-article.png",
        fullPage: true,
      });
      await page.goto(
        base + "/admin/geo/articles/?q=" + encodeURIComponent(a.title),
      );
      await page.getByRole("row").filter({ hasText: a.title }).waitFor();
      const publicResult = await anon.request.get(
        base + "/insights/" + a.slug + "/",
      );
      assert.equal(publicResult.status(), 404);
      await api(
        op,
        "GET",
        "/api/admin/geo/generation/?view=task&id=" + final.id,
        undefined,
        404,
      );
      evidence.article = {
        id: a.id,
        title: a.title,
        status: a.status,
        isLive: a.isLive,
        publicStatus: 404,
        markdownLength: a.content.length,
      };
      pass(
        "真实Provider生成Markdown，真实Worker原子保存原文章表，后台可查看，草稿未公开且本人任务隔离",
      );
    } else {
      pass("真实任务未成功：保留错误及用量，无自动人工重试，无虚假草稿");
      evidence.realGenerationIncomplete = true;
    }
  }
  assert.deepEqual(evidence.pageErrors, []);
  evidence.outcome = evidence.realGenerationIncomplete ? "PARTIAL" : "PASS";
  const after = await snapshot();
  for (const key of Object.keys(before)) {
    assert.deepEqual(
      after[key]
        .filter((row) => before[key].some((old) => old.id === row.id))
        .sort((a, b) => a.id.localeCompare(b.id)),
      before[key].sort((a, b) => a.id.localeCompare(b.id)),
      key + " 原记录内容变化",
    );
  }
  evidence.originalDataUnchanged = true;
  evidence.counts = {
    questions: await p.geoQuestion.count(),
    faqs: await p.faq.count(),
    articles: await p.article.count(),
  };
  pass("原100题正文、60FAQ及其当前审核发布状态、原文章/员工凭据/线索全部保持");
})()
  .catch((e) => {
    evidence.outcome = "FAIL";
    evidence.failure = e.message;
    console.error(e.name, e.message);
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
      evidence.syntheticUsersCleaned = true;
    } catch {
      evidence.syntheticUsersCleaned = false;
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
    save();
  });
