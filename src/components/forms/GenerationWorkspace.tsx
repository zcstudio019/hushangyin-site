"use client";
import { useState, useEffect, useRef } from "react";
import { ModelConnection, type ModelStatus } from "./ModelConnection";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useContentEditingSession } from "./ContentEditingSession";
import { ArticleFactCheck } from "./ArticleFactCheck";
import {
  articleTypes,
  depths,
  generationStatuses,
  severityNames,
  type KnowledgeSnapshot,
  type Finding,
} from "@/features/generation/config";
import { intents, questionStatuses } from "@/features/geo/config";
import { SafeMarkdown } from "@/components/content/SafeMarkdown";
type Options = {
  questions: {
    id: string;
    question: string;
    category: string;
    keywords: string[];
    intent: string;
    status: string;
  }[];
  templates: {
    id: string;
    name: string;
    version: number;
    description: string;
  }[];
  configuration: { available: boolean; missing: string[] };
  modelStatus: ModelStatus;
  workerOnline: boolean;
  canManage: boolean;
};
type Task = {
  id: string;
  status: keyof typeof generationStatuses;
  attempts: number;
  errorMessage?: string | null;
  outputArticleId?: string | null;
  output?: {
    markdown?: string;
    title?: string;
    verificationItems?: string[];
  } | null;
  tokenUsage?: {
    input: number | null;
    output: number | null;
    total: number | null;
  } | null;
  callLogs?: { estimatedCostUsd?: string | null }[];
};
const endpoint = "/api/admin/geo/generation/";
async function request(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = await r.json();
  if (!r.ok || !j.ok) throw Error(j.error?.message || "操作失败，请稍后重试。");
  return j.data;
}
export function GenerationWorkspace({
  initial,
  taskId,
  initialQuestionId,
}: {
  initial: Options;
  taskId?: string;
  initialQuestionId?: string;
}) {
  const [options, setOptions] = useState(initial),
    [question, setQuestion] = useState(
      initial.questions.some((q) => q.id === initialQuestionId)
        ? initialQuestionId!
        : "",
    ),
    [knowledge, setKnowledge] = useState<KnowledgeSnapshot | null>(null),
    [task, setTask] = useState<Task | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      initialQuestionId &&
        !initial.questions.some((q) => q.id === initialQuestionId)
        ? "所选融资问题不存在或已归档，请重新选择有效问题。"
        : "",
    );
  const lock = useRef(false),
    key = useRef("");
  useEffect(() => {
    if (!taskId) return;
    request(endpoint + "?view=task&id=" + encodeURIComponent(taskId))
      .then(setTask)
      .catch((e) => setMessage(e.message));
  }, [taskId]);
  useEffect(() => {
    if (!question) return;
    let stale = false;
    request(
      endpoint + "?view=knowledge&questionId=" + encodeURIComponent(question),
    )
      .then((v) => {
        if (!stale) setKnowledge(v);
      })
      .catch((e) => {
        if (!stale) setMessage(e.message);
      });
    return () => {
      stale = true;
    };
  }, [question]);
  useEffect(() => {
    if (!task || !["QUEUED", "RUNNING"].includes(task.status)) return;
    const id = task.id;
    const timer = setInterval(() => {
      request(endpoint + "?view=task&id=" + id)
        .then(setTask)
        .catch((e) => setMessage(e.message));
    }, 2000);
    return () => clearInterval(timer);
  }, [task]);
  const [chargeTask, setChargeTask] = useState<string | null>(null);
  const confirmCharge = !!task && chargeTask === task.id;
  async function action(value: string) {
    if (!task || lock.current) return;
    if (
      ["retry", "regenerate"].includes(value) &&
      task.attempts > 0 &&
      !confirmCharge
    ) {
      setMessage("请先核对网关用量与任务状态，勾选可能产生额外费用的确认。");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const result = await request(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          action: value,
          confirmPotentialCharge: confirmCharge,
        }),
      });
      setTask(
        await request(
          endpoint +
            "?view=task&id=" +
            (value === "regenerate" ? result.id : task.id),
        ),
      );
      setMessage(value === "retry" ? "任务已重新排队。" : "操作成功。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败。");
    } finally {
      lock.current = false;
      setBusy(false);
      setChargeTask(null);
    }
  }
  return (
    <>
      <h1>AI 内容创作工作台</h1>
      <p>
        生成内容只保存为草稿。须由另一位授权审核人核验，再由发布人发布。请勿输入任何客户个人资料。
      </p>
      <ModelConnection
        initial={options.modelStatus}
        canManage={options.canManage}
      />
      {!options.configuration.available && (
        <aside className="admin-panel" role="status">
          <h2>尚未配置模型服务</h2>
          <ul>
            {options.configuration.missing.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p>可以检索与整理知识；不会模拟生成成功或创建虚假文章。</p>
        </aside>
      )}
      {!options.workerOnline && (
        <p role="status">
          内容生成执行器尚未在线。配置模型后，还需启动独立执行器处理任务。
        </p>
      )}
      <div className="generation-grid">
        <section className="admin-panel">
          <h2>选题与写作设置</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                setOptions(
                  await request(
                    endpoint +
                      "?q=" +
                      encodeURIComponent(String(f.get("q") || "")),
                  ),
                );
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "搜索失败。");
              }
            }}
          >
            <label>
              搜索融资问题
              <input name="q" maxLength={100} />
            </label>
            <button className="button outline">搜索</button>
          </form>
          <form
            className="account-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setMessage("");
              const f = new FormData(e.currentTarget);
              try {
                const template = options.templates.find(
                  (t) => t.id === f.get("template"),
                );
                if (!template) throw Error("请选择有效模板。");
                if (!key.current) key.current = crypto.randomUUID();
                const result = await request(endpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    questionId: question,
                    templateId: template.id,
                    templateVersion: template.version,
                    articleType: f.get("articleType"),
                    audience: f.get("audience"),
                    depth: f.get("depth"),
                    supplement: f.get("supplement") || "",
                    idempotencyKey: key.current,
                    approvedNonSensitive:
                      f.get("approvedNonSensitive") === "on",
                  }),
                });
                setTask(result);
                key.current = "";
                setMessage("任务已保存，等待执行器处理。");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "生成失败。");
                key.current = "";
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <fieldset
              disabled={busy}
              onChange={() => {
                key.current = "";
              }}
            >
              <label>
                融资问题
                <select
                  required
                  value={question}
                  onChange={(e) => {
                    setQuestion(e.target.value);
                    setKnowledge(null);
                  }}
                >
                  <option value="">请选择问题</option>
                  {options.questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.question}
                    </option>
                  ))}
                </select>
              </label>
              {(() => {
                const q = options.questions.find((q) => q.id === question);
                return (
                  q && (
                    <p>
                      {q.category} · {intents[q.intent as keyof typeof intents]}{" "}
                      ·{" "}
                      {
                        questionStatuses[
                          q.status as keyof typeof questionStatuses
                        ]
                      }
                      <br />
                      关键词：{q.keywords.join("、") || "未设置"}
                    </p>
                  )
                );
              })()}
              <label>
                文章类型
                <select name="articleType" defaultValue="KNOWLEDGE">
                  {Object.entries(articleTypes).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                写作模板
                <select name="template" required>
                  {options.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}（版本{t.version}）
                    </option>
                  ))}
                </select>
              </label>
              <label>
                目标读者
                <input
                  name="audience"
                  required
                  maxLength={120}
                  defaultValue="上海企业经营者与财务负责人"
                />
              </label>
              <label>
                文章深度
                <select name="depth" defaultValue="STANDARD">
                  {Object.entries(depths).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                人工补充资料
                <textarea
                  name="supplement"
                  maxLength={4000}
                  rows={5}
                  placeholder="仅填写已获授权的非敏感资料；补充内容不等于已核验事实。"
                />
              </label>
              <label className="geo-check">
                <input name="approvedNonSensitive" type="checkbox" required />
                我确认输入内容不含个人或客户敏感资料，并同意在管理员批准的模型服务中处理这些知识材料。
              </label>
              <button
                className="button gold"
                disabled={
                  !options.configuration.available ||
                  !question ||
                  !knowledge ||
                  busy ||
                  (!!task && ["QUEUED", "RUNNING"].includes(task.status))
                }
              >
                {busy ? "提交中…" : "生成文章草稿"}
              </button>
            </fieldset>
          </form>
          {knowledge && (
            <div>
              <h3>知识依据</h3>
              {knowledge.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              <h4>已审核问答（{knowledge.faqs.length}）</h4>
              <ul>
                {knowledge.faqs.map((f) => (
                  <li key={f.id}>
                    {f.question}（
                    {f.evidenceKind === "PROFESSIONAL_REVIEW"
                      ? "专业人工判断，无外部来源"
                      : "已核验公开来源"}
                    ）
                  </li>
                ))}
              </ul>
              <h4>相似原始问题</h4>
              <ul>
                {knowledge.similarQuestions.map((q) => (
                  <li key={q.id}>{q.question}（仅作选题）</li>
                ))}
              </ul>
              <h4>已发布文章</h4>
              <ul>
                {knowledge.articles.map((a) => (
                  <li key={a.id}>
                    {a.title}（{a.verified ? "有审核记录" : "历史背景，未核验"}
                    ）
                  </li>
                ))}
              </ul>
              <h4>人工核验参考资料</h4>
              <ul>
                {knowledge.references.map((s) => (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>{" "}
                    · 核验时间：
                    {new Date(s.verifiedAt).toLocaleDateString("zh-CN")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="admin-panel">
          <h2>生成结果</h2>
          <p role="status">{message}</p>
          {task ? (
            <>
              <p>
                任务状态：{generationStatuses[task.status]} · 已执行
                {task.attempts}次
              </p>
              {task.errorMessage && <p role="alert">{task.errorMessage}</p>}
              {!["QUEUED", "RUNNING"].includes(task.status) &&
                task.attempts > 0 && (
                  <label className="geo-check">
                    <input
                      type="checkbox"
                      checked={confirmCharge}
                      onChange={(e) =>
                        setChargeTask(e.target.checked ? task.id : null)
                      }
                    />
                    我已核对任务与网关用量，确认重试或重新生成可能产生额外Token费用（网关可能不支持幂等计费）
                  </label>
                )}
              {["QUEUED", "RUNNING"].includes(task.status) && (
                <button
                  disabled={busy}
                  className="button outline"
                  onClick={() => void action("cancel")}
                >
                  取消任务
                </button>
              )}
              {["FAILED", "CANCELLED"].includes(task.status) && (
                <button
                  disabled={busy}
                  className="button outline"
                  onClick={() => void action("retry")}
                >
                  重试任务
                </button>
              )}
              {task.outputArticleId && (
                <p>
                  <Link
                    href={"/admin/geo/articles/" + task.outputArticleId + "/"}
                  >
                    打开已保存草稿，继续编辑与审核 →
                  </Link>
                </p>
              )}
              {!["QUEUED", "RUNNING"].includes(task.status) && (
                <button
                  type="button"
                  className="button outline"
                  disabled={busy || !options.configuration.available}
                  onClick={() => void action("regenerate")}
                >
                  重新生成新草稿
                </button>
              )}
              {task.output?.markdown && (
                <>
                  <h3>{task.output.title}</h3>
                  <SafeMarkdown content={task.output.markdown} />
                  <h3>待人工核实</h3>
                  <ul>
                    {task.output.verificationItems?.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </>
              )}
              <p>
                用量：
                {task.tokenUsage
                  ? `输入 ${task.tokenUsage.input ?? "未返回"}、输出 ${task.tokenUsage.output ?? "未返回"}、合计 ${task.tokenUsage.total ?? "未返回"} 个词元`
                  : "尚无可用记录"}
                。估算成本：
                {task.callLogs?.some((l) => l.estimatedCostUsd != null)
                  ? "$" +
                    task.callLogs
                      .reduce((n, l) => n + Number(l.estimatedCostUsd || 0), 0)
                      .toFixed(6)
                  : "未提供价格或用量，不作估算"}
                。
              </p>
            </>
          ) : (
            <p>
              选题后可先检查知识依据。生成成功会自动、原子地保存到现有文章草稿库。
            </p>
          )}
        </section>
      </div>
    </>
  );
}
export function ArticleGenerationCheck({
  metadata,
  findings,
  articleId,
  revision,
}: {
  metadata: {
    model?: string;
    templateVersion?: number;
    verificationItems?: string[];
    knowledgeWarnings?: string[];
  };
  findings: Finding[];
  articleId?: string;
  revision?: number;
}) {
  const router = useRouter();
  const session = useContentEditingSession();
  return (
    <aside className="admin-panel">
      <h2>生成溯源与事实核验</h2>
      {!articleId && (
        <button
          type="button"
          className="button outline"
          disabled={session?.busy || session?.dirty}
          onClick={() => router.refresh()}
        >
          重新执行事实核验（已保存版本）
        </button>
      )}
      {session?.dirty && <p>请先保存草稿，再核验当前内容。</p>}
      <p>
        模型：{metadata.model} · 模板版本：{metadata.templateVersion}
        。规则检查仅作辅助，不能替代独立人工审核。
      </p>
      {metadata.knowledgeWarnings?.map((w, i) => (
        <p key={i}>生成时的知识提示（历史快照）：{w}</p>
      ))}
      {articleId && revision !== undefined ? (
        <ArticleFactCheck
          articleId={articleId}
          revision={revision}
          initial={findings}
        />
      ) : (
        <ul>
          {findings.map((f, i) => (
            <li key={i}>
              {severityNames[f.severity]}：{f.message}
              {f.excerpt && <blockquote>{f.excerpt}</blockquote>}
            </li>
          ))}
        </ul>
      )}
      <h3>生成时待核实事项（历史快照，当前阻塞以本次规则结果为准）</h3>
      <ul>
        {metadata.verificationItems?.map((v, i) => (
          <li key={i}>{v}</li>
        ))}
      </ul>
    </aside>
  );
}
