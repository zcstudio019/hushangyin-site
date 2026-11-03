import { modelConnectionStatus } from "./connection";
import { isChatProvider, aiSettingsSignature } from "@/lib/ai/provider";
import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/session";
import { authorize } from "@/lib/auth/authorization";
import { can } from "@/lib/auth/permissions";
import { HttpError } from "@/lib/http";
import { limit } from "@/lib/security";
import { geoWrite } from "@/features/geo/write";
import { aiConfiguration } from "@/lib/ai/provider";
import { parseGeo } from "@/features/geo/errors";
import {
  createTaskSchema,
  templateSchema,
  referenceSchema,
  containsSensitive,
} from "./validation";
import { postgresKnowledge } from "./knowledge";
import type { GenerationInput } from "./config";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export const taskScope = (actor: Actor) =>
  can(actor, "generation.manage") ? {} : { createdById: actor.id };
export async function generationOptions(
  actor: Actor,
  q = "",
  selectedId?: string,
) {
  await authorize(actor, "generation.create");
  const conf = aiConfiguration();
  const [questions, templates, heartbeat] = await Promise.all([
    db().geoQuestion.findMany({
      where: {
        status: { not: "ARCHIVED" },
        ...(q ? { question: { contains: q.slice(0, 100) } } : {}),
      },
      select: {
        id: true,
        question: true,
        category: true,
        keywords: true,
        intent: true,
        status: true,
      },
      take: 100,
      orderBy: { priority: "asc" },
    }),
    db().geoGenerationTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    db().generationWorkerHeartbeat.findFirst({
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);
  // Include an explicit deep-link selection even when it is outside the first 100 choices.
  if (selectedId && !questions.some((question) => question.id === selectedId)) {
    const selected = await db().geoQuestion.findFirst({
      where: { id: selectedId, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        question: true,
        category: true,
        keywords: true,
        intent: true,
        status: true,
      },
    });
    if (selected) questions.unshift(selected);
  }
  return {
    questions,
    templates,
    canManage: can(actor, "generation.manage"),
    configuration: { available: conf.available, missing: conf.missing },
    modelStatus: await modelConnectionStatus(actor),
    workerOnline:
      !!heartbeat && Date.now() - heartbeat.lastSeenAt.getTime() < 60000,
  };
}
export async function taskItem(actor: Actor, id: string) {
  await authorize(actor, "generation.create");
  const item = await db().geoGenerationTask.findFirst({
    where: { id, ...taskScope(actor) },
    include: {
      question: { select: { question: true } },
      createdBy: { select: { name: true } },
      callLogs: { orderBy: { attempt: "asc" } },
    },
  });
  if (!item) throw new HttpError(404, "TASK_MISSING", "任务不存在或无权查看。");
  return item;
}
export async function createTask(actor: Actor, input: unknown) {
  await authorize(actor, "generation.create");
  const v = parseGeo(createTaskSchema, input);
  const conf = aiConfiguration();
  if (!conf.available)
    throw new HttpError(
      503,
      "AI_NOT_CONFIGURED",
      "尚不能生成：" + conf.missing.join("；") + "。不会创建虚假草稿。",
    );
  if (
    containsSensitive(v.supplement) ||
    containsSensitive(v.audience) ||
    /征信报告原文|银行流水明细|客户档案|资产负债表|利润表|开户行\s*[:：]|(?:户名|账号|账户号)\s*[:：]/.test(
      v.supplement,
    )
  )
    throw new HttpError(
      400,
      "SENSITIVE_INPUT",
      "请移除补充材料中的疑似个人信息。",
    );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...v, idempotencyKey: undefined }))
    .digest("hex");
  const existing = await db().geoGenerationTask.findUnique({
    where: {
      createdById_idempotencyKey: {
        createdById: actor.id,
        idempotencyKey: v.idempotencyKey,
      },
    },
  });
  if (existing) {
    if (
      (existing.inputSnapshot as { requestFingerprint?: string })
        .requestFingerprint !== fingerprint
    )
      throw new HttpError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "相同请求标识不能用于不同内容。",
      );
    return existing;
  }
  await limit("generation:" + actor.id, 5, 3600);
  return geoWrite(actor, "generation.create", async (tx) => {
    const activeKey = createHash("sha256")
      .update(actor.id + fingerprint)
      .digest("hex");
    const active = await tx.geoGenerationTask.findUnique({
      where: { activeKey },
    });
    if (active) return active;
    const template = await tx.geoGenerationTemplate.findUnique({
      where: { id: v.templateId },
    });
    if (
      !template ||
      !template.isActive ||
      template.version !== v.templateVersion
    )
      throw new HttpError(
        409,
        "TEMPLATE_CHANGED",
        "模板已变化，请刷新后重试。",
      );
    const knowledge = await postgresKnowledge.retrieve(tx, v.questionId);
    const snapshot: GenerationInput = {
      providerConfiguration: aiSettingsSignature(conf.settings),
      knowledge,
      template: {
        id: template.id,
        name: template.name,
        version: template.version,
        content: template.templateContent,
      },
      articleType: v.articleType,
      audience: v.audience,
      depth: v.depth,
      supplement: v.supplement,
      requestFingerprint: fingerprint,
    };
    if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > 128000)
      throw new HttpError(
        413,
        "KNOWLEDGE_TOO_LARGE",
        "知识材料总量过大，请精简资料后重试。",
      );
    if (containsSensitive(JSON.stringify(snapshot)))
      throw new HttpError(
        400,
        "SENSITIVE_INPUT",
        "材料含疑似个人信息，不会外发。",
      );
    const item = await tx.geoGenerationTask.create({
      data: {
        questionId: v.questionId,
        createdById: actor.id,
        creatorSessionVersion: actor.sessionVersion,
        articleType: v.articleType,
        audience: v.audience,
        depth: v.depth,
        templateId: template.id,
        templateVersion: template.version,
        providerName: conf.settings.provider,
        modelName: conf.settings.model,
        inputSnapshot: json(snapshot),
        idempotencyKey: v.idempotencyKey,
        activeKey,
        timeoutMs: conf.settings.timeoutMs,
        maxOutputTokens: conf.settings.maxOutputTokens,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "GENERATION_CREATE",
        resourceType: "geo_generation",
        resourceId: item.id,
        metadata: { templateVersion: template.version },
      },
    });
    return item;
  });
}
export async function taskAction(
  actor: Actor,
  id: string,
  action: "cancel" | "retry" | "save" | "regenerate",
  confirmPotentialCharge = false,
) {
  const old = await taskItem(actor, id);
  if (
    ["retry", "regenerate"].includes(action) &&
    isChatProvider(old.providerName) &&
    old.attempts > 0 &&
    !confirmPotentialCharge
  )
    throw new HttpError(
      400,
      "CHARGE_CONFIRMATION_REQUIRED",
      "请先核对网关用量与任务记录，并确认再次调用可能产生额外Token费用。网关不保证幂等计费。",
    );
  if (action === "regenerate") {
    if (["QUEUED", "RUNNING"].includes(old.status))
      throw new HttpError(
        409,
        "TASK_ACTIVE",
        "当前任务仍在执行，请等待或取消。新任务不会覆盖原草稿。",
      );
    const previous = old.inputSnapshot as unknown as GenerationInput;
    return createTask(actor, {
      questionId: old.questionId,
      templateId: old.templateId,
      templateVersion: old.templateVersion,
      articleType: old.articleType,
      audience: old.audience,
      depth: old.depth,
      supplement: previous.supplement,
      idempotencyKey: crypto.randomUUID(),
      approvedNonSensitive: true,
    });
  }
  if (action === "save") {
    if (!old.outputArticleId)
      throw new HttpError(409, "NOT_READY", "任务尚未产生已保存草稿。");
    return { articleId: old.outputArticleId };
  }
  return geoWrite(actor, "generation.create", async (tx) => {
    const item = await tx.geoGenerationTask.findUniqueOrThrow({
      where: { id },
    });
    if (action === "cancel") {
      if (!["QUEUED", "RUNNING"].includes(item.status))
        throw new HttpError(409, "STATE_INVALID", "当前任务不可取消。");
      await tx.geoGenerationTask.update({
        where: { id },
        data: {
          status: "CANCELLED",
          activeKey: null,
          leaseToken: null,
          leaseUntil: null,
          completedAt: new Date(),
        },
      });
    } else {
      if (
        !["FAILED", "CANCELLED"].includes(item.status) ||
        item.attempts >= item.maxAttempts
      )
        throw new HttpError(
          409,
          "STATE_INVALID",
          "当前任务不可重试或已达到重试上限，请重新创建任务。",
        );
      const conf = aiConfiguration();
      if (!conf.available)
        throw new HttpError(
          503,
          "AI_NOT_CONFIGURED",
          "模型配置尚未完成，不能重试。",
        );
      if (
        item.modelName !== conf.settings.model ||
        item.providerName !== conf.settings.provider
      )
        throw new HttpError(
          409,
          "MODEL_CHANGED",
          "模型配置已变化，请重新创建任务，不能将旧任务自动切换模型。",
        );
      const input = item.inputSnapshot as unknown as GenerationInput;
      if (
        input.providerConfiguration &&
        input.providerConfiguration !== aiSettingsSignature(conf.settings)
      )
        throw new HttpError(
          409,
          "MODEL_CHANGED",
          "模型、网关或请求参数已变更，请重新创建任务，不能将旧任务切换到其他配置。",
        );
      input.knowledge = await postgresKnowledge.retrieve(tx, item.questionId);
      const creator = await tx.adminUser.findUnique({
        where: { id: item.createdById },
      });
      if (
        !creator ||
        !creator.isActive ||
        creator.mustChangePassword ||
        !can(creator, "generation.create")
      )
        throw new HttpError(
          409,
          "CREATOR_UNAVAILABLE",
          "原创建人账号或权限不可用，不能恢复该任务。",
        );
      const activeKey = createHash("sha256")
        .update(item.createdById + input.requestFingerprint)
        .digest("hex");
      if (
        await tx.geoGenerationTask.findFirst({
          where: { activeKey, id: { not: id } },
        })
      )
        throw new HttpError(409, "TASK_ACTIVE", "已有相同任务正在执行。");
      await tx.geoGenerationTask.update({
        where: { id },
        data: {
          status: "QUEUED",
          activeKey,
          creatorSessionVersion: creator.sessionVersion,
          inputSnapshot: json(input),
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          availableAt: new Date(),
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "GENERATION_" + action.toUpperCase(),
        resourceType: "geo_generation",
        resourceId: id,
        metadata: { chargeConfirmed: confirmPotentialCharge },
      },
    });
    return { id };
  });
}
export async function saveTemplate(actor: Actor, input: unknown, id?: string) {
  const v = parseGeo(templateSchema, input);
  if (containsSensitive(JSON.stringify(v)))
    throw new HttpError(400, "SENSITIVE_INPUT", "模板不可包含个人信息。");
  return geoWrite(actor, "generation.manage", async (tx) => {
    const old = id
      ? await tx.geoGenerationTemplate.findUnique({ where: { id } })
      : null;
    if (id && (!old || old.version !== v.version))
      throw new HttpError(409, "TEMPLATE_CHANGED", "模板已变化，请刷新。");
    const data = {
      name: v.name,
      description: v.description,
      templateContent: v.templateContent,
      isActive: v.isActive,
      updatedById: actor.id,
      version: (old?.version || 0) + 1,
    };
    const item = id
      ? await tx.geoGenerationTemplate.update({ where: { id }, data })
      : await tx.geoGenerationTemplate.create({ data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "GENERATION_TEMPLATE_SAVE",
        resourceType: "geo_template",
        resourceId: item.id,
        metadata: { version: item.version },
      },
    });
    return item;
  });
}
export async function saveReference(actor: Actor, input: unknown, id?: string) {
  const v = parseGeo(referenceSchema, input);
  if (containsSensitive(JSON.stringify(v)))
    throw new HttpError(400, "SENSITIVE_INPUT", "参考资料不可包含个人信息。");
  if (v.validUntil && new Date(v.validUntil + "T23:59:59Z") < new Date())
    throw new HttpError(400, "EXPIRED", "适用截止日期不能早于今天。");
  return geoWrite(actor, "generation.manage", async (tx) => {
    if (
      id &&
      !(await tx.articleSource.findFirst({
        where: { id, articleId: null, catalogId: null },
      }))
    )
      throw new HttpError(404, "SOURCE_MISSING", "资料不存在。");
    const data = {
      title: v.title,
      sourceUrl: v.sourceUrl,
      excerpt: v.excerpt,
      validUntil: v.validUntil ? new Date(v.validUntil + "T23:59:59Z") : null,
      verifiedAt: new Date(),
      verifiedById: actor.id,
      isActive: v.isActive,
    };
    const item = id
      ? await tx.articleSource.update({ where: { id }, data })
      : await tx.articleSource.create({ data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "GENERATION_SOURCE_VERIFY",
        resourceType: "article_source",
        resourceId: item.id,
      },
    });
    return item;
  });
}
