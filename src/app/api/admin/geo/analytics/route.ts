import { requirePermission } from "@/lib/auth/authorization";
import {
  assertOrigin,
  readJson,
  success,
  failure,
  HttpError,
} from "@/lib/http";
import { analyticsReport } from "@/features/analytics/report";
import {
  searchData,
  saveConnection,
  importSearch,
  requestSearchSync,
} from "@/features/analytics/search";
import { z } from "zod";
import { parseGeo } from "@/features/geo/errors";
export async function GET(r: Request) {
  try {
    const a = await requirePermission("analytics.read"),
      q = new URL(r.url).searchParams;
    return success(
      q.get("view") === "search"
        ? await searchData(a)
        : await analyticsReport(a, Object.fromEntries(q.entries())),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    const a = await requirePermission("analytics.manage"),
      v = parseGeo(
        z
          .object({
            action: z.enum(["connection", "import", "sync"]),
            id: z.string().max(64).optional(),
            data: z.unknown(),
          })
          .strict(),
        await readJson(r, 1150000),
      );
    if (v.action === "connection")
      return success(await saveConnection(a, v.data, v.id));
    if (v.action === "import") return success(await importSearch(a, v.data));
    if (v.action === "sync" && v.id)
      return success(await requestSearchSync(a, v.id));
    throw new HttpError(400, "ID_REQUIRED", "请选择数据源。");
  } catch (e) {
    return failure(e);
  }
}
