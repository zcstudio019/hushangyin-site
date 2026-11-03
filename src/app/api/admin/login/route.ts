import {
  assertOrigin,
  readJson,
  success,
  failure,
  HttpError,
} from "@/lib/http";
import { loginSchema } from "@/lib/validations/consultation";
import { login } from "@/lib/auth/login";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const parsed = loginSchema.safeParse(await readJson(request, 2048));
    if (!parsed.success)
      throw new HttpError(400, "VALIDATION_ERROR", "请检查登录信息。");
    return success(
      await login(request, parsed.data.email, parsed.data.password),
    );
  } catch (error) {
    return failure(error);
  }
}
