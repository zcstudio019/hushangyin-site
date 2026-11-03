import test from "node:test";
import assert from "node:assert/strict";
import {
  reviewInputIssue,
  workflowFailureMessage,
} from "../../src/features/geo/workflow-feedback";
import { reviewChecks } from "../../src/features/geo/config";
test("审核说明与清单共享边界规则，退回也必须有具体原因", () => {
  const complete = Object.fromEntries(
    Object.keys(reviewChecks).map((k) => [k, true]),
  );
  assert.equal(reviewInputIssue("approve", "无", complete)?.field, "note");
  assert.equal(
    reviewInputIssue("approve", "   123456789   ", complete)?.code,
    "REVIEW_NOTE",
  );
  assert.equal(
    reviewInputIssue("approve", "已核验实际引用支持本条测试事实。", {
      ...complete,
      human: false,
    })?.field,
    "human",
  );
  assert.equal(
    reviewInputIssue("reject", "需补充与实际答案一致的引用资料。", {}),
    null,
  );
  assert.equal(reviewInputIssue("publish", "", {}), null);
  assert.equal(
    reviewInputIssue(
      "approve",
      "已核验引用支持本条测试事实且日期适用。",
      complete,
    ),
    null,
  );
});
test("工作流错误说明区分权限、版本、限流和不确定结果", () => {
  for (const [status, code, fragment] of [
    [403, "INDEPENDENT_REVIEW", "独立审核"],
    [403, "REVIEW_ASSIGNED_TO_OTHER", "其他审核人"],
    [409, "STALE_VERSION", "刷新"],
    [503, "SERVICE_UNAVAILABLE", "数据库"],
    [401, "UNAUTHORIZED", "重新登录"],
    [429, "RATE_LIMITED", "频繁"],
  ] as const)
    assert.ok(workflowFailureMessage(status, code).includes(fragment));
  assert.equal(
    workflowFailureMessage(400, "REVIEW_NOTE", "中文校验说明"),
    "中文校验说明",
  );
  assert.equal(
    workflowFailureMessage(500, "INTERNAL", "secret internal stack").includes(
      "secret",
    ),
    false,
  );
});
