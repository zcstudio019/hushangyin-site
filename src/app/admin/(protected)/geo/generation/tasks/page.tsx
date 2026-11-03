import Link from "next/link";
import { pageActor } from "@/lib/auth/page";
import { db } from "@/lib/db";
import { taskScope } from "@/features/generation/service";
import { generationStatuses } from "@/features/generation/config";
export const metadata = { title: "内容生成任务" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await pageActor("generation.create");
  const page = Math.max(
    1,
    Math.min(1000, Number.parseInt((await searchParams).page || "1") || 1),
  );
  const where = taskScope(actor);
  const [items, total] = await db().$transaction([
    db().geoGenerationTask.findMany({
      where,
      include: {
        question: { select: { question: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 25,
      take: 25,
    }),
    db().geoGenerationTask.count({ where }),
  ]);
  return (
    <>
      <h1>内容生成任务</h1>
      <Link href="/admin/geo/generation/">← 返回创作工作台</Link>
      <p>共{total}条；仅显示授权范围内的任务。失败任务最多执行三次。</p>
      <div className="admin-panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>来源问题</th>
              <th>创建人</th>
              <th>创建时间</th>
              <th>状态</th>
              <th>执行次数</th>
              <th>失败原因</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td>{t.question.question}</td>
                <td>{t.createdBy.name}</td>
                <td>
                  {t.createdAt.toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </td>
                <td>{generationStatuses[t.status]}</td>
                <td>{t.attempts}</td>
                <td>{t.errorMessage || "—"}</td>
                <td>
                  <Link href={"/admin/geo/generation/?task=" + t.id}>
                    查看任务
                  </Link>
                  {t.outputArticleId && (
                    <>
                      {" "}
                      ·{" "}
                      <Link
                        href={"/admin/geo/articles/" + t.outputArticleId + "/"}
                      >
                        打开草稿
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="admin-nav">
        {page > 1 && <Link href={"?page=" + (page - 1)}>上一页</Link>}
        {page * 25 < total && <Link href={"?page=" + (page + 1)}>下一页</Link>}
      </nav>
    </>
  );
}
