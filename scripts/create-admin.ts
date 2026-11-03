import {createDatabaseClient} from "../src/lib/db/provider";

import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { passwordSchema } from "@/lib/validations/account";
const schema = z.object({
  ADMIN_EMAIL: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  ADMIN_NAME: z.string().trim().min(1).max(80),
  ADMIN_PASSWORD: passwordSchema.refine((value) => value.length >= 16),
});
const prisma = createDatabaseClient();
async function main() {
  const input = schema.safeParse(process.env);
  if (!input.success || !process.env.DATABASE_URL)
    throw new Error("CONFIG_REQUIRED");
  const {
    ADMIN_EMAIL: email,
    ADMIN_NAME: name,
    ADMIN_PASSWORD: password,
  } = input.data;
  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await prisma.$transaction(async (tx) => {
    const existing = await tx.adminUser.findUnique({ where: { email } });
    if (existing) return;
    const user = await tx.adminUser.create({
      data: { email, name, passwordHash, role: "SUPER_ADMIN" },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "ADMIN_BOOTSTRAP",
        resourceType: "admin_user",
        resourceId: user.id,
      },
    });
  });
  console.log(
    "Administrator initialization finished; an existing account was not modified.",
  );
}
main()
  .catch(() => {
    console.error(
      "Administrator initialization failed. Check environment and database; no credential details logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
