import { guaranteeMatches } from "./guarantees";
import { z } from "zod";

export const riskNames = {
  LOW: "基础知识（低风险）",
  MEDIUM: "融资实操（中风险）",
  HIGH: "政策、利率、产品及案例（高风险）",
};
export type RiskLevel = keyof typeof riskNames;
const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };
export const riskSchema = z
  .object({
    level: z.enum(["LOW", "MEDIUM", "HIGH"]),
    confirmed: z.literal(true, {
      error: "请确认已核对真实性、宣传合规及隐私，并完成必要证据核验。",
    }),
    basis: z.string().trim().min(10).max(1000),
    evidence: z
      .array(
        z
          .object({
            claim: z.string().trim().min(1).max(1200),
            sourceIndex: z.number().int().min(0).max(19).optional(),
            catalogId: z.string().min(1).max(64).optional(),
            catalogVersion: z.iso.datetime().optional(),
          })
          .strict()
          .refine(
            (v) =>
              (v.sourceIndex !== undefined) !== !!v.catalogId &&
              (!v.catalogId || !!v.catalogVersion),
            "每项主张请选择一种证据。",
          ),
      )
      .max(40),
  })
  .strict();
export type RiskInput = z.infer<typeof riskSchema>;

export function classifyFaq(question: string, answer: string) {
  const text = (question + "\n" + answer)
    .normalize("NFKC")
    .replace(/[\u200b-\u200f\ufeff]/g, "");
  const lines = text
    .split(/[。！？!?\n]+/)
    .flatMap((s) => s.trim().match(/[\s\S]{1,1000}/g) || [])
    .filter(Boolean);
  const high =
    /(?:利率|年化|年息|月息|费率|综合成本|利息).{0,8}(?:是多少|多少|最新|最低|最高|固定|\d|[一二三四五六七八九十百千万两零点]+(?:厘|分|成))|(?:最新|最低|最高).{0,8}(?:利率|年化|费率)|百分之|\d\s*%|政策|监管规定|最新规定|具体产品|某银行|(?:工商|建设|中国|农业|交通|招商|浦发|兴业|平安|民生|光大|华夏|邮储|浙商|恒丰|渤海|上海|北京|宁波|南京)银行|银行.{0,12}(产品|准入|审批标准)|产品(?:条件|利率|准入)|成功案例|客户案例|合作银行|银行合作|授信额度|贷款额度.{0,8}\d|获批.{0,8}\d/;
  const quantitative =
    /[一二三四五六七八九十百千万两零点]+(?:个月|年|月|天|日|倍|成|万元|亿元)|\d+(?:\.\d+)?\s*(?:万|亿|元|个月|年|月|天|日|倍|成)|必须.{0,20}(?:提供|达到|满足)|银行.{0,15}(?:要求|规定|必须|准入|标准)/;
  const analysisLines = lines.filter(
    (line) =>
      !(
        /不(?:涉及|提供|包含|公布|构成)[^。]{0,30}(?:产品条件|利率|贷款条件|金融事实|金融数据)/.test(
          line,
        ) &&
        !/\d|百分之|[一二三四五六七八九十百千万两零]+(?:年|月|天|万元)|(?:工商|建设|农业|交通|招商|浦发|兴业|平安|民生|邮储|上海)银行/.test(
          line,
        )
      ),
  );
  const analysisText = analysisLines.join("\n");
  const allClaims = [
    ...new Set(
      analysisLines.filter(
        (line) => high.test(line) || quantitative.test(line),
      ),
    ),
  ];
  const claims = allClaims.slice(0, 40);
  const level: RiskLevel = high.test(analysisText)
    ? "HIGH"
    : quantitative.test(analysisText) ||
        /申请|准备|材料|资料|融资规划|步骤|办理|改善回款/.test(analysisText)
      ? "MEDIUM"
      : "LOW";
  const blockers: string[] = [];
  if (allClaims.length > 40)
    blockers.push("具体主张超过40项，请拆分内容后逐项核验，不能省略证据。");
  if (guaranteeMatches(text).some((m) => m.kind === "assertion"))
    blockers.push(
      "内容可能存在保证性融资承诺，请先修改，证据不能替代合规要求。",
    );
  if (/(?<!\d)1[3-9]\d{9}(?!\d)|\d{17}[\dXx]/.test(text))
    blockers.push("内容疑似包含客户手机号或身份信息，请先排查授权和隐私风险。");
  return {
    level,
    claims,
    blockers,
    reason:
      level === "LOW"
        ? "当前内容属于基础知识，可以直接进行专业人工审核，无需外部网址。"
        : claims.length
          ? "当前内容包含具体银行条件、政策、利率或数量主张，须逐项对应可核验证据。"
          : "一般实操建议可由专业审核人员说明判断依据；如含具体银行要求或数量判断，须补证据。",
  };
}
export function riskIsBelow(level: RiskLevel, minimum: RiskLevel) {
  return rank[level] < rank[minimum];
}
export function riskClaims(question: string, answer: string, level: RiskLevel) {
  const suggested = classifyFaq(question, answer);
  return suggested.claims.length
    ? suggested.claims
    : level === "HIGH"
      ? [question.trim()]
      : [];
}

export function faqNeedsEvidence(question: string, answer: string) {
  const suggested = classifyFaq(question, answer);
  return suggested.level === "HIGH" || suggested.claims.length > 0;
}
