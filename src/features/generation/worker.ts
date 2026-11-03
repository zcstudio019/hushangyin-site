import { databaseProvider, isolatedTestDatabase } from "@/lib/db/provider";
import { recalculateQuestion } from "./question-state";
import { Prisma, PrismaClient, type GeoGenerationTask } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import {
  AiError,
  HttpAiProvider,
  aiConfiguration,
  estimatedCost,
  isChatProvider,
  shouldRetryGeneration,
  aiSettingsSignature,
  type AiProvider,
  type ProviderResult,
  type AiSettings,
} from "@/lib/ai/provider";
import { can } from "@/lib/auth/permissions";
import { assertEvidence } from "./knowledge";
import { compliance, validateGrounding } from "./compliance";
import {
  resultSchema,
  containsSensitive,
  unsafeGeneratedText,
} from "./validation";
import type { GenerationInput } from "./config";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
async function allowed(tx: Prisma.TransactionClient, task: GeoGenerationTask) {
  const u = await tx.adminUser.findUnique({ where: { id: task.createdById } });
  if (
    !u ||
    !u.isActive ||
    u.mustChangePassword ||
    u.sessionVersion !== task.creatorSessionVersion ||
    !can(u, "generation.create")
  )
    throw new AiError(
      "PERMISSION_CHANGED",
      "创建人账号或权限已变化，请重新登录后创建任务。",
    );
}
export async function recoverExpired(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    const rows =
      databaseProvider() !== "postgresql"
        ? await tx.geoGenerationTask.findMany({
            where: { status: "RUNNING", leaseUntil: { lt: new Date() } },
          })
        : await tx.$queryRaw<
            GeoGenerationTask[]
          >`SELECT * FROM geo_generation_tasks WHERE status='RUNNING' AND "leaseUntil"<NOW() FOR UPDATE SKIP LOCKED`;
    for (const t of rows) {
      const failed =
        isChatProvider(t.providerName) || t.attempts >= t.maxAttempts;
      await tx.geoGenerationTask.update({
        where: { id: t.id },
        data: {
          status: failed ? "FAILED" : "QUEUED",
          leaseToken: null,
          leaseUntil: null,
          ...(failed ? { activeKey: null, completedAt: new Date() } : {}),
          availableAt: new Date(),
          errorCode: "LEASE_EXPIRED",
          errorMessage: failed
            ? "执行中断，模型结果及计费状态未确认，已停止自动重发；请核对网关记录。"
            : "执行中断，已等待安全重试。",
        },
      });
      await tx.generationCallLog.updateMany({
        where: { taskId: t.id, attempt: t.attempts, status: "RUNNING" },
        data: {
          status: "INTERRUPTED",
          errorCode: "LEASE_EXPIRED",
          completedAt: new Date(),
        },
      });
    }
    return rows.length;
  });
}
export async function claimTask(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    const rows =
      databaseProvider() !== "postgresql"
        ? await tx.geoGenerationTask.findMany({
            where: {
              status: "QUEUED",
              availableAt: { lte: new Date() },
              attempts: { lt: tx.geoGenerationTask.fields.maxAttempts },
            },
            orderBy: { createdAt: "asc" },
            take: 1,
          })
        : await tx.$queryRaw<
            GeoGenerationTask[]
          >`SELECT * FROM geo_generation_tasks WHERE status='QUEUED' AND "availableAt"<=NOW() AND attempts<"maxAttempts" ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    const t = rows[0];
    if (!t) return null;
    const task = await tx.geoGenerationTask.update({
      where: { id: t.id },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        leaseToken: randomUUID(),
        leaseUntil: new Date(Date.now() + t.timeoutMs + 60000),
        startedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });
    await tx.generationCallLog.create({
      data: {
        taskId: t.id,
        attempt: task.attempts,
        provider: t.providerName,
        model: t.modelName,
        status: "RUNNING",
      },
    });
    return task;
  });
}
async function finish(
  client: PrismaClient,
  t: GeoGenerationTask,
  response: ProviderResult,
  settings: AiSettings,
) {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(151151)`;
      // The row lock serializes completion against cancellation and lease recovery.
      await tx.$queryRaw`SELECT id FROM geo_generation_tasks WHERE id=${t.id} FOR UPDATE`;
      const current = await tx.geoGenerationTask.findUniqueOrThrow({
        where: { id: t.id },
      });
      if (
        current.status !== "RUNNING" ||
        current.leaseToken !== t.leaseToken ||
        !current.leaseUntil ||
        current.leaseUntil < new Date()
      )
        return false;
      await allowed(tx, t);
      const input = t.inputSnapshot as unknown as GenerationInput;
      await assertEvidence(tx, input.knowledge);
      const result = resultSchema.parse(response.result);
      if (
        containsSensitive(JSON.stringify(result)) ||
        unsafeGeneratedText(result.markdown)
      )
        throw new AiError("UNSAFE_OUTPUT", "生成内容含不安全文本，未保存。");
      validateGrounding(result, input.knowledge);
      const bindings = result.references.map((s) => ({
        ...input.knowledge.references.find((r) => r.id === s.sourceId)!,
        paragraph: s.paragraph,
      }));
      const sources = bindings.map((s) => ({
        title: s.title,
        url: s.url,
        checkedAt: s.verifiedAt.slice(0, 10),
        ...(s.validUntil ? { validUntil: s.validUntil.slice(0, 10) } : {}),
        paragraph: s.paragraph,
      }));
      const findings = compliance(
        result.markdown,
        result.keywords,
        !!sources.length,
      );
      const metadata = {
        taskId: t.id,
        provider: t.providerName,
        model: t.modelName,
        templateId: t.templateId,
        templateVersion: t.templateVersion,
        verificationItems: result.verificationItems,
        knowledgeWarnings: input.knowledge.warnings,
        generatedAt: new Date().toISOString(),
      };
      const article = await tx.article.create({
        data: {
          title: result.title,
          slug: "ai-" + t.id.toLowerCase(),
          summary: result.summary,
          content: result.markdown,
          category: input.knowledge.question.category,
          tags: result.keywords,
          sources: json(sources),
          seoTitle: result.seoTitle,
          metaDescription: result.metaDescription,
          contentFormat: "MARKDOWN",
          revision: 1,
          status: "DRAFT",
          aiAssisted: true,
          authorId: t.createdById,
          editorId: t.createdById,
          generationMetadata: json(metadata),
          complianceReport: json({ revision: 1, findings }),
        },
      });
      const author = await tx.adminUser.findUnique({
        where: { id: t.createdById },
        select: { name: true },
      });
      await tx.articleVersion.create({
        data: {
          articleId: article.id,
          revision: 1,
          editorId: t.createdById,
          snapshot: json({
            title: article.title,
            slug: article.slug,
            summary: article.summary,
            content: article.content,
            category: article.category,
            tags: article.tags,
            sources,
            seoTitle: article.seoTitle,
            metaDescription: article.metaDescription,
            aiAssisted: true,
            contentFormat: "MARKDOWN",
            authorName: author?.name || null,
            relatedIds: [],
          }),
        },
      });
      const questionIds = [
        ...new Set([t.questionId, ...result.relatedQuestionIds]),
      ];
      await tx.articleQuestionRelation.createMany({
        data: questionIds.map((questionId) => ({
          articleId: article.id,
          questionId,
          relationType: questionId === t.questionId ? "PRIMARY" : "RELATED",
        })),
      });
      const planned = await tx.geoQuestion.findMany({
        where: { id: { in: questionIds }, status: { in: ["OPEN", "PLANNED"] } },
        select: { id: true },
      });
      for (const q of planned)
        await recalculateQuestion(tx, q.id, t.createdById);
      if (result.faqIds.length)
        await tx.articleFaqRelation.createMany({
          data: result.faqIds.map((faqId) => {
            const f = input.knowledge.faqs.find((x) => x.id === faqId)!;
            return {
              articleId: article.id,
              faqId,
              revision: f.revision,
              evidenceMode: f.mode,
            };
          }),
        });
      if (bindings.length)
        await tx.articleSource.createMany({
          data: bindings.map((s) => ({
            articleId: article.id,
            catalogId: s.id,
            title: s.title,
            sourceUrl: s.url,
            excerpt: s.excerpt,
            paragraph: s.paragraph,
            verifiedAt: new Date(s.verifiedAt),
            validUntil: s.validUntil ? new Date(s.validUntil) : null,
            revision: 1,
          })),
        });
      await tx.geoGenerationTask.update({
        where: { id: t.id },
        data: {
          status: "SUCCEEDED",
          output: json(result),
          outputArticleId: article.id,
          tokenUsage: json(response.usage),
          activeKey: null,
          leaseToken: null,
          leaseUntil: null,
          completedAt: new Date(),
        },
      });
      const cost = estimatedCost(response.usage, settings);
      await tx.generationCallLog.update({
        where: { taskId_attempt: { taskId: t.id, attempt: t.attempts } },
        data: {
          status: "SUCCEEDED",
          usage: json(response.usage),
          requestId: response.requestId,
          estimatedCostUsd: cost === null ? null : cost,
          completedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: t.createdById,
          action: "GENERATION_DRAFT_SAVED",
          resourceType: "articles",
          resourceId: article.id,
          metadata: { taskId: t.id, templateVersion: t.templateVersion },
        },
      });
      return true;
    },
    { timeout: 15000 },
  );
}
export async function executeTask(
  client: PrismaClient,
  t: GeoGenerationTask,
  options?: { provider: AiProvider; settings: AiSettings },
) {
  // Dependency injection is permitted only in the isolated test database, never via HTTP or env mode.
  if (options && (process.env.NODE_ENV !== "test" || !isolatedTestDatabase()))
    throw new Error("TEST_PROVIDER_FORBIDDEN");
  const config = aiConfiguration();
  const settings = options?.settings || config.settings;
  const provider = options?.provider || new HttpAiProvider();
  const controller = new AbortController();
  let completedResponse: ProviderResult | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined,
    poll: ReturnType<typeof setInterval> | undefined;
  try {
    if (!options && !config.available)
      throw new AiError(
        "AI_NOT_CONFIGURED",
        "模型配置未完成，没有调用模型服务。",
      );
    if (settings.model !== t.modelName || settings.provider !== t.providerName)
      throw new AiError("MODEL_CHANGED", "模型配置已变化，请重新创建任务。");
    await client.$transaction((tx) => allowed(tx, t));
    const input = t.inputSnapshot as unknown as GenerationInput;
    if (
      input.providerConfiguration &&
      input.providerConfiguration !== aiSettingsSignature(settings)
    )
      throw new AiError(
        "MODEL_CHANGED",
        "网关或请求配置已变化，请重新创建任务，未调用模型。",
      );
    await assertEvidence(client, input.knowledge);
    const aborted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new AiError(
            "TIMEOUT",
            "生成超时，结果及计费状态未确认，请核对网关记录。",
            !isChatProvider(settings.provider),
          ),
        );
      }, t.timeoutMs);
      let checking = false;
      poll = setInterval(async () => {
        if (checking) return;
        checking = true;
        try {
          const state = await client.geoGenerationTask.findUnique({
            where: { id: t.id },
            select: { status: true, leaseToken: true },
          });
          if (
            !state ||
            state.status !== "RUNNING" ||
            state.leaseToken !== t.leaseToken
          ) {
            controller.abort();
            reject(new AiError("CANCELLED", "任务已取消或执行租约已失效。"));
          }
        } catch {
          controller.abort();
          reject(new AiError("DATABASE_UNAVAILABLE", "数据库暂不可用。", true));
        } finally {
          checking = false;
        }
      }, 500);
    });
    const response = await Promise.race([
      provider.generate(
        input,
        {
          ...settings,
          timeoutMs: t.timeoutMs,
          maxOutputTokens: t.maxOutputTokens,
          idempotencyKey:
            "hsy-geo-" +
            t.id +
            "-" +
            createHash("sha256")
              .update(JSON.stringify(t.inputSnapshot))
              .digest("hex")
              .slice(0, 16),
        },
        controller.signal,
      ),
      aborted,
    ]);
    completedResponse = response;
    const saved = await finish(client, t, response, settings);
    if (!saved)
      await client.generationCallLog.updateMany({
        where: { taskId: t.id, attempt: t.attempts, status: "RUNNING" },
        data: {
          status: "CANCELLED",
          errorCode: "LEASE_INVALID",
          usage: json(response.usage),
          estimatedCostUsd: estimatedCost(response.usage, settings),
          completedAt: new Date(),
        },
      });
  } catch (e) {
    const safe =
      e instanceof AiError
        ? e
        : new AiError(
            "VALIDATION_FAILED",
            "生成结果未通过知识或存储校验，未保存文章。",
          );
    if (!safe.usage && completedResponse) safe.usage = completedResponse.usage;
    const retry = shouldRetryGeneration(
      t.providerName,
      safe,
      t.attempts,
      t.maxAttempts,
    );
    await client.$transaction(async (tx) => {
      const changed = await tx.geoGenerationTask.updateMany({
        where: { id: t.id, status: "RUNNING", leaseToken: t.leaseToken },
        data: {
          status: retry ? "QUEUED" : "FAILED",
          ...(retry ? {} : { activeKey: null, completedAt: new Date() }),
          leaseToken: null,
          leaseUntil: null,
          availableAt: new Date(
            Date.now() + Math.min(60000, 2000 * 2 ** t.attempts),
          ),
          errorCode: safe.code,
          errorMessage: safe.message,
          ...(safe.usage ? { tokenUsage: json(safe.usage) } : {}),
        },
      });
      await tx.generationCallLog.updateMany({
        where: { taskId: t.id, attempt: t.attempts, status: "RUNNING" },
        data: {
          status: changed.count ? (retry ? "RETRYING" : "FAILED") : "CANCELLED",
          errorCode: safe.code,
          ...(safe.usage
            ? {
                usage: json(safe.usage),
                estimatedCostUsd: estimatedCost(safe.usage, settings),
              }
            : {}),
          completedAt: new Date(),
        },
      });
    });
  } finally {
    clearTimeout(timer);
    clearInterval(poll);
    controller.abort();
  }
}
