import { db } from "@/lib/db";
import {
  assertOrigin,
  readJson,
  success,
  failure,
  HttpError,
} from "@/lib/http";
import { limit, requesterKey } from "@/lib/security";
import { analyticsEnabled } from "@/features/analytics/config";
import { eventSchema } from "@/features/analytics/validation";
import { recordEvent } from "@/features/analytics/events";
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    if (!analyticsEnabled())
      throw new HttpError(503, "ANALYTICS_DISABLED", "可选分析未开启。");
    if (
      /bot\b|crawler|spider|slurp|facebookexternalhit/i.test(
        r.headers.get("user-agent") || "",
      )
    )
      return success({ ignored: true });
    const v = eventSchema.safeParse(await readJson(r, 5000));
    if (!v.success)
      throw new HttpError(
        400,
        "INVALID_EVENT",
        "访问事件格式或来源标记不正确。",
      );
    await limit("analytics-event:" + requesterKey(r), 120, 60);
    return success(await db().$transaction((tx) => recordEvent(tx, v.data)));
  } catch (e) {
    return failure(e);
  }
}
