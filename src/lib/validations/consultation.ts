import { z } from "zod";
import { utmSchema } from "@/features/analytics/validation";
const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
      "请仅填写普通文字",
    );
export const customerTypes = [
  "ENTERPRISE",
  "SELF_EMPLOYED",
  "PERSONAL",
] as const;
export const financingAmounts = [
  "50万元以内",
  "50—100万元",
  "100—300万元",
  "300万元以上",
] as const;
export const consultationSchema = z
  .object({
    name: plain(40),
    phone: z.string().regex(/^1[3-9]\d{9}$/),
    customerType: z.enum(customerTypes),
    financingAmount: z.enum(financingAmounts),
    hasProperty: z.boolean().nullable().optional(),
    hasCompany: z.boolean().nullable().optional(),
    remark: z
      .string()
      .trim()
      .max(600)
      .refine(
        (value) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
      )
      .optional(),
    sourcePage: z
      .string()
      .max(200)
      .regex(/^\/(?:[a-z0-9-]+\/)*$/),
    consent: z.literal(true),
    sourceFaqId: z.string().regex(/^[a-z0-9]{20,40}$/).optional(),
    attributionToken: z.string().max(3000).regex(/^[a-zA-Z0-9_-]+\.[a-f0-9]{64}$/).optional(),
    sourceArticleId: z
      .string()
      .regex(/^[a-z0-9]{20,40}$/)
      .optional(),
    sourceParameters: utmSchema.optional(),
  })
  .strict();
export type ConsultationInput = z.infer<typeof consultationSchema>;
export const leadStatuses = [
  "NEW",
  "PENDING",
  "FOLLOWING",
  "COMPLETED",
  "INVALID",
] as const;
export const leadStatusNames: Record<(typeof leadStatuses)[number], string> = {
  NEW: "新线索",
  PENDING: "待联系",
  FOLLOWING: "跟进中",
  COMPLETED: "已完成",
  INVALID: "无效线索",
};
export const statusSchema = z.object({ status: z.enum(leadStatuses) }).strict();
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
