"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { roleNames } from "@/lib/auth/permissions";
type Department = { id: string; name: string; isActive: boolean };
type User = {
  id: string;
  name: string;
  email: string;
  role: keyof typeof roleNames;
  departmentId: string | null;
  isActive: boolean;
};
export function ActionForm({
  endpoint,
  method = "POST",
  children,
  transform,
  button = "保存",
  redirect = false,
}: {
  endpoint: string;
  method?: string;
  children: React.ReactNode;
  transform?: (data: FormData) => unknown;
  button?: string;
  redirect?: boolean;
}) {
  const router = useRouter(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [credential, setCredential] = useState("");
  return (
    <form
      className="admin-panel account-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setMessage("");
        setCredential("");
        const form = e.currentTarget,
          data = new FormData(form);
        try {
          const response = await fetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              transform ? transform(data) : Object.fromEntries(data),
            ),
          });
          const r = await response.json();
          if (!response.ok || !r.ok) {
            setMessage(r.error?.message || "操作失败，请重试。");
            return;
          }
          setMessage("操作成功。");
          if (r.data.initialPassword) setCredential(r.data.initialPassword);
          form
            .querySelectorAll<HTMLInputElement>('input[type="password"]')
            .forEach((i) => (i.value = ""));
          if (redirect) {
            router.replace(r.data.redirect);
            router.refresh();
          } else router.refresh();
        } catch {
          setMessage("连接失败，请重试。");
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        {children}
        <button className="button gold" disabled={busy}>
          {busy ? "处理中…" : button}
        </button>
      </fieldset>
      <p role="status">{message}</p>
      {credential && (
        <div className="credential" role="alert">
          <b>仅限本地虚构测试账号初始化</b>
          <p>
            新凭据仅本次展示，15分钟有效。请通过安全渠道交付，首次登录必须改密。不要截图、写入报告或普通日志。
          </p>
          <code>{credential}</code>
          <button
            type="button"
            className="button outline"
            onClick={() => setCredential("")}
          >
            关闭并清除凭据
          </button>
        </div>
      )}
    </form>
  );
}
export function Reauth() {
  return (
    <label>
      验证当前管理员密码
      <input
        name="reauthPassword"
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
      />
    </label>
  );
}
export function ReviewerGrantForm({ user }: { user: User }) {
  return (
    <ActionForm
      endpoint={`/api/admin/users/${user.id}/`}
      method="PATCH"
      button="确认授予内容审核权限"
      transform={(data) => ({
        name: user.name,
        email: user.email,
        role: "CONTENT_REVIEWER",
        departmentId: user.departmentId,
        isActive: user.isActive,
        reauthPassword: data.get("reauthPassword"),
      })}
    >
      <p>当前角色：{roleNames[user.role]} → 授权后：独立内容审核员。</p>
      <p>
        仅授予内容查看和审核，不含发布、员工管理或客户信息访问。此操作切换岗位角色，不叠加原岗位权限；原线索不会删除，请按需要先重新分配。
      </p>
      <p>
        保留现有密码、账号启用状态和部门；已完成首次改密的账号无需再次改密。旧会话将失效，需要以原密码重新登录。
      </p>
      <label className="geo-check">
        <input type="checkbox" required />
        我确认该员工应担任独立审核岗位，并了解原岗位权限将被替换。
      </label>
      <Reauth />
    </ActionForm>
  );
}
export function PasswordForm() {
  return (
    <ActionForm
      endpoint="/api/admin/profile/"
      method="PATCH"
      button="修改密码并重新登录"
      redirect
    >
      <label>
        原密码
        <input
          name="oldPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </label>
      <label>
        新密码
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
      </label>
      <label>
        确认新密码
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
      </label>
      <p>至少12位，包含字母及非字母，避免常见弱密码。成功后所有会话失效。</p>
    </ActionForm>
  );
}
export function UserForm({
  user,
  initialRole,
  departments,
}: {
  user?: User;
  initialRole?: keyof typeof roleNames;
  departments: Department[];
}) {
  return (
    <ActionForm
      endpoint={user ? `/api/admin/users/${user.id}/` : "/api/admin/users/"}
      method={user ? "PATCH" : "POST"}
      button={user ? "保存员工资料" : "创建员工"}
      transform={(d) => ({
        ...Object.fromEntries(d),
        departmentId: d.get("departmentId") || null,
        isActive: d.get("isActive") === "true",
      })}
    >
      <label>
        员工姓名
        <input name="name" defaultValue={user?.name} maxLength={80} required />
      </label>
      <label>
        登录邮箱
        <input
          name="email"
          type="email"
          autoComplete="off"
          defaultValue={user?.email}
          maxLength={254}
          required
        />
      </label>
      <label>
        角色
        <select
          name="role"
          defaultValue={user?.role || initialRole || "FINANCING_ADVISOR"}
        >
          {Object.entries(roleNames).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        部门
        <select name="departmentId" defaultValue={user?.departmentId || ""}>
          <option value="">无部门（主管、顾问必须选择）</option>
          {departments
            .filter((d) => d.isActive || d.id === user?.departmentId)
            .map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
                {d.isActive ? "" : "（已停用）"}
              </option>
            ))}
        </select>
      </label>
      <label>
        状态
        <select
          name="isActive"
          defaultValue={user?.isActive === false ? "false" : "true"}
        >
          <option value="true">启用</option>
          <option value="false">停用</option>
        </select>
      </label>
      <Reauth />
      <p>
        停用保留业务记录；更改部门前需重新分配其线索。新增或重置凭据仅支持本地测试。
      </p>
    </ActionForm>
  );
}
export function ResetPasswordForm({ id }: { id: string }) {
  return (
    <ActionForm
      endpoint={`/api/admin/users/${id}/reset-password/`}
      button="生成一次性重置凭据"
    >
      <Reauth />
      <p>立即撤销该员工全部会话，并要求使用短期凭据登录后改密。</p>
    </ActionForm>
  );
}
export function DepartmentForm({ department }: { department?: Department }) {
  return (
    <ActionForm
      endpoint={
        department
          ? `/api/admin/departments/${department.id}/`
          : "/api/admin/departments/"
      }
      method={department ? "PATCH" : "POST"}
      button={department ? "保存部门" : "新增部门"}
      transform={(d) => ({
        ...Object.fromEntries(d),
        isActive: d.get("isActive") === "true",
      })}
    >
      <label>
        部门名称
        <input
          name="name"
          defaultValue={department?.name}
          required
          maxLength={80}
        />
      </label>
      <label>
        状态
        <select
          name="isActive"
          defaultValue={department?.isActive === false ? "false" : "true"}
        >
          <option value="true">启用</option>
          <option value="false">停用</option>
        </select>
      </label>
      <Reauth />
    </ActionForm>
  );
}
export function AssignmentForm({
  id,
  assignedTo,
  users,
  superAdmin,
}: {
  id: string;
  assignedTo: string | null;
  users: { id: string; name: string; department: { name: string } | null }[];
  superAdmin: boolean;
}) {
  return (
    <ActionForm
      endpoint={`/api/admin/leads/${id}/assign/`}
      method="PATCH"
      button="保存线索分配"
      transform={(d) => ({
        ...Object.fromEntries(d),
        assignedTo: d.get("assignedTo") || null,
      })}
    >
      <label>
        分配给员工
        <select
          name="assignedTo"
          defaultValue={assignedTo || ""}
          required={!superAdmin}
        >
          {superAdmin && <option value="">取消分配（仅超级管理员可见）</option>}
          {users.map((u) => (
            <option value={u.id} key={u.id}>
              {u.name} · {u.department?.name}
            </option>
          ))}
        </select>
      </label>
      {superAdmin && <Reauth />}
    </ActionForm>
  );
}
