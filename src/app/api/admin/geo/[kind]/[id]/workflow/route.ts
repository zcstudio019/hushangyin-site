import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { kindOf, workflow } from "@/features/geo/service";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("content.read"),
      p = await params;
    return success(
      await workflow(actor, kindOf(p.kind), p.id, await readJson(r, 192000)),
    );
  } catch (e) {
    return failure(e);
  }
}
