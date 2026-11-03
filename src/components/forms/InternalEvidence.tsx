"use client";
import { useState } from "react";
import { ActionForm, Reauth } from "./AccountForms";
type Record = {
  id: string;
  title: string;
  sourceUrl: string;
  excerpt: string;
  verifiedAt: string | null;
  validUntil: string | null;
  isActive: boolean;
};
export function InternalEvidence({ records }: { records: Record[] }) {
  const [id, setId] = useState("");
  const current = records.find((r) => r.id === id);
  return (
    <details className="admin-panel">
      <summary>受控内部产品依据（仅超级管理员登记、更新和停用）</summary>
      <p>
        只登记经授权的内部资料编号、版本和适用条款，不上传文件、不存客户资料、不发送AI、不公开内部资料。登记不是系统自动证明资料可靠，须由负责人实际核验并按真实日期填写。
      </p>
      <label>
        编辑已有资料或新登记
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">新登记</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}（{r.isActive ? "启用" : "停用"}）
            </option>
          ))}
        </select>
      </label>
      <ActionForm
        key={id}
        endpoint="/api/admin/geo/evidence/"
        button="保存受控内部依据"
        transform={(data) => ({
          ...(id ? { id } : {}),
          title: data.get("title"),
          reference: data.get("reference"),
          excerpt: data.get("excerpt"),
          checkedAt: data.get("checkedAt"),
          ...(data.get("validUntil")
            ? { validUntil: data.get("validUntil") }
            : {}),
          isActive: data.get("isActive") === "on",
          reauthPassword: data.get("reauthPassword"),
        })}
      >
        <label>
          资料标题
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={current?.title}
          />
        </label>
        <label>
          内部资料编号及版本（不要求公开网址）
          <input
            name="reference"
            required
            maxLength={500}
            defaultValue={current?.sourceUrl.replace(/^internal:/, "")}
          />
        </label>
        <label>
          支持内容的具体条款及适用范围
          <textarea
            name="excerpt"
            required
            minLength={10}
            maxLength={4000}
            defaultValue={current?.excerpt}
          />
        </label>
        <label>
          实际核验日期
          <input
            name="checkedAt"
            type="date"
            required
            defaultValue={current?.verifiedAt?.slice(0, 10)}
          />
        </label>
        <label>
          适用截止日期（如适用）
          <input
            name="validUntil"
            type="date"
            defaultValue={current?.validUntil?.slice(0, 10)}
          />
        </label>
        <label className="geo-check">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={current?.isActive ?? true}
          />
          启用此份依据
        </label>
        <label className="geo-check">
          <input type="checkbox" required />
          我已取得使用授权、核对真实资料及适用时间，填写内容不含客户个人资料
        </label>
        <Reauth />
      </ActionForm>
    </details>
  );
}
