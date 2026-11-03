export const articleTypes = {
  KNOWLEDGE: "融资知识科普",
  GUIDE: "融资申请指南",
  RISK: "融资风险分析",
  COMPARISON: "产品比较分析",
  CASH_FLOW: "企业现金流专题",
  CREDIT: "征信与负债管理",
  SHANGHAI: "上海本地融资问题解答",
} as const;
export const depths = {
  BRIEF: "简明解答",
  STANDARD: "标准文章",
  DEEP: "深入分析",
} as const;
export const generationStatuses = {
  QUEUED: "待执行",
  RUNNING: "生成中",
  SUCCEEDED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
} as const;
export const severityNames = {
  MUST_FIX: "必须修复",
  VERIFY: "需要人工核实",
  SUGGESTION: "优化建议",
} as const;
export const defaultSections = [
  "文章标题",
  "核心问题",
  "直接回答",
  "适用对象",
  "关键影响因素",
  "实操准备步骤",
  "常见错误",
  "相关问答",
  "风险提示",
  "专业咨询引导",
  "参考资料",
];
export const defaultTemplate = {
  id: "hsy-financing-default",
  name: "融资专业文章标准模板",
  description: "以问题为起点，区分已核验知识与待核实建议；发布必须人工审核。",
  templateContent: defaultSections.map((s) => "## " + s).join("\n\n"),
};
export type Finding = {
  key?: string;
  claim?: string;
  line?: number;
  objectId?: string;
  location?: string;
  excerpt?: string;
  severity: keyof typeof severityNames;
  code: string;
  message: string;
};
export type SourceBinding = { sourceId: string; paragraph: string };
export type KnowledgeSnapshot = {
  question: {
    id: string;
    question: string;
    category: string;
    keywords: string[];
    intent: string;
  };
  similarQuestions: { id: string; question: string; category: string }[];
  faqs: {
    id: string;
    question: string;
    answer: string;
    revision: number;
    mode: "approved" | "published";
    sources: unknown;
    evidenceKind?: "PUBLIC_SOURCES" | "PROFESSIONAL_REVIEW";
  }[];
  articles: {
    id: string;
    title: string;
    content: string;
    verified: boolean;
    revision: number | null;
  }[];
  references: {
    id: string;
    title: string;
    url: string;
    excerpt: string;
    verifiedAt: string;
    validUntil: string | null;
  }[];
  warnings: string[];
  retrievedAt: string;
};
export type GenerationInput = {
  providerConfiguration?: string;
  knowledge: KnowledgeSnapshot;
  template: { id: string; name: string; version: number; content: string };
  articleType: string;
  audience: string;
  depth: string;
  supplement: string;
  requestFingerprint: string;
};
