"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function ReviewAssignment({
  kind,
  id,
  revision,
  policy,
  canAssign,
}: {
  kind: "articles" | "faqs";
  id: string;
  revision: number;
  canAssign: boolean;
  policy: {
    currentActor: {
      id: string;
      roleName: string;
      canReview: boolean;
      canPublish: boolean;
    };
    participantOrigins: {
      authorId: string | null;
      editorId: string | null;
      submittedById: string | null;
      importedById: string | null;
      versionEditorId: string | null;
    };
    qualifiedCount: number;
    reviewerCount: number;
    assigneeId: string | null;
    assigneeName: string | null;
    assignedRevision: number | null;
    assignmentValid: boolean;
    missingSources: string[];
    missingItems: string[];
    candidates: {
      id: string;
      name: string;
      roleName: string;
      departmentName: string;
    }[];
    excludedAccounts: {
      id: string;
      name: string;
      roleName: string;
      departmentName: string;
      reasons: string[];
    }[];
  };
}) {
  const router = useRouter(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="admin-panel">
      <h2>审核人分配 · 版本 {revision}</h2>
      <button
        type="button"
        className="button outline"
        disabled={busy}
        onClick={() => {
          router.refresh();
          setMessage("已请求重新核验，列表以最新账号和版本条件为准。");
        }}
      >
        刷新审核人资格
      </button>
      <p>
        员工完成改密、授权或启用状态变更后，点击刷新重新读取数据库；不会修改该员工密码。
      </p>
      <details>
        <summary>当前账号与版本权限判定（内部标识）</summary>
        <p>
          当前用户：{policy.currentActor.id} · {policy.currentActor.roleName} ·
          审核权限：{policy.currentActor.canReview ? "有" : "无"} · 发布权限：
          {policy.currentActor.canPublish ? "有" : "无"}
        </p>
        <p>
          原始作者：{policy.participantOrigins.authorId || "未记录"}
          ；最后编辑人：{policy.participantOrigins.editorId || "未记录"}
          ；提交人：
          {policy.participantOrigins.submittedById || "历史导入未单独记录"}
          ；原导入人：{policy.participantOrigins.importedById || "未记录"}
          ；本版本快照编辑人：
          {policy.participantOrigins.versionEditorId || "未记录"}。
        </p>
      </details>
      <p>
        当前审核人：
        {policy.assigneeName ||
          (policy.assigneeId
            ? "账号已失效或未完成初始化"
            : "未分配，合格独立审核人可直接审核")}
        {policy.assignedRevision !== null &&
          " · 分配版本 " + policy.assignedRevision}
      </p>
      <p>
        具备审核权限的有效账号：{policy.reviewerCount}{" "}
        位；未参与此版本的合格账号：{policy.qualifiedCount} 位。
      </p>
      {!policy.qualifiedCount && (
        <aside role="status">
          <p>
            审核受阻：没有合格的独立审核人。不能通过修改作者、导入来源或直接改状态解除限制。
          </p>
          {canAssign ? (
            <>
              <Link href="/admin/settings/users/new/?role=CONTENT_REVIEWER">
                按正式权限流程新增独立审核员 →
              </Link>
              <p>
                也可在<Link href="/admin/settings/users/">员工管理</Link>
                中正式授权另一位人员。需验证管理员密码，授权写入审计，原作者和审计历史不变。
              </p>
            </>
          ) : (
            <p>请联系超级管理员安排独立审核人员。</p>
          )}
        </aside>
      )}
      {policy.assigneeId && !policy.assignmentValid && (
        <p role="alert">当前分配已失效，请管理员按本版本重新选择合格审核人。</p>
      )}
      {canAssign && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setMessage("");
            const f = new FormData(e.currentTarget);
            try {
              const r = await fetch(
                `/api/admin/geo/${kind}/${id}/review-assignment/`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    revision,
                    assigneeId: f.get("assigneeId") || null,
                  }),
                },
              );
              const j = await r.json();
              if (!r.ok || !j.ok) throw Error(j.error?.message || "分配失败。");
              setMessage("审核人分配已保存并记录审计。");
              router.refresh();
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "连接失败。");
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              分配合格独立审核人
              <select
                name="assigneeId"
                defaultValue={
                  policy.assignmentValid ? policy.assigneeId || "" : ""
                }
              >
                <option value="">不指定 / 解除现有分配</option>
                {policy.candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}（{u.roleName} · {u.departmentName}）
                  </option>
                ))}
              </select>
            </label>
            <button className="button outline">
              {busy ? "保存中…" : "保存审核人分配"}
            </button>
          </fieldset>
          <p role="status">{message}</p>
        </form>
      )}
      {canAssign && (
        <details open={!policy.qualifiedCount}>
          <summary>
            其他员工为何未进入候选列表（{policy.excludedAccounts.length}位）
          </summary>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>员工</th>
                  <th>角色</th>
                  <th>部门</th>
                  <th>具体原因</th>
                  <th>处理入口</th>
                </tr>
              </thead>
              <tbody>
                {policy.excludedAccounts.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.roleName}</td>
                    <td>{u.departmentName}</td>
                    <td>{u.reasons.join("；")}</td>
                    <td>
                      <Link
                        href={`/admin/settings/users/${u.id}/#review-permission`}
                      >
                        查看账号与审核授权
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p>
        分配只适用于当前固定版本；修改、撤回或驳回生成新版本后会失效，必须重新分配。分配不等于审核通过，也不会自动发布。
      </p>
      <p>新审核账号须先完成首次改密，之后才会出现在合格审核人选项中。</p>
      <h3>{kind === "faqs" ? "审核前内容检查" : "审核前引用检查"}</h3>
      {policy.missingItems.length ? (
        <ul>
          {policy.missingItems.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : (
        <p>
          {kind === "faqs"
            ? "FAQ按风险分级核验。基础知识无需外部网址；一般实操说明判断依据，具体主张须对应证据。"
            : "引用格式和日期检查通过，仍需审核人逐项核验真实内容。"}
        </p>
      )}
      <p>
        来源格式有效不等于内容可靠。审核人须人工确认来源支持正文，核实利率、政策、承诺、隐私及金融宣传要求。
      </p>
      <p>
        当前为锁定的待审核版本；需补充来源时，请作者先
        <a href="#content-workflow">撤回审核</a>
        ，再到引用来源填写区补充、保存并重新提交。旧分配不能用于新版本。
      </p>
    </section>
  );
}
