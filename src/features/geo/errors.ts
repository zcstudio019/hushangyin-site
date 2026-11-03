import { z } from "zod";
import { HttpError } from "@/lib/http";
import { fieldNames } from "./config";
export function chineseIssue(issue: z.core.$ZodIssue) {
  const field = String(issue.path[0] || ""),
    label = fieldNames[field] || "填写内容";
  const index =
    typeof issue.path[1] === "number" ? `第${issue.path[1] + 1}项` : "";
  const detail =
    typeof issue.path[2] === "string"
      ? fieldNames[issue.path[2]] || "内容"
      : "";
  const subject = label + index + detail;
  if (issue.code === "custom" && /[\u4e00-\u9fff]/.test(issue.message))
    return `${subject}：${issue.message}`;
  if (issue.code === "unrecognized_keys")
    return "存在不支持的字段，请使用页面提供的输入项。";
  if (field === "priority") return "优先级须为1到5的整数。";
  if (issue.code === "too_big")
    return `${subject}过长或项目过多，最多允许${String(issue.maximum)}${issue.origin === "array" ? "项" : "个字符"}。`;
  if (issue.code === "too_small")
    return `${subject}不能为空或过短，请补充后重试。`;
  if (issue.code === "invalid_value")
    return `${subject}无效，请从页面提供的中文选项中选择。`;
  if (issue.code === "invalid_format" && field === "slug")
    return "网址标识只允许小写字母、数字和连字符。";
  if (issue.code === "invalid_format")
    return `${subject}格式不正确，请按提示填写。`;
  return `${subject}缺失或格式不正确，请检查后重试。`;
}
export function parseGeo<T>(schema: z.ZodType<T>, input: unknown): T {
  const p = schema.safeParse(input);
  if (!p.success)
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      chineseIssue(p.error.issues[0]),
    );
  return p.data;
}
