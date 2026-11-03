import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import {
  visibilityData,
  saveVisibility,
} from "@/features/analytics/visibility";
export async function GET() {
  try {
    return success(
      await visibilityData(await requirePermission("analytics.read")),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    return success(
      await saveVisibility(
        await requirePermission("visibility.write"),
        await readJson(r, 8000),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
