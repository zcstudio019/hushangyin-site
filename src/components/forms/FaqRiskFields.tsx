"use client";
import { useState } from "react";
import {
  classifyFaq,
  riskClaims,
  riskIsBelow,
  riskNames,
  type RiskLevel,
} from "@/features/geo/risk";
export type EvidenceOption = {
  id: string;
  title: string;
  sourceUrl: string;
  excerpt: string;
  updatedAt: string;
  verifiedAt: string | null;
  validUntil: string | null;
};
export type FaqRiskContext = {
  question: string;
  answer: string;
  sources: { title: string; url?: string; checkedAt?: string }[];
  catalog: EvidenceOption[];
};
export function FaqRiskFields({
  context,
  onLevel,
}: {
  context: FaqRiskContext;
  onLevel: (level: RiskLevel) => void;
}) {
  const suggested = classifyFaq(context.question, context.answer);
  const [level, setLevel] = useState<RiskLevel>(suggested.level);
  const [selected, setSelected] = useState<Record<number, string>>({});
  const claims = riskClaims(context.question, context.answer, level);
  return (
    <>
      <h3>风险等级与必要依据</h3>
      <p>{suggested.reason}</p>
      <label>
        审核人员确认风险等级
        <select
          name="riskLevel"
          value={level}
          onChange={(e) => {
            const v = e.target.value as RiskLevel;
            setLevel(v);
            onLevel(v);
          }}
        >
          {Object.entries(riskNames).map(([k, name]) => (
            <option
              key={k}
              value={k}
              disabled={riskIsBelow(k as RiskLevel, suggested.level)}
            >
              {name}
            </option>
          ))}
        </select>
      </label>
      <p>
        系统建议是最低核验范围，不能通过选择低风险免除实际高风险主张的证据。规则不能替代专业判断；发现未标记的具体事实时请选择较高等级。
      </p>
      {claims.map((claim, i) => {
        const internal = context.catalog.find(
          (s) => "internal:" + s.id === selected[i],
        );
        return (
          <div className="admin-panel" key={claim}>
            <label>
              对应主张：{claim}
              <input type="hidden" name={`riskClaim-${i}`} value={claim} />
              <input
                type="hidden"
                name={`riskEvidenceVersion-${i}`}
                value={internal?.updatedAt || ""}
              />
              <select
                name={`riskEvidence-${i}`}
                value={selected[i] || ""}
                onChange={(e) =>
                  setSelected({ ...selected, [i]: e.target.value })
                }
              >
                <option value="">请选择已核验依据</option>
                {context.sources.map((s, j) => (
                  <option key={j} value={`public:${j}`}>
                    公开来源：{s.title} · 核验{s.checkedAt || "日期未填"}
                  </option>
                ))}
                {context.catalog.map((s) => (
                  <option key={s.id} value={`internal:${s.id}`}>
                    受控内部资料：{s.title}
                  </option>
                ))}
              </select>
            </label>
            {internal && (
              <aside>
                <p>
                  内部编号及版本：{internal.sourceUrl.replace(/^internal:/, "")}{" "}
                  · 核验日期：{internal.verifiedAt?.slice(0, 10) || "未核验"} ·
                  截止：{internal.validUntil?.slice(0, 10) || "未设定"}
                </p>
                <p>{internal.excerpt}</p>
                <p>
                  须核对受控原资料是否确实支持本条主张；此目录不代表系统自动验证事实。
                </p>
              </aside>
            )}
          </div>
        );
      })}
      {claims.length > 0 && (
        <p>
          没有合适依据时请退回作者补充，或请超级管理员在内容审核中心登记有权限、可追溯的内部产品资料。不得编造标题、资料编号和核验日期。
        </p>
      )}
      <label className="geo-check">
        <input type="checkbox" name="riskConfirmed" />
        我已核对内容真实性、融资宣传合规性及客户隐私保护要求，并确认必要的证据已核验。
      </label>
    </>
  );
}
