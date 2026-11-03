import { databaseProvider } from "./db/provider";
import { createHmac, createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function randomToken() {
  return randomBytes(32).toString("hex");
}
export function privateKey(value: string) {
  const key = process.env.RATE_LIMIT_SECRET;
  if (!key || key.length < 32)
    throw new HttpError(
      503,
      "SERVICE_UNAVAILABLE",
      "安全配置未完成，当前不可提交。",
    );
  return createHmac("sha256", key).update(value).digest("hex");
}
export function requesterKey(request: Request) {
  // Without a trusted proxy, use a shared bucket, never trust attacker-supplied IPs.
  const ip =
    process.env.TRUST_PROXY === "true"
      ? request.headers
          .get("x-forwarded-for")
          ?.split(",")[0]
          ?.trim()
          .slice(0, 80) || "unknown"
      : "shared";
  return privateKey(ip);
}
export async function limit(key: string, maximum: number, windowSeconds = 900) {
  const expires = new Date(Date.now() + windowSeconds * 1000);
  if (databaseProvider() !== "postgresql") {
    const count = await db().$transaction(async (tx) => {
      const old = await tx.rateLimitBucket.findUnique({ where: { key } });
      const row = old
        ? await tx.rateLimitBucket.update({
            where: { key },
            data:
              old.expiresAt <= new Date()
                ? { count: 1, expiresAt: expires }
                : { count: { increment: 1 } },
          })
        : await tx.rateLimitBucket.create({
            data: { key, count: 1, expiresAt: expires },
          });
      return row.count;
    });
    if (count > maximum)
      throw new HttpError(429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
    return;
  }
  const rows = await db().$queryRaw<{ count: number }[]>`
 INSERT INTO rate_limit_buckets (key,count,"expiresAt") VALUES (${key},1,${expires})
 ON CONFLICT (key) DO UPDATE SET count=CASE WHEN rate_limit_buckets."expiresAt"<=NOW() THEN 1 ELSE rate_limit_buckets.count+1 END,
 "expiresAt"=CASE WHEN rate_limit_buckets."expiresAt"<=NOW() THEN EXCLUDED."expiresAt" ELSE rate_limit_buckets."expiresAt" END
 RETURNING count`;
  if (rows[0].count > maximum)
    throw new HttpError(429, "RATE_LIMITED", "请求过于频繁，请稍后再试。");
}
