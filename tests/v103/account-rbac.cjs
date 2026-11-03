/* Real local service + PostgreSQL + Edge. Never print credentials/cookies. */
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
      : "test-results/") + "v103",
  run = randomBytes(6).toString("hex"),
  prefix = "V103合成-" + run;
assert.equal(process.env.SITE_URL, base);
assert.equal(process.env.LOCAL_TEST_MODE, "true");
if (process.env.DATABASE_PROVIDER === "sqlite")
  assert.ok(
    process.env.DATABASE_URL.startsWith("file:") &&
      process.env.LOCAL_TEST_MODE === "true",
  );
else assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
const db = new PrismaClient({ log: [] }),
  userIds = [],
  deptIds = [],
  leadIds = [],
  contexts = [];
const evidence = { run, base, checks: [], browserErrors: [], screenshots: [] };
let browser, mainCredentials;
const check = (label) => {
  evidence.checks.push(label);
  console.log("PASS: " + label);
};
const password = () => randomBytes(20).toString("hex") + "-Z9!";
async function request(ctx, method, path, data, status = 200) {
  const r = await ctx.request.fetch(base + path, {
    method,
    headers: { Origin: base },
    ...(data !== undefined ? { data } : {}),
  });
  assert.equal(
    r.status(),
    status,
    method + " " + path + " status " + r.status(),
  );
  const result = await r.json();
  if (status < 300) assert.equal(result.ok, true);
  return result.data || result.error;
}
async function login(ctx, email, pw, status = 200) {
  return request(
    ctx,
    "POST",
    "/api/admin/login/",
    { email, password: pw },
    status,
  );
}
async function context() {
  const c = await browser.newContext();
  contexts.push(c);
  c.on("page", (p) =>
    p.on("pageerror", () =>
      evidence.browserErrors.push("uncaught browser error"),
    ),
  );
  return c;
}
function userData(user, patch = {}) {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    isActive: user.isActive,
    ...patch,
  };
}
async function createUser(admin, pw, role, dept, label) {
  const r = await request(
    admin,
    "POST",
    "/api/admin/users/",
    {
      name: prefix + "-" + label,
      email: `v103-${run}-${label}@example.test`,
      role,
      departmentId: dept,
      isActive: true,
      reauthPassword: pw,
    },
    201,
  );
  userIds.push(r.user.id);
  assert.equal("passwordHash" in r.user, false);
  assert.equal(r.expiresInMinutes, 15);
  return { ...r.user, initial: r.initialPassword, password: password() };
}
async function activate(user) {
  const c = await context();
  const r = await login(c, user.email, user.initial);
  assert.ok(r.redirect.includes("/settings/profile/"));
  await request(c, "GET", "/api/admin/leads/", undefined, 403);
  await request(c, "PATCH", "/api/admin/profile/", {
    oldPassword: user.initial,
    newPassword: user.password,
    confirmation: user.password,
  });
  await request(c, "GET", "/api/admin/profile/", undefined, 401);
  await login(c, user.email, user.password);
  return c;
}
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  mainCredentials = JSON.parse(
    fs.readFileSync(".local-postgres/private.json", "utf8"),
  );
  browser = await chromium.launch({
    executablePath:
      process.env.BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const anon = await context();
  for (const path of [
    "/api/admin/users/",
    "/api/admin/departments/",
    "/api/admin/profile/",
    "/api/admin/leads/",
  ])
    await request(anon, "GET", path, undefined, 401);
  check("anonymous account and lead APIs rejected");
  const root = await context();
  await login(root, mainCredentials.adminEmail, mainCredentials.adminPassword);
  const original = await request(root, "GET", "/api/admin/profile/");
  assert.equal(original.role, "SUPER_ADMIN");
  check("original administrator login preserved and migrated to SUPER_ADMIN");
  if (
    (await db.adminUser.count({
      where: { role: "SUPER_ADMIN", isActive: true },
    })) === 1
  ) {
    const r = await request(
      root,
      "PATCH",
      `/api/admin/users/${original.id}/`,
      {
        ...userData(original, { isActive: false }),
        reauthPassword: mainCredentials.adminPassword,
      },
      409,
    );
    assert.equal(r.code, "LAST_SUPER_ADMIN");
    check("last active super administrator cannot be disabled");
  }
  await request(
    root,
    "POST",
    "/api/admin/users/",
    {
      name: "x",
      email: "broken",
      role: "SUPER_ADMIN",
      departmentId: null,
      isActive: true,
      reauthPassword: mainCredentials.adminPassword,
    },
    400,
  );
  const superUser = await createUser(
    root,
    mainCredentials.adminPassword,
    "SUPER_ADMIN",
    null,
    "super",
  );
  const admin = await context(),
    oldSession = await context();
  await login(admin, superUser.email, superUser.initial);
  await login(oldSession, superUser.email, superUser.initial);
  const adminPage = await admin.newPage();
  await adminPage.goto(base + "/admin/dashboard/");
  await adminPage.waitForURL("**/admin/settings/profile/**");
  await adminPage
    .getByRole("heading", { name: "修改密码", exact: true })
    .waitFor();
  check("first login redirects browser to mandatory password change");
  const forcedLogout = await context();
  await login(forcedLogout, superUser.email, superUser.initial);
  await request(forcedLogout, "POST", "/api/admin/logout/");
  await request(forcedLogout, "GET", "/api/admin/profile/", undefined, 401);
  check("mandatory-password-change session may log out safely");
  await request(admin, "GET", "/api/admin/users/", undefined, 403);
  await request(
    admin,
    "PATCH",
    "/api/admin/profile/",
    {
      oldPassword: "incorrect-value",
      newPassword: superUser.password,
      confirmation: superUser.password,
    },
    400,
  );
  await request(
    admin,
    "PATCH",
    "/api/admin/profile/",
    {
      oldPassword: superUser.initial,
      newPassword: "password123456789",
      confirmation: "password123456789",
    },
    400,
  );
  await request(
    admin,
    "PATCH",
    "/api/admin/profile/",
    {
      oldPassword: superUser.initial,
      newPassword: superUser.initial,
      confirmation: superUser.initial,
    },
    400,
  );
  check("wrong old password, weak password and password reuse rejected");
  await adminPage.locator('[name="oldPassword"]').fill(superUser.initial);
  await adminPage.locator('[name="newPassword"]').fill(superUser.password);
  await adminPage.locator('[name="confirmation"]').fill(superUser.password);
  await adminPage.getByRole("button", { name: "修改密码并重新登录" }).click();
  await adminPage.waitForURL(base + "/admin/login/");
  await request(oldSession, "GET", "/api/admin/profile/", undefined, 401);
  await request(admin, "GET", "/api/admin/profile/", undefined, 401);
  await login(admin, superUser.email, superUser.password);
  check("browser password change succeeded and all old sessions revoked");
  const pw = superUser.password;
  const reauth = { reauthPassword: pw };
  for (const suffix of ["A", "B"]) {
    const d = await request(
      admin,
      "POST",
      "/api/admin/departments/",
      { name: prefix + "-" + suffix, isActive: true, ...reauth },
      201,
    );
    deptIds.push(d.id);
  }
  const [a, b] = deptIds;
  const manager = await createUser(admin, pw, "SALES_MANAGER", a, "manager"),
    advisor = await createUser(admin, pw, "FINANCING_ADVISOR", a, "advisor"),
    other = await createUser(admin, pw, "FINANCING_ADVISOR", b, "other"),
    operator = await createUser(admin, pw, "CONTENT_OPERATOR", null, "content");
  await request(
    admin,
    "POST",
    "/api/admin/users/",
    { ...userData(advisor), ...reauth },
    409,
  );
  check("department and staff creation; duplicate email rejected");
  const managerCtx = await activate(manager),
    advisorCtx = await activate(advisor),
    otherCtx = await activate(other),
    contentCtx = await activate(operator);
  check("all employee roles complete initial password change and login");
  const searched = await request(
    admin,
    "GET",
    `/api/admin/users/?q=${encodeURIComponent(prefix)}&role=FINANCING_ADVISOR&active=true`,
  );
  assert.equal(searched.total, 2);
  assert.ok(
    searched.items.every(
      (u) => !("passwordHash" in u) && !("initialCredentialExpiresAt" in u),
    ),
  );
  check("staff search, role/status filters and field allowlist");
  for (const c of [managerCtx, advisorCtx, contentCtx]) {
    await request(
      c,
      "POST",
      "/api/admin/users/",
      { ...userData(operator), role: "SUPER_ADMIN", reauthPassword: "invalid" },
      403,
    );
    await request(
      c,
      "PATCH",
      `/api/admin/users/${operator.id}/`,
      { ...userData(operator), role: "SUPER_ADMIN", reauthPassword: "invalid" },
      403,
    );
  }
  await request(
    advisorCtx,
    "PATCH",
    "/api/admin/profile/",
    { role: "SUPER_ADMIN" },
    400,
  );
  check("employees cannot manage accounts or promote themselves");
  // Actual public browser consultation. Fixture leads B/unassigned are synthetic database records.
  const publicPage = await anon.newPage();
  await publicPage.goto(base + "/contact/");
  assert.equal(
    await publicPage.locator("#consult-form").getAttribute("data-submission"),
    "api",
  );
  const phone =
    "1990000" + String(parseInt(run.slice(0, 6), 16) % 10000).padStart(4, "0");
  await publicPage.locator('[name="name"]').fill(prefix);
  await publicPage.locator('[name="phone"]').fill(phone);
  await publicPage.locator('[name="customerType"]').selectOption("ENTERPRISE");
  await publicPage
    .locator('[name="financingAmount"]')
    .selectOption("100—300万元");
  await publicPage.locator('[name="hasProperty"]').selectOption("yes");
  await publicPage.locator('[name="hasCompany"]').selectOption("no");
  await publicPage.locator('[name="consent"]').check();
  const posted = publicPage.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url() === base + "/api/consultations/",
  );
  await publicPage.locator('button[type="submit"]').click();
  const post = await posted;
  assert.equal(post.status(), 201);
  const lead = (await post.json()).data.reference;
  leadIds.push(lead);
  await publicPage.locator(".form-feedback.success").waitFor();
  assert.equal(await db.consent.count({ where: { leadId: lead } }), 1);
  evidence.consultation = {
    url: publicPage.url(),
    status: 201,
    reference: lead,
  };
  check("actual contact browser POST 201, database lead and consent");
  const raw = {
    name: prefix,
    phone: "19900000000",
    customerType: "PERSONAL",
    financingAmount: "50万元以内",
    source: "v103-test",
    sourcePage: "/contact/",
  };
  for (let i = 0; i < 2; i++) {
    const l = await db.lead.create({
      data: { ...raw, name: prefix + "-" + i },
    });
    leadIds.push(l.id);
  }
  const [, foreign, unassigned] = leadIds;
  const foreignScope = await request(otherCtx, "GET", "/api/admin/leads/");
  assert.equal(foreignScope.total, 0);
  await request(admin, "PATCH", `/api/admin/leads/${lead}/assign/`, {
    assignedTo: advisor.id,
    ...reauth,
  });
  await request(admin, "PATCH", `/api/admin/leads/${foreign}/assign/`, {
    assignedTo: other.id,
    ...reauth,
  });
  const all = await request(admin, "GET", "/api/admin/leads/");
  assert.equal(all.total, await db.lead.count());
  for (const c of [managerCtx, advisorCtx]) {
    const list = await request(c, "GET", "/api/admin/leads/?departmentId=" + b);
    assert.deepEqual(
      list.items.map((l) => l.id),
      [lead],
    );
    assert.ok(list.items[0].phone.includes("****"));
    await request(c, "GET", `/api/admin/leads/${foreign}/`, undefined, 404);
    await request(
      c,
      "PATCH",
      `/api/admin/leads/${foreign}/`,
      { status: "COMPLETED" },
      404,
    );
    await request(c, "GET", `/api/admin/leads/${unassigned}/`, undefined, 404);
  }
  await request(contentCtx, "GET", "/api/admin/leads/", undefined, 403);
  await request(contentCtx, "GET", `/api/admin/leads/${lead}/`, undefined, 403);
  await request(
    contentCtx,
    "PATCH",
    `/api/admin/leads/${lead}/`,
    { status: "COMPLETED" },
    403,
  );
  const hidden = await advisorCtx.newPage();
  const hiddenResponse = await hidden.goto(base + `/admin/leads/${foreign}/`);
  assert.equal(hiddenResponse.status(), 404);
  assert.equal((await hidden.content()).includes(other.email), false);
  await hidden.goto(base + "/admin/settings/users/");
  await hidden.waitForURL("**/admin/settings/profile/**");
  check(
    "super all, manager department, advisor assigned, content denied; URL/API isolation and parameter tampering",
  );
  await request(
    advisorCtx,
    "PATCH",
    `/api/admin/leads/${lead}/assign/`,
    { assignedTo: other.id },
    403,
  );
  await request(
    managerCtx,
    "PATCH",
    `/api/admin/leads/${lead}/assign/`,
    { assignedTo: other.id },
    403,
  );
  await request(
    managerCtx,
    "PATCH",
    `/api/admin/leads/${foreign}/assign/`,
    { assignedTo: manager.id },
    403,
  );
  await request(managerCtx, "PATCH", `/api/admin/leads/${lead}/assign/`, {
    assignedTo: manager.id,
  });
  assert.equal(
    (await request(advisorCtx, "GET", "/api/admin/leads/")).total,
    0,
  );
  await request(managerCtx, "PATCH", `/api/admin/leads/${lead}/assign/`, {
    assignedTo: advisor.id,
  });
  check(
    "manager may assign within own department only, advisor may not assign",
  );
  const leadPage = await advisorCtx.newPage();
  await leadPage.goto(base + `/admin/leads/${lead}/`);
  await leadPage.locator('[name="status"]').selectOption("FOLLOWING");
  const changed = leadPage.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      r.url() === base + `/api/admin/leads/${lead}/`,
  );
  await leadPage.getByRole("button", { name: "保存状态" }).click();
  assert.equal((await changed).status(), 200);
  await leadPage.reload();
  assert.equal(
    await leadPage.locator('[name="status"]').inputValue(),
    "FOLLOWING",
  );
  assert.equal(
    (await db.lead.findUniqueOrThrow({ where: { id: lead } })).status,
    "FOLLOWING",
  );
  check("advisor browser status update persists after reload in database");
  await request(
    admin,
    "PATCH",
    `/api/admin/users/${advisor.id}/`,
    { ...userData(advisor, { departmentId: b }), ...reauth },
    409,
  );
  await request(
    admin,
    "PATCH",
    `/api/admin/departments/${a}/`,
    { name: prefix + "-A", isActive: false, ...reauth },
    409,
  );
  check(
    "moving employee with leads and disabling nonempty department rejected",
  );
  const csrf = await admin.request.post(base + "/api/admin/departments/", {
    headers: { Origin: "https://invalid.test" },
    data: { name: "x", isActive: true, ...reauth },
  });
  assert.equal(csrf.status(), 403);
  await request(
    admin,
    "PATCH",
    `/api/admin/users/${operator.id}/`,
    { ...userData(operator), reauthPassword: "incorrect" },
    401,
  );
  check("CSRF and sensitive operation password reauthentication enforced");
  // Browser UI: search, edit, department and permission pages, four actual viewports.
  const settings = await admin.newPage();
  await settings.goto(base + "/admin/settings/users/");
  await settings.locator('[name="q"]').fill(prefix);
  await settings.getByRole("button", { name: "搜索", exact: true }).click();
  await settings.waitForURL("**/admin/settings/users/?**");
  assert.equal(await settings.locator("tbody tr").count(), 5);
  for (const width of [375, 768, 1024, 1440])
    for (const path of [
      "/admin/settings/profile/",
      "/admin/settings/users/",
      "/admin/settings/users/new/",
      "/admin/settings/departments/",
      "/admin/settings/roles/",
    ]) {
      await settings.setViewportSize({ width, height: 900 });
      await settings.goto(base + path);
      assert.ok(await settings.locator("h1").isVisible());
      assert.equal(
        await settings.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
    }
  await settings.goto(base + "/admin/settings/users/");
  await settings.screenshot({ path: folder + "/users.png", fullPage: true });
  evidence.screenshots.push("users.png");
  check("settings browser search + 20 responsive checks at 375/768/1024/1440");
  const edit = await admin.newPage();
  await edit.goto(base + `/admin/settings/users/${operator.id}/`);
  await edit.locator('[name="name"]').fill(prefix + "-edited");
  await edit
    .locator("form")
    .filter({ has: edit.getByRole("button", { name: "保存员工资料" }) })
    .locator('[name="reauthPassword"]')
    .fill(pw);
  await edit.getByRole("button", { name: "保存员工资料" }).click();
  await edit
    .locator('[role="status"]')
    .filter({ hasText: "操作成功" })
    .waitFor();
  await request(contentCtx, "GET", "/api/admin/profile/", undefined, 401);
  check("browser employee edit succeeds and revokes previous session");
  await login(contentCtx, operator.email, operator.password);
  await request(admin, "PATCH", `/api/admin/users/${operator.id}/`, {
    ...userData(operator, { role: "FINANCING_ADVISOR", departmentId: a }),
    ...reauth,
  });
  await request(contentCtx, "GET", "/api/admin/profile/", undefined, 401);
  check("role change audited and old session invalidated");
  await request(admin, "PATCH", `/api/admin/users/${advisor.id}/`, {
    ...userData(advisor, { isActive: false }),
    ...reauth,
  });
  await request(advisorCtx, "GET", "/api/admin/profile/", undefined, 401);
  await login(advisorCtx, advisor.email, advisor.password, 401);
  assert.equal(
    (await db.lead.findUniqueOrThrow({ where: { id: lead } })).assignedTo,
    advisor.id,
  );
  check(
    "disabled employee cannot log in, old sessions revoked, assigned lead preserved",
  );
  await request(admin, "PATCH", `/api/admin/users/${advisor.id}/`, {
    ...userData(advisor),
    ...reauth,
  });
  await login(advisorCtx, advisor.email, advisor.password);
  check("employee re-enabled without replacing password");
  const createPage = await admin.newPage();
  await createPage.goto(base + "/admin/settings/users/new/");
  await createPage.locator('[name="name"]').fill(prefix + "-expiry");
  await createPage
    .locator('[name="email"]')
    .fill(`v103-${run}-expiry@example.test`);
  await createPage.locator('[name="role"]').selectOption("CONTENT_OPERATOR");
  await createPage.locator('[name="reauthPassword"]').fill(pw);
  const createdResponse = createPage.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url() === base + "/api/admin/users/",
  );
  await createPage
    .getByRole("button", { name: "创建员工", exact: true })
    .click();
  const created = await createdResponse;
  assert.equal(created.status(), 201);
  const createdData = (await created.json()).data;
  const expiring = {
    ...createdData.user,
    initial: createdData.initialPassword,
  };
  userIds.push(expiring.id);
  await createPage.locator(".credential").waitFor();
  await createPage.getByRole("button", { name: "关闭并清除凭据" }).click();
  assert.equal(await createPage.locator(".credential").count(), 0);
  await createPage.close();
  check("browser staff creation and one-time credential dismissal");
  await db.adminUser.update({
    where: { id: expiring.id },
    data: { initialCredentialExpiresAt: new Date(Date.now() - 1000) },
  });
  await login(contentCtx, expiring.email, expiring.initial, 401);
  check("short-lived reset credentials expire and cannot log in");
  const reset2 = await request(
    admin,
    "POST",
    `/api/admin/users/${operator.id}/reset-password/`,
    reauth,
  );
  operator.initial = reset2.initialPassword;
  operator.password = password();
  const resetCtx = await activate(operator);
  await request(resetCtx, "GET", "/api/admin/profile/");
  check("password reset requires initial-password change before work");
  for (let i = 0; i < 4; i++)
    await request(
      admin,
      "POST",
      `/api/admin/users/${operator.id}/reset-password/`,
      reauth,
    );
  await request(
    admin,
    "POST",
    `/api/admin/users/${operator.id}/reset-password/`,
    reauth,
    429,
  );
  check("password reset rate limiting");
  // Lockout tests run last, using only generated employee accounts.
  for (let i = 0; i < 6; i++) {
    const r = await anon.request.post(base + "/api/admin/login/", {
      headers: { Origin: base },
      data: { email: other.email, password: "incorrect" },
    });
    assert.ok([401, 429].includes(r.status()));
    if (i === 5) assert.equal(r.status(), 429);
  }
  check("per-account login brute-force rate limiting");
  let limited = false;
  for (let i = 0; i < 35; i++) {
    const r = await admin.request.post(
      base + "/api/admin/users/" + operator.id + "/reset-password/",
      { headers: { Origin: base }, data: { reauthPassword: "incorrect" } },
    );
    if (r.status() === 429) {
      limited = true;
      break;
    }
    assert.equal(r.status(), 401);
  }
  assert.equal(limited, true);
  check("sensitive password reauthentication rate limiting");
  const logs = await db.auditLog.findMany({
    where: {
      OR: [
        { actorId: { in: userIds } },
        { resourceId: { in: [...userIds, ...leadIds, ...deptIds] } },
      ],
    },
    select: { action: true, metadata: true },
  });
  for (const action of [
    "USER_CREATE",
    "USER_UPDATE",
    "USER_DISABLE",
    "USER_ENABLE",
    "ROLE_CHANGE",
    "PASSWORD_CHANGE",
    "PASSWORD_RESET",
    "LEAD_ASSIGN",
    "PERMISSION_DENIED",
  ])
    assert.ok(
      logs.some((l) => l.action === action),
      action,
    );
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes(pw), false);
  assert.equal(serialized.includes("passwordHash"), false);
  check("required security audits exist without password/token payloads");
  const before = JSON.parse(
    fs.readFileSync(".local-postgres/backups/v103-before.json", "utf8"),
  );
  // The pg_dump snapshot is authoritative. The preliminary JSON snapshot was
  // taken while V1.0.2's temporary browser record was being cleaned up.
  const originalLeadIds = JSON.parse(
    fs.readFileSync(
      ".local-postgres/backups/v103-backup-lead-ids.json",
      "utf8",
    ),
  );
  for (const id of originalLeadIds)
    assert.ok(await db.lead.findUnique({ where: { id } }));
  evidence.preservedOriginalLeadCount = originalLeadIds.length;
  for (const u of before.admins) {
    const now = await db.adminUser.findUniqueOrThrow({ where: { id: u.id } });
    assert.equal(now.passwordHash, u.passwordHash);
  }
  check(
    "every pre-migration lead remains and original administrator password hash is unchanged",
  );
  assert.deepEqual(evidence.browserErrors, []);
  evidence.outcome = "PASS";
}
main()
  .catch((e) => {
    console.error("RBAC verification failed:", e.name, e.message);
    evidence.outcome = "FAIL";
    evidence.failure = e.name;
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      // Exact generated IDs only; keep all pre-existing accounts, leads and audits.
      await db.$transaction(async (tx) => {
        await tx.consent.deleteMany({ where: { leadId: { in: leadIds } } });
        await tx.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: userIds } },
              { resourceId: { in: [...userIds, ...leadIds, ...deptIds] } },
            ],
          },
        });
        await tx.lead.deleteMany({
          where: { id: { in: leadIds }, name: { startsWith: prefix } },
        });
        await tx.adminUser.deleteMany({
          where: { id: { in: userIds }, email: { startsWith: "v103-" + run } },
        });
        await tx.department.deleteMany({
          where: { id: { in: deptIds }, name: { startsWith: prefix } },
        });
        await tx.rateLimitBucket.deleteMany({
          where: { OR: userIds.map((id) => ({ key: { endsWith: ":" + id } })) },
        });
      });
      evidence.cleanedSyntheticData = true;
    } catch {
      evidence.cleanedSyntheticData = false;
      process.exitCode = 1;
    }
    for (const c of contexts) await c.close();
    if (browser) await browser.close();
    await db.$disconnect();
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(
      folder + "/result.json",
      JSON.stringify(evidence, null, 2),
    );
  });
