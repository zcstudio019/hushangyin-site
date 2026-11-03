"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { SafeMarkdown } from "@/components/content/SafeMarkdown";
import { riskNames, type RiskLevel } from "@/features/geo/risk";
type Item = {
  id: string;
  question: string;
  answer: string;
  revision: number;
  risk: { level: RiskLevel };
  policy: {
    canReview: boolean;
    reason: string;
    candidates: {
      id: string;
      name: string;
      roleName: string;
      departmentName: string;
    }[];
  };
};
export function ReviewBatch({
  canAssign,
  canReview,
}: {
  canAssign: boolean;
  canReview: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({}),
    [confirmed, setConfirmed] = useState<Record<string, boolean>>({}),
    [basis, setBasis] = useState<Record<string, string>>({}),
    [results, setResults] = useState<
      { id: string; ok: boolean; message: string }[]
    >([]);
  const [assigneeId, setAssignee] = useState("");
  const chosen = items.filter((i) => selected[i.id]);
  const candidates =
    chosen[0]?.policy.candidates.filter((u) =>
      chosen.every((i) => i.policy.candidates.some((c) => c.id === u.id)),
    ) || [];
  async function load() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/geo/reviews/batch/", {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message || "加载失败。");
      setItems(j.data);
      setLoaded(true);
      setSelected({});
      setConfirmed({});
      setBasis({});
      setAssignee("");
      setMessage(
        "已读取最新待审核版本。逐条阅读后记录判断，批量审核不会发布。",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "加载失败，请重试。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function execute(action: "assign" | "approve") {
    if (lock.current) return;
    const rows =
      action === "assign" ? chosen : items.filter((i) => confirmed[i.id]);
    if (!rows.length) {
      setMessage("请先选择待分配内容，或逐条确认已核验的基础知识。");
      return;
    }
    if (
      action === "approve" &&
      rows.some((i) => !basis[i.id]?.trim() || basis[i.id].trim().length < 10)
    ) {
      setMessage(
        "每条核验记录均须填写至少10字的专业判断依据，不能用全选代替。",
      );
      return;
    }
    if (action === "assign" && !assigneeId) {
      setMessage("请选择对本批每条内容都合格的独立审核人。");
      return;
    }
    lock.current = true;
    setBusy(true);
    setResults([]);
    try {
      const r = await fetch("/api/admin/geo/reviews/batch/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "assign" ? { assigneeId } : {}),
          items: rows.map((i) => ({
            id: i.id,
            revision: i.revision,
            ...(action === "approve"
              ? { basis: basis[i.id], confirmed: true }
              : {}),
          })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message || "操作未确认，请刷新核对。");
      setResults(j.data.results);
      setMessage(
        `完成${j.data.succeeded}条，未完成${j.data.failed}条。每条独立事务保存；请按结果核对并重新加载，审核成功仍须单独发布。`,
      );
      setConfirmed({});
      setSelected({});
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "连接失败，请重新加载核对逐条结果，勿直接重复提交。",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="admin-panel">
      <summary>批量分配与逐条核验（仅FAQ，不含批量发布）</summary>
      <p>
        先加载最多100条待审核FAQ。分配可以批选；审核没有全选确认，须逐条阅读全文、勾选并填写判断。中高风险请进入单条详情核验。
      </p>
      <button
        type="button"
        className="button outline"
        disabled={busy}
        onClick={load}
      >
        {busy ? "处理中…" : "加载 / 刷新待审核FAQ"}
      </button>
      {loaded && (
        <>
          {canAssign && (
            <section>
              <h3>批量分配</h3>
              <button
                type="button"
                className="button outline"
                disabled={busy}
                onClick={() =>
                  setSelected(
                    Object.fromEntries(items.map((i) => [i.id, true])),
                  )
                }
              >
                选择本页用于分配
              </button>
              <label>
                本批共同合格的独立审核人
                <select
                  value={assigneeId}
                  onChange={(e) => setAssignee(e.target.value)}
                  disabled={busy}
                >
                  <option value="">请先选择内容及审核人</option>
                  {candidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}（{u.roleName} · {u.departmentName}）
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button outline"
                disabled={busy}
                onClick={() => execute("assign")}
              >
                分配所选FAQ
              </button>
            </section>
          )}
          {items.map((i) => (
            <section className="admin-panel" key={i.id}>
              <h3>{i.question}</h3>
              <p>
                版本{i.revision} · {riskNames[i.risk.level]}
              </p>
              <SafeMarkdown content={i.answer} />
              <Link href={`/admin/geo/faqs/${i.id}/`}>
                打开单条审核与证据 →
              </Link>
              {canAssign && (
                <label className="geo-check">
                  <input
                    type="checkbox"
                    checked={!!selected[i.id]}
                    disabled={busy}
                    onChange={(e) =>
                      setSelected({ ...selected, [i.id]: e.target.checked })
                    }
                  />
                  仅选择此条用于分配
                </label>
              )}
              {canReview && i.risk.level === "LOW" && i.policy.canReview ? (
                <>
                  <label>
                    本条专业判断依据
                    <textarea
                      value={basis[i.id] || ""}
                      disabled={busy}
                      maxLength={1000}
                      onChange={(e) =>
                        setBasis({ ...basis, [i.id]: e.target.value })
                      }
                    />
                  </label>
                  <label className="geo-check">
                    <input
                      type="checkbox"
                      checked={!!confirmed[i.id]}
                      disabled={busy}
                      onChange={(e) =>
                        setConfirmed({ ...confirmed, [i.id]: e.target.checked })
                      }
                    />
                    我已阅读全文并逐条核对真实性、宣传合规、隐私和必要依据
                  </label>
                </>
              ) : (
                <p>
                  {i.policy.reason ||
                    "中高风险内容必须进入单条详情逐项核验，不能批量批准。"}
                </p>
              )}
            </section>
          ))}
          {canReview && (
            <button
              type="button"
              className="button gold"
              disabled={busy}
              onClick={() => execute("approve")}
            >
              提交已逐条核验的低风险FAQ
            </button>
          )}
        </>
      )}
      <p role="status">{message}</p>
      {results.map((r) => (
        <p key={r.id}>
          {items.find((i) => i.id === r.id)?.question}：
          {r.ok ? "成功" : "未完成"} · {r.message}
        </p>
      ))}
    </details>
  );
}
