import { databaseProvider } from "@/lib/db/provider";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { privateKey, randomToken } from "@/lib/security";
import { policyVersion } from "@/config/site";
import type { ConsultationInput } from "@/lib/validations/consultation";
import {
  resolveAttribution,
  saveAttribution,
} from "@/features/analytics/attribution";
export async function createConsultation(input: ConsultationInput) {
  const fingerprint = privateKey(
    JSON.stringify([input.phone, input.customerType, input.financingAmount]),
  );
  return db().$transaction(async (tx) => {
    const attribution = await resolveAttribution(tx, input);
    const expires = new Date(Date.now() + 5 * 60 * 1000);
    let guards: { key: string }[];
    if (databaseProvider() !== "postgresql") {
      const old = await tx.submissionGuard.findUnique({
        where: { key: fingerprint },
      });
      if (old && old.expiresAt > new Date()) guards = [];
      else {
        await tx.submissionGuard.upsert({
          where: { key: fingerprint },
          create: { key: fingerprint, expiresAt: expires },
          update: { expiresAt: expires },
        });
        guards = [{ key: fingerprint }];
      }
    } else {
      guards = await tx.$queryRaw<
        { key: string }[]
      >`INSERT INTO submission_guards (key,"expiresAt") VALUES (${fingerprint},${expires}) ON CONFLICT (key) DO UPDATE SET "expiresAt"=EXCLUDED."expiresAt" WHERE submission_guards."expiresAt"<=NOW() RETURNING key`;
    }
    if (!guards.length)
      throw new HttpError(
        409,
        "DUPLICATE_SUBMISSION",
        "近期已收到相同咨询，请勿重复提交。",
      );
    const lead = await tx.lead.create({
      data: {
        name: input.name,
        phone: input.phone,
        customerType: input.customerType,
        financingAmount: input.financingAmount,
        hasProperty: input.hasProperty,
        hasCompany: input.hasCompany,
        remark: input.remark,
        source: attribution.target?.kind.toLowerCase() || "website",
        sourcePage: attribution.target?.path || input.sourcePage,
        sourceArticleId: attribution.target?.articleId,
        sourceParameters: attribution.utm,
      },
    });
    await tx.consent.create({
      data: {
        leadId: lead.id,
        consentType: "CONSULTATION_CONTACT",
        policyVersion,
        evidenceReference: randomToken(),
      },
    });
    await saveAttribution(tx, lead.id, attribution);
    return { reference: lead.id };
  });
}
