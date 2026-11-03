import test from "node:test";
import assert from "node:assert/strict";
import { compliance } from "../../src/features/generation/compliance";
import { classifyFaq } from "../../src/features/geo/risk";
test("事实检查A：否定承诺及通用知识不强制外部URL", () => {
  const a =
    "不保证贷款获批。不承诺百分百放款。任何机构均不应承诺包过。审批结果以银行最终决定为准。应评估还款能力与还款风险。";
  const f = compliance(a, [], false);
  assert.ok(!f.some((x) => x.severity === "MUST_FIX"));
  assert.ok(f.some((x) => x.code === "PROFESSIONAL_BASIS"));
  assert.equal(classifyFaq("通用提醒", a).blockers.length, 0);
});
test("事实检查B：明确承诺、全角与零宽字符仍被阻断", () => {
  for (const text of [
    "保证放款",
    "百分百通过",
    "无视征信也能获批",
    "确保获得贷款",
    "１００％通过",
    "保\u200b证放款",
  ]) {
    assert.ok(
      compliance(text + "。应评估还款风险。", [], true).some(
        (f) => f.code === "GUARANTEE" && f.severity === "MUST_FIX",
      ),
      text,
    );
  }
});
test("事实检查C：具体银行利率必须核验，免责声明不掩盖真实数字", () => {
  const c = "某银行2026年经营贷年化利率为3.1%。还款风险需评估。";
  assert.equal(classifyFaq("利率核验", c).level, "HIGH");
  assert.ok(compliance(c, [], false).some((f) => f.code === "NO_SOURCE"));
  assert.ok(
    classifyFaq("声明", "本条不提供产品条件或利率。").claims.length === 0,
  );
  assert.ok(
    classifyFaq("声明", "不提供利率，但某银行年化利率为3.1%。").claims.length >
      0,
  );
});
