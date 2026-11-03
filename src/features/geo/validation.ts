import { riskSchema } from "./risk";
import { z } from "zod";
import { categories, intents, questionStatuses, reviewChecks } from "./config";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      "包含无效控制字符。",
    );
export const sourceSchema = z
  .object({
    title: text(200),
    url: z
      .string()
      .max(1000)
      .refine((v) => {
        try {
          const u = new URL(v);
          return u.protocol === "https:" && !u.username && !u.password;
        } catch {
          return false;
        }
      }, "引用必须为有效HTTPS网址。"),
    checkedAt: z.iso.date(),
    validUntil: z.iso.date().optional(),
    paragraph: text(2000).optional(),
  })
  .strict();
const category = z.enum(categories),
  ids = z.array(z.string().max(64)).max(20);
export const articleSchema = z
  .object({
    title: text(200),
    slug: z
      .string()
      .min(1)
      .max(150)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    summary: text(600),
    content: text(80000),
    category,
    tags: z.array(text(40)).max(15),
    sources: z.array(sourceSchema).max(20),
    relatedIds: ids,
    questionId: z.string().min(1).max(64).optional(),
    aiAssisted: z.boolean(),
    seoTitle: z.string().trim().max(200).optional(),
    metaDescription: z.string().trim().max(600).optional(),
    revision: z.number().int().min(0).optional(),
  })
  .strict();
export const faqSchema = z
  .object({
    question: text(300),
    answer: text(20000),
    category,
    articleId: z.string().max(64).nullable(),
    sources: z.array(sourceSchema).max(20),
    revision: z.number().int().min(0).optional(),
  })
  .strict();
export const questionSchema = z
  .object({
    question: text(300),
    category,
    keywords: z.array(text(40)).max(15),
    intent: z.enum(
      Object.keys(intents) as [
        keyof typeof intents,
        ...(keyof typeof intents)[],
      ],
    ),
    priority: z.number().int().min(1).max(5),
    status: z.enum(
      Object.keys(questionStatuses) as [
        keyof typeof questionStatuses,
        ...(keyof typeof questionStatuses)[],
      ],
    ),
    articleId: z.string().max(64).nullable(),
  })
  .strict();
export const workflowSchema = z
  .object({
    action: z.enum([
      "submit",
      "approve",
      "reject",
      "publish",
      "offline",
      "withdraw",
      "restore",
    ]),
    revision: z.number().int().min(0),
    version: z.number().int().min(1).optional(),
    note: z.string().max(1000, "人工核验说明最多1000字。").optional(),
    risk: riskSchema.optional(),
    checklist: z
      .record(
        z.enum(
          Object.keys(reviewChecks) as [
            keyof typeof reviewChecks,
            ...(keyof typeof reviewChecks)[],
          ],
        ),
        z.boolean(),
      )
      .optional(),
  })
  .strict();
export type ArticleInput = z.infer<typeof articleSchema>;
export type Snapshot = {
  title: string;
  slug: string;
  summary: string;
  content: string;
  category: string;
  tags: string[];
  sources: {
    title: string;
    url: string;
    checkedAt?: string;
    validUntil?: string;
    paragraph?: string;
  }[];
  contentFormat: string;
  legacyHtml?: string;
  authorName: string | null;
  publishedAt?: string | null;
  modifiedAt?: string;
  relatedIds: string[];
  aiAssisted: boolean;
  seoTitle?: string | null;
  metaDescription?: string | null;
};
