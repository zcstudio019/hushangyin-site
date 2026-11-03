import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyFaq,
  riskIsBelow,
  riskSchema,
} from "../../src/features/geo/risk";
test("FAQ分级区分基础定义、一般实操和具体高风险主张", () => {
  assert.equal(
    classifyFaq("什么是银行流水？", "银行账户一定时期的资金收付记录。").level,
    "LOW",
  );
  assert.equal(
    classifyFaq(
      "什么是年化利率？",
      "这是将一定期间的利息按年度口径描述的通用概念，不说明具体数值。",
    ).level,
    "LOW",
  );
  assert.equal(
    classifyFaq("中小企业如何向银行准备资料？", "一般可整理经营信息。").level,
    "MEDIUM",
  );
  const b = classifyFaq(
    "企业申请经营贷通常需要哪些资料？",
    "一般可整理主体证照、经营信息与资金需求说明，实际范围因业务而异。",
  );
  assert.equal(b.level, "MEDIUM");
  assert.equal(b.claims.length, 0);
  assert.equal(
    classifyFaq("某银行2026年最新经营贷利率是多少？", "尚无核验资料。").level,
    "HIGH",
  );
  assert.ok(classifyFaq("经营准备", "银行要求经营满3年。").claims.length);
  assert.ok(classifyFaq("经营准备", "银行要求至少三个月流水。").claims.length);
  assert.ok(classifyFaq("产品", "某银行年化３％。").claims.length);
  assert.ok(classifyFaq("经营条件", "经营满3年即可申请。").claims.length);
  assert.ok(classifyFaq("经营条件", "成立满三年即可申请。").claims.length);
  assert.equal(classifyFaq("融资成本", "该方案月息三厘。").level, "HIGH");
  assert.ok(riskIsBelow("LOW", "HIGH"));
  assert.equal(riskIsBelow("HIGH", "LOW"), false);
});
test("负面承诺提醒不误判为保证；主张过多不能省略证据", () => {
  assert.equal(
    classifyFaq("风险提醒", "不能保证放款，请警惕包过宣传。").blockers.length,
    0,
  );
  assert.ok(classifyFaq("说明", "保证放款。").blockers.length);
  assert.ok(classifyFaq("说明", "100%放款。").blockers.length);
  assert.ok(classifyFaq("说明", "百分之百获批。").blockers.length);
  assert.ok(
    classifyFaq(
      "说明",
      Array.from({ length: 41 }, (_, i) => `某银行产品${i}年化利率为3%。`).join(
        "",
      ),
    ).blockers.length,
  );
  assert.equal(
    riskSchema.safeParse({
      level: "LOW",
      confirmed: false,
      basis: "已按专业知识完成逐条核验。",
      evidence: [],
    }).success,
    false,
  );
});
