import { consultationSchema } from "@/lib/validations/consultation";
import {
  assertOrigin,
  readJson,
  success,
  failure,
  HttpError,
} from "@/lib/http";
import { consultationAvailable } from "@/lib/consultation-availability";
import { requesterKey, limit } from "@/lib/security";
import { createConsultation } from "@/features/leads/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const parsed = consultationSchema.safeParse(await readJson(request));
    if (!parsed.success)
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "请检查必填项、手机号及隐私授权。",
      );
    if (!consultationAvailable())
      throw new HttpError(
        503,
        "CONSULTATIONS_DISABLED",
        "安全接收服务尚未开通，当前不可提交。",
      );
    await limit("consult:" + requesterKey(request), 10);
    const result = await createConsultation(parsed.data);
    return success(result, 201);
  } catch (error) {
    return failure(error);
  }
}
