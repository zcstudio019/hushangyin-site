const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { randomBytes, createHash } = require("node:crypto");
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
      : "test-results/") + "v152",
  run = randomBytes(6).toString("hex"),
  marker = "V152合成-" + run;
assert.equal(process.env.LOCAL_TEST_MODE, "true");
assert.equal(process.env.SITE_URL, base);
if (process.env.DATABASE_PROVIDER === "sqlite")
  assert.ok(
    process.env.DATABASE_URL.startsWith("file:") &&
      process.env.LOCAL_TEST_MODE === "true",
  );
else assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const p = new PrismaClient({ log: [] }),
  users = [],
  depts = [],
  questionIds = [],
  faqIds = [],
  contexts = [];
let browser;
let baseline;
const evidence = { run, base, checks: [], pageErrors: [], originalFiles: [] };
const check = (s) => {
  evidence.checks.push(s);
  console.log("PASS: " + s);
};
function questions(n = 5, source = "合成来源（仅验收）") {
  return (
    "# 合成测试文档\n## 字段说明\n说明不计入题数。\n\n" +
    Array.from(
      { length: n },
      (_, i) =>
        `## Q${String(i + 1).padStart(3, "0")}｜${marker} 问题${i + 1}？\n- 分类：融资规划\n- 关键词：合成、测试\n- 搜索意图：申请准备型\n- 优先级：3\n- 状态：待规划\n- 来源：${source}\n`,
    ).join("\n")
  );
}
function faqText(n = 5) {
  return (
    "# 合成问答文档\n\n" +
    Array.from(
      { length: n },
      (_, i) =>
        `## F${String(i + 1).padStart(3, "0")}｜${marker} 问答${i + 1}？\n- 分类：融资规划\n- 状态：待审核\n\n### 答案\n\n${marker} 合成答案${i + 1}，不构成金融建议。\n\n- 格式验证\n- 人工复核\n\n| 项目 | 说明 |\n| --- | --- |\n| 合成 | 测试 |\n`,
    ).join("\n")
  );
}
async function ctx() {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (page) =>
    page.on("pageerror", () =>
      evidence.pageErrors.push("uncaught browser error"),
    ),
  );
  return c;
}
async function api(c, path, data, status = 200, method = "POST", headers = {}) {
  const r = await c.request.fetch(base + path, {
    method,
    headers: { Origin: base, ...headers },
    ...(data === undefined ? {} : { data }),
  });
  assert.equal(r.status(), status, path + " HTTP " + r.status());
  const j = await r.json();
  if (status < 300) assert.equal(j.ok, true);
  return j.data || j.error;
}
async function preview(c, kind, text, format = "markdown") {
  return api(c, `/api/admin/geo/${kind}/import/`, {
    format,
    text,
    mode: "preview",
  });
}
async function commit(c, kind, text, report, format = "markdown") {
  const r = await api(
    c,
    `/api/admin/geo/${kind}/import/`,
    {
      format,
      text,
      mode: "commit",
      confirmationToken: report.confirmationToken,
      confirmed: true,
    },
    201,
  );
  (kind === "questions" ? questionIds : faqIds).push(...r.createdIds);
  return r;
}
async function main() {
  // Capture the current data before this run; historical snapshots predate legitimate account changes.
  baseline = {
    users: await p.adminUser.findMany({
      select: { id: true, passwordHash: true, role: true },
    }),
    leads: await p.lead.findMany({ select: { id: true } }),
    articles: await p.article.findMany({ select: { id: true } }),
    faqs: await p.faq.findMany({ select: { id: true } }),
    questions: await p.geoQuestion.findMany({ select: { id: true } }),
  };
  fs.mkdirSync(folder, { recursive: true });
  browser = await chromium.launch({
    executablePath:
      process.env.BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const root = await ctx(),
    op = await ctx(),
    agent = await ctx(),
    anon = await ctx();
  const credentials = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  await api(root, "/api/admin/login/", {
    email: credentials.adminEmail,
    password: credentials.adminPassword,
  });
  const dept = await api(
    root,
    "/api/admin/departments/",
    { name: marker, isActive: true, reauthPassword: credentials.adminPassword },
    201,
  );
  depts.push(dept.id);
  async function employee(c, role, label, departmentId) {
    const u = await api(
      root,
      "/api/admin/users/",
      {
        name: marker + "-" + label,
        email: `import-${run}-${role.toLowerCase()}@example.test`,
        role,
        departmentId,
        isActive: true,
        reauthPassword: credentials.adminPassword,
      },
      201,
    );
    users.push(u.user.id);
    await api(c, "/api/admin/login/", {
      email: u.user.email,
      password: u.initialPassword,
    });
    const password = randomBytes(20).toString("hex") + "-M9!";
    await api(
      c,
      "/api/admin/profile/",
      {
        oldPassword: u.initialPassword,
        newPassword: password,
        confirmation: password,
      },
      200,
      "PATCH",
    );
    await api(c, "/api/admin/login/", { email: u.user.email, password });
    return u.user;
  }
  const operator = await employee(op, "CONTENT_OPERATOR", "运营", null);
  await employee(agent, "FINANCING_ADVISOR", "顾问", dept.id);
  const page = await op.newPage();
  assert.equal(
    (await op.request.get(base + "/contact/")).headers()["x-hushangyin-app"],
    "platform/" + JSON.parse(fs.readFileSync("package.json", "utf8")).version,
  );
  for (const kind of ["questions", "faqs"]) {
    await api(
      anon,
      `/api/admin/geo/${kind}/import/`,
      { format: "markdown", text: "test", mode: "preview" },
      401,
    );
    await api(
      agent,
      `/api/admin/geo/${kind}/import/`,
      { format: "markdown", text: "test", mode: "preview" },
      403,
    );
    await api(
      op,
      `/api/admin/geo/${kind}/import/`,
      { format: "markdown", text: "test", mode: "preview" },
      403,
      "POST",
      { Origin: "https://invalid.test" },
    );
  }
  check("both import APIs enforce server RBAC and CSRF on actual service");
  for (const [kind, text] of [
    ["questions", questions()],
    ["faqs", faqText()],
  ]) {
    await page.goto(base + `/admin/geo/${kind}/`);
    const block = page.getByTestId(`${kind}-markdown-import`);
    await block.locator(":scope > summary").click();
    if (kind === "questions") {
      await block.locator("input[type=file]").setInputFiles({
        name: "合成5题.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(text),
      });
      await block.getByText("已选择：合成5题.md", { exact: true }).waitFor();
    } else {
      await block.getByRole("radio", { name: "粘贴文本", exact: true }).check();
      await block.locator("textarea").fill(text);
    }
    const before =
      kind === "questions" ? await p.geoQuestion.count() : await p.faq.count();
    const r = page.waitForResponse(
      (r) =>
        r.url() === base + `/api/admin/geo/${kind}/import/` &&
        r.request().method() === "POST",
    );
    await block
      .getByRole("button", { name: "解析与预览", exact: true })
      .click();
    const response = await r;
    assert.equal(response.status(), 200);
    const report = (await response.json()).data;
    assert.equal(report.valid, true);
    assert.equal(report.total, 5);
    assert.equal(report.newCount, 5);
    assert.equal(
      kind === "questions" ? await p.geoQuestion.count() : await p.faq.count(),
      before,
    );
    assert.equal(
      await block
        .getByRole("button", { name: "确认导入", exact: true })
        .isDisabled(),
      true,
    );
    if (kind === "faqs") {
      await block.getByText("预览答案", { exact: true }).first().click();
      assert.ok(await block.locator(".geo-prose ul").count());
      assert.equal(
        await block
          .locator('script,img[onerror],a[href^="javascript:"]')
          .count(),
        0,
      );
    }
    await block.getByRole("checkbox").check();
    const saved = page.waitForResponse(
      (r) =>
        r.url() === base + `/api/admin/geo/${kind}/import/` &&
        r.request().method() === "POST",
    );
    await block.getByRole("button", { name: "确认导入", exact: true }).click();
    const posted = await saved;
    assert.equal(posted.status(), 201);
    const result = (await posted.json()).data;
    (kind === "questions" ? questionIds : faqIds).push(...result.createdIds);
    assert.equal(result.successCount, 5);
    await block.getByRole("status").filter({ hasText: "导入完成" }).waitFor();
    await page.goto(
      base + `/admin/geo/${kind}/?q=` + encodeURIComponent(marker),
    );
    assert.ok((await page.locator("tbody").innerText()).includes(marker));
    const textOnPage = await page.locator("main").innerText();
    assert.equal(
      /\b(?:AWARENESS|PREPARATION|OPEN|PLANNED|ANSWERED|IN_REVIEW|DRAFT|question,category|APPROVED|REJECTED)\b/.test(
        textOnPage,
      ),
      false,
    );
    await page.screenshot({
      path: `${folder}/${kind}-list.png`,
      fullPage: true,
    });
  }
  check(
    "browser file imports 5 questions, paste imports 5 FAQs; preview read-only, explicit confirmation, real list refresh and Chinese labels",
  );
  const firstQ = await p.geoQuestion.findFirstOrThrow({
    where: { id: { in: questionIds } },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(firstQ.importMetadata.source, "合成来源（仅验收）");
  assert.equal(firstQ.importMetadata.importedBy, operator.id);
  assert.equal(firstQ.importMetadata.recordLabel, "Q001");
  assert.ok(firstQ.id !== "Q001");
  const firstFaq = await p.faq.findFirstOrThrow({
    where: { id: { in: faqIds } },
    orderBy: { createdAt: "asc" },
  });
  const originalAnswer = firstFaq.answer;
  assert.match(originalAnswer, /\n\n- 格式验证/);
  assert.equal(firstFaq.status, "IN_REVIEW");
  assert.equal(firstFaq.isLive, false);
  assert.equal(firstFaq.publishedSnapshot, null);
  check(
    "source/reference/importer/time persisted, CUID independent, FAQ body structure and unpublished pending state",
  );
  const manyQ = questions(100, "后续来源不得覆盖"),
    qReport = await preview(op, "questions", manyQ);
  assert.equal(qReport.total, 100);
  assert.equal(qReport.duplicateCount, 5);
  const [qa, qb] = await Promise.all([
    commit(op, "questions", manyQ, qReport),
    commit(op, "questions", manyQ, qReport),
  ]);
  assert.equal(qa.successCount + qb.successCount, 95);
  assert.equal(
    await p.geoQuestion.count({ where: { question: { startsWith: marker } } }),
    100,
  );
  assert.equal(
    (await p.geoQuestion.findUniqueOrThrow({ where: { id: firstQ.id } }))
      .importMetadata.source,
    "合成来源（仅验收）",
  );
  const replay = await commit(
    op,
    "questions",
    manyQ,
    await preview(op, "questions", manyQ),
  );
  assert.equal(replay.successCount, 0);
  assert.equal(replay.skippedCount, 100);
  const manyF = faqText(60),
    fr = await preview(op, "faqs", manyF);
  assert.equal(fr.total, 60);
  assert.equal(fr.duplicateCount, 5);
  const fa = await commit(op, "faqs", manyF, fr);
  assert.equal(fa.successCount, 55);
  const fb = await commit(op, "faqs", manyF, await preview(op, "faqs", manyF));
  assert.equal(fb.skippedCount, 60);
  assert.equal(fb.successCount, 0);
  assert.equal(
    await p.faq.count({
      where: {
        question: { startsWith: marker },
        isLive: false,
        status: "IN_REVIEW",
      },
    }),
    60,
  );
  assert.equal(
    (await p.faq.findUniqueOrThrow({ where: { id: firstFaq.id } })).answer,
    originalAnswer,
  );
  evidence.fixtureCounts = {
    questions: 100,
    faqs: 60,
    questionConcurrentCreated: 95,
    faqCreatedAfterFive: 55,
  };
  check(
    "100-question/60-FAQ equivalent fixtures persist, concurrent/repeated requests skip duplicates without overwrite",
  );
  for (const [kind, file, count] of [
    [
      "questions",
      "C:/Users/Administrator/Downloads/沪上银_GEO融资问题库_100题.md",
      100,
    ],
    [
      "faqs",
      "C:/Users/Administrator/Downloads/沪上银_GEO_FAQ问答库_60组.md",
      60,
    ],
  ]) {
    if (!fs.existsSync(file)) {
      evidence.originalFiles.push({ file, available: false });
      continue;
    }
    const raw = fs.readFileSync(file, "utf8"),
      qCount = await p.geoQuestion.count(),
      fCount = await p.faq.count();
    const r = await preview(op, kind, raw);
    assert.equal(r.total, count);
    assert.equal(r.valid, true);
    assert.equal(r.failedCount, 0);
    assert.equal(await p.geoQuestion.count(), qCount);
    assert.equal(await p.faq.count(), fCount);
    evidence.originalFiles.push({
      file,
      available: true,
      total: r.total,
      valid: r.valid,
      failed: r.failedCount,
      sha256: createHash("sha256").update(raw).digest("hex"),
      dryRunOnly: true,
    });
  }
  check(
    "original 100-question and 60-FAQ files server dry-run validated only; no original material inserted",
  );
  const normalized = await preview(
    op,
    "questions",
    questions(1).replace("问题1？", "问题1?"),
  );
  assert.equal(normalized.duplicateCount, 1);
  const duplicateId = await preview(
    op,
    "questions",
    questions(1) + "\n" + questions(1).replace("问题1？", "另一道问题？"),
  );
  assert.equal(duplicateId.valid, true);
  assert.equal(duplicateId.total, 2);
  check(
    "normalised text handles punctuation, original wording retained and document numbering is not identity",
  );
  for (const [kind, text] of [
    ["questions", questions().replace("融资规划", "非法分类")],
    ["questions", questions().replace("申请准备型", "无效意图")],
    ["faqs", faqText().replace("待审核", "待规划")],
    ["faqs", `## F001｜缺少答案\n- 分类：融资规划`],
    ["questions", questions(101)],
    ["faqs", faqText(101)],
    ["faqs", faqText(1).replace("合成答案1", "<script>alert(1)</script>")],
    ["faqs", faqText(1).replace("合成答案1", "<img src=x onerror=alert(1)>")],
    ["faqs", faqText(1).replace("合成答案1", "[危险](javascript:alert(1))")],
    ["faqs", faqText(1).replace("合成答案1", "字".repeat(20001))],
    ["questions", "字".repeat(400000)],
  ]) {
    const r = await preview(op, kind, text);
    assert.equal(r.valid, false);
    assert.equal(r.confirmationToken, undefined);
    assert.ok(r.failedCount > 0);
    assert.ok(
      r.errors.length || r.rows.some((x) => x.errors.some((e) => e.line > 0)),
    );
  }
  const clamped = await preview(
    op,
    "faqs",
    faqText(1).replace("待审核", "已发布"),
  );
  assert.equal(clamped.rows[0].status, "DRAFT");
  assert.ok(clamped.rows[0].warnings.length);
  check(
    "invalid category/enums/answer/count/length/HTML/unsafe links rejected with Chinese record-line errors; publish status safely clamped",
  );
  const good = questions(1),
    tokenReport = await preview(op, "questions", good);
  await api(
    op,
    "/api/admin/geo/questions/import/",
    {
      format: "markdown",
      text: good,
      mode: "commit",
      confirmed: false,
      confirmationToken: tokenReport.confirmationToken,
    },
    400,
  );
  await api(
    op,
    "/api/admin/geo/questions/import/",
    {
      format: "markdown",
      text: good + "\n",
      mode: "commit",
      confirmed: true,
      confirmationToken: tokenReport.confirmationToken,
    },
    409,
  );
  await api(
    root,
    "/api/admin/geo/questions/import/",
    {
      format: "markdown",
      text: good,
      mode: "commit",
      confirmed: true,
      confirmationToken: tokenReport.confirmationToken,
    },
    409,
  );
  await api(
    op,
    "/api/admin/geo/questions/import/",
    { format: "markdown", text: "x".repeat(3 * 1024 * 1024), mode: "preview" },
    413,
  );
  check(
    "server confirmation, content/user-bound preview credentials and HTTP byte limit enforced",
  );
  const csv =
    "融资问题,问题分类,关键词,搜索意图,优先级,问题状态\n" +
    marker +
    " 表格问题,融资规划,合成、表格,认知型,3,待规划";
  const cr = await preview(op, "questions", csv, "csv");
  const cs = await commit(op, "questions", csv, cr, "csv");
  assert.equal(cs.successCount, 1);
  const oldCsv =
    "question,category,keywords,intent,priority,status\n" +
    marker +
    " 旧格式问题,融资规划,合成|兼容,COMPARISON,3,OPEN";
  const legacy = await api(
    op,
    "/api/admin/geo/questions/import/",
    { csv: oldCsv },
    201,
  );
  questionIds.push(...legacy.createdIds);
  assert.equal(legacy.count, 1);
  const invalidCsv =
    "融资问题,问题分类,关键词,搜索意图,优先级,问题状态\n" +
    marker +
    " 原子测试一,融资规划,合成,认知型,3,待规划\n" +
    marker +
    " 原子测试二,非法分类,合成,认知型,3,待规划";
  const before = await p.geoQuestion.count();
  const failed = await api(
    op,
    "/api/admin/geo/questions/import/",
    { csv: invalidCsv },
    400,
  );
  assert.ok(failed.details.failedCount > 0);
  assert.equal(await p.geoQuestion.count(), before);
  check(
    "Chinese and legacy English CSV compatible through shared import service; invalid batch leaves zero partial rows",
  );
  for (const file of ["geo-questions.md", "geo-faqs.md", "geo-questions.csv"]) {
    const r = await op.request.get(base + "/templates/" + file);
    assert.equal(r.status(), 200);
    assert.ok((await r.text()).includes("融资"));
  }
  await page.goto(base + "/admin/geo/questions/");
  let block = page.getByTestId("questions-markdown-import");
  await block.locator(":scope > summary").click();
  await block.locator("input[type=file]").setInputFiles({
    name: "过大.md",
    mimeType: "text/markdown",
    buffer: Buffer.alloc(1024 * 1024 + 1, 65),
  });
  await block.getByRole("status").filter({ hasText: "超过1MB" }).waitFor();
  await block.locator("input[type=file]").setInputFiles({
    name: "错误编码.md",
    mimeType: "text/markdown",
    buffer: Buffer.from([0xff, 0xfe, 0x00]),
  });
  await block.getByRole("status").filter({ hasText: "编码无法识别" }).waitFor();
  check(
    "downloadable templates, file byte limit and invalid UTF-8 browser feedback",
  );
  for (const width of [375, 768, 1024, 1440])
    for (const kind of ["questions", "faqs"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + `/admin/geo/${kind}/`);
      block = page.getByTestId(`${kind}-markdown-import`);
      await block.locator(":scope > summary").click();
      await block.getByRole("radio", { name: "粘贴文本", exact: true }).check();
      await block
        .locator("textarea")
        .fill(kind === "questions" ? questions() : faqText());
      const response = page.waitForResponse(
        (r) =>
          r.url() === base + `/api/admin/geo/${kind}/import/` &&
          r.request().method() === "POST",
      );
      await block
        .getByRole("button", { name: "解析与预览", exact: true })
        .click();
      await response;
      await block.getByText("导入预览", { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      if (width === 1440)
        await block.screenshot({ path: `${folder}/${kind}-preview.png` });
    }
  check("both real preview interfaces pass375/768/1024/1440 width checks");
  const audit = await p.auditLog.findUniqueOrThrow({
    where: { id: fa.reference },
  });
  assert.equal(audit.actorId, operator.id);
  assert.equal(audit.action, "FAQ_IMPORT");
  assert.equal(audit.metadata.count, 55);
  assert.equal("text" in audit.metadata, false);
  assert.equal("confirmationToken" in audit.metadata, false);
  assert.ok(
    await p.auditLog.count({
      where: { actorId: operator.id, action: "QUESTION_IMPORT" },
    }),
  );
  check(
    "import actor/time/count audit exists with no passwords, preview credentials or source body",
  );
  let limited = false;
  for (let i = 0; i < 65; i++) {
    const r = await op.request.post(base + "/api/admin/geo/questions/import/", {
      headers: { Origin: base },
      data: { format: "markdown", text: questions(1), mode: "preview" },
    });
    if (r.status() === 429) {
      limited = true;
      break;
    }
    assert.equal(r.status(), 200);
  }
  assert.equal(limited, true);
  check("persistent per-user preview abuse limit returns429");
  for (const u of baseline.users) {
    const n = await p.adminUser.findUniqueOrThrow({ where: { id: u.id } });
    assert.ok(n.passwordHash === u.passwordHash, "original password unchanged");
    assert.equal(n.role, u.role);
  }
  for (const l of baseline.leads)
    assert.ok(await p.lead.findUnique({ where: { id: l.id } }));
  for (const a of baseline.articles)
    assert.ok(await p.article.findUnique({ where: { id: a.id } }));
  for (const f of baseline.faqs)
    assert.ok(await p.faq.findUnique({ where: { id: f.id } }));
  for (const q of baseline.questions)
    assert.ok(await p.geoQuestion.findUnique({ where: { id: q.id } }));
  check(
    "all pre-existing business records, users and password hashes retained",
  );
  assert.deepEqual(evidence.pageErrors, []);
  evidence.outcome = "PASS";
}
main()
  .catch((e) => {
    console.error("Markdown import verification failed:", e.name, e.message);
    evidence.outcome = "FAIL";
    evidence.failure = e.name;
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await p.$transaction(async (tx) => {
        await tx.geoQuestion.deleteMany({
          where: { id: { in: questionIds }, question: { startsWith: marker } },
        });
        await tx.faqVersion.deleteMany({ where: { faqId: { in: faqIds } } });
        await tx.faq.deleteMany({
          where: { id: { in: faqIds }, question: { startsWith: marker } },
        });
        await tx.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: users } },
              { resourceId: { in: [...users, ...depts] } },
            ],
          },
        });
        await tx.adminUser.deleteMany({
          where: { id: { in: users }, email: { startsWith: "import-" + run } },
        });
        await tx.department.deleteMany({
          where: { id: { in: depts }, name: marker },
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
