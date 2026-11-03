import { z } from "zod";
import { roleNames } from "@/lib/auth/permissions";
export const emailSchema = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const passwordSchema = z
  .string()
  .min(12, "新密码至少12位。")
  .max(128)
  .refine((value) => {
    const lower = value.toLowerCase();
    return (
      ![
        "password",
        "123456",
        "qwerty",
        "admin",
        "hushangyin",
        "沪上银",
        "letmein",
        "welcome",
        "abc123",
      ].some((s) => lower.includes(s)) &&
      new Set(value).size >= 6 &&
      /[a-zA-Z]/.test(value) &&
      /[^a-zA-Z]/.test(value)
    );
  }, "密码至少12位，需包含字母和非字母，避免常见弱密码和重复字符。");
export const roleSchema = z.enum(
  Object.keys(roleNames) as [
    keyof typeof roleNames,
    ...(keyof typeof roleNames)[],
  ],
);
export const userSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: emailSchema,
    role: roleSchema,
    departmentId: z.string().max(64).nullable(),
    isActive: z.boolean(),
    reauthPassword: z.string().max(128),
  })
  .strict();
export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    confirmation: z.string().max(128),
  })
  .strict()
  .refine((v) => v.newPassword === v.confirmation, "两次新密码不一致。");
