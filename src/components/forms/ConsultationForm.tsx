"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  consultationSchema,
  financingAmounts,
} from "@/lib/validations/consultation";
export function ConsultationForm({
  available,
  sourceArticleId,
  sourceFaqId,
  attributionToken,
  sourceParameters,
}: {
  available: boolean;
  sourceArticleId?: string;
  sourceFaqId?: string;
  attributionToken?: string;
  sourceParameters?: Record<string, string>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [sent, setSent] = useState(false);
  const inFlight = useRef(false),
    path = usePathname();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !available) return;
    setSent(false);
    setMessage("");
    const form = event.currentTarget,
      data = new FormData(form);
    const boolean = (key: string) =>
      data.get(key) === "yes" ? true : data.get(key) === "no" ? false : null;
    const payload = {
      name: data.get("name"),
      phone: data.get("phone"),
      customerType: data.get("customerType"),
      financingAmount: data.get("financingAmount"),
      hasProperty: boolean("hasProperty"),
      hasCompany: boolean("hasCompany"),
      remark: data.get("remark") || "",
      sourcePage: path,
      ...(sourceArticleId ? { sourceArticleId } : {}),
      ...(sourceFaqId ? { sourceFaqId } : {}),
      ...(attributionToken ? { attributionToken } : {}),
      ...(sourceParameters && Object.keys(sourceParameters).length
        ? { sourceParameters }
        : {}),
      consent: data.get("consent") === "on",
    };
    const parsed = consultationSchema.safeParse(payload);
    if (!parsed.success) {
      setMessage("请检查必填项、手机号和隐私授权。");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    setSent(false);
    try {
      const response = await fetch("/api/consultations/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (
        response.status === 201 &&
        result.ok &&
        typeof result.data?.reference === "string"
      ) {
        setSent(true);
        setMessage("咨询需求已成功提交，沪上银工作人员将与您联系。");
        form.reset();
      } else setMessage(result.error?.message || "提交失败，请稍后再试。");
    } catch {
      setMessage("网络连接失败，暂未确认是否提交，请稍后核实后再试。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="form-panel"
      id="consult-form"
      data-submission={available ? "api" : "disabled"}
      onSubmit={submit}
      onInvalidCapture={() => {
        setSent(false);
        setMessage("请完成必填项目并检查手机号格式。");
      }}
    >
      {(sourceArticleId || sourceFaqId || attributionToken) && (
        <p className="form-note">
          已携带内容来源标记，提交时将由服务端核验对应公开文章或问答；无效来源不会自动归入GEO。
        </p>
      )}
      <fieldset
        disabled={!available || busy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="form-grid">
          <label>
            您的称呼 <em>*</em>
            <input
              name="name"
              autoComplete="name"
              placeholder="请输入称呼"
              required
              maxLength={40}
            />
          </label>
          <label>
            联系电话 <em>*</em>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="请输入手机号码"
              required
              pattern="1[3-9][0-9]{9}"
              maxLength={11}
              title="请输入11位中国大陆手机号"
            />
          </label>
          <label>
            客户类型 <em>*</em>
            <select name="customerType" required defaultValue="">
              <option value="">请选择客户类型</option>
              <option value="ENTERPRISE">企业主 / 公司法人</option>
              <option value="SELF_EMPLOYED">个体工商户</option>
              <option value="PERSONAL">个人客户</option>
            </select>
          </label>
          <label>
            融资金额 <em>*</em>
            <select name="financingAmount" required defaultValue="">
              <option value="">请选择资金需求</option>
              {financingAmounts.map((amount) => (
                <option key={amount}>{amount}</option>
              ))}
            </select>
          </label>
          {(["hasProperty", "hasCompany"] as const).map((name, i) => (
            <label key={name}>
              {i === 0 ? "是否有房产" : "是否有企业"}
              <select name={name}>
                <option value="">暂不填写</option>
                <option value="yes">是</option>
                <option value="no">否</option>
              </select>
            </label>
          ))}
        </div>
        <label>
          补充说明
          <textarea
            name="remark"
            maxLength={600}
            rows={4}
            placeholder="例如：经营年限、资金用途、希望咨询的问题（请勿填写身份证号等敏感信息）"
          />
        </label>
        <label className="consent">
          <input type="checkbox" name="consent" required />
          <span>
            我已阅读并理解<Link href="/privacy/">《隐私政策》</Link>与
            <Link href="/risks/">《风险提示》</Link>
            ，同意为本次咨询处理所填写的信息并联系我。
          </span>
        </label>
        <button
          className="button gold full"
          type="submit"
          disabled={!available || busy}
        >
          {busy ? "正在提交…" : "提交咨询需求 ↗"}
        </button>
      </fieldset>
      <div
        className={sent ? "form-feedback success" : "form-feedback"}
        role="status"
        aria-live="polite"
      >
        {!available ? "安全接收服务尚未配置或未开通，当前不可提交。" : message}
      </div>
      <p className="form-note">
        仅收集本次咨询必要信息；请勿提交征信、流水、身份证或银行账户资料。
      </p>
    </form>
  );
}
