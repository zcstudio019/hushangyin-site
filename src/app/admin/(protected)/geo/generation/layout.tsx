import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
import { can } from "@/lib/auth/permissions";

export default async function GenerationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await pageActor("generation.create");
  return (
    <>
      <nav className="admin-nav" aria-label="AI 内容创作导航">
        <Link href="/admin/geo/generation/">AI 创作工作台</Link>
        <Link href="/admin/geo/generation/tasks/">生成任务</Link>
        {can(actor, "generation.manage") && (
          <>
            <Link href="/admin/geo/generation/#model-connection">
              模型配置与连接测试
            </Link>
            <Link href="/admin/geo/generation/templates/">
              写作模板与参考资料
            </Link>
          </>
        )}
      </nav>
      {children}
    </>
  );
}
