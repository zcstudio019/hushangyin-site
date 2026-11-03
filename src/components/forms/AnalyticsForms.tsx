"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { platforms } from "@/features/analytics/config";
async function request(path: string, data: unknown) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw Error(j.error?.message || "操作失败，请稍后重试。");
  return j.data;
}
type Connection = {
  id: string;
  platform: string;
  siteUrl: string;
  label: string;
  isActive: boolean;
};
export function SearchManagement({
  connections,
}: {
  connections: Connection[];
}) {
  const router = useRouter(),
    [editing, setEditing] = useState<Connection | null>(null),
    [selected, setSelected] = useState(connections[0]?.id || ""),
    [csv, setCsv] = useState(""),
    [preview, setPreview] = useState<{
      total: number;
      duplicates: number;
      conflicts: string[];
      previewToken: string;
      rows: { day: string; clicks: number; impressions: number }[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const chosen = connections.find((c) => c.id === selected);
  async function action(work: () => Promise<unknown>, text: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await work();
      setMessage(
        typeof result === "object" && result && "message" in result
          ? String(result.message)
          : text,
      );
      router.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error && /[\u4e00-\u9fff]/.test(e.message)
          ? e.message
          : "连接失败，请刷新核对操作结果。",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="admin-panel">
        <h2>管理数据源</h2>
        <p>
          不收集平台密码或密钥；当前仅人工导入，所有平台自动API均尚未授权、未开通。
        </p>
        <nav className="admin-nav">
          {connections.map((c) => (
            <button
              type="button"
              className="button outline"
              key={c.id}
              disabled={busy}
              onClick={() => setEditing(c)}
            >
              编辑：{c.label}
            </button>
          ))}
        </nav>
        <form
          key={editing?.id || "new"}
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(
              () =>
                request("/api/admin/geo/analytics/", {
                  action: "connection",
                  ...(editing ? { id: editing.id } : {}),
                  data: {
                    platform: f.get("platform"),
                    label: f.get("label"),
                    siteUrl: f.get("siteUrl"),
                    isActive: f.get("isActive") === "on",
                  },
                }),
              "数据源配置已保存；不代表API连接成功。",
            );
          }}
        >
          <fieldset disabled={busy}>
            <label>
              平台
              <select
                name="platform"
                defaultValue={editing?.platform || "GOOGLE"}
              >
                {Object.entries(platforms).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              数据源名称
              <input
                name="label"
                maxLength={100}
                required
                defaultValue={editing?.label}
              />
            </label>
            <label>
              站点属性
              <input
                name="siteUrl"
                required
                maxLength={300}
                placeholder="https://example.com/ 或 sc-domain:example.com"
                defaultValue={editing?.siteUrl}
              />
            </label>
            <label>
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={editing?.isActive ?? true}
              />
              启用人工数据源
            </label>
            <button className="button gold">
              {editing ? "保存配置" : "新增数据源"}
            </button>
            {editing && (
              <button
                type="button"
                className="button outline"
                onClick={() => setEditing(null)}
              >
                取消编辑
              </button>
            )}
          </fieldset>
        </form>
      </section>
      <section className="admin-panel">
        <h2>手动CSV导入</h2>
        <p>
          目前适配Google按日期、单一站点整体网页搜索表现CSV；保留导出日期，不与上海访问日期直接相加。百度/Bing需真实官方导出样例后适配，不能用访问量填充曝光。
        </p>
        <label>
          选择数据源
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">请选择</option>
            {connections
              .filter((c) => c.isActive)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </select>
        </label>
        {chosen?.platform === "GOOGLE" ? (
          <>
            <label>
              选择CSV文件（UTF-8，1MB、最多1000日）
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 1024 * 1024) {
                    setMessage("文件超过1MB。");
                    return;
                  }
                  setCsv(await file.text());
                  setPreview(null);
                }}
              />
            </label>
            <label>
              或粘贴日期CSV
              <textarea
                value={csv}
                rows={7}
                maxLength={1050000}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <p>
              导入格式说明：日期、点击次数、展示次数、点击率、平均排名；不支持对比、查询词或页面明细。
            </p>
            <button
              type="button"
              className="button outline"
              onClick={() => {
                const u = URL.createObjectURL(
                  new Blob(["\uFEFFDate,Clicks,Impressions,CTR,Position\n"], {
                    type: "text/csv;charset=utf-8",
                  }),
                );
                const a = document.createElement("a");
                a.href = u;
                a.download = "Google_日期导出模板.csv";
                a.click();
                URL.revokeObjectURL(u);
              }}
            >
              下载日期CSV模板
            </button>
            <button
              type="button"
              className="button outline"
              disabled={busy || !csv}
              onClick={() =>
                void action(async () => {
                  const p = await request("/api/admin/geo/analytics/", {
                    action: "import",
                    data: { connectionId: selected, csv },
                  });
                  setPreview(p);
                  return {};
                }, "预览完成，尚未写入数据。")
              }
            >
              解析与预览
            </button>
            {preview && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(async () => {
                    const result = await request("/api/admin/geo/analytics/", {
                      action: "import",
                      data: {
                        connectionId: selected,
                        csv,
                        confirm: true,
                        previewToken: preview.previewToken,
                        replaceConflicts: f.get("replace") === "on",
                      },
                    });
                    setPreview(null);
                    return {
                      message: `导入完成：新增${result.added}，跳过${result.skipped}，替换${result.replaced}。`,
                    };
                  }, "导入完成。");
                }}
              >
                <p>
                  有效{preview.total}日；相同记录{preview.duplicates}
                  ；不同数据冲突{preview.conflicts.length}。仅展示前20行。
                </p>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>点击</th>
                      <th>展示</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 20).map((r) => (
                      <tr key={r.day}>
                        <td>{r.day}</td>
                        <td>{r.clicks}</td>
                        <td>{r.impressions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <label>
                  <input type="checkbox" required />
                  我已核对文件来自本人授权的所选站点、按日期导出，数据真实且不是其他分组。
                </label>
                {preview.conflicts.length > 0 && (
                  <label>
                    <input type="checkbox" name="replace" />
                    已核对日期冲突，明确替换这些日期的旧值（不相加）
                  </label>
                )}
                <button className="button gold" disabled={busy}>
                  确认原子导入
                </button>
              </form>
            )}
          </>
        ) : (
          <p>
            {chosen
              ? "此平台导出格式尚未核验，暂不能导入。"
              : "请先配置并选择数据源。"}
          </p>
        )}
        {selected && (
          <button
            type="button"
            className="button outline"
            disabled={busy}
            onClick={() =>
              void action(
                () =>
                  request("/api/admin/geo/analytics/", {
                    action: "sync",
                    id: selected,
                    data: {},
                  }),
                "已检查同步条件。",
              )
            }
          >
            检查自动同步条件
          </button>
        )}
      </section>
      <p role="status">{busy ? "正在处理…" : message}</p>
    </>
  );
}
export function VisibilityForm({
  articles,
}: {
  articles: { id: string; title: string }[];
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    router = useRouter();
  return (
    <form
      className="admin-panel account-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget,
          f = new FormData(form);
        setBusy(true);
        setMessage("");
        try {
          await request("/api/admin/geo/visibility/", {
            platform: f.get("platform"),
            query: f.get("query"),
            observedOn: f.get("observedOn"),
            brandMention: f.get("brandMention") === "on",
            siteCitation: f.get("siteCitation") === "on",
            recommendation: f.get("recommendation") === "on",
            articleId: f.get("articleId") || null,
            evidenceUrl: f.get("evidenceUrl"),
            evidenceNote: f.get("evidenceNote"),
            verified: f.get("verified") === "on",
          });
          setMessage("人工抽样观察已保存，不代表全平台表现。");
          form.reset();
          router.refresh();
        } catch (e) {
          setMessage(
            e instanceof Error && /[\u4e00-\u9fff]/.test(e.message)
              ? e.message
              : "保存连接失败，请刷新核对记录。",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <h2>新增人工核验观察</h2>
        <label>
          平台名称
          <input name="platform" required maxLength={60} />
        </label>
        <label>
          实际查询问题
          <input name="query" required maxLength={300} />
        </label>
        <label>
          测试日期
          <input name="observedOn" type="date" required />
        </label>
        <label>
          <input name="brandMention" type="checkbox" />
          明确出现沪上银品牌
        </label>
        <label>
          <input name="siteCitation" type="checkbox" />
          明确引用官网网址
        </label>
        <label>
          <input name="recommendation" type="checkbox" />
          明确推荐（单独核验，不能由提及推断）
        </label>
        <label>
          被引用文章
          <select name="articleId">
            <option value="">未引用特定文章</option>
            {articles.map((a) => (
              <option value={a.id} key={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          公开可核验结果证据链接
          <input
            name="evidenceUrl"
            type="url"
            required
            maxLength={1000}
            placeholder="不含登录凭据、查询参数的HTTPS分享链接"
          />
        </label>
        <label>
          核验说明与适用范围
          <textarea
            name="evidenceNote"
            minLength={10}
            maxLength={1500}
            required
          />
        </label>
        <label>
          <input type="checkbox" name="verified" required />
          我已实际核对该样本，证据支持选项，不包含客户资料；不代表所有用户看到的结果。
        </label>
        <button className="button gold">保存人工观察</button>
      </fieldset>
      <p role="status">{busy ? "正在保存…" : message}</p>
    </form>
  );
}
