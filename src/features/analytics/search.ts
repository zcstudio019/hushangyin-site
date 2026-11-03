import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Actor } from "@/lib/auth/session";
import { authorize } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { geoWrite } from "@/features/geo/write";
import { parseGeo } from "@/features/geo/errors";
import { HttpError } from "@/lib/http";
import { containsSensitive } from "@/features/generation/validation";
import { signAnalytics, readAnalytics } from "./tokens";
import { dayDate } from "./config";
import { searchAdapter } from "./search-adapters";
const connectionSchema = z
  .object({
    platform: z.enum(["GOOGLE", "BAIDU", "BING"]),
    label: z.string().trim().min(1).max(100),
    siteUrl: z
      .string()
      .max(300)
      .refine((v) => {
        try {
          if (/^sc-domain:[a-z0-9.-]+$/i.test(v)) return true;
          const u = new URL(v);
          return (
            u.protocol === "https:" &&
            !u.username &&
            !u.password &&
            !u.search &&
            !u.hash &&
            u.pathname === "/"
          );
        } catch {
          return false;
        }
      }, "请填写HTTPS站点根网址或sc-domain域名属性。"),
    isActive: z.boolean(),
  })
  .strict();
export async function searchData(actor: Actor) {
  await authorize(actor, "analytics.read");
  return {
    connections: await db().searchPlatformConnection.findMany({
      orderBy: { createdAt: "desc" },
    }),
    metrics: await db().searchPerformanceMetric.findMany({
      include: {
        connection: { select: { label: true, platform: true, siteUrl: true } },
      },
      orderBy: { day: "desc" },
      take: 500,
    }),
    jobs: await db().analyticsSyncJob.findMany({
      select: {
        id: true,
        kind: true,
        status: true,
        result: true,
        createdAt: true,
        connection: { select: { label: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  };
}
export async function saveConnection(
  actor: Actor,
  input: unknown,
  id?: string,
) {
  await authorize(actor, "analytics.manage");
  const v = parseGeo(connectionSchema, input);
  if (containsSensitive(v.label + " " + v.siteUrl))
    throw new HttpError(
      400,
      "SENSITIVE_CONFIG",
      "数据源配置不得包含个人信息或密钥。",
    );
  return geoWrite(actor, "analytics.manage", async (tx) => {
    if (
      id &&
      !(await tx.searchPlatformConnection.findUnique({ where: { id } }))
    )
      throw new HttpError(404, "NOT_FOUND", "数据源不存在。");
    const saved = id
      ? await tx.searchPlatformConnection.update({ where: { id }, data: v })
      : await tx.searchPlatformConnection.create({
          data: { ...v, createdById: actor.id },
        });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "SEARCH_CONNECTION_SAVE",
        resourceType: "analytics_connection",
        resourceId: saved.id,
        metadata: { platform: v.platform, mode: "CSV_ONLY" },
      },
    });
    return saved;
  });
}
const importSchema = z
  .object({
    connectionId: z.string().max(64),
    csv: z.string().max(1050000),
    previewToken: z.string().max(3000).optional(),
    confirm: z.boolean().optional(),
    replaceConflicts: z.boolean().optional(),
  })
  .strict();
export async function importSearch(actor: Actor, input: unknown) {
  await authorize(actor, "analytics.manage");
  const v = parseGeo(importSchema, input);
  const c = await db().searchPlatformConnection.findFirst({
    where: { id: v.connectionId, isActive: true },
  });
  if (!c) throw new HttpError(404, "SOURCE_MISSING", "请先配置有效数据源。");
  const rows = searchAdapter(c.platform).parse(v.csv),
    hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  const old = await db().searchPerformanceMetric.findMany({
    where: {
      connectionId: c.id,
      day: { in: rows.map((r) => dayDate(r.day)) },
      dimension: "site-daily-web",
    },
  });
  const conflicts = rows
    .filter((r) => {
      const o = old.find((o) => o.day.toISOString().slice(0, 10) === r.day);
      return (
        o &&
        (o.clicks !== r.clicks ||
          o.impressions !== r.impressions ||
          o.averagePosition !== r.averagePosition)
      );
    })
    .map((r) => r.day);
  if (!v.confirm)
    return {
      rows,
      total: rows.length,
      duplicates: old.length - conflicts.length,
      conflicts,
      previewToken: signAnalytics({
        type: "SEARCH_PREVIEW",
        actorId: actor.id,
        connectionId: c.id,
        version: c.updatedAt.toISOString(),
        hash,
        exp: Date.now() + 10 * 60000,
      }),
    };
  const proof = readAnalytics<{
    type: string;
    actorId: string;
    connectionId: string;
    version: string;
    hash: string;
    exp: number;
  }>(v.previewToken, "SEARCH_PREVIEW");
  if (
    !proof ||
    proof.actorId !== actor.id ||
    proof.connectionId !== c.id ||
    proof.hash !== hash ||
    proof.version !== c.updatedAt.toISOString()
  )
    throw new HttpError(
      409,
      "PREVIEW_REQUIRED",
      "预览凭证已过期或配置/文件变化，请重新预览并确认。",
    );
  return geoWrite(actor, "analytics.manage", async (tx) => {
    const current = await tx.searchPlatformConnection.findUnique({
      where: { id: c.id },
    });
    if (!current?.isActive || current.updatedAt.toISOString() !== proof.version)
      throw new HttpError(409, "SOURCE_CHANGED", "数据源已变化，请重新预览。");
    let added = 0,
      skipped = 0,
      replaced = 0;
    for (const r of rows) {
      const day = dayDate(r.day),
        where = {
          connectionId_day_dimension: {
            connectionId: c.id,
            day,
            dimension: "site-daily-web",
          },
        },
        exists = await tx.searchPerformanceMetric.findUnique({ where });
      if (exists) {
        if (
          exists.clicks === r.clicks &&
          exists.impressions === r.impressions &&
          exists.averagePosition === r.averagePosition
        ) {
          skipped++;
          continue;
        }
        if (!v.replaceConflicts)
          throw new HttpError(
            409,
            "DATE_CONFLICT",
            "已有日期出现不同数据，请重新预览并明确确认替换，不会部分写入。",
          );
        await tx.searchPerformanceMetric.update({
          where,
          data: {
            clicks: r.clicks,
            impressions: r.impressions,
            averagePosition: r.averagePosition,
          },
        });
        replaced++;
      } else {
        await tx.searchPerformanceMetric.create({
          data: {
            connectionId: c.id,
            day,
            clicks: r.clicks,
            impressions: r.impressions,
            averagePosition: r.averagePosition,
          },
        });
        added++;
      }
    }
    const result = {
      added,
      skipped,
      replaced,
      source: "人工CSV导入；非API授权数据",
      timezone: "保留平台原始导出日期，不与上海日期直接相加",
    };
    await tx.analyticsSyncJob.create({
      data: {
        connectionId: c.id,
        actorId: actor.id,
        kind: "CSV_IMPORT",
        status: "COMPLETED",
        inputHash: hash,
        result,
        completedAt: new Date(),
      },
    });
    await tx.searchPlatformConnection.update({
      where: { id: c.id },
      data: { lastImportedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "SEARCH_CSV_IMPORT",
        resourceType: "analytics_connection",
        resourceId: c.id,
        metadata: result,
      },
    });
    return result;
  });
}
export async function requestSearchSync(actor: Actor, id: string) {
  return geoWrite(actor, "analytics.manage", async (tx) => {
    const c = await tx.searchPlatformConnection.findUnique({ where: { id } });
    if (!c) throw new HttpError(404, "NOT_FOUND", "数据源不存在。");
    const job = await tx.analyticsSyncJob.create({
      data: {
        connectionId: id,
        actorId: actor.id,
        kind: "API_SYNC",
        status: "BLOCKED",
        result: {
          message: "平台尚未授权且API适配未开通；未发送请求、未生成曝光数据。",
        },
        completedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "SEARCH_SYNC_BLOCKED",
        resourceType: "analytics_connection",
        resourceId: id,
      },
    });
    return {
      id: job.id,
      status: "BLOCKED",
      message: "尚未获得平台授权或实现自动适配，当前仅支持人工CSV导入。",
    };
  });
}
