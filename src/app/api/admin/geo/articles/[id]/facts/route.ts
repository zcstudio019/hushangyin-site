import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import {
  articleFacts,
  actOnArticleFacts,
} from "@/features/generation/fact-actions";
export async function GET(
  _r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return success(
      await articleFacts(
        await requirePermission("content.read"),
        (await params).id,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(r);
    return success(
      await actOnArticleFacts(
        await requirePermission("content.read"),
        (await params).id,
        await readJson(r, 32000),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
