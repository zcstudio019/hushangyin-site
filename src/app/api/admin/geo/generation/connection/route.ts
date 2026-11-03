import { z } from "zod";
import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { parseGeo } from "@/features/geo/errors";
import {
  modelConnectionStatus,
  runConnectionTest,
} from "@/features/generation/connection";
export async function GET() {
  try {
    return success(
      await modelConnectionStatus(await requirePermission("generation.create")),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("generation.manage");
    parseGeo(
      z
        .object({
          confirmedCost: z.literal(true, {
            error: "请先确认连接测试可能产生实际Token费用。",
          }),
        })
        .strict(),
      await readJson(r, 1024),
    );
    return success(await runConnectionTest(actor));
  } catch (e) {
    return failure(e);
  }
}
