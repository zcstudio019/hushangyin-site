import test from "node:test";
import assert from "node:assert/strict";
import { parseQuestionCsv } from "../../src/features/geo/csv";
import {
  questionSchema,
  articleSchema,
} from "../../src/features/geo/validation";
import { consultationSchema } from "../../src/lib/validations/consultation";
import { can } from "../../src/lib/auth/permissions";
test("CSV quoted commas/newlines, malformed input and bounded import", () => {
  const rows = parseQuestionCsv(
    '\uFEFFquestion,category,keywords,intent,priority,status\r\n"系统,合成问题",融资规划,标签|词,AWARENESS,2,OPEN\r\n',
  );
  assert.equal(rows[0].question, "系统,合成问题");
  assert.equal(questionSchema.safeParse(rows[0]).success, true);
  assert.throws(() =>
    parseQuestionCsv(
      'question,category,keywords,intent,priority,status\n"unclosed',
    ),
  );
  assert.throws(() => parseQuestionCsv("wrong,header\nx,y"));
  assert.throws(() =>
    parseQuestionCsv(
      "question,category,keywords,intent,priority,status\n" +
        Array(101).fill("问题,融资规划,,AWARENESS,3,OPEN").join("\n"),
    ),
  );
});
test("content operations cannot review, publish, manage accounts or read leads", () => {
  const op = { role: "CONTENT_OPERATOR" as const };
  for (const permission of [
    "content.publish",
    "content.review",
    "users.update",
    "leads.read_all",
    "leads.read_department",
    "leads.read_assigned",
  ] as const)
    assert.equal(can(op, permission), false);
  assert.equal(can(op, "content.create"), true);
  assert.equal(can({ role: "SUPER_ADMIN" }, "content.review"), true);
  assert.equal(can({ role: "FINANCING_ADVISOR" }, "content.read"), false);
});
test("independent content reviewer has only content read/review, not publication or customer administration", () => {
  const reviewer = { role: "CONTENT_REVIEWER" as const };
  assert.equal(can(reviewer, "content.read"), true);
  assert.equal(can(reviewer, "content.review"), true);
  for (const p of [
    "content.create",
    "content.update",
    "content.publish",
    "content.unpublish",
    "content.assign_review",
    "users.create",
    "users.update",
    "leads.read_all",
    "generation.create",
  ] as const)
    assert.equal(can(reviewer, p), false);
  assert.equal(can({ role: "SUPER_ADMIN" }, "content.assign_review"), true);
});
test("article source validation and attribution reject arbitrary fields and sensitive URL markers", () => {
  const v = {
    title: "合成文章",
    slug: "synthetic",
    summary: "系统测试",
    content: "安全段落",
    category: "融资规划",
    tags: [],
    sources: [],
    relatedIds: [],
    aiAssisted: false,
  };
  assert.equal(articleSchema.safeParse(v).success, true);
  assert.equal(articleSchema.safeParse({ ...v, isLive: true }).success, false);
  assert.equal(
    articleSchema.safeParse({
      ...v,
      sources: [
        { title: "来源", url: "javascript:alert(1)", checkedAt: "2026-10-29" },
      ],
    }).success,
    false,
  );
  const input = {
    name: "合成测试",
    phone: "19900000000",
    customerType: "PERSONAL",
    financingAmount: "50万元以内",
    sourcePage: "/contact/",
    consent: true,
  };
  assert.equal(
    consultationSchema.safeParse({
      ...input,
      sourceParameters: { utm_source: "19900000000" },
    }).success,
    false,
  );
  assert.equal(
    consultationSchema.safeParse({
      ...input,
      sourceParameters: { phone: "19900000000" },
    }).success,
    false,
  );
  assert.equal(
    consultationSchema.safeParse({
      ...input,
      sourceParameters: { utm_source: "geo-local" },
    }).success,
    true,
  );
});

test("审核候选人逐项诊断且已激活账号不受旧初始凭据日期影响", async () => {
  const { accountReviewReasons, reviewDepartment } =
    await import("../../src/features/geo/review-policy");
  const reviewer = {
    id: "reviewer",
    name: "测试审核员",
    role: "CONTENT_REVIEWER" as const,
    isActive: true,
    mustChangePassword: false,
    initialCredentialExpiresAt: new Date("2020-01-01"),
    department: { name: "内容部", isActive: true },
  };
  assert.deepEqual(accountReviewReasons(reviewer), []);
  assert.equal(reviewDepartment(reviewer), "内容部");
  assert.deepEqual(accountReviewReasons(reviewer, ["reviewer"]), [
    "参与当前版本，不能自审",
  ]);
  const excluded = accountReviewReasons(
    {
      ...reviewer,
      role: "CONTENT_OPERATOR",
      isActive: false,
      mustChangePassword: true,
    },
    ["reviewer"],
  );
  assert.equal(excluded.length, 4);
  for (const text of [
    "无内容审核权限",
    "账号已停用",
    "初始凭据已过期",
    "不能自审",
  ])
    assert.ok(excluded.some((reason) => reason.includes(text)));
  assert.equal(
    reviewDepartment({ ...reviewer, department: null }),
    "未分配部门",
  );
  assert.equal(
    accountReviewReasons({
      ...reviewer,
      mustChangePassword: true,
      initialCredentialExpiresAt: new Date("2099-01-01"),
    })[0],
    "账号未激活：尚未完成首次改密",
  );
});
