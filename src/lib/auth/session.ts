import "server-only";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { db } from "@/lib/db";
import { siteUrl } from "@/config/site";
import { hashToken } from "@/lib/security";
import { HttpError } from "@/lib/http";
export async function sessionCookie() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32)
    throw new HttpError(503, "AUTH_UNAVAILABLE", "管理员登录尚未配置。");
  const secure = new URL(siteUrl()).protocol === "https:";
  return getIronSession<{ token?: string }>(await cookies(), {
    password,
    cookieName: secure ? "__Host-hsy_session" : "hsy_session",
    ttl: 8 * 3600,
    cookieOptions: {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600 - 60,
    },
  });
}
export async function currentAdmin() {
  if (!process.env.SESSION_SECRET || !process.env.DATABASE_URL) return null;
  try {
    const cookie = await sessionCookie();
    if (!cookie.token) return null;
    const session = await db().adminSession.findUnique({
      where: { tokenHash: hashToken(cookie.token) },
      include: { admin: true },
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      !session.admin.isActive ||
      session.admin.sessionVersion !== session.sessionVersion ||
      (session.admin.mustChangePassword &&
        (!session.admin.initialCredentialExpiresAt ||
          session.admin.initialCredentialExpiresAt <= new Date()))
    )
      return null;
    const {
      id,
      name,
      email,
      role,
      departmentId,
      mustChangePassword,
      sessionVersion,
    } = session.admin;
    return {
      id,
      name,
      email,
      role,
      departmentId,
      mustChangePassword,
      sessionVersion,
      sessionId: session.id,
    };
  } catch {
    return null;
  }
}
export async function requireAdmin(allowPasswordChange = false) {
  const actor = await currentAdmin();
  if (!actor) throw new HttpError(401, "UNAUTHORIZED", "请先登录。");
  if (actor.mustChangePassword && !allowPasswordChange)
    throw new HttpError(
      403,
      "PASSWORD_CHANGE_REQUIRED",
      "请先在个人资料中修改初始密码。",
    );
  return actor;
}
export type Actor = NonNullable<Awaited<ReturnType<typeof currentAdmin>>>;
