import { pageActor } from "@/lib/auth/page";
import { db } from "@/lib/db";
import { GenerationSettings } from "@/components/forms/GenerationSettings";
export const metadata = { title: "生成模板与参考资料" };
export default async function Page() {
  await pageActor("generation.manage");
  const [templates, references] = await Promise.all([
    db().geoGenerationTemplate.findMany({ orderBy: { name: "asc" } }),
    db().articleSource.findMany({
      where: {
        articleId: null,
        catalogId: null,
        sourceType: { not: "INTERNAL_BANK" },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return (
    <>
      <h1>写作模板与参考资料</h1>
      <p>仅系统管理人员可修改。模板变更会产生新版本，已创建任务保留原快照。</p>
      <GenerationSettings
        templates={templates}
        references={references.map((s) => ({
          ...s,
          validUntil: s.validUntil?.toISOString() || null,
        }))}
      />
    </>
  );
}
