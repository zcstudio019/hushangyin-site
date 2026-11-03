import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "管理后台｜沪上银", template: "%s｜沪上银后台" },
  robots: { index: false, follow: false, noarchive: true },
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admin-shell">{children}</div>;
}
