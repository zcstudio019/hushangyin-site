"use client";
import { useRef, useState } from "react";
export type ModelStatus = {
  providerName: string;
  model: string;
  baseUrl: string;
  endpoint: string;
  keyConfigured: boolean;
  reasoningEffort: string;
  missing: string[];
  latest: {
    at: string;
    result: {
      connected: boolean;
      message: string;
      code: string;
      elapsedMs: number;
      usage?: {
        input: number | null;
        output: number | null;
        total: number | null;
      };
      estimatedCostUsd?: number | null;
    };
  } | null;
};
export function ModelConnection({
  initial,
  canManage,
}: {
  initial: ModelStatus;
  canManage: boolean;
}) {
  const [state, setState] = useState(initial),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function test() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 35000);
    try {
      const r = await fetch("/api/admin/geo/generation/connection/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedCost: confirmed }),
        signal: controller.signal,
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setError(
          j?.error?.message || "本地连接测试接口未返回有效结果，请刷新后核对。",
        );
        return;
      }
      setState({ ...state, latest: j.data });
    } catch {
      setError(
        controller.signal.aborted
          ? "测试请求超时，请刷新核对最近结果，勿立即重复调用。"
          : "无法连接本地模型测试服务，请恢复网络后刷新核对结果。",
      );
    } finally {
      clearTimeout(timer);
      lock.current = false;
      setBusy(false);
      setConfirmed(false);
    }
  }
  return (
    <section className="admin-panel" id="model-connection">
      <h2>模型连接状态</h2>
      <p role="status">
        当前状态：
        {!state.keyConfigured
          ? "未配置"
          : state.missing.length
            ? "连接失败"
            : state.latest
              ? state.latest.result.connected
                ? "连接成功"
                : "连接失败"
              : "可测试"}
        {state.latest && "（最近一次测试结果）"}
      </p>
      <p>模型密钥由服务器配置文件管理，页面不会读取或展示密钥。</p>
      <p>
        服务商：{state.providerName} · 模型：{state.model || "尚未配置"} ·
        推理强度：{state.reasoningEffort}
      </p>
      <p>API地址：{state.endpoint || "尚未配置有效地址"}</p>
      <p>
        密钥：
        {state.keyConfigured ? "已配置（仅服务端保存）" : "尚未配置 API 密钥"}
      </p>
      {state.latest ? (
        <p role="status">
          最近测试：{new Date(state.latest.at).toLocaleString("zh-CN")} ·{" "}
          {state.latest.result.message} · 耗时{state.latest.result.elapsedMs}ms
          {state.latest.result.usage &&
            ` · 输入${state.latest.result.usage.input ?? "未知"}、输出${state.latest.result.usage.output ?? "未知"}词元`}
          {state.latest.result.estimatedCostUsd != null &&
            ` · 估算$${state.latest.result.estimatedCostUsd}`}
        </p>
      ) : (
        <p>最近测试：尚未执行。填写密钥后须实际测试，不代表已连接。</p>
      )}
      {canManage ? (
        <>
          <p>
            测试会向当前第三方网关发送一条固定连接检查指令，可能产生实际Token费用；不发送问题库、FAQ或客户资料，不会自动重试。
          </p>
          <label className="geo-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={busy}
            />
            我了解可能产生费用，确认执行一次连接测试
          </label>
          <button
            type="button"
            className="button outline"
            onClick={test}
            disabled={busy || !confirmed}
          >
            {busy ? "正在测试模型连接…" : "测试模型连接"}
          </button>
        </>
      ) : (
        <p>仅具有生成管理权限的人员可以测试连接，请联系超级管理员。</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
