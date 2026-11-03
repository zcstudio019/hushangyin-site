import "server-only";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { privateKey } from "@/lib/security";
import { analyticsPolicy, localDay } from "./config";
type Base = { type: string; exp: number };
export function signAnalytics<T extends Base>(payload: T) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + privateKey("analytics-signed:" + body);
}
export function readAnalytics<T extends Base>(
  token: string | undefined,
  type: string,
): T | null {
  try {
    if (!token || token.length > 3000) return null;
    const [body, signature, ...rest] = token.split(".");
    if (rest.length || !/^[a-f0-9]{64}$/.test(signature)) return null;
    const expected = privateKey("analytics-signed:" + body);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
      return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return p.type === type &&
      typeof p.exp === "number" &&
      p.exp > Date.now() &&
      p.exp <= Date.now() + 31 * 60000
      ? (p as T)
      : null;
  } catch {
    return null;
  }
}
export function newAnalyticsSession() {
  const exp = Date.now() + 30 * 60000;
  return {
    token: signAnalytics({
      type: "ANON",
      id: randomUUID(),
      policy: analyticsPolicy,
      exp,
    }),
    expiresAt: exp,
  };
}
export function anonymousSession(token?: string) {
  const p = readAnalytics<{
    type: string;
    id: string;
    policy: string;
    exp: number;
  }>(token, "ANON");
  if (!p || p.policy !== analyticsPolicy || !/^[-a-z0-9]{36}$/.test(p.id))
    return null;
  return {
    key: privateKey("analytics-session:" + localDay() + ":" + p.id),
    expiresAt: p.exp,
  };
}
export type SourceContext = {
  type: "CONTENT";
  kind: "ARTICLE" | "FAQ";
  id: string;
  path: string;
  channel: string;
  utm: { utm_source?: string; utm_medium?: string; utm_campaign?: string };
  measurementKey?: string;
  measurementExpiresAt?: number;
  exp: number;
};
