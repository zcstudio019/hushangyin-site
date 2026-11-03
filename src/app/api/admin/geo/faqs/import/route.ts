import { requirePermission } from "@/lib/auth/authorization";
import { assertOrigin, readJson, success, failure } from "@/lib/http";
import { importContent } from "@/features/geo/import-service";
import { IMPORT_REQUEST_MAX_BYTES } from "@/features/geo/config";
export async function POST(r: Request) {
  try {
    assertOrigin(r);
    const actor = await requirePermission("content.create");
    const input = await readJson(r, IMPORT_REQUEST_MAX_BYTES);
    return success(
      await importContent(actor, "faqs", input),
      input &&
        typeof input === "object" &&
        "mode" in input &&
        input.mode === "preview"
        ? 200
        : 201,
    );
  } catch (e) {
    return failure(e);
  }
}
