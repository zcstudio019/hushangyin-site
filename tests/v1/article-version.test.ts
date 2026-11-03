import test from "node:test";
import assert from "node:assert/strict";
import { compliance } from "../../src/features/generation/compliance";
import { workflowFailureMessage } from "../../src/features/geo/workflow-feedback";
test("否定融资承诺不误报，真实承诺给出具体正文行", () => {
  assert.equal(
    compliance(
      "不应将咨询服务描述为保证获批或保证放款。\n须考虑还款风险。",
      [],
      true,
    ).some((f) => f.code === "GUARANTEE"),
    false,
  );
  const findings = compliance(
    "不保证审批，但保证放款。\n风险提示：评估还款能力。",
    [],
    true,
  ).filter((f) => f.code === "GUARANTEE");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].location, "正文第1行");
  assert.ok(findings[0].excerpt?.includes("但保证放款"));
  const question = compliance(
    "**咨询服务等于保证贷款获批吗？**\n不等于，不能保证贷款获批。",
    [],
    true,
  );
  assert.ok(!question.some((f) => f.code === "GUARANTEE"));
  assert.ok(
    question.some(
      (f) => f.code === "GUARANTEE_QUESTION" && f.severity === "VERIFY",
    ),
  );
  assert.ok(
    compliance("我们保证放款，是否满意？", [], true).some(
      (f) => f.code === "GUARANTEE",
    ),
  );
  assert.ok(
    compliance("不需要任何资料就保证放款。", [], true).some(
      (f) => f.code === "GUARANTEE",
    ),
  );
  assert.ok(
    compliance("不审核也保证放款。", [], true).some(
      (f) => f.code === "GUARANTEE",
    ),
  );
});
test("合规阻塞、状态错误与真正版本冲突分开说明", () => {
  assert.equal(
    workflowFailureMessage(409, "COMPLIANCE_REQUIRED", "仍须补充来源"),
    "仍须补充来源",
  );
  assert.equal(
    workflowFailureMessage(409, "STATE_INVALID", "仅草稿可以提交审核。"),
    "仅草稿可以提交审核。",
  );
  assert.ok(workflowFailureMessage(409, "STALE_VERSION").includes("差异"));
});
