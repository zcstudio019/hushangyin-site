"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Finding } from "@/features/generation/config";
import { severityNames } from "@/features/generation/config";
import { FaqRiskFields, type FaqRiskContext } from "./FaqRiskFields";
import { useContentEditingSession } from "./ContentEditingSession";
type RecordItem = {
  id: string;
  action: string;
  createdAt: string;
  actor: { name: string } | null;
  metadata: {
    note?: string;
    accepted?: boolean;
    requestId?: string;
    code?: string;
    riskAssessment?: {
      basis?: string;
      evidence?: {
        claim: string;
        title?: string;
        type: string;
        source?: { title: string; url: string; checkedAt: string };
        verifiedAt?: string;
      }[];
    };
  };
};
type State = {
  revision: number;
  findings: Finding[];
  checkedAt: string | null;
  canRequest: boolean;
  canDecide: boolean;
  status: string;
  records: RecordItem[];
  context: FaqRiskContext;
};
const names: Record<string, string> = {
  GUARANTEE: "保证性承诺",
  GUARANTEE_QUESTION: "承诺语境待核实",
  FACT_EVIDENCE: "具体事实依据",
  PROFESSIONAL_BASIS: "专业人工判断",
  NO_SOURCE: "核验依据",
  SOURCE_BINDING: "来源与段落对应",
  FAQ_CHANGED: "问答版本有效性",
  REPAYMENT_RISK: "还款风险",
  UNSAFE: "隐私与安全",
  RATE: "利率",
  AMOUNT: "额度及条件",
  POLICY: "政策",
  BANK_RELATION: "银行关系",
  CASE: "案例",
  KEYWORD_DENSITY: "关键词密度",
};
function riskInput(form: HTMLFormElement) {
  const f = new FormData(form);
  const evidence = Array.from(f.entries())
    .filter(([key]) => key.startsWith("riskClaim-"))
    .map(([key, claim]) => {
      const i = key.slice(10),
        selected = String(f.get("riskEvidence-" + i) || "");
      return {
        claim: String(claim),
        ...(selected.startsWith("public:")
          ? { sourceIndex: Number(selected.slice(7)) }
          : selected.startsWith("internal:")
            ? {
                catalogId: selected.slice(9),
                catalogVersion: String(f.get("riskEvidenceVersion-" + i) || ""),
              }
            : {}),
      };
    });
  return {
    level: f.get("riskLevel"),
    confirmed: f.get("riskConfirmed") === "on",
    basis: String(f.get("note") || "").trim(),
    evidence,
  };
}
export function ArticleFactCheck({
  articleId,
  revision,
  initial,
}: {
  articleId: string;
  revision: number;
  initial: Finding[];
}) {
  const [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [requestNote, setRequestNote] = useState(
      "请独立审核人员核对当前正文语境及必要依据，不直接认可未经核验的金融事实。",
    ),
    [selected, setSelected] = useState("");
  const session = useContentEditingSession(),
    router = useRouter(),
    url = `/api/admin/geo/articles/${articleId}/facts/`;
  async function load() {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || !j.ok) throw Error(j.error?.message || "无法读取核验结果。");
    setState(j.data);
  }
  useEffect(() => {
    let stale = false;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (stale) return;
        if (j.ok) setState(j.data);
        else setMessage(j.error?.message || "无法读取核验结果。");
      })
      .catch(() => {
        if (!stale) setMessage("无法连接核验服务，请稍后刷新。");
      });
    return () => {
      stale = true;
    };
  }, [url, revision, initial]);
  const findings = state?.findings || initial;
  const pending =
    state?.records.filter(
      (r) =>
        r.action === "ARTICLE_FACT_REQUEST" &&
        !state.records.some(
          (d) =>
            d.action === "ARTICLE_FACT_DECISION" &&
            d.metadata.requestId === r.id,
        ),
    ) || [];
  async function act(data: Record<string, unknown>) {
    if (busy || session?.dirty || session?.busy) {
      setMessage("请先完成草稿保存，再处理当前版本核验。");
      return;
    }
    if (
      data.action !== "check" &&
      state?.revision !== (session?.revision ?? revision)
    ) {
      setMessage("保存版本已变化，请等待最新检查加载或先重新执行事实核验。");
      return;
    }
    if (session && !session.begin("workflow")) return;
    setBusy(true);
    setMessage("");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          revision: session?.revision ?? revision,
        }),
        signal: controller.signal,
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw Error(j.error?.message || "核验操作未完成。");
      await load();
      if (data.action === "decide") setSelected("");
      setMessage(
        data.action === "check"
          ? "已更新当前保存版本的检查结果。"
          : data.action === "request"
            ? "已申请独立人工复核；这不等于审核通过或允许发布。"
            : "复核判断已保存，当前检查已重新计算；正式审核和发布仍需单独操作。",
      );
      router.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error && /[\u4e00-\u9fff]/.test(e.message)
          ? e.message
          : "核验连接中断或超时，请先核对记录，避免重复操作。",
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
      session?.finish();
    }
  }
  function locate(f: Finding) {
    const el = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="content"]',
    );
    if (!f.excerpt && !f.claim) {
      document
        .getElementById("content-sources")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
      setMessage(
        "已定位核验依据填写区；基础知识也可申请独立人员记录专业判断。",
      );
      return;
    }
    if (!el) {
      setMessage("当前版本编辑已锁定，请由作者通过正式撤回流程后修改。");
      return;
    }
    const text = f.excerpt || f.claim || "",
      positions = [];
    let from = 0;
    while (text && from < el.value.length) {
      const i = el.value.indexOf(text, from);
      if (i < 0) break;
      positions.push(i);
      from = i + text.length;
    }
    if (!positions.length) {
      setMessage("该原文已被修改，请先保存并重新检查，不会定位到旧行号。");
      return;
    }
    const target = positions.sort(
      (a, b) =>
        Math.abs(el.value.slice(0, a).split("\n").length - (f.line || 1)) -
        Math.abs(el.value.slice(0, b).split("\n").length - (f.line || 1)),
    )[0];
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus();
    el.setSelectionRange(target, target + text.length);
    const line = el.value.slice(0, target).split("\n").length;
    el.scrollTop = Math.max(
      0,
      (line - 3) * (parseFloat(getComputedStyle(el).lineHeight) || 24),
    );
    setMessage(`已定位并选中当前正文第${line}行；修改后请保存，再重新检查。`);
  }
  return (
    <section aria-label="文章事实检查">
      <p>
        检查版本：{state?.revision ?? revision}。必须修复{" "}
        {findings.filter((f) => f.severity === "MUST_FIX").length}{" "}
        项；待人工核实 {findings.filter((f) => f.severity === "VERIFY").length}{" "}
        项；优化建议{" "}
        {findings.filter((f) => f.severity === "SUGGESTION").length} 项。
      </p>
      {state?.checkedAt && (
        <p>
          最近持久化检查：{new Date(state.checkedAt).toLocaleString("zh-CN")}
        </p>
      )}
      <button
        type="button"
        className="button outline"
        disabled={busy || session?.dirty || session?.busy}
        onClick={() => void act({ action: "check" })}
      >
        重新执行事实核验（已保存版本）
      </button>
      {session?.dirty && (
        <p>
          当前有未保存修改。下方显示已保存版本的结果；定位按当前编辑器文本重新计算，请先保存再审核。
        </p>
      )}
      {state?.canRequest && state.status === "DRAFT" && findings.length > 0 && (
        <label>
          申请人工复核说明
          <textarea
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            minLength={10}
            maxLength={1000}
          />
        </label>
      )}
      <ul>
        {findings.map((f, i) => (
          <li className="admin-panel" key={f.key || i}>
            <strong>
              {severityNames[f.severity]} · {names[f.code] || "内容核验"}
            </strong>
            <p>{f.message}</p>
            <p>{f.location || "整篇文章或知识来源"}</p>
            {f.excerpt ? (
              <blockquote>{f.excerpt}</blockquote>
            ) : (
              <p>本项没有单一触发片段，按整篇内容及依据核验。</p>
            )}
            <button
              type="button"
              className="button outline"
              onClick={() => locate(f)}
            >
              {f.excerpt || f.claim ? "定位并修改" : "补充核验依据"}
            </button>
            {f.code === "FAQ_CHANGED" && f.objectId && (
              <a href={`/admin/geo/faqs/${f.objectId}/`}>查看关联问答版本</a>
            )}
            {["FACT_EVIDENCE", "SOURCE_BINDING", "NO_SOURCE"].includes(
              f.code,
            ) && <a href="#content-sources">补充这项主张的核验依据</a>}
            {state?.canRequest && state.status === "DRAFT" && f.key && (
              <button
                type="button"
                className="button outline"
                disabled={busy || session?.dirty || session?.busy}
                onClick={() =>
                  void act({
                    action: "request",
                    findingKey: f.key,
                    note: requestNote,
                  })
                }
              >
                申请人工复核
              </button>
            )}
          </li>
        ))}
      </ul>
      {state && (
        <details>
          <summary>已保存的公开依据与状态</summary>
          {state.context.sources.length ? (
            state.context.sources.map((s, i) => (
              <p key={i}>
                {s.title} · {s.url} · 核验{s.checkedAt || "未填写"}
                ；核验状态：
                {findings.some(
                  (f) => f.code === "SOURCE_BINDING" && f.objectId === s.url,
                )
                  ? "需补充或已失效"
                  : "格式及版本检查通过，内容支持关系仍须独立人工核验"}
                。
              </p>
            ))
          ) : (
            <p>
              暂无公开来源；基础知识允许专业判断，具体事实必须匹配有效公开来源或受控内部资料。
            </p>
          )}
          <a href="#content-sources">编辑公开依据及对应正文</a> ·{" "}
          <Link href="/admin/geo/reviews/">管理受控内部资料（需授权）</Link>
        </details>
      )}
      {state && pending.length > 0 && (
        <section>
          <h3>待独立人工复核（{pending.length}）</h3>
          <ul>
            {pending.map((r) => (
              <li key={r.id}>
                {r.actor?.name || "原申请人"}：{r.metadata.note}
              </li>
            ))}
          </ul>
          {state.canDecide ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const button = (e.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement | null;
                void act({
                  action: "decide",
                  requestId: selected || pending[0].id,
                  accepted: button?.value === "accept",
                  note: String(new FormData(e.currentTarget).get("note") || ""),
                  ...(button?.value === "accept"
                    ? { risk: riskInput(e.currentTarget) }
                    : {}),
                });
              }}
            >
              <label>
                处理申请
                <select
                  value={selected || pending[0].id}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {pending.map((r) => (
                    <option key={r.id} value={r.id}>
                      {names[r.metadata.code || ""] || "内容核验"} ·{" "}
                      {r.actor?.name || "原申请人"}
                    </option>
                  ))}
                </select>
              </label>
              <FaqRiskFields
                key={state.revision}
                context={state.context}
                onLevel={() => {}}
              />
              <label>
                独立复核判断依据
                <textarea
                  name="note"
                  required
                  minLength={10}
                  maxLength={1000}
                />
              </label>
              <button
                name="decision"
                value="accept"
                className="button gold"
                disabled={busy || session?.dirty || session?.busy}
              >
                确认核验判断
              </button>
              <button
                name="decision"
                value="reject"
                className="button outline"
                disabled={busy || session?.dirty || session?.busy}
              >
                退回补充或修改
              </button>
            </form>
          ) : (
            <p>
              当前账号没有独立审核资格，请由未参与本版本创作、编辑或提交的授权审核人复核。
            </p>
          )}
        </section>
      )}
      {state?.records.some((r) => r.action === "ARTICLE_FACT_DECISION") && (
        <details>
          <summary>本版本复核记录</summary>
          {state.records
            .filter((r) => r.action === "ARTICLE_FACT_DECISION")
            .map((r) => (
              <div key={r.id}>
                <p>
                  {r.actor?.name || "原审核人"} ·{" "}
                  {new Date(r.createdAt).toLocaleString("zh-CN")} ·{" "}
                  {r.metadata.accepted
                    ? "已记录核验判断（不等于发布）"
                    : "退回修改"}
                </p>
                <p>{r.metadata.note}</p>
                {r.metadata.riskAssessment?.evidence?.map((s, i) => (
                  <p key={i}>
                    主张：{s.claim} ·{" "}
                    {s.type === "PUBLIC" ? s.source?.title : s.title} ·
                    核验日期：
                    {s.source?.checkedAt || s.verifiedAt?.slice(0, 10)} ·
                    对应依据已由人工确认；资料更新后须重新核验。
                  </p>
                ))}
              </div>
            ))}
        </details>
      )}
      <p role="status" className="workflow-feedback">
        {busy ? "正在处理核验…" : message}
      </p>
    </section>
  );
}
