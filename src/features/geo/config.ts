export const categories = [
  "企业经营贷款",
  "房产抵押经营贷",
  "企业征信",
  "银行流水",
  "企业现金流",
  "高负债融资",
  "融资规划",
  "上海企业贷款",
  "银行贷款申请条件",
  "贷款申请准备",
  "融资风险与合规",
  "融资知识",
] as const;
export const intents = {
  AWARENESS: "认知型",
  COMPARISON: "比较型",
  DECISION: "决策型",
  PREPARATION: "申请准备型",
} as const;
export const questionStatuses = {
  OPEN: "待规划",
  PLANNED: "已规划",
  ANSWERED: "已解答",
  ARCHIVED: "已归档",
} as const;
export const contentStatuses = {
  DRAFT: "草稿",
  IN_REVIEW: "待审核",
  APPROVED: "已审核（待发布）",
  PUBLISHED: "已发布",
  ARCHIVED: "已下线",
} as const;
export const reviewChecks = {
  sources:
    "已逐项核验来源真实、支持正文事实及数据适用时间（含利率、额度、政策）",
  promises: "不存在保证审批或放款承诺",
  relationships: "没有虚构银行合作关系",
  cases: "没有虚构成功案例",
  promotion: "不存在误导性金融宣传",
  privacy: "没有未经授权的客户敏感信息",
  human: "已由人工阅读全文，含人工智能辅助内容",
} as const;
export const articlePath = (slug: string) => `/insights/${slug}/`;
export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_REQUEST_MAX_BYTES = 2 * IMPORT_MAX_BYTES + 8192;
export const reviewDecisions: Record<string, string> = {
  APPROVED: "审核通过",
  REJECTED: "退回修改",
};
export const fieldNames: Record<string, string> = {
  question: "融资问题",
  category: "问题分类",
  keywords: "关键词",
  intent: "搜索意图",
  priority: "优先级",
  status: "状态",
  title: "文章标题",
  slug: "网址标识",
  summary: "文章摘要",
  content: "文章正文",
  answer: "答案",
  tags: "标签",
  sources: "引用来源",
  url: "网址",
  checkedAt: "核验日期",
  validUntil: "适用截止日期",
  relatedIds: "相关文章",
  articleId: "关联文章",
  revision: "内容版本",
  note: "审核说明",
  checklist: "核验清单",
  aiAssisted: "智能辅助标记",
  action: "操作",
  version: "历史版本",
  text: "导入内容",
  format: "文件格式",
  mode: "导入步骤",
  confirmationToken: "预览凭证",
  confirmed: "导入确认",
  assigneeId: "独立审核人",
  questionId: "来源问题",
  templateId: "写作模板",
  templateVersion: "模板版本",
  articleType: "文章类型",
  audience: "目标读者",
  depth: "文章深度",
  supplement: "补充资料",
  approvedNonSensitive: "非敏感资料外发确认",
  idempotencyKey: "请求标识",
  templateContent: "模板内容",
  description: "模板说明",
  sourceUrl: "来源网址",
  excerpt: "已核验摘录",
  verified: "人工核验确认",
  seoTitle: "搜索标题",
  metaDescription: "搜索描述",
  paragraph: "对应正文段落",
};
export function boundaryValue<T extends Record<string, string>>(
  value: string,
  map: T,
): keyof T | undefined {
  const v = value.trim();
  if (Object.hasOwn(map, v)) return v as keyof T;
  return Object.entries(map).find(([, cn]) => cn === v)?.[0] as
    keyof T | undefined;
}
export function statusName(kind: string, value: string) {
  const map: Record<string, string> =
    kind === "questions" ? questionStatuses : contentStatuses;
  return map[value] || "未知状态";
}

export function contentStatusLabel(
  status: string,
  revision?: number,
  review?: { decision: string; revision: number },
) {
  if (
    status === "DRAFT" &&
    review?.decision === "REJECTED" &&
    review.revision === (revision || 0) - 1
  )
    return "已驳回（待修改）";
  return (contentStatuses as Record<string, string>)[status] || "未知状态";
}
