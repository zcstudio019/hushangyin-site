"use client";
import { useContentEditingSession } from "./ContentEditingSession";
import { FaqRiskFields, type FaqRiskContext } from "./FaqRiskFields";
import { classifyFaq, type RiskLevel } from "@/features/geo/risk";
import Link from "next/link";
import { MarkdownImport } from "./MarkdownImport";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  categories,
  intents,
  questionStatuses,
  reviewChecks,
  contentStatuses,
} from "@/features/geo/config";
import type { Snapshot } from "@/features/geo/validation";
import {
  reviewInputIssue,
  reviewNoteHelp,
  reviewNoteMaximum,
  reviewNoteMinimum,
  workflowFailureMessage,
  workflowTimeoutMs,
} from "@/features/geo/workflow-feedback";
type Kind = "articles" | "faqs" | "questions";
export type EditorData = {
  id?: string;
  questionId?: string;
  hasPublicAnswer?: boolean;
  title?: string;
  slug?: string;
  summary?: string;
  seoTitle?: string;
  metaDescription?: string;
  generationMetadata?: unknown;
  content?: string;
  question?: string;
  answer?: string;
  category?: string;
  tags?: string[];
  sources?: Snapshot["sources"];
  relatedIds?: string[];
  articleId?: string | null;
  aiAssisted?: boolean;
  revision?: number;
  keywords?: string[];
  intent?: keyof typeof intents;
  priority?: number;
  status?: string;
  importMetadata?: {
    recordLabel?: string;
    source?: string;
    importedAt?: string;
  };
};
const split = (v: FormDataEntryValue | null) =>
  String(v || "")
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
export function ContentEditor({
  kind,
  item = {},
  articles,
}: {
  kind: Kind;
  item?: EditorData;
  articles: { id: string; title: string }[];
}) {
  const router = useRouter(),
    lock = useRef(false),
    body = useRef<HTMLTextAreaElement>(null);
  const session = useContentEditingSession();
  const [conflictInfo, setConflictInfo] = useState<{
    revision: number;
    status: string;
    title?: string;
    content?: string;
    answer?: string;
  } | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [sourceCount, setSourceCount] = useState(
    Math.max(1, item.sources?.length || 0),
  );
  const insert = (text: string) => {
    const el = body.current;
    if (el) {
      el.focus();
      el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
      session?.markDirty();
    }
  };
  return (
    <form
      className="admin-panel account-form geo-editor"
      onChange={() => session?.markDirty()}
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        if (session && !session.begin("save")) {
          setMessage("保存或审核正在处理，请等待完成。");
          return;
        }
        lock.current = true;
        setBusy(true);
        setMessage("");
        const d = new FormData(e.currentTarget);
        try {
          const sources = item.generationMetadata
            ? Array.from({ length: sourceCount }, (_, i) => {
                const title = String(d.get(`source-title-${i}`) || "").trim(),
                  url = String(d.get(`source-url-${i}`) || "").trim(),
                  checkedAt = String(d.get(`source-date-${i}`) || ""),
                  validUntil = String(d.get(`source-until-${i}`) || ""),
                  paragraph = String(
                    d.get(`source-paragraph-${i}`) || "",
                  ).trim();
                return {
                  title,
                  url,
                  checkedAt,
                  ...(validUntil ? { validUntil } : {}),
                  ...(paragraph ? { paragraph } : {}),
                };
              }).filter((s) => s.title || s.url || s.paragraph || s.checkedAt)
            : String(d.get("sources") || "")
                .split("\n")
                .filter((s) => s.trim())
                .map((line) => {
                  const [
                    title,
                    url,
                    checkedAt,
                    validUntil,
                    paragraph,
                    ...extra
                  ] = line.split("|").map((s) => s.trim());
                  if (extra.length || !title || !url || !checkedAt)
                    throw Error(
                      "引用请按“标题 | HTTPS网址 | 核验日期 | 可选截止日期”逐行填写。",
                    );
                  return {
                    title,
                    url,
                    checkedAt,
                    ...(validUntil ? { validUntil } : {}),
                    ...(paragraph ? { paragraph } : {}),
                  };
                });
          const data =
            kind === "articles"
              ? {
                  ...(item.questionId ? { questionId: item.questionId } : {}),
                  title: d.get("title"),
                  slug: d.get("slug"),
                  summary: d.get("summary"),
                  seoTitle: d.get("seoTitle") || undefined,
                  metaDescription: d.get("metaDescription") || undefined,
                  content: d.get("content"),
                  category: d.get("category"),
                  tags: split(d.get("tags")),
                  sources,
                  relatedIds: d.getAll("relatedIds"),
                  aiAssisted: d.get("aiAssisted") === "on",
                  ...(item.id
                    ? { revision: session?.revision ?? item.revision }
                    : {}),
                }
              : kind === "faqs"
                ? {
                    question: d.get("question"),
                    answer: d.get("answer"),
                    category: d.get("category"),
                    articleId: d.get("articleId") || null,
                    sources,
                    ...(item.id
                      ? { revision: session?.revision ?? item.revision }
                      : {}),
                  }
                : {
                    question: d.get("question"),
                    category: d.get("category"),
                    keywords: split(d.get("keywords")),
                    intent: d.get("intent"),
                    priority: Number(d.get("priority")),
                    status: d.get("status"),
                    articleId: d.get("articleId") || null,
                  };
          const r = await fetch(
            `/api/admin/geo/${kind}/${item.id ? item.id + "/" : ""}`,
            {
              method: item.id ? "PATCH" : "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            },
          );
          const j = await r.json();
          if (!r.ok || !j.ok) {
            setStale(j.error?.code === "STALE_VERSION");
            setMessage(
              workflowFailureMessage(r.status, j.error?.code, j.error?.message),
            );
            return;
          }
          if (typeof j.data.revision === "number")
            session?.saved(j.data.revision);
          setStale(false);
          setMessage(
            `已保存${typeof j.data.revision === "number" ? "，当前版本" + j.data.revision : ""}。`,
          );
          if (!item.id) router.push(`/admin/geo/${kind}/${j.data.id}/`);
          router.refresh();
        } catch (e) {
          setMessage(
            e instanceof Error && /[\u4e00-\u9fff]/.test(e.message)
              ? e.message
              : "连接失败，尚未确认保存结果；当前输入已保留，请先核对服务器版本。",
          );
        } finally {
          lock.current = false;
          setBusy(false);
          session?.finish();
        }
      }}
    >
      <fieldset disabled={busy || session?.busy}>
        <label>
          {kind === "articles" ? "文章标题（H1）" : "问题"}
          <input
            name={kind === "articles" ? "title" : "question"}
            defaultValue={kind === "articles" ? item.title : item.question}
            required
            maxLength={kind === "articles" ? 200 : 300}
          />
        </label>
        <label>
          分类
          <select name="category" defaultValue={item.category || categories[0]}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {kind === "articles" && (
          <>
            <label>
              网址标识（英文小写及连字符，首次发布后固定）
              <input
                name="slug"
                defaultValue={item.slug}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                required
                maxLength={150}
              />
            </label>
            <label>
              文章摘要 / 搜索描述
              <textarea
                name="summary"
                defaultValue={item.summary}
                required
                maxLength={600}
                rows={3}
              />
            </label>
            <label>
              搜索标题（可选）
              <input
                name="seoTitle"
                maxLength={200}
                defaultValue={item.seoTitle || ""}
              />
            </label>
            <label>
              搜索描述（可选）
              <textarea
                name="metaDescription"
                maxLength={600}
                rows={3}
                defaultValue={item.metaDescription || ""}
              />
            </label>
            <label>
              标签（逗号分隔）
              <input name="tags" defaultValue={item.tags?.join(",")} />
            </label>
          </>
        )}
        {kind !== "questions" && (
          <>
            <div className="admin-nav geo-toolbar" aria-label="Markdown工具栏">
              {Object.entries({
                H2: "\n## 二级标题\n",
                H3: "\n### 三级标题\n",
                段落: "\n\n正文段落\n",
                无序列表: "\n- 项目一\n- 项目二\n",
                有序列表: "\n1. 第一步\n2. 第二步\n",
                表格: "\n| 项目 | 说明 |\n| --- | --- |\n| 内容 | 说明 |\n",
                引用: "\n> 引用内容\n",
                图片: "\n![图片说明](/assets/approved-image.png)\n",
                链接: "[链接文字](/insights/)",
              }).map(([name, text]) => (
                <button
                  type="button"
                  className="button outline"
                  key={name}
                  onClick={() => insert(text)}
                >
                  {name}
                </button>
              ))}
            </div>
            <label>
              {kind === "articles" ? "正文（Markdown）" : "答案（Markdown）"}
              <textarea
                ref={body}
                name={kind === "articles" ? "content" : "answer"}
                defaultValue={kind === "articles" ? item.content : item.answer}
                required
                maxLength={kind === "articles" ? 80000 : 20000}
                rows={18}
              />
            </label>
            <p>
              文章标题作为主标题；正文可使用二级、三级标题。网页代码仅显示为文字，不执行。图片只允许已审核的本地位图资源。
            </p>
            <label>
              图片上传（暂未开通安全存储）
              <input
                type="file"
                disabled
                accept="image/png,image/jpeg,image/webp,image/gif"
              />
            </label>
            {item.generationMetadata ? (
              <section id="content-sources">
                <h3>已核验引用与正文段落</h3>
                <p>
                  与创作中心的已核验参考资料一致；清空某一组全部字段可移除该引用。
                </p>
                {Array.from({ length: sourceCount }, (_, i) => {
                  const source = item.sources?.[i];
                  return (
                    <div className="admin-panel" key={i}>
                      <h4>引用 {i + 1}</h4>
                      <label>
                        资料标题
                        <input
                          name={`source-title-${i}`}
                          maxLength={200}
                          defaultValue={source?.title || ""}
                        />
                      </label>
                      <label>
                        来源网址
                        <input
                          name={`source-url-${i}`}
                          maxLength={1000}
                          defaultValue={source?.url || ""}
                        />
                      </label>
                      <label>
                        核验日期
                        <input
                          type="date"
                          name={`source-date-${i}`}
                          defaultValue={source?.checkedAt || ""}
                        />
                      </label>
                      <label>
                        适用截止日期（可选）
                        <input
                          type="date"
                          name={`source-until-${i}`}
                          defaultValue={source?.validUntil || ""}
                        />
                      </label>
                      <label>
                        对应正文原段落
                        <textarea
                          name={`source-paragraph-${i}`}
                          rows={4}
                          maxLength={2000}
                          defaultValue={source?.paragraph || ""}
                        />
                      </label>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="button outline"
                  disabled={sourceCount >= 20}
                  onClick={() => setSourceCount((n) => n + 1)}
                >
                  增加引用来源
                </button>
              </section>
            ) : (
              <label id="content-sources">
                {kind === "faqs"
                  ? "公开参考资料（选填；内部资料在审核时关联）"
                  : "引用来源"}
                （每行：标题 | HTTPS网址 | 核验日期YYYY-MM-DD | 可选截止日期 |
                可选对应正文段落）
                <textarea
                  name="sources"
                  defaultValue={item.sources
                    ?.map((s) =>
                      [
                        s.title,
                        s.url,
                        s.checkedAt || "",
                        s.validUntil || "",
                        (s as { paragraph?: string }).paragraph || "",
                      ].join(" | "),
                    )
                    .join("\n")}
                  rows={4}
                />
              </label>
            )}
            <p>
              {kind === "faqs"
                ? "FAQ按风险分级：基础知识不强制外部网址；一般实操说明判断依据；具体银行、政策、利率或数量主张须对应有效公开来源或受控内部资料。已有引用不会删除。"
                : "草稿可暂缺引用；审核通过前必须由人工核验并填写有效来源。生成文章还须填写正文原段落，网址与核验日期须匹配创作中心的有效参考资料。"}
            </p>
          </>
        )}
        {kind === "articles" ? (
          <>
            <label>
              相关知识文章
              <select
                name="relatedIds"
                multiple
                defaultValue={item.relatedIds || []}
                size={Math.min(5, Math.max(2, articles.length))}
              >
                {articles
                  .filter((a) => a.id !== item.id)
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="geo-check">
              <input
                name="aiAssisted"
                type="checkbox"
                defaultChecked={item.aiAssisted}
              />
              含人工智能辅助内容（仍必须人工审核）
            </label>
          </>
        ) : (
          <label>
            关联文章
            <select name="articleId" defaultValue={item.articleId || ""}>
              <option value="">暂不关联</option>
              {articles.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "questions" && (
          <>
            <label>
              关键词（逗号分隔）
              <input name="keywords" defaultValue={item.keywords?.join(",")} />
            </label>
            <label>
              搜索意图
              <select name="intent" defaultValue={item.intent || "AWARENESS"}>
                {Object.entries(intents).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              优先级
              <select name="priority" defaultValue={item.priority || 3}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option value={n} key={n}>
                    {n}
                    {n === 1 ? "（最高）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              问题状态
              <select name="status" defaultValue={item.status || "OPEN"}>
                {Object.entries(questionStatuses).map(([k, v]) => (
                  <option
                    value={k}
                    key={k}
                    disabled={k === "ANSWERED" && !item.hasPublicAnswer}
                  >
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button className="button gold" disabled={busy}>
          {busy ? "保存中…" : kind === "questions" ? "保存问题" : "保存草稿"}
        </button>
      </fieldset>
      <p role="status">{message}</p>
      {stale && (
        <div role="alert">
          <button
            type="button"
            className="button outline"
            onClick={async () => {
              try {
                const r = await fetch(`/api/admin/geo/${kind}/${item.id}/`, {
                  cache: "no-store",
                });
                const j = await r.json();
                if (!r.ok || !j.ok) throw Error();
                setConflictInfo(j.data);
              } catch {
                setMessage("无法读取最新版本，请稍后重试；当前输入已保留。");
              }
            }}
          >
            查看服务器最新版本差异
          </button>
          {conflictInfo && (
            <div>
              <p>
                本页基于版本{session?.revision ?? item.revision}；服务器版本
                {conflictInfo.revision}，状态
                {contentStatuses[
                  conflictInfo.status as keyof typeof contentStatuses
                ] || "请核对"}
                。当前本地输入仍保留在上方编辑框，不会自动覆盖。
              </p>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {conflictInfo.title}
                {"\n"}
                {conflictInfo.content || conflictInfo.answer}
              </pre>
            </div>
          )}
        </div>
      )}
      {item.id && kind !== "questions" && (
        <Link href={`/admin/geo/${kind}/${item.id}/preview/`}>
          预览已保存内容 ↗
        </Link>
      )}
    </form>
  );
}
export function WorkflowForm({
  kind,
  id,
  revision,
  status,
  isLive,
  canReview,
  canPublish,
  canUpdate,
  canUnpublish,
  canWithdraw,
  hasReviewPermission,
  selfReview,
  reviewReason,
  approvalBlocked,
  approvalIssues = [],
  faqRisk,
  rejected,
  publicUrl,
  versions = [],
}: {
  kind: "articles" | "faqs";
  id: string;
  revision: number;
  status: keyof typeof contentStatuses;
  isLive: boolean;
  canReview: boolean;
  canPublish: boolean;
  canUpdate: boolean;
  canUnpublish: boolean;
  canWithdraw: boolean;
  hasReviewPermission: boolean;
  selfReview: boolean;
  reviewReason?: string;
  approvalBlocked?: boolean;
  approvalIssues?: string[];
  faqRisk?: FaqRiskContext;
  rejected: boolean;
  publicUrl?: string;
  versions?: number[];
}) {
  const router = useRouter(),
    lock = useRef(false);
  const session = useContentEditingSession();
  const [issues, setIssues] = useState<string[]>([]);
  const [staleWorkflow, setStaleWorkflow] = useState(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busy = busyAction !== null;
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(
    faqRisk ? classifyFaq(faqRisk.question, faqRisk.answer).level : "HIGH",
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  function showError(text: string, form?: HTMLFormElement, field?: string) {
    setMessage(text);
    setIsError(true);
    const target = field && form?.elements.namedItem(field);
    if (target instanceof HTMLElement) {
      requestAnimationFrame(() => {
        target.focus();
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    } else
      requestAnimationFrame(() =>
        feedback.current?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        }),
      );
  }
  async function action(action: string, data: FormData, form: HTMLFormElement) {
    if (lock.current) return;
    if (session?.dirty || session?.busy) {
      showError("内容尚未保存或保存正在进行，请等待保存完成再操作。", form);
      return;
    }
    const note = String(data.get("note") || "");
    const checklist = Object.fromEntries(
      Object.keys(reviewChecks).map((k) => [k, data.get(k) === "on"]),
    );
    const issue = reviewInputIssue(
      kind === "faqs" && faqRisk && riskLevel !== "HIGH" && action === "approve"
        ? "reject"
        : action,
      note,
      checklist,
    );
    if (issue) {
      showError(issue.message, form, issue.field);
      return;
    }
    if (faqRisk && action === "approve" && data.get("riskConfirmed") !== "on") {
      showError(
        "请完成综合核验确认，不能仅选择风险等级。",
        form,
        "riskConfirmed",
      );
      return;
    }
    const evidence = Array.from(data.entries())
      .filter(([key]) => key.startsWith("riskClaim-"))
      .map(([key, claim]) => {
        const selected = String(
          data.get("riskEvidence-" + key.slice("riskClaim-".length)) || "",
        );
        return {
          claim: String(claim),
          ...(selected.startsWith("public:")
            ? { sourceIndex: Number(selected.slice(7)) }
            : selected.startsWith("internal:")
              ? {
                  catalogId: selected.slice(9),
                  catalogVersion: String(
                    data.get(
                      "riskEvidenceVersion-" + key.slice("riskClaim-".length),
                    ) || "",
                  ),
                }
              : {}),
        };
      });
    if (
      faqRisk &&
      action === "approve" &&
      evidence.some((e) => !("sourceIndex" in e) && !("catalogId" in e))
    ) {
      showError(
        "当前内容包含未经核验的具体利率、产品条件或其他主张，请逐项选择必要证据；没有依据时请退回补充。",
      );
      return;
    }
    if (session && !session.begin("workflow")) {
      showError("保存或审核正在处理，请等待完成。", form);
      return;
    }
    lock.current = true;
    setIssues([]);
    setBusyAction(action);
    setMessage("");
    setIsError(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), workflowTimeoutMs);
    try {
      const r = await fetch(`/api/admin/geo/${kind}/${id}/workflow/`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          revision: session?.revision ?? revision,
          note: note.trim(),
          checklist,
          ...(faqRisk && action === "approve"
            ? {
                risk: {
                  level: riskLevel,
                  confirmed: true,
                  basis: note.trim(),
                  evidence,
                },
              }
            : {}),
          ...(data.get("version")
            ? { version: Number(data.get("version")) }
            : {}),
        }),
      });
      const j = await r.json().catch(() => null);
      if (controller.signal.aborted) throw new Error("request-timeout");
      if (!r.ok || !j?.ok) {
        setStaleWorkflow(j?.error?.code === "STALE_VERSION");
        setIssues(
          Array.isArray(j?.error?.details)
            ? j.error.details
                .map((f: { message?: string }) => f.message)
                .filter((s: unknown): s is string => typeof s === "string")
            : [],
        );
        showError(
          workflowFailureMessage(r.status, j?.error?.code, j?.error?.message),
          form,
          j?.error?.code === "REVIEW_NOTE" ? "note" : undefined,
        );
        return;
      }
      const messages: Record<string, string> = {
        approve:
          "审核已通过。" +
          (canPublish
            ? "请确认当前已审核版本后，点击“发布到官网”。"
            : "内容尚未公开，请由具有发布权限的人员执行“发布到官网”。"),
        reject: "已退回修改，审核意见已记录，请作者修改后重新提交。",
        submit: "已提交审核，请等待独立审核人员处理。",
        withdraw: "已撤回审核，请补充修改并保存，再重新提交。",
        publish: "已发布到官网。",
        offline: "内容已下线。",
        restore: "已恢复为新草稿，须重新审核。",
      };
      setMessage(messages[action] || "操作成功。");
      setIsError(false);
      setStaleWorkflow(false);
      router.refresh();
    } catch {
      showError(
        controller.signal.aborted
          ? "审核请求超时，尚未确认处理结果。请刷新核对状态和审核记录，避免重复审核。"
          : "网络连接失败，尚未确认处理结果。请恢复连接后刷新核对状态和审核记录，再决定是否重试。",
      );
    } finally {
      clearTimeout(timeout);
      lock.current = false;
      setBusyAction(null);
      session?.finish();
    }
  }
  return (
    <section className="admin-panel" id="content-workflow">
      <h2>审核与发布</h2>
      <p>
        当前：{rejected ? "已驳回（待修改）" : contentStatuses[status]} · 版本{" "}
        {session?.revision ?? revision} · {isLive ? "有线上版本" : "未公开"}
        。请先保存草稿；操作针对已保存版本。编辑不会直接替换线上内容。
      </p>
      {session?.dirty && (
        <p role="status">内容尚未保存，请先保存草稿，再提交审核。</p>
      )}
      {session?.busy && !busy && (
        <p role="status">正在保存草稿，请等待完成后再提交审核。</p>
      )}
      {!!issues.length && (
        <ul role="alert">
          {issues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      )}
      {staleWorkflow && (
        <p>
          <a
            target="_blank"
            rel="noreferrer"
            href={`/admin/geo/${kind}/${id}/preview/`}
          >
            查看服务器最新已保存内容（另开页面，不覆盖本地输入）
          </a>
        </p>
      )}
      {status === "IN_REVIEW" && !hasReviewPermission && (
        <p role="note">当前账号没有审核权限，请联系超级管理员。</p>
      )}
      {status === "IN_REVIEW" && hasReviewPermission && selfReview && (
        <p role="note">
          {reviewReason ||
            "此版本由你参与创作、编辑、导入或提交，不能自审。请分配另一位有权限的独立审核人员。"}
        </p>
      )}
      {status === "IN_REVIEW" &&
        hasReviewPermission &&
        !selfReview &&
        !canReview &&
        reviewReason && <p role="note">{reviewReason}</p>}
      {status === "APPROVED" && !canPublish && (
        <p>当前账号没有发布权限，请联系超级管理员发布已审核版本。</p>
      )}
      {status === "APPROVED" && (
        <p role="status" className="workflow-feedback">
          审核已通过。
          {canPublish
            ? "请核对当前已审核版本，点击下方“发布到官网”完成发布。"
            : "当前已审核版本尚待发布，请由具有发布权限的人员执行“发布到官网”。"}
        </p>
      )}
      {rejected && (
        <p>该版本已驳回。请根据驳回原因修改并保存新版本，再重新提交审核。</p>
      )}
      {isLive && publicUrl && (
        <p>
          <Link href={publicUrl}>查看官网已发布版本 ↗</Link>
        </p>
      )}
      <form
        noValidate
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const button = (e.nativeEvent as SubmitEvent).submitter;
          if (!(button instanceof HTMLButtonElement) || !button.value) {
            showError("请选择要执行的操作按钮。", form);
            return;
          }
          void action(button.value, new FormData(form), form);
        }}
      >
        <fieldset
          disabled={busy || session?.busy || session?.dirty}
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          {status === "IN_REVIEW" && canReview && (
            <>
              {faqRisk ? (
                <FaqRiskFields context={faqRisk} onLevel={setRiskLevel} />
              ) : (
                <h3>人工金融内容核验</h3>
              )}
              {(kind === "articles" || !faqRisk || riskLevel === "HIGH") &&
                Object.entries(reviewChecks).map(([k, v]) => (
                  <label key={k} className="geo-check">
                    <input type="checkbox" name={k} />
                    {v}
                  </label>
                ))}
              <label>
                {faqRisk ? "审核意见与专业判断依据" : "人工核验说明"}
                <textarea
                  name="note"
                  minLength={reviewNoteMinimum}
                  maxLength={reviewNoteMaximum}
                  required
                  aria-describedby="workflow-note-help"
                  rows={3}
                />
              </label>
              <p id="workflow-note-help">
                {faqRisk
                  ? "必填，10—1000字。低风险说明专业判断；一般实操说明适用条件；具体主张逐项核对依据。不能仅填“无”或“同意”。"
                  : reviewNoteHelp}
              </p>
              <p>
                审核人必须与作者、当前版本最后编辑人及提交人不同。不得将未经核验的金融宣传内容发布。
              </p>
            </>
          )}
          {status === "IN_REVIEW" && canReview && approvalBlocked && (
            <aside
              role="alert"
              className="workflow-error"
              id="workflow-blockers"
            >
              <p>
                当前不能审核通过，请先解决以下缺失项；勾选核验清单不能代替真实引用来源。
              </p>
              <ul>
                {(approvalIssues.length
                  ? approvalIssues
                  : ["当前版本缺少必要答案或已核验引用来源。"]
                ).map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <p>
                请作者先撤回审核，在引用来源填写区补充真实来源并保存，重新提交后再分配新版本审核。不得直接修改当前锁定版本。
              </p>
            </aside>
          )}
          <div className="admin-nav">
            {status === "DRAFT" && canUpdate && !rejected && (
              <button name="action" value="submit" className="button gold">
                提交审核
              </button>
            )}
            {status === "IN_REVIEW" && canWithdraw && (
              <button name="action" value="withdraw" className="button outline">
                撤回审核
              </button>
            )}
            {status === "IN_REVIEW" && canReview && (
              <>
                <button
                  name="action"
                  value="approve"
                  className="button gold"
                  disabled={approvalBlocked}
                  aria-describedby={
                    approvalBlocked ? "workflow-blockers" : "workflow-note-help"
                  }
                >
                  {busyAction === "approve" ? "审核处理中…" : "审核通过"}
                </button>
                <button name="action" value="reject" className="button outline">
                  {busyAction === "reject" ? "审核处理中…" : "退回修改"}
                </button>
              </>
            )}
            {status === "APPROVED" && canPublish && (
              <button name="action" value="publish" className="button gold">
                发布到官网
              </button>
            )}
            {isLive && canUnpublish && (
              <button name="action" value="offline" className="button outline">
                下线内容
              </button>
            )}
          </div>
          {versions.length > 0 && canUpdate && status !== "IN_REVIEW" && (
            <label>
              恢复历史内容（生成新草稿，需重新审核）
              <select name="version" defaultValue="">
                <option value="">选择历史版本</option>
                {versions.map((v) => (
                  <option value={v} key={v}>
                    版本 {v}
                  </option>
                ))}
              </select>
              <button name="action" value="restore" className="button outline">
                恢复历史版本
              </button>
            </label>
          )}
        </fieldset>
        <p
          ref={feedback}
          role={isError ? "alert" : "status"}
          aria-live={isError ? "assertive" : "polite"}
          aria-atomic="true"
          className={isError ? "workflow-error" : "workflow-feedback"}
        >
          {message}
        </p>
        {busy && (
          <p role="status">正在提交，请勿重复操作；结果将在此处显示。</p>
        )}
      </form>
    </section>
  );
}
export function QuestionImport() {
  return <MarkdownImport kind="questions" format="csv" />;
}
