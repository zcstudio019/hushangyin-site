import { verify, hash } from "@node-rs/argon2";
import { db } from "@/lib/db";
import {
  hashToken,
  randomToken,
  limit,
  privateKey,
  requesterKey,
} from "@/lib/security";
import { HttpError } from "@/lib/http";
import { sessionCookie } from "./session";
let dummyHash: Promise<string> | undefined;
export async function login(request: Request, email: string, password: string) {
  const cookie = await sessionCookie();
  await limit("login-ip:" + requesterKey(request), 60);
  await limit("login-user:" + privateKey(email), 5);
  const user = await db().adminUser.findUnique({ where: { email } });
  const passwordHash =
    user?.passwordHash ??
    (await (dummyHash ??= hash(randomToken(), {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    })));
  const valid = await verify(passwordHash, password).catch(() => false);
  if (
    !user ||
    !user.isActive ||
    !valid ||
    (user.mustChangePassword &&
      (!user.initialCredentialExpiresAt ||
        user.initialCredentialExpiresAt <= new Date()))
  )
    throw new HttpError(
      401,
      "INVALID_CREDENTIALS",
      "登录信息不正确或账户不可用。",
    );
  const token = randomToken(),
    expiresAt = new Date(Date.now() + 8 * 3600 * 1000);
  await db().$transaction(async (tx) => {
    const fresh = await tx.adminUser.findUniqueOrThrow({
      where: { id: user.id },
    });
    if (
      !fresh.isActive ||
      fresh.sessionVersion !== user.sessionVersion ||
      fresh.passwordHash !== user.passwordHash
    )
      throw new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "账户已变更，请重新登录。",
      );
    await tx.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    if (cookie.token)
      await tx.adminSession.deleteMany({
        where: { tokenHash: hashToken(cookie.token) },
      });
    await tx.adminSession.create({
      data: {
        adminId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        sessionVersion: user.sessionVersion,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "LOGIN",
        resourceType: "admin_user",
        resourceId: user.id,
      },
    });
  });
  cookie.token = token;
  await cookie.save();
  return {
    redirect: user.mustChangePassword
      ? "/admin/settings/profile/?change=required"
      : "/admin/dashboard/",
  };
}
