import "server-only";
import { PrismaClient } from "@prisma/client";
import { createDatabaseClient } from "./provider";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
// Never enable query logging: parameters may contain personal information.
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  if (!globalDb.prisma) globalDb.prisma = createDatabaseClient();
  return globalDb.prisma;
}
export const databaseConfigured = () => Boolean(process.env.DATABASE_URL);
