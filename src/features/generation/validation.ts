import { z } from "zod";
import { articleTypes, depths } from "./config";
const str = (max: number) => z.string().trim().min(1).max(max);
export const createTaskSchema = z
  .object({
    questionId: str(64),
    templateId: str(64),
    templateVersion: z.number().int().min(1),
    articleType: z.enum(
      Object.keys(articleTypes) as [
        keyof typeof articleTypes,
        ...(keyof typeof articleTypes)[],
      ],
    ),
    audience: str(120),
    depth: z.enum(
      Object.keys(depths) as [keyof typeof depths, ...(keyof typeof depths)[]],
    ),
    supplement: z.string().max(4000),
    idempotencyKey: z.string().uuid(),
    approvedNonSensitive: z.literal(true),
  })
  .strict();
export const resultSchema = z
  .object({
    title: str(200),
    summary: str(600),
    markdown: str(80000),
    seoTitle: str(200),
    metaDescription: str(600),
    keywords: z.array(str(40)).max(15),
    relatedQuestionIds: z.array(str(64)).max(5),
    faqIds: z.array(str(64)).max(8),
    references: z
      .array(z.object({ sourceId: str(64), paragraph: str(2000) }).strict())
      .max(20),
    verificationItems: z.array(str(500)).max(30),
  })
  .strict();
export type GeneratedResult = z.infer<typeof resultSchema>;
export const resultJsonSchema = z.toJSONSchema(resultSchema, {
  target: "draft-7",
});
export const templateSchema = z
  .object({
    name: str(100),
    description: str(600),
    templateContent: str(12000),
    version: z.number().int().min(1),
    isActive: z.boolean(),
  })
  .strict();
export const referenceSchema = z
  .object({
    title: str(200),
    sourceUrl: z
      .url()
      .max(1000)
      .refine((s) => {
        const u = new URL(s);
        return u.protocol === "https:" && !u.username && !u.password;
      }, "参考网址必须为无凭据的HTTPS地址。"),
    excerpt: str(4000),
    validUntil: z.iso.date().nullable(),
    verified: z.literal(true),
    isActive: z.boolean(),
  })
  .strict();
export function containsSensitive(text: string) {
  text = text.normalize("NFKC").replace(/[\u200b-\u200f\ufeff]/g, "");
  return /\bsk-[a-z0-9_-]{16,}|(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=：]\s*[^\s&"']+|(?:^|\D)1[3-9]\d{9}(?!\d)|\b\d{17}[\dXx]\b|\b\d{16,19}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:客户姓名|姓名|联系人|借款人)\s*[:：]\s*[\u4e00-\u9fff]{2,10}/i.test(
    text,
  );
}
export function unsafeGeneratedText(text: string) {
  return /<\s*\/?\s*[a-z][^>]*>|\bon[a-z]+\s*=|(?:javascript|vbscript|data)\s*:/i.test(
    text,
  );
}
