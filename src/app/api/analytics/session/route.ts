import { z } from "zod";
import {
  assertOrigin,
  readJson,
  success,
  failure,
  HttpError,
} from "@/lib/http";
import { limit, requesterKey } from "@/lib/security";
import { analyticsEnabled, analyticsPolicy } from "@/features/analytics/config";
import { newAnalyticsSession } from "@/features/analytics/tokens";
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    if (!analyticsEnabled())
      throw new HttpError(503, "ANALYTICS_DISABLED", "可选分析尚未启用。");
    const v = z
      .object({
        consent: z.literal(true),
        policyVersion: z.literal(analyticsPolicy),
      })
      .strict()
      .safeParse(await readJson(r, 1000));
    if (!v.success)
      throw new HttpError(
        400,
        "CONSENT_REQUIRED",
        "请明确同意本次窗口的可选匿名分析。",
      );
    await limit("analytics-session:" + requesterKey(r), 30, 60);
    return success(newAnalyticsSession());
  } catch (e) {
    return failure(e);
  }
}
