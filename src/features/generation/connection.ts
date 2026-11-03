import type { ModelStatus } from "@/components/forms/ModelConnection";
import "server-only";
import { createHash } from "node:crypto";
import {
  aiConfiguration,
  publicAiConfiguration,
  AiError,
  testModelConnection,
  estimatedCost,
} from "@/lib/ai/provider";
import { db } from "@/lib/db";
import { limit } from "@/lib/security";
import type { Actor } from "@/lib/auth/session";
import { authorize } from "@/lib/auth/authorization";

const signature = () =>
  createHash("sha256")
    .update(JSON.stringify(publicAiConfiguration()))
    .digest("hex");
export async function modelConnectionStatus(
  actor: Actor,
): Promise<ModelStatus> {
  await authorize(actor, "generation.create");
  const latest = await db().auditLog.findFirst({
    where: {
      action: "AI_CONNECTION_TEST",
      resourceType: "geo_generation",
      resourceId: signature(),
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, metadata: true },
  });
  return {
    ...publicAiConfiguration(),
    latest: latest
      ? {
          at: latest.createdAt.toISOString(),
          result: latest.metadata as unknown as NonNullable<
            ModelStatus["latest"]
          >["result"],
        }
      : null,
  };
}
export async function runConnectionTest(actor: Actor) {
  await authorize(actor, "generation.manage");
  await limit("ai-test:" + actor.id, 3);
  await limit("ai-test:global", 10);
  const config = aiConfiguration(),
    start = Date.now();
  let result: {
    connected: boolean;
    code: string;
    message: string;
    elapsedMs: number;
    usage?: unknown;
    returnedModel?: string | null;
    estimatedCostUsd?: number | null;
  };
  if (!config.connectionAvailable)
    result = {
      connected: false,
      code: !config.settings.apiKey ? "KEY_MISSING" : "CONFIG_INVALID",
      message: config.connectionMissing.join("；"),
      elapsedMs: 0,
    };
  else {
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(),
        Math.min(config.settings.timeoutMs, 30000),
      );
    try {
      const r = await testModelConnection(config.settings, controller.signal);
      result = {
        connected: true,
        code: "CONNECTED",
        message: "模型连接成功。此测试不代表完整文章生成已验收。",
        elapsedMs: Date.now() - start,
        usage: r.usage,
        returnedModel: r.returnedModel,
        estimatedCostUsd: estimatedCost(r.usage, config.settings),
      };
    } catch (e) {
      const safe =
        e instanceof AiError
          ? e
          : new AiError("PROVIDER_ERROR", "模型测试失败，未返回安全有效结果。");
      result = {
        connected: false,
        code: safe.code,
        message: safe.message,
        elapsedMs: Date.now() - start,
        ...(safe.usage ? { usage: safe.usage } : {}),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  await db().auditLog.create({
    data: {
      actorId: actor.id,
      action: "AI_CONNECTION_TEST",
      resourceType: "geo_generation",
      resourceId: signature(),
      metadata: JSON.parse(JSON.stringify(result)),
    },
  });
  return { at: new Date().toISOString(), result };
}
