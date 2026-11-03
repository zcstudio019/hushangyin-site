import { NextResponse } from "next/server";
import { siteUrl } from "@/config/site";
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function success(data: unknown, status = 200) {
  return NextResponse.json(
    { ok: true, data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function failure(error: unknown) {
  const safe =
    error instanceof HttpError
      ? error
      : new HttpError(503, "SERVICE_UNAVAILABLE", "服务暂不可用，请稍后再试。");
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: safe.code,
        message: safe.message,
        ...(safe.details ? { details: safe.details } : {}),
      },
    },
    {
      status: safe.status,
      headers: {
        "Cache-Control": "no-store",
        ...(safe.status === 429 ? { "Retry-After": "900" } : {}),
      },
    },
  );
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== siteUrl() ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(403, "ORIGIN_REJECTED", "请求来源无效。");
}
export async function readJson(
  request: Request,
  maxBytes = 8192,
): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "请使用 JSON 提交。");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    throw new HttpError(413, "BODY_TOO_LARGE", "提交内容过大。");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "INVALID_JSON", "请求内容无效。");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "BODY_TOO_LARGE", "提交内容过大。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "INVALID_JSON", "请求内容无效。");
  }
}
