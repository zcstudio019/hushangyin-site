import { saveFaqVersion } from "./faq-versions";
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth/authorization";
import type { Actor } from "@/lib/auth/session";
import { HttpError } from "@/lib/http";
import { limit } from "@/lib/security";
import { geoWrite, geoAudit } from "./write";
import { parseGeo } from "./errors";
import {
  parseImport,
  normaliseQuestion,
  finishReport,
  inputDigest,
  type ImportKind,
  type ImportFormat,
  type ImportReport,
} from "./import-parser";
const requestSchema = z
  .object({
    format: z.enum(["markdown", "csv"]),
    text: z
      .string()
      .min(1)
      .max(1024 * 1024),
    mode: z.enum(["preview", "commit"]),
    confirmationToken: z.string().max(300).optional(),
    confirmed: z.boolean().optional(),
  })
  .strict();
function signature(
  actor: Actor,
  kind: ImportKind,
  format: ImportFormat,
  text: string,
  expires: string,
) {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32)
    throw new HttpError(
      503,
      "IMPORT_UNAVAILABLE",
      "导入安全配置未完成，请联系管理员。",
    );
  return createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "geo-import-v1",
        actor.id,
        kind,
        format,
        inputDigest(text),
        expires,
      ]),
    )
    .digest("hex");
}
function token(
  actor: Actor,
  kind: ImportKind,
  format: ImportFormat,
  text: string,
) {
  const expires = String(Date.now() + 10 * 60 * 1000);
  return expires + "." + signature(actor, kind, format, text, expires);
}
function verifyToken(
  actor: Actor,
  kind: ImportKind,
  format: ImportFormat,
  text: string,
  value: string | undefined,
) {
  const [expires, sig] = value?.split(".") || [];
  if (
    !expires ||
    !/^\d{13}$/.test(expires) ||
    Number(expires) < Date.now() ||
    Number(expires) > Date.now() + 11 * 60 * 1000 ||
    !sig ||
    !/^[a-f0-9]{64}$/.test(sig) ||
    !timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(signature(actor, kind, format, text, expires)),
    )
  )
    throw new HttpError(
      409,
      "PREVIEW_EXPIRED",
      "预览已过期或内容已改变，请重新解析预览后确认导入。",
    );
}
async function duplicates(
  client: Prisma.TransactionClient,
  report: ImportReport,
) {
  const existing =
    report.kind === "questions"
      ? await client.geoQuestion.findMany({
          select: { question: true, category: true },
        })
      : await client.faq.findMany({
          select: { question: true, category: true },
        });
  const seen = new Map(
    existing.map((r) => [normaliseQuestion(r.question), r.category]),
  );
  for (const row of report.rows) {
    if (row.disposition === "invalid") continue;
    const key = normaliseQuestion(row.question);
    if (seen.has(key)) {
      row.disposition = "duplicate";
      row.warnings.push(
        "问题文字已存在或在本文件中重复，将跳过且不覆盖现有内容。" +
          (seen.get(key) !== row.category
            ? "现有分类不同，仍按项目的全库唯一问题规则跳过。"
            : ""),
      );
    } else seen.set(key, row.category);
  }
  return finishReport(report);
}
export async function importContent(
  actor: Actor,
  kind: ImportKind,
  input: unknown,
  legacyCsv = false,
) {
  await authorize(actor, "content.create");
  const v = legacyCsv
    ? {
        format: "csv" as const,
        text: parseGeo(
          z
            .object({
              csv: z
                .string()
                .min(1)
                .max(1024 * 1024),
            })
            .strict(),
          input,
        ).csv,
        mode: "commit" as const,
        confirmed: true,
        confirmationToken: undefined,
      }
    : parseGeo(requestSchema, input);
  if (kind === "faqs" && v.format !== "markdown")
    throw new HttpError(
      400,
      "FORMAT_INVALID",
      "常见问答仅支持Markdown导入，请下载问答模板。",
    );
  await limit(
    "geo-import-" + v.mode + ":" + actor.id,
    v.mode === "preview" ? 60 : 30,
  );
  if (v.mode === "commit" && !legacyCsv) {
    if (v.confirmed !== true)
      throw new HttpError(
        400,
        "CONFIRM_REQUIRED",
        "请勾选导入确认，并先完成解析预览。",
      );
    verifyToken(actor, kind, v.format, v.text, v.confirmationToken);
  }
  const report = parseImport(kind, v.format, v.text);
  if (v.mode === "preview") {
    await duplicates(db(), report);
    if (report.valid)
      report.confirmationToken = token(actor, kind, v.format, v.text);
    return report;
  }
  if (!report.valid)
    throw new HttpError(
      400,
      "IMPORT_INVALID",
      "导入未保存：请修正预览中全部错误后再试。",
      report,
    );
  return geoWrite(actor, "content.create", async (tx) => {
    await duplicates(tx, report);
    if (!report.valid)
      throw new HttpError(
        400,
        "IMPORT_INVALID",
        "导入未保存，请修正全部错误。",
        report,
      );
    const importedAt = new Date().toISOString(),
      createdIds: string[] = [];
    for (const row of report.rows.filter((r) => r.disposition === "new")) {
      const importMetadata = {
        recordLabel: row.label,
        ...(row.source ? { source: row.source } : {}),
        importedAt,
        importedBy: actor.id,
        format: v.format,
      };
      if (kind === "questions") {
        const data = {
          question: row.question.trim(),
          category: row.category,
          keywords: row.keywords!,
          intent: row.intent as
            "AWARENESS" | "COMPARISON" | "DECISION" | "PREPARATION",
          priority: row.priority!,
          status: row.status as "OPEN" | "PLANNED" | "ARCHIVED",
          articleId: null,
          importMetadata,
        };
        const item = await tx.geoQuestion.create({ data });
        createdIds.push(item.id);
      } else {
        const item = await tx.faq.create({
          data: {
            question: row.question.trim(),
            answer: row.answer!,
            category: row.category,
            status: row.status as "DRAFT" | "IN_REVIEW",
            articleId: null,
            sources: [],
            authorId: actor.id,
            editorId: actor.id,
            revision: 1,
            submittedAt:
              row.status === "IN_REVIEW" ? new Date(importedAt) : null,
            submittedById: row.status === "IN_REVIEW" ? actor.id : null,
            isLive: false,
            importMetadata,
          },
        });
        await saveFaqVersion(tx, item, actor.id);
        createdIds.push(item.id);
      }
    }
    report.successCount = createdIds.length;
    report.importedAt = importedAt;
    const audit = await geoAudit(
      tx,
      actor,
      kind === "questions" ? "QUESTION_IMPORT" : "FAQ_IMPORT",
      kind,
      actor.id,
      {
        format: v.format,
        count: createdIds.length,
        skipped: report.skippedCount,
        failed: 0,
        digest: inputDigest(v.text),
      },
    );
    return {
      ...report,
      count: createdIds.length,
      createdIds,
      reference: audit.id,
    };
  });
}
export async function importQuestions(actor: Actor, input: unknown) {
  return importContent(
    actor,
    "questions",
    input,
    !!input && typeof input === "object" && Object.hasOwn(input, "csv"),
  );
}
