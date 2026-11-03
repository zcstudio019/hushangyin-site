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
import {
  contextSchema,
  classifyChannel,
} from "@/features/analytics/validation";
import { liveContent, recordEvent } from "@/features/analytics/events";
import { signAnalytics, anonymousSession } from "@/features/analytics/tokens";
import { siteUrl } from "@/config/site";
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    const v = contextSchema.safeParse(await readJson(r, 5000));
    if (!v.success)
      throw new HttpError(
        400,
        "SOURCE_INVALID",
        "来源参数不合法，请从公开内容重新进入咨询。",
      );
    await limit("attribution-context:" + requesterKey(r), 60, 60);
    const target = await db().$transaction((tx) =>
      liveContent(tx, v.data.kind, v.data.id),
    );
    if (!target)
      throw new HttpError(
        404,
        "CONTENT_NOT_PUBLIC",
        "来源内容不存在或未公开。",
      );
    const ref = r.headers.get("referer");
    let samePage = false;
    try {
      const u = new URL(ref || "");
      samePage =
        u.origin === new URL(siteUrl()).origin && u.pathname === target.path;
    } catch {}
    if (!samePage)
      throw new HttpError(
        400,
        "SOURCE_PAGE_REQUIRED",
        "请从对应的公开文章或问答点击咨询。",
      );
    const session = analyticsEnabled()
      ? anonymousSession(v.data.analyticsToken)
      : null;
    if (
      session &&
      v.data.eventId &&
      !/bot\b|crawler|spider/i.test(r.headers.get("user-agent") || "")
    )
      await db().$transaction((tx) =>
        recordEvent(tx, {
          ...v.data,
          type: "CLICK",
          analyticsToken: v.data.analyticsToken!,
          eventId: v.data.eventId!,
        }),
      );
    const token = signAnalytics({
      type: "CONTENT",
      kind: target.kind,
      id: target.id,
      path: target.path,
      channel: classifyChannel(v.data.utm, v.data.referrerHost),
      utm: v.data.utm || {},
      ...(session
        ? {
            measurementKey: session.key,
            measurementExpiresAt: session.expiresAt,
          }
        : {}),
      exp: Date.now() + 30 * 60000,
    });
    return success({
      href: `/contact/?${target.kind === "ARTICLE" ? "article" : "faq"}=${target.id}&attribution=${encodeURIComponent(token)}`,
    });
  } catch (e) {
    return failure(e);
  }
}
