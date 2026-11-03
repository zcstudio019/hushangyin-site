import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { kindOf, contentItem, saveContent } from "@/features/geo/service";
type Context = { params: Promise<{ kind: string; id: string }> };
export async function GET(_r: Request, { params }: Context) {
  try {
    await requirePermission("content.read");
    const p = await params;
    return success(await contentItem(kindOf(p.kind), p.id));
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(r: Request, { params }: Context) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("content.update"),
      p = await params;
    return success(
      await saveContent(actor, kindOf(p.kind), await readJson(r, 384000), p.id),
    );
  } catch (e) {
    return failure(e);
  }
}
