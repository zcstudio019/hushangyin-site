import test from "node:test";
import assert from "node:assert/strict";
import {
  parseImport,
  normaliseQuestion,
} from "../../src/features/geo/import-parser";
import { parseQuestionCsv } from "../../src/features/geo/csv";
const q = (n = 1, extra = "") =>
  `## Q${n}｜合成问题${n}？\n- 分类：融资规划\n${extra}`;
const f = (n = 1, extra = "") =>
  `## F${n}｜合成问答${n}？\n- 分类：融资规划\n- 状态：待审核\n${extra}\n### 答案\n\n第一段。\n\n- 列表一\n- 列表二\n\n| 项目 | 说明 |\n| --- | --- |\n| 合成 | 测试 |`;
test("question headings ignore document/instructions; order/colon/defaults/source preserve original text", () => {
  const r = parseImport(
    "questions",
    "markdown",
    "# 标题\n## 字段说明\n- 分类：说明，不是记录\n" +
      q(
        1,
        "- 来源: 内部选题整理\n- 关键词：甲、乙,丙\n- 优先级：1\n- 搜索意图：申请准备型",
      ),
  );
  assert.equal(r.valid, true);
  assert.equal(r.total, 1);
  assert.equal(r.rows[0].question, "合成问题1？");
  assert.equal(r.rows[0].status, "OPEN");
  assert.equal(r.rows[0].intent, "PREPARATION");
  assert.deepEqual(r.rows[0].keywords, ["甲", "乙", "丙"]);
  assert.equal(r.rows[0].source, "内部选题整理");
  const defaults = parseImport("questions", "markdown", q());
  assert.equal(defaults.rows[0].priority, 3);
  assert.equal(defaults.rows[0].intent, "AWARENESS");
});
test("FAQ separates its real workflow enum, preserves multiline answer, never auto-publishes", () => {
  const r = parseImport("faqs", "markdown", f(1) + "\n\n" + f(2));
  assert.equal(r.valid, true);
  assert.equal(r.total, 2);
  assert.equal(r.rows[0].status, "IN_REVIEW");
  assert.match(r.rows[0].answer!, /第一段。\n\n- 列表一/);
  assert.match(r.rows[0].answer!, /\| 项目 \|/);
  const pub = parseImport("faqs", "markdown", f(1).replace("待审核", "已发布"));
  assert.equal(pub.rows[0].status, "DRAFT");
  assert.ok(pub.rows[0].warnings.length);
  assert.equal(
    parseImport("faqs", "markdown", f(1).replace("待审核", "待规划")).valid,
    false,
  );
});
test("missing answer, bad categories/enums, over-limit and HTML are rejected with record lines", () => {
  for (const [kind, text] of [
    ["faqs", "## F001｜缺少答案？\n- 分类：融资规划"],
    ["questions", q(1).replace("融资规划", "不存在的分类")],
    ["questions", q(1, "- 搜索意图：错误枚举")],
    ["faqs", f(1).replace("第一段。", "<img src=x onerror=alert(1)>")],
    ["questions", q(1, "- 来源：<script>alert(1)</script>")],
    ["faqs", f(1).replace("第一段。", "[链接](javascript:alert(1))")],
  ] as const) {
    const r = parseImport(kind, "markdown", text);
    assert.equal(r.valid, false);
    assert.ok(r.rows[0].errors.every((e) => e.line > 0));
  }
  assert.equal(
    parseImport(
      "questions",
      "markdown",
      Array.from({ length: 101 }, (_, i) => q(i + 1)).join("\n"),
    ).valid,
    false,
  );
  assert.equal(
    parseImport("faqs", "markdown", f().replace("第一段。", "字".repeat(20001)))
      .valid,
    false,
  );
  assert.equal(
    parseImport("questions", "markdown", "字".repeat(400000)).valid,
    false,
  );
});
test("normalisation only affects dedupe key, Q numbers are not identity, and fenced answers keep structure", () => {
  assert.equal(normaliseQuestion("  ＡＢＣ？  "), "abc?");
  const r = parseImport(
    "questions",
    "markdown",
    q(1) + "\n" + q(1).replace("合成问题1", "另一问题"),
  );
  assert.equal(r.total, 2);
  assert.equal(r.valid, true);
  assert.ok(r.rows[1].warnings.length);
  const code = parseImport(
    "faqs",
    "markdown",
    f() + "\n```text\n## F999｜代码中的标题\n```",
  );
  assert.equal(code.total, 1);
  assert.equal(code.valid, true);
});
test("Chinese CSV and legacy CSV stay compatible; precise Chinese header guidance", () => {
  const cn = parseQuestionCsv(
    "融资问题,问题分类,关键词,搜索意图,优先级,问题状态\n合成问题,融资规划,词一、词二,认知型,3,待规划",
  );
  assert.equal(cn[0].status, "OPEN");
  assert.deepEqual(cn[0].keywords, ["词一", "词二"]);
  const old = parseQuestionCsv(
    "question,category,keywords,intent,priority,status\n合成问题,融资规划,词一|词二,PREPARATION,1,OPEN",
  );
  assert.equal(old[0].intent, "PREPARATION");
  assert.throws(() => parseQuestionCsv("wrong,header\na,b"), /中文标题/);
});
