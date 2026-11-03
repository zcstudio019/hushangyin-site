import { can } from "@/lib/auth/permissions";
import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
export default async function GeoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await pageActor("content.read");
  return (
    <>
      <nav className="admin-nav geo-nav" aria-label="内容运营导航">
        <Link href="/admin/geo/">内容仪表盘</Link>
        <Link href="/admin/geo/questions/">融资问题库</Link>
        <Link href="/admin/geo/articles/">文章管理</Link>
        <Link href="/admin/geo/faqs/">常见问答管理</Link>
        <Link href="/admin/geo/reviews/">内容审核</Link>
        {can(actor,"analytics.read")&&<><Link href="/admin/geo/analytics/">效果与咨询归因</Link><Link href="/admin/geo/visibility/">可见性观察</Link></>}
        {can(actor, "generation.create") && (
          <Link href="/admin/geo/generation/">AI 内容创作</Link>
        )}
      </nav>
      {!can(actor, "generation.create") && (
        <p role="status">
          当前账号没有 AI
          内容创作权限。独立审核岗位不含创作权限，请联系超级管理员核对岗位；审核权限不会自动授予创作或发布权限。
        </p>
      )}
      {children}
    </>
  );
}
