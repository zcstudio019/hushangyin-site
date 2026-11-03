"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { leadStatuses, leadStatusNames } from "@/lib/validations/consultation";
export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const result = await response.json();
      if (response.ok && result.ok) {
        router.push(result.data.redirect);
        router.refresh();
      } else setMessage(result.error?.message || "登录失败。");
    } catch {
      setMessage("连接失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="admin-panel">
      <label>
        登录邮箱
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
        />
      </label>
      <label>
        密码
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </label>
      <button className="button gold" disabled={busy}>
        {busy ? "正在登录…" : "登录"}
      </button>
      <p className="error-message" role="status">
        {message}
      </p>
    </form>
  );
}
export function LogoutButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        className="button navy"
        onClick={async () => {
          try {
            const response = await fetch("/api/admin/logout/", {
              method: "POST",
            });
            if (response.ok || response.status === 401) {
              router.push("/admin/login/");
              router.refresh();
            } else setMessage("登出失败，请重试。");
          } catch {
            setMessage("连接失败。");
          }
        }}
      >
        登出
      </button>
      <span role="status">{message}</span>
    </>
  );
}
export function StatusForm({
  id,
  status,
}: {
  id: string;
  status: (typeof leadStatuses)[number];
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/leads/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: data.get("status") }),
      });
      const result = await response.json();
      setMessage(
        result.ok ? "状态已更新。" : result.error?.message || "更新失败。",
      );
      if (result.ok) router.refresh();
    } catch {
      setMessage("连接失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="admin-panel">
      <label>
        线索状态
        <select name="status" defaultValue={status}>
          {leadStatuses.map((value) => (
            <option key={value} value={value}>
              {leadStatusNames[value]}
            </option>
          ))}
        </select>
      </label>
      <button className="button gold" disabled={busy}>
        保存状态
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
