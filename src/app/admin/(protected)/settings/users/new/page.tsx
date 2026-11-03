import { pageActor } from "@/lib/auth/page";
import { db } from "@/lib/db";
import { UserForm } from "@/components/forms/AccountForms";
export const metadata = { title: "新增员工" };
export default async function NewUser({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  await pageActor("users.create");
  const reviewer = (await searchParams).role === "CONTENT_REVIEWER";
  return (
    <>
      <h1>新增员工</h1>
      {reviewer && (
        <p>
          新增独立内容审核员仅授予内容查看与审核权限，不含发布、客户信息或员工管理。必须验证你的当前密码，创建后使用一次性凭据并首次改密；授权会写入审计日志。
        </p>
      )}
      <UserForm
        {...(reviewer ? { initialRole: "CONTENT_REVIEWER" as const } : {})}
        departments={await db().department.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
        })}
      />
    </>
  );
}
