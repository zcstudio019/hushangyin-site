import type { Finding, KnowledgeSnapshot } from "./config";
import type { GeneratedResult } from "./validation";
import { containsSensitive, unsafeGeneratedText } from "./validation";
import { HttpError } from "@/lib/http";
import { guaranteeMatches } from "@/features/geo/guarantees";
import { classifyFaq } from "@/features/geo/risk";
export function compliance(
  content: string,
  keywords: string[] = [],
  hasSources = false,
): Finding[] {
  const findings: Finding[] = [];
  const add = (severity: Finding["severity"], code: string, message: string) =>
    findings.push({ severity, code, message });
  for (const match of guaranteeMatches(content))
    findings.push({
      ...match,
      severity: match.kind === "assertion" ? "MUST_FIX" : "VERIFY",
      code: match.kind === "assertion" ? "GUARANTEE" : "GUARANTEE_QUESTION",
      message:
        match.kind === "assertion"
          ? `${match.location}含保证性融资承诺，请修改实际原文。`
          : `${match.location}以问句讨论承诺，请人工核对相邻答案，不能据此承诺获批。`,
    });
  if (containsSensitive(content) || unsafeGeneratedText(content))
    add("MUST_FIX", "UNSAFE", "移除疑似个人信息、网页脚本或不安全代码。");
  if (!/还款.{0,15}(风险|压力|能力)|风险.{0,15}还款/.test(content))
    add("MUST_FIX", "REPAYMENT_RISK", "补充还款能力与还款风险提示。");
  if (
    !hasSources &&
    (classifyFaq("", content).claims.length ||
      classifyFaq("", content).level === "HIGH")
  )
    add(
      "MUST_FIX",
      "NO_SOURCE",
      "补充真实核验依据及对应正文段落，再提交审核；通用知识可用公开知识来源，无须具体银行产品资料。",
    );
  else if (!hasSources)
    add(
      "VERIFY",
      "PROFESSIONAL_BASIS",
      "基础知识或一般实操无须银行产品资料；须由独立审核人员记录专业判断后正式批准。",
    );
  const rules: [RegExp, string, string][] = [
    [
      /合作银行|战略合作|银行合作/,
      "BANK_RELATION",
      "核实银行合作关系，不得虚构背书。",
    ],
    [
      /\d+(\.\d+)?\s*[%％]|最新利率|年化利率/,
      "RATE",
      "核实利率来源、适用对象和适用日期。",
    ],
    [
      /\d+\s*(万|亿)|贷款额度|准入条件/,
      "AMOUNT",
      "核实额度或准入条件及适用范围。",
    ],
    [/政策|条例|通知|规定/, "POLICY", "核对政策真实名称、来源和有效期。"],
    [/客户案例|成功案例|某企业|某客户/, "CASE", "核验案例真实性与使用授权。"],
    [
      /以贷养贷|过桥|刷流水|包装资料/,
      "ADVICE",
      "检查融资建议是否合法、适当且不诱导违规操作。",
    ],
  ];
  for (const [re, code, message] of rules) {
    const match = re.exec(content);
    if (match) {
      const line = content.slice(0, match.index).split("\n").length;
      const start = content.lastIndexOf("\n", match.index - 1) + 1;
      const from = Math.max(start, match.index - 80);
      findings.push({
        severity: "VERIFY",
        code,
        message,
        location: `正文第${line}行`,
        excerpt: content.slice(
          from,
          Math.min(
            content.indexOf("\n", match.index) < 0
              ? content.length
              : content.indexOf("\n", match.index),
            from + 240,
          ),
        ),
      });
    }
  }
  if (
    keywords.some((k) => k && content.split(k).length > 12) ||
    content.split("沪上银").length > 7
  )
    add(
      "SUGGESTION",
      "KEYWORD_DENSITY",
      "减少重复关键词和品牌名称，优先自然表达。",
    );
  return findings;
}
export function validateGrounding(
  result: GeneratedResult,
  k: KnowledgeSnapshot,
) {
  if (
    result.relatedQuestionIds.some(
      (id) =>
        ![k.question.id, ...k.similarQuestions.map((q) => q.id)].includes(id),
    ) ||
    result.faqIds.some((id) => !k.faqs.some((f) => f.id === id))
  )
    throw new HttpError(
      400,
      "UNKNOWN_KNOWLEDGE",
      "生成结果引用了未检索或未审核的知识，未保存。",
    );
  if (
    result.references.some(
      (s) =>
        !k.references.some((r) => r.id === s.sourceId) ||
        !result.markdown.includes(s.paragraph),
    )
  )
    throw new HttpError(
      400,
      "UNKNOWN_SOURCE",
      "生成结果含无法追溯的来源或段落，未保存。",
    );
  // External links must come from the verified source catalogue; internal article links remain usable.
  for (const match of result.markdown.matchAll(/https?:\/\/[^\s)<>]+/g))
    if (!k.references.some((r) => r.url === match[0]))
      throw new HttpError(
        400,
        "UNKNOWN_URL",
        "生成结果出现未核验的外部网址，未保存。",
      );
}
