import "server-only";
import { siteUrl } from "@/config/site";
export function consultationAvailable() {
  const ready = Boolean(
    process.env.DATABASE_URL &&
    (process.env.RATE_LIMIT_SECRET?.length ?? 0) >= 32 &&
    process.env.CONSULTATIONS_ENABLED === "true",
  );
  if (process.env.LOCAL_TEST_MODE === "true")
    return (
      ready &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(siteUrl()).hostname)
    );
  return ready && process.env.PRODUCTION_CONSULTATIONS_APPROVED === "true";
}
