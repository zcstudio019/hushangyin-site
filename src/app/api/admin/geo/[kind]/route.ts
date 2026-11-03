import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { kindOf, contentList, saveContent } from "@/features/geo/service";
type Context = { params: Promise<{ kind: string }> };
export async function GET(r: Request, { params }: Context) {
  try {
    await requirePermission("content.read");
    return success(
      await contentList(
        kindOf((await params).kind),
        Object.fromEntries(new URL(r.url).searchParams),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request, { params }: Context) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("content.create");
    return success(
      await saveContent(
        actor,
        kindOf((await params).kind),
        await readJson(r, 384000),
      ),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
