import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
export const metadata: Metadata = {
  title: "沪上银智能融资服务平台",
  description: "上海本地企业与个人融资咨询服务。",
  icons: { icon: "/assets/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
