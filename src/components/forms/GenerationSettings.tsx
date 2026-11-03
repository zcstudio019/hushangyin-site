"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
type Template = {
  id: string;
  name: string;
  description: string;
  templateContent: string;
  version: number;
  isActive: boolean;
};
type Reference = {
  id: string;
  title: string;
  sourceUrl: string;
  excerpt: string;
  validUntil: string | null;
  isActive: boolean;
};
export function GenerationSettings({
  templates,
  references,
}: {
  templates: Template[];
  references: Reference[];
}) {
  const router = useRouter(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save(
    e: React.FormEvent<HTMLFormElement>,
    kind: string,
    id?: string,
  ) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const data =
      kind === "template"
        ? {
            name: f.get("name"),
            description: f.get("description"),
            templateContent: f.get("templateContent"),
            version: Number(f.get("version") || 1),
            isActive: f.get("isActive") === "on",
          }
        : {
            title: f.get("title"),
            sourceUrl: f.get("sourceUrl"),
            excerpt: f.get("excerpt"),
            validUntil: f.get("validUntil") || null,
            verified: f.get("verified") === "on",
            isActive: f.get("isActive") === "on",
          };
    try {
      const r = await fetch("/api/admin/geo/generation/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, data }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw Error(j.error?.message || "保存失败。");
      setMessage("已保存并记录审计。");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "连接失败。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <p role="status">{message}</p>
      <h2>写作模板</h2>
      {[
        ...templates,
        {
          id: "",
          name: "",
          description: "",
          templateContent: "",
          version: 1,
          isActive: true,
        },
      ].map((t) => (
        <form
          className="admin-panel account-form"
          key={t.id}
          onSubmit={(e) => void save(e, "template", t.id || undefined)}
        >
          <h3>{t.id ? t.name : "新增模板"}</h3>
          <fieldset disabled={busy}>
            <input type="hidden" name="version" value={t.version} />
            <label>
              名称
              <input
                name="name"
                defaultValue={t.name}
                required
                maxLength={100}
              />
            </label>
            <label>
              说明
              <input
                name="description"
                defaultValue={t.description}
                required
                maxLength={600}
              />
            </label>
            <label>
              模板内容
              <textarea
                name="templateContent"
                defaultValue={t.templateContent}
                rows={8}
                maxLength={12000}
                required
              />
            </label>
            <label className="geo-check">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={t.isActive}
              />
              启用模板
            </label>
            <button className="button gold">保存模板</button>
          </fieldset>
        </form>
      ))}
      <h2>权威参考资料</h2>
      <p>
        仅录入你已实际核验的公开来源、适用日期和摘录。系统不自动抓取网址，也不会替你确认政策、利率或银行信息。
      </p>
      {[
        ...references,
        {
          id: "",
          title: "",
          sourceUrl: "",
          excerpt: "",
          validUntil: null,
          isActive: true,
        },
      ].map((s) => (
        <form
          className="admin-panel account-form"
          key={s.id}
          onSubmit={(e) => void save(e, "reference", s.id || undefined)}
        >
          <h3>{s.id ? s.title : "新增人工核验资料"}</h3>
          <fieldset disabled={busy}>
            <label>
              标题
              <input
                name="title"
                defaultValue={s.title}
                maxLength={200}
                required
              />
            </label>
            <label>
              公开来源网址
              <input
                name="sourceUrl"
                type="url"
                defaultValue={s.sourceUrl}
                maxLength={1000}
                required
              />
            </label>
            <label>
              已核验摘录
              <textarea
                name="excerpt"
                defaultValue={s.excerpt}
                maxLength={4000}
                rows={5}
                required
              />
            </label>
            <label>
              适用截止日期（可选）
              <input
                type="date"
                name="validUntil"
                defaultValue={s.validUntil?.slice(0, 10) || ""}
              />
            </label>
            <label className="geo-check">
              <input name="verified" type="checkbox" required />
              我已实际核对来源真实性、摘录和适用时间。本次保存将记录我的核验身份与时间。
            </label>
            <label className="geo-check">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={s.isActive}
              />
              允许引用
            </label>
            <button className="button gold">保存核验资料</button>
          </fieldset>
        </form>
      ))}
    </>
  );
}
