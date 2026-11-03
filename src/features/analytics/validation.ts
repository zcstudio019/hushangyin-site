import { z } from "zod";
export const utmValue = z
  .string()
  .max(40)
  .regex(/^[a-z0-9_.-]+$/i)
  .refine(
    (v) => !/[0-9]{11}|sk-|password|api.?key|token/i.test(v),
    "来源标记不得包含个人资料或凭据。",
  );
export const utmSchema = z
  .object({
    utm_source: utmValue.optional(),
    utm_medium: utmValue.optional(),
    utm_campaign: utmValue.optional(),
  })
  .strict();
export const contentSchema = z.object({
  kind: z.enum(["ARTICLE", "FAQ"]),
  id: z.string().regex(/^[a-z0-9_-]{1,64}$/i),
});
export const contextSchema = contentSchema
  .extend({
    utm: utmSchema.optional(),
    referrerHost: z
      .string()
      .max(150)
      .regex(/^[a-z0-9.-]*$/i)
      .optional(),
    analyticsToken: z.string().max(1500).optional(),
    eventId: z.uuid().optional(),
  })
  .strict();
export const eventSchema = contextSchema
  .extend({
    type: z.enum(["PV", "CLICK"]),
    eventId: z.uuid(),
    analyticsToken: z.string().max(1500),
  })
  .strict();
export function classifyChannel(
  utm: z.infer<typeof utmSchema> = {},
  host = "",
) {
  const value = (utm.utm_source || host).toLowerCase();
  if (
    /^(?:baidu|google|bing)(?:[._-]|$)/.test(value) ||
    /(^|\.)(baidu|google|bing)\.com$/.test(value)
  )
    return "SEARCH";
  if (
    /^(?:chatgpt|perplexity|claude|doubao|kimi)(?:[._-]|$)/.test(value) ||
    /(^|\.)(chatgpt\.com|perplexity\.ai|claude\.ai)$/.test(value)
  )
    return "AI";
  if (/^(?:wechat|weixin|weibo|xiaohongshu)(?:[._-]|$)/.test(value))
    return "SOCIAL";
  return utm.utm_source ? "CAMPAIGN" : host ? "REFERRAL" : "DIRECT";
}
