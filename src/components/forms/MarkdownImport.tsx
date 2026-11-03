"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IMPORT_MAX_BYTES,
  categories,
  intents,
  statusName,
} from "@/features/geo/config";
import type {
  ImportKind,
  ImportFormat,
  ImportReport,
} from "@/features/geo/import-parser";
import { SafeMarkdown } from "@/components/content/SafeMarkdown";
const examples = {
  questions:
    "## Q001｜如何整理融资申请资料？\n- 分类：融资规划\n- 关键词：申请资料、融资规划\n- 搜索意图：申请准备型\n- 优先级：3\n- 状态：待规划\n- 来源：内部选题整理",
  faqs: "## F001｜如何阅读这份问答？\n- 分类：融资规划\n- 状态：待审核\n\n### 答案\n\n请在这里填写需要人工核验的答案，保留必要的段落、列表和引用。",
};
export function MarkdownImport({
  kind,
  format = "markdown",
}: {
  kind: ImportKind;
  format?: ImportFormat;
}) {
  const router = useRouter(),
    lock = useRef(false);
  const [mode, setMode] = useState<"file" | "paste">("file"),
    [fileText, setFileText] = useState(""),
    [pasteText, setPasteText] = useState(""),
    [fileName, setFileName] = useState(""),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState<ImportReport | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [completed, setCompleted] = useState(false);
  const input = format === "markdown" ? "Markdown" : "CSV",
    label = kind === "questions" ? "融资问题" : "常见问答",
    text = mode === "file" ? fileText : pasteText;
  const reset = () => {
    setReport(null);
    setConfirmed(false);
    setMessage("");
    setCompleted(false);
  };
  async function run(step: "preview" | "commit") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/admin/geo/${kind}/import/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          text,
          mode: step,
          ...(step === "commit"
            ? { confirmationToken: report?.confirmationToken, confirmed }
            : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        if (j.error?.details) setReport(j.error.details);
        else setReport(null);
        setConfirmed(false);
        setMessage(j.error?.message || "操作失败，请重新预览后重试。");
        return;
      }
      setReport(j.data);
      setConfirmed(false);
      if (step === "commit") {
        setCompleted(true);
        setMessage(
          `导入完成：成功${j.data.successCount}条，跳过${j.data.skippedCount}条，失败${j.data.failedCount}条。`,
        );
        router.refresh();
      } else {
        setCompleted(false);
        setMessage(
          j.data.valid
            ? "校验通过，请核对拟新增清单后勾选确认。"
            : "存在格式或内容错误，请修正后重新预览。",
        );
      }
    } catch {
      setConfirmed(false);
      setReport(null);
      setMessage("连接失败，当前未确认是否保存，请刷新列表核对后重试。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      className="admin-panel geo-import"
      data-testid={`${kind}-${format}-import`}
    >
      <summary>
        {input}导入（最多100条{label}）
      </summary>
      <h2>导入格式说明</h2>
      <p>
        可选择一个文件或直接粘贴内容，单次最多100条、1MB。先解析预览，确认后才保存。重复问题默认跳过，不覆盖现有答案、分类或来源。
      </p>
      <p>
        <a
          className="button outline"
          download
          href={`/templates/geo-${kind}.${format === "markdown" ? "md" : "csv"}`}
        >
          下载{input}模板
        </a>
      </p>
      {format === "markdown" ? (
        <pre className="geo-import-example">{examples[kind]}</pre>
      ) : (
        <p>
          请使用模板中的“融资问题、问题分类、关键词、搜索意图、优先级、问题状态”六列。关键词用顿号分隔；包含逗号的单元格请用双引号包裹。已有英文模板也可继续使用。
        </p>
      )}
      <p>可用分类：{categories.join("、")}。</p>
      {kind === "questions" ? (
        <p>
          搜索意图：{Object.values(intents).join("、")}
          。默认优先级为3、意图为认知型、状态为待规划。已解答问题需先在编辑页关联文章。
        </p>
      ) : (
        <p>
          问答默认待审核，也可指定草稿；任何已发布或已审核状态都会安全转为草稿。导入不等于人工核验；需要补充引用时，请撤回审核后编辑，再重新提交。
        </p>
      )}
      <p>
        文档标题和字段说明不作为记录；原文编号仅用于定位，不作为数据库编号。来源和编号会保留在导入信息中。问答答案可保留安全的Markdown段落、列表、标题与表格，不支持脚本或原始HTML。
      </p>
      <fieldset disabled={busy} className="geo-import-input">
        <legend>输入方式（择一）</legend>
        <label className="geo-check">
          <input
            type="radio"
            name={`${kind}-${format}-input`}
            checked={mode === "file"}
            onChange={() => {
              setMode("file");
              reset();
            }}
          />
          选择文件
        </label>
        <label className="geo-check">
          <input
            type="radio"
            name={`${kind}-${format}-input`}
            checked={mode === "paste"}
            onChange={() => {
              setMode("paste");
              reset();
            }}
          />
          粘贴文本
        </label>
        {mode === "file" ? (
          <label>
            选择{input}文件
            <input
              type="file"
              accept={
                format === "markdown" ? ".md,text/markdown" : ".csv,text/csv"
              }
              onChange={async (e) => {
                reset();
                setFileText("");
                setFileName("");
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > IMPORT_MAX_BYTES) {
                  setMessage("文件超过1MB，请拆分后再选择。");
                  return;
                }
                const extension = format === "markdown" ? ".md" : ".csv";
                if (!f.name.toLowerCase().endsWith(extension)) {
                  setMessage(`请选择${extension}格式的文件。`);
                  return;
                }
                lock.current = true;
                setBusy(true);
                try {
                  const decoded = new TextDecoder("utf-8", {
                    fatal: true,
                  }).decode(await f.arrayBuffer());
                  setFileText(decoded);
                  setFileName(f.name);
                } catch {
                  setMessage("文件编码无法识别，请另存为UTF-8编码后重试。");
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            />
            {fileName && <span>已选择：{fileName}</span>}
          </label>
        ) : (
          <label>
            {input}内容
            <textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                reset();
              }}
              maxLength={IMPORT_MAX_BYTES}
              rows={12}
            />
          </label>
        )}
        <button
          type="button"
          className="button gold"
          disabled={busy || !text.trim()}
          onClick={() => void run("preview")}
        >
          {busy ? "正在处理…" : "解析与预览"}
        </button>
      </fieldset>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {report && (
        <section aria-label="导入预览结果">
          <h3>导入预览</h3>
          <p>
            识别{report.total}条 · 有效{report.validCount}条 · 重复
            {report.duplicateCount}条 · 拟新增{report.newCount}条 · 错误
            {report.failedCount}项
          </p>
          {report.errors.length > 0 && (
            <ul role="alert">
              {report.errors.map((err, i) => (
                <li key={i}>
                  第{err.line}行：{err.message}
                </li>
              ))}
            </ul>
          )}
          <div className="admin-table-wrap">
            <table className="admin-table geo-import-table">
              <thead>
                <tr>
                  {[
                    "编号 / 行号",
                    "融资问题",
                    "问题分类",
                    "状态",
                    "拟处理",
                    "提示",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.number}>
                    <td>
                      {row.label}
                      <br />第{row.line}行
                    </td>
                    <td>
                      {row.question || "（缺少问题）"}
                      {kind === "faqs" &&
                        row.answer &&
                        row.disposition !== "invalid" && (
                          <details>
                            <summary>预览答案</summary>
                            <SafeMarkdown content={row.answer} />
                          </details>
                        )}
                      {row.source && <p>来源：{row.source}</p>}
                      {row.keywords && (
                        <p>关键词：{row.keywords.join("、") || "未填写"}</p>
                      )}
                      {row.intent && (
                        <p>
                          搜索意图：
                          {intents[row.intent as keyof typeof intents] ||
                            "待修正"}
                          ；优先级：{row.priority}
                        </p>
                      )}
                    </td>
                    <td>{row.category || "待补充"}</td>
                    <td>{statusName(kind, row.status)}</td>
                    <td>
                      {row.disposition === "new"
                        ? "拟新增"
                        : row.disposition === "duplicate"
                          ? "跳过重复"
                          : "需要修正"}
                    </td>
                    <td>
                      {row.errors.map((err, i) => (
                        <p key={i}>
                          第{err.line}行：{err.message}
                        </p>
                      ))}
                      {row.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!completed && (
            <>
              <label className="geo-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!report.valid || busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                我确认预览无误，仅新增记录；重复项跳过，不覆盖现有内容。
              </label>
              <button
                type="button"
                className="button gold"
                disabled={
                  busy ||
                  !report.valid ||
                  !confirmed ||
                  !report.confirmationToken
                }
                onClick={() => void run("commit")}
              >
                确认导入
              </button>
            </>
          )}
        </section>
      )}
    </details>
  );
}
