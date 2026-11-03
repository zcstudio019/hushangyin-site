const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  { randomBytes, randomUUID } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  chromium,
} = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const existingGrant = process.argv.includes("--existing-grant");
const p = new PrismaClient({ log: [] }),
  base = "http://127.0.0.1:3000",
  folder = existingGrant
    ? "test-results/independent-reviewer"
    : "test-results/review-permission",
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
    existingGrant,
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
async function grantExisting(rootPage, rootPassword, user) {
  const before = await p.adminUser.findUniqueOrThrow({
    where: { id: user.id },
  });
  await rootPage.goto(
    base + `/admin/settings/users/${user.id}/?grant=reviewer#review-permission`,
  );
  for (const width of [375, 1440]) {
    await rootPage.setViewportSize({ width, height: 900 });
    assert.equal(
      await rootPage.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  }
  await rootPage.screenshot({ path: folder + "/reviewer-grant.png" });
  await rootPage.getByRole("checkbox").check();
  await rootPage.locator('[name="reauthPassword"]').fill(rootPassword);
  await click(
    rootPage,
    "确认授予内容审核权限",
    `/api/admin/users/${user.id}/`,
    "PATCH",
  );
  await rootPage.reload();
  const after = await p.adminUser.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(after.passwordHash === before.passwordHash, "授权不应修改既有密码");
  assert.equal(after.mustChangePassword, before.mustChangePassword);
  assert.equal(after.departmentId, before.departmentId);
  assert.equal(after.isActive, before.isActive);
  assert.equal(after.role, "CONTENT_REVIEWER");
  user.role = "CONTENT_REVIEWER";
  return after;
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
const source =
  "Next.js官方站点地图技术说明（软件验收） | https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap | " +
  new Date().toISOString().slice(0, 10);
async function approve(page, id) {
  await page.goto(base + `/admin/geo/faqs/${id}/`);
  for (const k of keys) await page.locator(`[name="${k}"]`).check();
  await page.locator('[name="note"]').fill(note);
  await click(page, "审核通过", `/api/admin/geo/faqs/${id}/workflow/`);
}
async function assign(page, id, userId) {
  await page.goto(base + `/admin/geo/faqs/${id}/`);
  await page.locator('[name="assigneeId"]').selectOption(userId);
  await click(
    page,
    "保存审核人分配",
    `/api/admin/geo/faqs/${id}/review-assignment/`,
  );
  await page.reload();
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
  const credentials = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  await login(rootPage, credentials.adminEmail, credentials.adminPassword);
  const original = await api(root, "GET", "/api/admin/profile/");
  assert.equal(original.role, "SUPER_ADMIN");
  evidence.rootId = original.id;
  const existing = await p.faq.findFirstOrThrow({
    where: {
      status: "IN_REVIEW",
      authorId: original.id,
      editorId: original.id,
    },
  });
  const historicalBefore = await p.faq.findUniqueOrThrow({
    where: { id: existing.id },
  });
  await rootPage.goto(base + `/admin/geo/faqs/${existing.id}/`);
  await rootPage
    .getByText(
      "审核受阻：没有合格的独立审核人。不能通过修改作者、导入来源或直接改状态解除限制。",
      { exact: true },
    )
    .waitFor();
  const row = await api(
    root,
    "GET",
    "/api/admin/geo/reviews/?type=faqs&q=" +
      encodeURIComponent(existing.question),
  );
  const policy = row.items.find((i) => i.id === existing.id).policy;
  assert.equal(policy.currentActor.id, original.id);
  assert.equal(policy.currentActor.canReview, true);
  assert.equal(policy.selfReview, true);
  assert.equal(policy.qualifiedCount, 0);
  await rootPage.screenshot({
    path: folder + "/blocked-history.png",
    fullPage: true,
  });
  evidence.historical = {
    faqId: existing.id,
    revision: existing.revision,
    authorId: existing.authorId,
    editorId: existing.editorId,
    submittedById: existing.submittedById,
    importedBy: existing.importMetadata.importedBy,
    qualifiedReviewers: 0,
  };
  check(
    "真实原管理员登录与数据库判定一致：有审核权限，但60组本人导入内容没有合格独立审核人",
  );
  const a = await createStaff(
      rootPage,
      credentials.adminPassword,
      "CONTENT_OPERATOR",
      "运营A",
    ),
    A = await activate(a);
  const b = await createStaff(
    rootPage,
    credentials.adminPassword,
    existingGrant ? "CONTENT_OPERATOR" : "CONTENT_REVIEWER",
    "独立审核B",
  );
  if (existingGrant)
    await grantExisting(rootPage, credentials.adminPassword, b);
  assert.ok(
    (await p.auditLog.count({
      where: {
        resourceId: b.id,
        actorId: original.id,
        action: "CONTENT_REVIEWER_GRANT",
      },
    })) > 0,
  );
  assert.equal(
    (await p.adminUser.findUniqueOrThrow({ where: { id: b.id } }))
      .mustChangePassword,
    true,
  );
  check(
    "超级管理员经员工界面和当前密码重新认证正式授予独立审核角色，授权审计真实入库",
  );
  await A.page.goto(base + "/admin/geo/faqs/new/");
  await A.page
    .locator('[name="question"]')
    .fill(marker + "：站点地图技术验收如何核对？");
  await A.page.locator('[name="category"]').selectOption("融资知识");
  await A.page
    .locator('[name="answer"]')
    .fill(
      "站点地图用于帮助搜索引擎发现网站内容。本条仅验证软件流程，不是融资建议。请评估还款风险。",
    );
  await A.page.locator('[name="sources"]').fill(source);
  const faq = await click(
    A.page,
    "保存草稿",
    "/api/admin/geo/faqs/",
    "POST",
    201,
  );
  faqs.push(faq.id);
  await A.page.waitForURL(base + `/admin/geo/faqs/${faq.id}/`);
  await click(A.page, "提交审核", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  const url = base + "/faqs/" + faq.id + "/";
  assert.equal((await anon.request.get(url)).status(), 404);
  await api(
    root,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/review-assignment/`,
    { revision: 1, assigneeId: b.id },
    400,
  );
  if (existingGrant) {
    const ctx = await api(
      root,
      "GET",
      "/api/admin/geo/reviews/?q=" + encodeURIComponent(marker),
    );
    const ex = ctx.items
      .find((i) => i.id === faq.id)
      .policy.excludedAccounts.find((u) => u.id === b.id);
    assert.ok(ex.reasons.some((r) => r.includes("未激活")));
  }
  const B = await activate(b);
  if (existingGrant) {
    await rootPage.goto(base + `/admin/geo/faqs/${faq.id}/`);
    await rootPage
      .getByRole("button", { name: "刷新审核人资格", exact: true })
      .click();
    const candidate = await rootPage
      .locator(`[name="assigneeId"] option[value="${b.id}"]`)
      .textContent();
    const dept = await p.department.findUnique({
      where: { id: b.departmentId },
    });
    assert.ok(candidate.includes("独立内容审核员"));
    assert.ok(candidate.includes(dept.name));
    check(
      "员工授权不修改密码、部门或激活标志；首次改密后刷新列表显示姓名、角色与真实部门",
    );
  }

  await api(
    A.c,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/review-assignment/`,
    { revision: 1, assigneeId: b.id },
    403,
  );
  await api(
    A.c,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
    { action: "approve", revision: 1, note, checklist },
    403,
  );
  await api(
    root,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/review-assignment/`,
    { revision: 0, assigneeId: b.id },
    409,
  );
  await assign(rootPage, faq.id, b.id);
  assert.equal(
    (await p.faq.findUniqueOrThrow({ where: { id: faq.id } }))
      .reviewAssignedRevision,
    1,
  );
  check(
    "账号A在浏览器创建、补真实技术来源、提交；B先改初始密码才可分配；A自审/分配和旧版本分配被拒绝",
  );
  await api(
    root,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
    { action: "approve", revision: 1, note, checklist },
    403,
  );
  await api(B.c, "GET", "/api/admin/leads/", undefined, 403);
  await api(B.c, "GET", "/api/admin/users/", undefined, 403);
  await api(
    B.c,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
    { action: "publish", revision: 1 },
    403,
  );
  await api(
    B.c,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/review-assignment/`,
    { revision: 1, assigneeId: original.id },
    403,
  );
  await B.page.goto(
    base + "/admin/geo/reviews/?type=faqs&q=" + encodeURIComponent(marker),
  );
  await B.page
    .getByRole("row")
    .filter({ hasText: faq.question })
    .getByRole("link", { name: "查看与审核" })
    .click();
  await B.page.getByRole("button", { name: "审核通过", exact: true }).waitFor();
  assert.ok(
    await B.page.getByRole("button", { name: "退回修改", exact: true }).count(),
  );
  check(
    "B可从审核中心查看全文与来源并审核；超级管理员不能越过已分配人，B无发布/客户/员工/分配权限",
  );
  await A.page.goto(base + `/admin/geo/faqs/${faq.id}/`);
  await click(A.page, "撤回审核", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  assert.equal(
    (await p.faq.findUniqueOrThrow({ where: { id: faq.id } })).reviewAssigneeId,
    null,
  );
  await api(
    B.c,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
    { action: "approve", revision: 1, note, checklist },
    409,
  );
  await A.page.reload();
  await A.page
    .locator('[name="answer"]')
    .fill(
      "修订后的技术合成验收：站点地图用于帮助搜索引擎发现网站内容。不作融资事实依据，应评估还款风险。",
    );
  await click(A.page, "保存草稿", `/api/admin/geo/faqs/${faq.id}/`, "PATCH");
  await A.page.reload();
  await click(A.page, "提交审核", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  await api(
    root,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/review-assignment/`,
    { revision: 1, assigneeId: b.id },
    409,
  );
  await assign(rootPage, faq.id, b.id);
  assert.equal(
    (await p.faq.findUniqueOrThrow({ where: { id: faq.id } }))
      .reviewAssignedRevision,
    3,
  );
  check(
    "撤回与修改让旧分配失效，版本固定、旧审核请求拒绝，新版本重新分配并审计",
  );
  if (existingGrant) {
    const before = await p.adminUser.findUniqueOrThrow({ where: { id: b.id } });
    await rootPage.goto(base + `/admin/settings/users/${b.id}/`);
    const form = rootPage.locator("form").filter({
      has: rootPage.getByRole("button", {
        name: "保存员工资料",
        exact: true,
      }),
    });
    await form.locator('[name="role"]').selectOption("CONTENT_OPERATOR");
    await form
      .locator('[name="reauthPassword"]')
      .fill(credentials.adminPassword);
    await click(rootPage, "保存员工资料", `/api/admin/users/${b.id}/`, "PATCH");
    const revoked = await p.adminUser.findUniqueOrThrow({
      where: { id: b.id },
    });
    assert.ok(revoked.passwordHash === before.passwordHash);
    assert.equal(revoked.mustChangePassword, false);
    await api(B.c, "GET", "/api/admin/geo/reviews/", undefined, 401);
    await login(B.page, b.email, b.password);
    await api(
      B.c,
      "POST",
      `/api/admin/geo/faqs/${faq.id}/workflow/`,
      { action: "approve", revision: 3, note, checklist },
      403,
    );
    await rootPage.goto(base + `/admin/geo/faqs/${faq.id}/`);
    await rootPage
      .getByRole("button", { name: "刷新审核人资格", exact: true })
      .click();
    const ctx = await api(
      root,
      "GET",
      "/api/admin/geo/reviews/?q=" + encodeURIComponent(marker),
    );
    assert.ok(
      ctx.items
        .find((i) => i.id === faq.id)
        .policy.excludedAccounts.find((u) => u.id === b.id)
        .reasons.includes("无内容审核权限"),
    );
    await grantExisting(rootPage, credentials.adminPassword, b);
    assert.equal(
      (await p.adminUser.findUniqueOrThrow({ where: { id: b.id } }))
        .mustChangePassword,
      false,
    );
    await api(B.c, "GET", "/api/admin/geo/reviews/", undefined, 401);
    await login(B.page, b.email, b.password);
    await assign(rootPage, faq.id, b.id);
    check(
      "取消审核权限立即失效旧会话并拒绝审核；已激活员工重新授权后沿用原密码，无需重复改密",
    );
  }
  const userPayload = {
    name: b.name,
    email: b.email,
    role: "CONTENT_REVIEWER",
    departmentId: null,
    isActive: false,
    reauthPassword: credentials.adminPassword,
  };
  await api(root, "PATCH", "/api/admin/users/" + b.id + "/", userPayload);
  await api(B.c, "GET", "/api/admin/geo/reviews/", undefined, 401);
  const denied = await api(
    root,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
    { action: "approve", revision: 3, note, checklist },
    403,
  );
  assert.equal(denied.code, "REVIEW_ASSIGNMENT_INVALID");
  await api(
    root,
    "POST",
    `/api/admin/geo/faqs/${faq.id}/review-assignment/`,
    { revision: 3, assigneeId: b.id },
    400,
  );
  await api(root, "PATCH", "/api/admin/users/" + b.id + "/", {
    ...userPayload,
    isActive: true,
  });
  await login(B.page, b.email, b.password);
  await assign(rootPage, faq.id, b.id);
  check("审核员停用立即失效旧会话与审核资格，重新启用登录并正式确认分配后恢复");
  await rootPage.screenshot({
    path: folder + "/review-assignment.png",
    fullPage: true,
  });
  if (existingGrant) {
    await B.page.goto(base + "/admin/geo/reviews/?view=pending&mine=true");
    assert.equal(
      await B.page.locator('input[name="mine"]').inputValue(),
      "true",
    );
    await B.page.locator('[name="q"]').fill(marker);
    await B.page.getByRole("button", { name: "筛选", exact: true }).click();
    await B.page.waitForURL((u) => u.searchParams.get("q") === marker);
    assert.equal(new URL(B.page.url()).searchParams.get("mine"), "true");
    const historyHref = await B.page
      .getByRole("link", { name: "已审核记录", exact: true })
      .getAttribute("href");
    assert.equal(new URL(historyHref, base).searchParams.has("mine"), false);
    await B.page.getByRole("row").filter({ hasText: faq.question }).waitFor();
    const todo = await api(
      B.c,
      "GET",
      "/api/admin/geo/reviews/?view=pending&mine=true",
    );
    assert.ok(todo.items.some((i) => i.id === faq.id));
    assert.ok(todo.items.every((i) => i.policy.assigneeId === b.id));
  }
  await approve(B.page, faq.id);
  assert.equal(
    (await p.faq.findUniqueOrThrow({ where: { id: faq.id } })).status,
    "APPROVED",
  );
  assert.equal((await anon.request.get(url)).status(), 404);
  await rootPage.goto(
    base + "/admin/geo/reviews/?view=ready&q=" + encodeURIComponent(marker),
  );
  await rootPage.getByRole("link", { name: "查看与发布", exact: true }).click();
  await click(
    rootPage,
    "发布到官网",
    `/api/admin/geo/faqs/${faq.id}/workflow/`,
  );
  const pub = await anon.newPage();
  await pub.goto(url);
  assert.ok(
    (await pub.locator("main").innerText()).includes("修订后的技术合成验收"),
  );
  assert.ok(
    (await (await anon.request.get(base + "/sitemap.xml")).text()).includes(
      url,
    ),
  );
  const review = await p.contentReview.findFirstOrThrow({
    where: { faqId: faq.id, revision: 3, decision: "APPROVED" },
  });
  assert.equal(review.reviewerId, b.id);
  evidence.publication = {
    faqId: faq.id,
    url,
    publishedRevision: 3,
    creatorId: a.id,
    reviewerId: b.id,
    publisherId: original.id,
  };
  check(
    "A→B真实人工审核→授权发布账号发布；审批不自动公开，发布后独立URL和Sitemap正确",
  );
  const md = `## F001｜${marker} 历史导入样例？\n- 分类：融资知识\n- 状态：待审核\n\n### 答案\n\n此条为合成导入数据，不是融资事实。`;
  const preview = await api(root, "POST", "/api/admin/geo/faqs/import/", {
    format: "markdown",
    text: md,
    mode: "preview",
  });
  const imported = await api(
    root,
    "POST",
    "/api/admin/geo/faqs/import/",
    {
      format: "markdown",
      text: md,
      mode: "commit",
      confirmed: true,
      confirmationToken: preview.confirmationToken,
    },
    201,
  );
  const importedId = imported.createdIds[0];
  faqs.push(importedId);
  const before = await p.faq.findUniqueOrThrow({ where: { id: importedId } });
  await api(
    root,
    "POST",
    `/api/admin/geo/faqs/${importedId}/review-assignment/`,
    { revision: 1, assigneeId: original.id },
    400,
  );
  await assign(rootPage, importedId, b.id);
  await B.page.goto(base + `/admin/geo/faqs/${importedId}/`);
  assert.equal(
    await B.page
      .getByRole("button", { name: "审核通过", exact: true })
      .isDisabled(),
    true,
  );
  await B.page
    .getByText(
      "未填写引用来源，请由作者补充来源标题、HTTPS网址和实际核验日期。",
      { exact: true },
    )
    .waitFor();
  await api(
    B.c,
    "POST",
    `/api/admin/geo/faqs/${importedId}/workflow/`,
    { action: "approve", revision: 1, note, checklist },
    400,
  );
  await rootPage.goto(base + `/admin/geo/faqs/${importedId}/`);
  await click(
    rootPage,
    "撤回审核",
    `/api/admin/geo/faqs/${importedId}/workflow/`,
  );
  await rootPage.reload();
  if (existingGrant) {
    await rootPage
      .getByRole("link", { name: "前往引用来源填写区 ↓", exact: true })
      .click();
    assert.equal(new URL(rootPage.url()).hash, "#content-sources");
  }
  await rootPage.locator('[name="sources"]').fill(source);
  await click(
    rootPage,
    "保存草稿",
    `/api/admin/geo/faqs/${importedId}/`,
    "PATCH",
  );
  await rootPage.reload();
  await click(
    rootPage,
    "提交审核",
    `/api/admin/geo/faqs/${importedId}/workflow/`,
  );
  await assign(rootPage, importedId, b.id);
  await approve(B.page, importedId);
  const after = await p.faq.findUniqueOrThrow({ where: { id: importedId } });
  assert.equal(after.authorId, before.authorId);
  assert.deepEqual(after.importMetadata, before.importMetadata);
  assert.equal(after.status, "APPROVED");
  check(
    "历史导入样例保留原作者与来源，通过独立授权审核员完成审核；缺引用时明确阻断，不改审计历史",
  );
  for (const width of [375, 768, 1024, 1440]) {
    for (const [page, path] of [
      [rootPage, `/admin/geo/faqs/${importedId}/`],
      [B.page, "/admin/geo/reviews/?q=" + encodeURIComponent(marker)],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + path);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
    }
  }
  await rootPage.screenshot({
    path: folder + "/approved-history.png",
    fullPage: true,
  });
  check("审核分配/审核中心四视口无水平溢出，浏览器未捕获异常为零");
  await rootPage.goto(base + `/admin/geo/faqs/${faq.id}/`);
  await click(rootPage, "下线内容", `/api/admin/geo/faqs/${faq.id}/workflow/`);
  assert.equal((await anon.request.get(url)).status(), 404);
  assert.ok(
    (await p.auditLog.count({
      where: { resourceId: faq.id, action: "CONTENT_REVIEW_ASSIGN" },
    })) >= 3,
  );
  assert.ok(
    (await p.auditLog.count({
      where: {
        resourceId: faq.id,
        action: "CONTENT_REVIEW_ASSIGNMENT_INVALIDATED",
      },
    })) > 0,
  );
  const originalAfter = await p.faq.findUniqueOrThrow({
    where: { id: existing.id },
  });
  assert.deepEqual(originalAfter, historicalBefore);
  assert.equal(evidence.pageErrors.length, 0);
  evidence.originalHistoricalUntouched = true;
  check("发布下线和授权/分配/失效/审批审计真实保存，原历史FAQ未被分配或改写");
}
main()
  .catch((e) => {
    console.error(e.message);
    evidence.failed = e.message;
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
            { resourceId: { in: [...users, ...faqs] } },
          ],
        },
      });
      await p.adminSession.deleteMany({ where: { adminId: { in: users } } });
      await p.adminUser.deleteMany({ where: { id: { in: users } } });
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
