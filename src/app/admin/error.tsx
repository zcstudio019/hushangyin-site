"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>后台服务暂不可用</h1>
      <p>请稍后重试或联系系统管理员检查服务配置。</p>
      <button className="button gold" onClick={reset}>
        重试
      </button>
    </main>
  );
}
