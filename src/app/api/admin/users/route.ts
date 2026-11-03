import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { saveUser } from "@/features/accounts/service";
import { userQuery } from "@/features/accounts/queries";
export async function GET(r: Request) {
  try {
    await requirePermission("users.read");
    const u = new URL(r.url);
    return success(await userQuery(Object.fromEntries(u.searchParams)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    const a = await requirePermission("users.create");
    return success(await saveUser(a, await readJson(r, 4096)), 201);
  } catch (e) {
    return failure(e);
  }
}
// All responses use an explicit field allowlist; password hashes never leave the server.
