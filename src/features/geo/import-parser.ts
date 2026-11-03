import { createHash } from "node:crypto";
import {
  categories,
  intents,
  questionStatuses,
  contentStatuses,
  boundaryValue,
  IMPORT_MAX_BYTES,
} from "./config";
import { parseCsvQuestions } from "./csv";
import { faqSchema, questionSchema } from "./validation";
import { chineseIssue } from "./errors";
export type ImportKind = "questions" | "faqs";
export type ImportFormat = "markdown" | "csv";
export type ImportIssue = { line: number; message: string };
type RawRecord = {
  label: string;
  line: number;
  question: string;
  attributes: Record<string, string>;
  attributeLines: Record<string, number>;
  answer: string;
  warnings: string[];
  errors: ImportIssue[];
};
export type ImportRow = {
  number: number;
  label: string;
  line: number;
  question: string;
  category: string;
  answer?: string;
  keywords?: string[];
  intent?: string;
  priority?: number;
  status: string;
  source?: string;
  warnings: string[];
  errors: ImportIssue[];
  disposition: "new" | "duplicate" | "invalid";
};
export type ImportReport = {
  kind: ImportKind;
  format: ImportFormat;
  total: number;
  validCount: number;
  newCount: number;
  duplicateCount: number;
  failedCount: number;
  successCount: number;
  skippedCount: number;
  valid: boolean;
  rows: ImportRow[];
  errors: ImportIssue[];
  confirmationToken?: string;
  importedAt?: string;
};
export function normaliseQuestion(text: string) {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}
export function inputDigest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}
function unsafe(value: string) {
  return /<\s*\/?\s*[a-z][^>]*>|<\s*\/?\s*(?:script|iframe|svg|object|embed)\b|\bon[a-z]+\s*=|(?:javascript|vbscript|data)\s*:/i.test(
    value,
  );
}
function markdownRecords(kind: ImportKind, text: string) {
  const records: RawRecord[] = [],
    lines = text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
  let current: RawRecord | undefined,
    answer = false,
    fence: string | undefined;
  const answerLines: string[] = [];
  const labels = new Set<string>();
  const finish = () => {
    if (current) {
      current.answer = answerLines.join("\n").trim();
      if (kind === "faqs" && !answer)
        current.errors.push({
          line: current.line,
          message: "缺少“### 答案”小节，请在属性后添加答案标题和正文。",
        });
      records.push(current);
    }
    current = undefined;
    answer = false;
    answerLines.length = 0;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = undefined;
      if (answer) answerLines.push(line);
      continue;
    }
    const heading = !fence
      ? /^##\s+([QF]\d+)\s*[｜|]\s*(.*?)\s*$/i.exec(line)
      : null;
    if (heading) {
      finish();
      const label = heading[1].toUpperCase();
      if (!label.startsWith(kind === "questions" ? "Q" : "F")) continue;
      current = {
        label,
        line: i + 1,
        question: heading[2],
        attributes: {},
        attributeLines: {},
        answer: "",
        warnings: [],
        errors: [],
      };
      if (labels.has(label))
        current.warnings.push(
          "文内编号重复，仅用于定位；实际按问题文字去重，不作为数据库编号。",
        );
      labels.add(label);
      continue;
    }
    if (!current) continue;
    if (!fence && kind === "questions" && /^#{1,2}\s+/.test(line)) {
      finish();
      continue;
    }
    if (kind === "faqs" && !answer && !fence && /^###\s+答案\s*$/.test(line)) {
      answer = true;
      continue;
    }
    if (answer) {
      answerLines.push(line);
      continue;
    }
    const attr = /^\s*-\s*([^:：]+?)\s*[:：]\s*(.*?)\s*$/.exec(line);
    if (attr) {
      const key = attr[1].trim().replace(/^`|`$/g, "");
      const allowed =
        kind === "questions"
          ? ["分类", "关键词", "搜索意图", "优先级", "状态", "来源"]
          : ["分类", "状态", "来源"];
      if (!allowed.includes(key)) {
        current.errors.push({
          line: i + 1,
          message: `不支持“${key}”属性，请参照本页模板填写。`,
        });
        continue;
      }
      if (Object.hasOwn(current.attributes, key))
        current.errors.push({
          line: i + 1,
          message: `“${key}”重复，请只保留一项。`,
        });
      current.attributes[key] = attr[2];
      current.attributeLines[key] = i + 1;
    } else if (line.trim() && line.trim() !== "---")
      current.errors.push({
        line: i + 1,
        message:
          kind === "faqs"
            ? "属性格式不正确，请使用“- 分类：…”；答案放在“### 答案”下面。"
            : "属性格式不正确，请使用“- 字段：值”，不要在问题记录中加入未说明的正文。",
      });
  }
  if (fence && current)
    current.errors.push({
      line: current.line,
      message: "代码块未闭合，请补上结束标记，避免后续记录被当作答案。",
    });
  finish();
  return records;
}
export function parseImport(
  kind: ImportKind,
  format: ImportFormat,
  text: string,
): ImportReport {
  const report: ImportReport = {
    kind,
    format,
    total: 0,
    validCount: 0,
    newCount: 0,
    duplicateCount: 0,
    failedCount: 0,
    successCount: 0,
    skippedCount: 0,
    valid: false,
    rows: [],
    errors: [],
  };
  if (Buffer.byteLength(text, "utf8") > IMPORT_MAX_BYTES) {
    report.errors.push({
      line: 1,
      message: "文件或粘贴内容超过1MB，请拆分后再导入。",
    });
    return finishReport(report);
  }
  if (text.includes("\uFFFD")) {
    report.errors.push({
      line: 1,
      message: "内容存在无法识别的字符，请另存为正确的UTF-8编码。",
    });
    return finishReport(report);
  }
  let raw: RawRecord[] = [];
  try {
    if (format === "csv" && kind !== "questions")
      throw Error("常见问答只支持Markdown导入，请下载问答模板。");
    raw =
      format === "csv" ? parseCsvQuestions(text) : markdownRecords(kind, text);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "格式无法识别，请使用模板。";
    report.errors.push({
      line: Number(/第(\d+)行/.exec(message)?.[1] || 1),
      message,
    });
    return finishReport(report);
  }
  report.total = raw.length;
  if (!raw.length)
    report.errors.push({
      line: 1,
      message: `未识别到${kind === "questions" ? "融资问题" : "常见问答"}。请使用“## ${kind === "questions" ? "Q001" : "F001"}｜问题文字”开始每条记录，文档标题和字段说明不会作为记录。`,
    });
  if (raw.length > 100)
    report.errors.push({
      line: raw[100].line,
      message: "每次最多导入100条，请将文档拆分后再导入。",
    });
  for (const [index, r] of raw.entries()) {
    const a = r.attributes,
      category = a.分类?.trim() || "",
      state = a.状态?.trim() || "",
      errors = [...r.errors],
      warnings = [...r.warnings];
    const err = (field: string, message: string) =>
      errors.push({ line: r.attributeLines[field] || r.line, message });
    if (!categories.includes(category as (typeof categories)[number]))
      err(
        "分类",
        category
          ? "分类无效，请从页面列出的融资分类中选择。"
          : "缺少分类，请添加“- 分类：有效分类名称”。",
      );
    const row: ImportRow = {
      number: index + 1,
      label: r.label,
      line: r.line,
      question: r.question,
      category,
      status: "",
      warnings,
      errors,
      disposition: "new",
      ...(a.来源 ? { source: a.来源 } : {}),
    };
    if (r.label.length > 20)
      errors.push({
        line: r.line,
        message: "原文编号过长，请使用简短数字编号。",
      });
    if (kind === "questions") {
      const intent = boundaryValue(a.搜索意图?.trim() || "认知型", intents);
      const oldState: Record<string, string> = {
        创作中: "PLANNED",
        已关联解答: "ANSWERED",
      };
      const status =
        boundaryValue(state || "待规划", questionStatuses) || oldState[state];
      row.intent = intent as string;
      row.priority = Number(a.优先级?.trim() || 3);
      row.keywords = (a.关键词 || "")
        .split(/[、,，|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      row.status = status || "";
      if (!intent)
        err(
          "搜索意图",
          "搜索意图无效，请填写认知型、比较型、决策型或申请准备型。",
        );
      if (!status)
        err("状态", "问题状态无效，请填写待规划、已规划、已解答或已归档。");
      if (status === "ANSWERED")
        err(
          "状态",
          "已解答问题需要关联文章。请先按已规划导入，再在编辑页关联文章并标记已解答。",
        );
      const p = questionSchema.safeParse({
        question: row.question,
        category,
        keywords: row.keywords,
        intent: row.intent,
        priority: row.priority,
        status: row.status,
        articleId: null,
      });
      if (!p.success)
        for (const issue of p.error.issues) {
          if (["category", "intent", "status"].includes(String(issue.path[0])))
            continue;
          err(
            String(issue.path[0]) === "priority" ? "优先级" : "",
            chineseIssue(issue),
          );
        }
    } else {
      const status = boundaryValue(state || "待审核", contentStatuses);
      if (!status) err("状态", "问答状态无效，请填写草稿或待审核。");
      row.status = status === "IN_REVIEW" ? "IN_REVIEW" : "DRAFT";
      if (status && !["DRAFT", "IN_REVIEW"].includes(status))
        warnings.push(
          "原状态涉及审核或发布，导入已安全改为草稿；不会自动审核、发布或下线现有内容。",
        );
      row.answer = r.answer;
      const p = faqSchema.safeParse({
        question: r.question,
        answer: r.answer,
        category,
        articleId: null,
        sources: [],
      });
      if (!p.success)
        for (const issue of p.error.issues) {
          if (issue.path[0] === "category") continue;
          err("", chineseIssue(issue));
        }
    }
    if (a.来源 && a.来源.length > 600)
      err("来源", "来源说明最多600个字符，请缩短后重试。");
    for (const [field, value] of [
      ["问题", r.question],
      ["答案", r.answer],
      ...Object.entries(a),
    ] as [string, string][]) {
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
        err(field, `${field}包含无效控制字符，请删除后重试。`);
      if (unsafe(value))
        err(
          field,
          `${field}含有HTML标签、事件属性或不安全链接，请改用纯文字或安全Markdown。`,
        );
    }
    if (errors.length) row.disposition = "invalid";
    report.rows.push(row);
  }
  return finishReport(report);
}
export function finishReport(report: ImportReport) {
  report.validCount = report.rows.filter(
    (r) => r.disposition !== "invalid",
  ).length;
  report.duplicateCount = report.rows.filter(
    (r) => r.disposition === "duplicate",
  ).length;
  report.newCount = report.rows.filter((r) => r.disposition === "new").length;
  report.failedCount =
    report.rows.filter((r) => r.disposition === "invalid").length +
    report.errors.length;
  report.skippedCount = report.duplicateCount;
  report.valid =
    report.failedCount === 0 && report.total > 0 && report.total <= 100;
  return report;
}
