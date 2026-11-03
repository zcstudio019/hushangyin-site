export const analyticsPolicy = "2026-11-02-analytics-v1";
export const channels: Record<string, string> = {
  DIRECT: "直接访问",
  SEARCH: "搜索来源线索",
  AI: "AI平台来源线索",
  SOCIAL: "社交来源线索",
  REFERRAL: "其他站外来源",
  CAMPAIGN: "营销标记",
  UNKNOWN: "来源未知",
};
export const confidences: Record<string, string> = {
  SIGNED_CONTEXT: "服务端签发的同源内容上下文（非身份或外部渠道证明）",
  VALIDATED_LEGACY: "客户端声明，服务端仅校验公开内容",
  DIRECT_OR_UNKNOWN: "直接访问或来源未知",
  INVALID_CONTEXT: "来源凭证无效，未计为GEO",
};
export const platforms = {
  GOOGLE: "Google Search Console",
  BING: "Bing站长工具",
  BAIDU: "百度搜索资源平台",
} as const;
export const sourceKinds: Record<string, string> = {
  ARTICLE: "知识文章",
  FAQ: "融资问答",
  DIRECT: "直接访问",
  UNKNOWN: "来源未知",
};
export const localDay = (now = new Date()) =>
  new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const dayDate = (date: string) => new Date(date + "T00:00:00.000Z");
export function analyticsEnabled() {
  return (
    process.env.ANALYTICS_ENABLED === "true" &&
    ((process.env.LOCAL_TEST_MODE === "true" &&
      /^http:\/\/(127\.0\.0\.1|localhost):[0-9]{4,5}\/?$/.test(
        process.env.SITE_URL || "",
      )) ||
      (process.env.ANALYTICS_PRODUCTION_APPROVED === "true" &&
        !!process.env.SITE_URL?.startsWith("https://")))
  );
}
