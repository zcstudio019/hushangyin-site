import { requirePermission } from "@/lib/auth/authorization";
import {
  assertOrigin,
  readJson,
  success,
  failure,
  HttpError,
} from "@/lib/http";
import { db } from "@/lib/db";
import {
  generationOptions,
  createTask,
  taskItem,
  taskAction,
  saveTemplate,
  saveReference,
  taskScope,
} from "@/features/generation/service";
import { postgresKnowledge } from "@/features/generation/knowledge";
import { z } from "zod";
import { parseGeo } from "@/features/geo/errors";
export async function GET(r: Request) {
  try {
    const actor = await requirePermission("generation.create");
    const p = new URL(r.url).searchParams;
    const view = p.get("view");
    if (view === "knowledge")
      return success(
        await postgresKnowledge.retrieve(
          db(),
          p.get("questionId")?.slice(0, 64) || "",
        ),
      );
    if (view === "task")
      return success(await taskItem(actor, p.get("id")?.slice(0, 64) || ""));
    if (view === "tasks") {
      const page = Math.max(
        1,
        Math.min(1000, Number.parseInt(p.get("page") || "1") || 1),
      );
      const where = taskScope(actor);
      const [items, total] = await db().$transaction([
        db().geoGenerationTask.findMany({
          where,
          select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true,
            attempts: true,
            errorMessage: true,
            outputArticleId: true,
            question: { select: { question: true } },
            createdBy: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * 25,
          take: 25,
        }),
        db().geoGenerationTask.count({ where }),
      ]);
      return success({ items, total, page });
    }
    return success(await generationOptions(actor, p.get("q") || ""));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("generation.create");
    return success(await createTask(actor, await readJson(r, 32000)), 201);
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(r: Request) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("generation.create");
    const v = parseGeo(
      z
        .object({
          id: z.string().min(1).max(64),
          action: z.enum(["cancel", "retry", "save", "regenerate"]),
          confirmPotentialCharge: z.boolean().optional(),
        })
        .strict(),
      await readJson(r, 2000),
    );
    return success(
      await taskAction(actor, v.id, v.action, v.confirmPotentialCharge),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(r: Request) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("generation.manage");
    const body = parseGeo(
      z
        .object({
          kind: z.enum(["template", "reference"]),
          id: z.string().max(64).optional(),
          data: z.unknown(),
        })
        .strict(),
      await readJson(r, 64000),
    );
    if (body.kind === "template")
      return success(await saveTemplate(actor, body.data, body.id));
    if (body.kind === "reference")
      return success(await saveReference(actor, body.data, body.id));
    throw new HttpError(400, "INVALID_KIND", "操作无效。");
  } catch (e) {
    return failure(e);
  }
}
