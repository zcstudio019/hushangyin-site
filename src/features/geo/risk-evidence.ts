import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { sourceSchema } from "./validation";
import {
  classifyFaq,
  riskClaims,
  riskIsBelow,
  riskSchema,
  type RiskInput,
} from "./risk";
import { HttpError } from "@/lib/http";

const fingerprint = (v: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(v, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, value[key]]),
            )
          : value,
      ),
    )
    .digest("hex");
const comparableEvidence = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => {
        if (item?.type !== "PUBLIC") return item;
        // Public snapshots contain the complete source; ignore the old opaque hash format.
        const comparable = { ...item };
        delete comparable.fingerprint;
        return comparable;
      })
    : value;
export async function checkFaqRisk(
  tx: Prisma.TransactionClient,
  faq: { question: string; answer: string; sources: unknown },
  input: RiskInput,
) {
  const parsed = riskSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "RISK_INVALID",
      "请确认风险等级、综合核验、至少10字判断依据及逐项证据。",
    );
  const v = parsed.data,
    suggested = classifyFaq(faq.question, faq.answer);
  if (suggested.blockers.length)
    throw new HttpError(400, "CONTENT_RISK", suggested.blockers.join("；"));
  if (riskIsBelow(v.level, suggested.level))
    throw new HttpError(
      400,
      "RISK_DOWNGRADE",
      "当前内容包含更高风险主张，不能选择较低等级绕过证据核验。请核对风险提示。",
    );
  const claims = riskClaims(faq.question, faq.answer, v.level);
  if (v.evidence.some((e) => !claims.includes(e.claim)))
    throw new HttpError(
      400,
      "EVIDENCE_MAPPING",
      "证据对应内容已变化，请刷新并按当前版本逐项核验。",
    );
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const snapshots: object[] = [];
  const sourceList = Array.isArray(faq.sources) ? faq.sources : [];
  for (const claim of claims) {
    const bindings = v.evidence.filter((e) => e.claim === claim);
    if (!bindings.length)
      throw new HttpError(
        400,
        "EVIDENCE_REQUIRED",
        "当前内容包含未经核验的具体利率、银行产品条件或其他主张，请逐项补充对应依据：" +
          claim.slice(0, 100),
      );
    for (const e of bindings) {
      if (e.sourceIndex !== undefined) {
        const source = sourceSchema.safeParse(sourceList[e.sourceIndex]);
        if (
          !source.success ||
          source.data.checkedAt > today ||
          (source.data.validUntil && source.data.validUntil < today)
        )
          throw new HttpError(
            400,
            "EVIDENCE_INVALID",
            "所选公开来源缺少有效标题、网址、核验日期，或已超过适用时间。",
          );
        snapshots.push({
          claim,
          type: "PUBLIC",
          source: source.data,
          fingerprint: fingerprint(source.data),
        });
      } else {
        const source = await tx.articleSource.findFirst({
          where: {
            id: e.catalogId,
            articleId: null,
            sourceType: "INTERNAL_BANK",
            isActive: true,
          },
          include: { verifiedBy: { select: { isActive: true } } },
        });
        if (
          !source ||
          !source.verifiedAt ||
          !source.verifiedBy?.isActive ||
          source.verifiedAt.toISOString().slice(0, 10) > today ||
          (source.validUntil &&
            source.validUntil.toISOString().slice(0, 10) < today)
        )
          throw new HttpError(
            400,
            "EVIDENCE_INVALID",
            "内部资料未登记、已停用、核验人员失效或不在适用时间内，请联系资料管理员。",
          );
        if (source.updatedAt.toISOString() !== e.catalogVersion)
          throw new HttpError(
            409,
            "EVIDENCE_CHANGED",
            "内部资料在页面打开后已更新，请刷新阅读最新条款后重新核验。",
          );
        snapshots.push({
          claim,
          type: "INTERNAL_BANK",
          catalogId: source.id,
          title: source.title,
          reference: source.sourceUrl,
          excerpt: source.excerpt,
          verifiedAt: source.verifiedAt.toISOString(),
          validUntil: source.validUntil?.toISOString() || null,
          verifiedById: source.verifiedById,
          fingerprint: fingerprint([
            source.title,
            source.sourceUrl,
            source.excerpt,
            source.verifiedAt,
            source.validUntil,
            source.updatedAt,
          ]),
        });
      }
    }
  }
  return {
    policyVersion: "risk-v1",
    confirmedLevel: v.level,
    suggested,
    basis: v.basis,
    confirmed: true,
    input: v,
    evidence: snapshots,
  };
}

export async function recheckFaqRisk(
  tx: Prisma.TransactionClient,
  faq: { question: string; answer: string; sources: unknown },
  checklist: unknown,
) {
  const stored = (
    checklist as { riskAssessment?: { input?: RiskInput; evidence?: unknown } }
  )?.riskAssessment;
  if (!stored?.input) return false; // Pre-existing detailed-review contract is checked by its original path.
  const checked = await checkFaqRisk(tx, faq, stored.input);
  if (
    fingerprint(comparableEvidence(checked.evidence)) !==
    fingerprint(comparableEvidence(stored.evidence))
  )
    throw new HttpError(
      409,
      "EVIDENCE_CHANGED",
      "审核后证据已更新或失效，请重新进行独立审核，不能发布旧的核验结论。",
    );
  return true;
}

export const internalEvidenceSchema = z
  .object({
    id: z.string().max(64).optional(),
    title: z.string().trim().min(2).max(200),
    reference: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .regex(
        /^[\p{L}\p{N}_\-./:（）() ]+$/u,
        "请填写内部资料编号和版本，不填写客户资料或访问凭据。",
      ),
    excerpt: z.string().trim().min(10).max(4000),
    checkedAt: z.iso.date(),
    validUntil: z.iso.date().optional(),
    isActive: z.boolean(),
    reauthPassword: z.string().min(1).max(128),
  })
  .strict();
