import "server-only";
import { db } from "@/lib/db";
import { publicUserSelect } from "./service";
import { roleSchema } from "@/lib/validations/account";
export async function userQuery(query: Record<string, string | undefined>) {
  const role = roleSchema.safeParse(query.role);
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(query.page || "1", 10) || 1),
  );
  const where = {
    ...(query.q
      ? {
          OR: [
            {
              name: {
                contains: query.q.slice(0, 80),
                mode: "insensitive" as const,
              },
            },
            {
              email: {
                contains: query.q.slice(0, 80),
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
    ...(role.success ? { role: role.data } : {}),
    ...(["true", "false"].includes(query.active || "")
      ? { isActive: query.active === "true" }
      : {}),
  };
  const [items, total] = await db().$transaction([
    db().adminUser.findMany({
      where,
      select: publicUserSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 25,
      take: 25,
    }),
    db().adminUser.count({ where }),
  ]);
  return { items, total, page };
}
