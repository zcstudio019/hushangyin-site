const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  { randomUUID, randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = "http://127.0.0.1:3000",
  folder = "test-results/fact-check",
  p = new PrismaClient({ log: [] }),
  users = [],
  articles = [],
  contexts = [];
assert.equal(process.env.LOCAL_TEST_MODE, "true");
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
let browser;
const evidence = { base, checks: [], pageErrors: [], realAiCalled: false };
const pass = (s) => {
  console.log("PASS: " + s);
  evidence.checks.push(s);
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
async function context() {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (page) =>
    page.on("pageerror", () => evidence.pageErrors.push("页面未捕获异常")),
  );
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
  };
}
function facts(id) {
  return `/api/admin/geo/articles/${id}/facts/`;
}
function flow(id) {
  return `/api/admin/geo/articles/${id}/workflow/`;
}
async function clickPost(page, name, path, status = 200, scope = page) {
  const waiting = page.waitForResponse(
    (r) => r.url() === base + path && r.request().method() === "POST",
  );
  await scope.getByRole("button", { name, exact: true }).click();
  const r = await waiting;
  assert.equal(r.status(), status);
  return r.json();
}
async function save(page, id) {
  const waiting = page.waitForResponse(
    (r) =>
      r.url() === base + `/api/admin/geo/articles/${id}/` &&
      r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  const r = await waiting;
  assert.equal(r.status(), 200);
  const a = (await r.json()).data;
  await page
    .locator("#content-workflow")
    .getByText(new RegExp("版本 " + a.revision))
    .waitFor();
  return a;
}
(async () => {
  fs.mkdirSync(folder, { recursive: true });
  evidence.before = await counts();
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const root = await context(),
    op = await context(),
    reviewer = await context(),
    anon = await context(),
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
        name: "虚构事实检查验收人员",
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
  async function make(label, body) {
    const a = await api(
      op,
      "POST",
      "/api/admin/geo/articles/",
      {
        title: "规则测试" + label + "-" + randomUUID().slice(0, 6),
        slug: "fact-" + randomUUID().slice(0, 8),
        summary: "本地虚构规则验收，不是实际金融建议。",
        content: body,
        category: "融资风险与合规",
        tags: [],
        sources: [],
        relatedIds: [],
        aiAssisted: true,
      },
      201,
    );
    articles.push(a.id);
    await p.article.update({
      where: { id: a.id },
      data: {
        generationMetadata: {
          model: "本地确定性夹具（未调用AI）",
          templateVersion: 1,
        },
      },
    });
    return a;
  }
  const A = await make(
    "A基础知识",
    "## 基础说明\n\n咨询服务是否等于保证放款？\n不等于。不保证贷款获批。不承诺百分百放款。\n任何机构均不应承诺包过。审批结果以银行最终决定为准。\n请评估还款能力与还款风险。",
  );
  const B = await make(
    "B承诺检查",
    "## 本地违规规则测试\n我们保证放款。\n请评估还款风险。",
  );
  const C = await make(
    "C依据检查",
    "## 具体事实测试\n某银行2026年经营贷年化利率为3.1%。\n以上仅为虚构规则测试数值，不对应真实产品。请评估还款风险。",
  );
  const page = await op.newPage(),
    rp = await reviewer.newPage(),
    rootPage = await root.newPage();
  await page.goto(base + `/admin/geo/articles/${A.id}/`);
  await page.getByRole("region", { name: "文章事实检查" }).waitFor();
  const fa = await api(op, "GET", facts(A.id));
  assert.ok(!fa.findings.some((f) => f.severity === "MUST_FIX"));
  const row = page
    .getByRole("listitem")
    .filter({
      has: page.getByText("需要人工核实 · 承诺语境待核实", { exact: true }),
    });
  await row.getByRole("button", { name: "定位并修改", exact: true }).click();
  let selected = await page
    .locator("[name=content]")
    .evaluate((el) => ({
      text: el.value.slice(el.selectionStart, el.selectionEnd),
      line: el.value.slice(0, el.selectionStart).split("\n").length,
    }));
  assert.ok(selected.text.includes("咨询服务是否等于保证放款"));
  assert.equal(selected.line, 3);
  const old = await page.locator("[name=content]").inputValue();
  await page.locator("[name=content]").fill("\n\n" + old);
  await row.getByRole("button", { name: "定位并修改", exact: true }).click();
  selected = await page
    .locator("[name=content]")
    .evaluate((el) => ({
      line: el.value.slice(0, el.selectionStart).split("\n").length,
    }));
  assert.equal(selected.line, 5);
  const saved = await save(page, A.id);
  await clickPost(page, "重新执行事实核验（已保存版本）", facts(A.id));
  const report = await p.article.findUnique({
    where: { id: A.id },
    select: { complianceReport: true, revision: true },
  });
  assert.equal(report.complianceReport.revision, saved.revision);
  assert.ok(report.complianceReport.checkedAt);
  pass(
    "A否定和风险提示不阻断；点击原文选中正文，插入两行后定位重算；检查按版本持久保存",
  );
  const request = await clickPost(page, "申请人工复核", facts(A.id), 200, row);
  const requestId = request.data.id;
  const current = await api(op, "GET", facts(A.id));
  const f = current.findings.find((f) => f.code === "GUARANTEE_QUESTION");
  const duplicate = await api(op, "POST", facts(A.id), {
    action: "request",
    revision: saved.revision,
    findingKey: f.key,
    note: "请独立核验本地测试问句语境及依据。",
  });
  assert.equal(duplicate.id, requestId);
  assert.equal(duplicate.duplicate, true);
  const risk = {
    level: "LOW",
    confirmed: true,
    basis: "逐句核对本地通用提醒，明确否定任何放款承诺，没有具体产品或数据。",
    evidence: [],
  };
  await api(
    op,
    "POST",
    facts(A.id),
    {
      action: "decide",
      revision: saved.revision,
      requestId,
      accepted: true,
      note: risk.basis,
      risk,
    },
    403,
  );
  await api(anon, "GET", facts(A.id), undefined, 401);
  await rp.goto(base + "/admin/geo/reviews/");
  await rp
    .getByRole("heading", { name: "AI文章事实复核待办", exact: true })
    .waitFor();
  await rp.getByRole("link").filter({ hasText: A.title }).click();
  const preflight = rp
    .locator("form")
    .filter({
      has: rp.getByRole("button", { name: "确认核验判断", exact: true }),
    });
  await preflight.locator("[name=riskConfirmed]").check();
  await preflight.locator("[name=note]").fill(risk.basis);
  await clickPost(rp, "确认核验判断", facts(A.id), 200, preflight);
  const checked = await api(op, "GET", facts(A.id));
  assert.equal(
    checked.findings.filter((f) => f.severity === "MUST_FIX").length,
    0,
  );
  assert.ok(
    !checked.findings.some((f) =>
      ["PROFESSIONAL_BASIS", "GUARANTEE_QUESTION"].includes(f.code),
    ),
  );
  assert.equal(
    (await p.article.findUnique({ where: { id: A.id } })).status,
    "DRAFT",
  );
  await api(
    reviewer,
    "POST",
    facts(A.id),
    {
      action: "decide",
      revision: saved.revision,
      requestId,
      accepted: true,
      note: risk.basis,
      risk,
    },
    409,
  );
  pass(
    "申请去重，作者和匿名拒绝；独立审核中心看到待办并真实复核，专业判断无须URL，不自动审核或发布",
  );
  await page.reload();
  await page
    .locator("[name=content]")
    .fill("\n" + (await page.locator("[name=content]").inputValue()));
  const edited = await save(page, A.id);
  await api(
    op,
    "POST",
    facts(A.id),
    { action: "check", revision: saved.revision },
    409,
  );
  assert.ok(
    (await api(op, "GET", facts(A.id))).findings.some(
      (f) => f.code === "PROFESSIONAL_BASIS",
    ),
  );
  await clickPost(page, "提交审核", flow(A.id));
  assert.equal(
    (await p.article.findUnique({ where: { id: A.id } })).status,
    "IN_REVIEW",
  );
  await rp.goto(base + `/admin/geo/articles/${A.id}/`);
  const wf = rp.locator("#content-workflow");
  for (const key of [
    "sources",
    "promises",
    "relationships",
    "cases",
    "promotion",
    "privacy",
    "human",
  ])
    await wf.locator(`[name=${key}]`).check();
  await wf.locator("[name=riskConfirmed]").check();
  await wf.locator("[name=note]").fill(risk.basis);
  await clickPost(rp, "审核通过", flow(A.id), 200, wf);
  await rootPage.goto(base + `/admin/geo/articles/${A.id}/`);
  await clickPost(rootPage, "发布到官网", flow(A.id));
  assert.equal(
    (await anon.request.get(base + "/insights/" + A.slug + "/")).status(),
    200,
  );
  assert.ok(
    !(await api(root, "GET", facts(A.id))).findings.some(
      (f) => f.code === "PROFESSIONAL_BASIS",
    ),
  );
  evidence.A = { id: A.id, revision: edited.revision, publicStatus: 200 };
  pass(
    "修改后旧复核自动失效，过期版本拒绝；A正常提交、独立七项与专业判断审核后授权发布200",
  );
  await page.goto(base + `/admin/geo/articles/${B.id}/`);
  const fb = await api(op, "GET", facts(B.id));
  assert.ok(
    fb.findings.some(
      (f) => f.code === "GUARANTEE" && f.severity === "MUST_FIX",
    ),
  );
  await api(
    op,
    "POST",
    flow(B.id),
    { action: "submit", revision: B.revision },
    409,
  );
  const rb = await api(op, "POST", facts(B.id), {
    action: "request",
    revision: B.revision,
    findingKey: fb.findings.find((f) => f.code === "GUARANTEE").key,
    note: "请核对本条真实承诺测试，不能直接通过。",
  });
  const bad = await api(
    reviewer,
    "POST",
    facts(B.id),
    {
      action: "decide",
      revision: B.revision,
      requestId: rb.id,
      accepted: true,
      note: risk.basis,
      risk,
    },
    400,
  );
  assert.equal(bad.code, "MUST_EDIT");
  const bcard = page
    .getByRole("listitem")
    .filter({ has: page.getByText("必须修复 · 保证性承诺", { exact: true }) });
  await bcard.getByRole("button", { name: "定位并修改", exact: true }).click();
  assert.ok(
    (
      await page
        .locator("[name=content]")
        .evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd))
    ).includes("保证放款"),
  );
  await page
    .locator("[name=content]")
    .fill("## 已修改提醒\n不保证放款。请评估还款能力和还款风险。");
  const bnext = await save(page, B.id);
  await clickPost(page, "重新执行事实核验（已保存版本）", facts(B.id));
  assert.ok(
    !(await api(op, "GET", facts(B.id))).findings.some(
      (f) => f.code === "GUARANTEE",
    ),
  );
  await clickPost(page, "提交审核", flow(B.id));
  evidence.B = {
    id: B.id,
    blockedCode: bad.code,
    repairedRevision: bnext.revision,
  };
  pass(
    "B真实承诺阻断且独立复核不能勾选绕过；定位修改保存后旧问题消失，可提交审核",
  );
  const fc = await api(op, "GET", facts(C.id));
  const claim = fc.findings.find((f) => f.code === "FACT_EVIDENCE");
  assert.ok(claim);
  const ce = await api(
    op,
    "POST",
    flow(C.id),
    { action: "submit", revision: C.revision },
    409,
  );
  assert.equal(ce.code, "COMPLIANCE_REQUIRED");
  const cr = await api(op, "POST", facts(C.id), {
    action: "request",
    revision: C.revision,
    findingKey: claim.key,
    note: "本条为虚构数值的规则测试，缺少可靠依据，不能认可为真实金融数据。",
  });
  const low = await api(
    reviewer,
    "POST",
    facts(C.id),
    {
      action: "decide",
      revision: C.revision,
      requestId: cr.id,
      accepted: true,
      note: risk.basis,
      risk,
    },
    400,
  );
  assert.equal(low.code, "RISK_DOWNGRADE");
  const missing = await api(
    reviewer,
    "POST",
    facts(C.id),
    {
      action: "decide",
      revision: C.revision,
      requestId: cr.id,
      accepted: true,
      note: risk.basis,
      risk: { ...risk, level: "HIGH" },
    },
    400,
  );
  assert.equal(missing.code, "EVIDENCE_REQUIRED");
  await page.goto(base + `/admin/geo/articles/${C.id}/`);
  await page.getByText("必须修复 · 具体事实依据", { exact: true }).waitFor();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  }
  await page.screenshot({
    path: folder + "/missing-evidence.png",
    fullPage: true,
  });
  assert.equal(
    (await p.article.findUnique({ where: { id: C.id } })).status,
    "DRAFT",
  );
  assert.equal(
    (await anon.request.get(base + "/insights/" + C.slug + "/")).status(),
    404,
  );
  evidence.C = {
    id: C.id,
    blockedCode: ce.code,
    downgrade: low.code,
    missingEvidence: missing.code,
  };
  pass(
    "C具体银行利率无依据禁止提交；降风险和空证据均服务端拒绝，未公开；四视口无溢出",
  );
  assert.equal(
    await p.auditLog.count({
      where: {
        action: "ARTICLE_FACT_DECISION",
        resourceId: { in: [B.id, C.id] },
      },
    }),
    0,
  );
  assert.ok(
    await p.auditLog.count({
      where: { action: "ARTICLE_FACT_DECISION", resourceId: A.id },
    }),
  );
  assert.deepEqual(evidence.pageErrors, []);
  evidence.outcome = "PASS";
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
        where: { articleId: { in: articles } },
      });
      await p.articleSource.deleteMany({
        where: { articleId: { in: articles } },
      });
      await p.articleVersion.deleteMany({
        where: { articleId: { in: articles } },
      });
      await p.article.deleteMany({ where: { id: { in: articles } } });
      await p.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: users } },
            { resourceId: { in: [...articles, ...users] } },
          ],
        },
      });
      await p.adminSession.deleteMany({ where: { adminId: { in: users } } });
      await p.adminUser.deleteMany({ where: { id: { in: users } } });
      evidence.syntheticCleaned = true;
      evidence.after = await counts();
      assert.deepEqual(evidence.after, evidence.before);
    } catch (e) {
      console.error("清理/数量核对失败", e.message);
      evidence.syntheticCleaned = false;
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
