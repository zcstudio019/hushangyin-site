import { requirePermission } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { saveDepartment } from "@/features/accounts/service";
export async function GET() {
  try {
    await requirePermission("departments.manage");
    return success(
      await db().department.findMany({ orderBy: { name: "asc" } }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    const a = await requirePermission("departments.manage");
    return success(await saveDepartment(a, await readJson(r, 2048)), 201);
  } catch (e) {
    return failure(e);
  }
}
