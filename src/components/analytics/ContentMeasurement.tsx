"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { analyticsPolicy } from "@/features/analytics/config";
import { utmSchema } from "@/features/analytics/validation";
const storageKey = "hsy-optional-analytics";
type Choice = {
  choice: "accepted" | "declined";
  expiresAt: number;
  token?: string;
};
function readChoice(): Choice | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const c = JSON.parse(raw) as Choice;
    return c.expiresAt > Date.now() &&
      ["accepted", "declined"].includes(c.choice)
      ? c
      : null;
  } catch {
    return null;
  }
}
export function ContentMeasurement({
  kind,
  id,
  enabled,
}: {
  kind: "ARTICLE" | "FAQ";
  id: string;
  enabled: boolean;
}) {
  const [choice, setChoice] = useState<Choice | null>(null),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    pvId = useRef<string | null>(null),
    lastToken = useRef<string | null>(null),
    clickLock = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setChoice(readChoice());
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function context() {
    const q = new URLSearchParams(location.search),
      data: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
      const v = q.get(key);
      if (v) data[key] = v;
    }
    const parsed = utmSchema.safeParse(data);
    let referrerHost = "";
    try {
      const u = new URL(document.referrer);
      if (u.origin !== location.origin) referrerHost = u.hostname;
    } catch {}
    return { kind, id, utm: parsed.success ? parsed.data : {}, referrerHost };
  }
  useEffect(() => {
    if (
      !enabled ||
      choice?.choice !== "accepted" ||
      !choice.token ||
      choice.expiresAt <= Date.now()
    )
      return;
    const visitKey = choice.token + ":" + kind + ":" + id;
    if (lastToken.current !== visitKey) {
      lastToken.current = visitKey;
      pvId.current = crypto.randomUUID();
      void fetch("/api/analytics/events/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...context(),
          analyticsToken: choice.token,
          eventId: pvId.current,
          type: "PV",
        }),
        keepalive: true,
      })
        .then((r) => {
          if (!r.ok) setMessage("本次可选访问统计未记录，不影响阅读或咨询。");
        })
        .catch(() => setMessage("可选统计连接失败，不影响阅读或咨询。"));
    }
    const timer = setTimeout(
      () => {
        setChoice(null);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
      },
      Math.max(0, choice.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, enabled, kind, id]);
  useEffect(() => {
    async function click(event: MouseEvent) {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        clickLock.current
      )
        return;
      const link = (event.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!link || link.target === "_blank") return;
      const dest = new URL(link.href, location.href);
      if (dest.origin !== location.origin || dest.pathname !== "/contact/")
        return;
      event.preventDefault();
      clickLock.current = true;
      try {
        const c = readChoice();
        const response = await fetch("/api/analytics/context/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...context(),
            ...(enabled && c?.choice === "accepted" && c.token
              ? { analyticsToken: c.token, eventId: crypto.randomUUID() }
              : {}),
          }),
          signal: AbortSignal.timeout(8000),
        });
        const j = await response.json();
        location.assign(
          response.ok && j.ok && typeof j.data.href === "string"
            ? j.data.href
            : dest.pathname + dest.search,
        );
      } catch {
        location.assign(dest.pathname + dest.search);
      }
    }
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, enabled]);
  async function accept() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/analytics/session/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, policyVersion: analyticsPolicy }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw Error();
      const c: Choice = {
        choice: "accepted",
        expiresAt: j.data.expiresAt,
        token: j.data.token,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(c));
      setChoice(c);
      setMessage("已同意本次窗口的匿名分析，可随时停止。");
    } catch {
      setMessage("未能启用可选分析，保持不采集；咨询照常可用。");
    } finally {
      setBusy(false);
    }
  }
  function decline() {
    const c: Choice = {
      choice: "declined",
      expiresAt: Date.now() + 30 * 60000,
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(c));
    } catch {}
    setChoice(c);
    setMessage(
      "已停止可选分析；已计入的去标识聚合无法识别个人，咨询功能照常可用。",
    );
  }
  return (
    <aside className="notice shell" aria-label="可选匿名分析">
      {enabled && ready && (!choice || choice.choice === "declined") && (
        <>
          <p>
            可选匿名分析：同意后，仅在本窗口最多30分钟内记录本文访问、咨询点击及相应转化；使用随机短期标记，不记录手机号、IP或设备指纹。拒绝不影响阅读和咨询。
          </p>
          <button
            type="button"
            className="button outline"
            disabled={busy}
            onClick={() => void accept()}
          >
            同意本次匿名分析
          </button>
          {!choice && (
            <button type="button" className="button outline" onClick={decline}>
              暂不同意
            </button>
          )}
        </>
      )}
      {enabled && choice?.choice === "accepted" && (
        <button type="button" className="button outline" onClick={decline}>
          停止本次匿名分析
        </button>
      )}
      <p>
        点击咨询会将这篇内容的来源带入咨询流程，不作为身份或平台引用证明。
        <Link href="/privacy/">隐私与来源处理说明</Link>
      </p>
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
