export const brand = {
  name: "沪上银",
  mark: "沪",
  english: "HUSHANGYIN",
  home: "/",
};
export const navigation = [
  { name: "首页", href: "/" },
  { name: "关于沪上银", href: "/about/" },
  { name: "企业融资", href: "/enterprise/" },
  { name: "个人融资", href: "/personal/" },
  { name: "产品方案", href: "/products/" },
  { name: "资料预审", href: "/precheck/" },
  { name: "成功案例", href: "/cases/" },
  { name: "融资知识", href: "/insights/" },
  { name: "风险提示", href: "/risks/" },
  { name: "联系我们", href: "/contact/" },
];
export const consultationCta = { name: "立即咨询", href: "/contact/" };
export const footerGroups = [
  {
    name: "了解服务",
    hrefs: ["/enterprise/", "/personal/", "/products/", "/precheck/"],
  },
  {
    name: "探索更多",
    hrefs: ["/about/", "/cases/", "/insights/", "/contact/"],
  },
  { name: "风险与隐私", hrefs: ["/risks/", "/privacy/"] },
];
export const policyVersion = "2026-11-02-v2";
export function siteUrl() {
  const raw =
    process.env.SITE_URL ||
    (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:3000" : "");
  if (!raw)
    throw new Error("SITE_URL is required for production build and runtime");
  const url = new URL(raw);
  if (
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["https:", "http:"].includes(url.protocol)
  )
    throw new Error("SITE_URL must be an origin");
  if (url.hostname === "www.example.com" || url.hostname === "example.com")
    throw new Error("Placeholder SITE_URL prohibited");
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Production SITE_URL requires HTTPS");
  return url.origin;
}
