type Day = {
  day: string;
  pv: number | null;
  clicks: number | null;
  consults: number | null;
};
const series = [
  { key: "pv", label: "授权内容PV", color: "#1e3a8a" },
  { key: "clicks", label: "咨询点击", color: "#997527" },
  { key: "consults", label: "成功内容归因咨询", color: "#16754b" },
] as const;
export function AnalyticsTrend({ days }: { days: Day[] }) {
  const hasData = days.some((d) => series.some((s) => d[s.key] !== null));
  const maximum = Math.max(
    1,
    ...days.flatMap((d) => series.map((s) => d[s.key] ?? 0)),
  );
  const x = (i: number) => 55 + (i * 820) / Math.max(1, days.length - 1),
    y = (n: number) => 245 - (n * 210) / maximum;
  return (
    <section className="analytics-chart" aria-label="真实采集趋势">
      <p>
        缺少采集记录的日期留空，不补零、不跨空白连线。成功咨询按提交日统计，和按访问日计入的转化访问不同。
      </p>
      {hasData ? (
        <svg
          viewBox="0 0 900 290"
          role="img"
          aria-labelledby="analytics-trend-title"
          aria-describedby="analytics-trend-desc"
        >
          <title id="analytics-trend-title">
            内容访问、咨询点击与成功咨询趋势
          </title>
          <desc id="analytics-trend-desc">
            按上海日期统计。下方可展开逐日数据表读取准确数值。
          </desc>
          {[
            ...new Set([0, 1, 2, 3].map((i) => Math.ceil((maximum * i) / 3))),
          ].map((n) => {
            return (
              <g key={n}>
                <line x1="55" x2="875" y1={y(n)} y2={y(n)} stroke="#dce4ef" />
                <text x="45" y={y(n) + 4} textAnchor="end" fontSize="13">
                  {n}
                </text>
              </g>
            );
          })}
          {series.map((s) => {
            const segments: { i: number; n: number }[][] = [];
            let run: { i: number; n: number }[] = [];
            for (let i = 0; i < days.length; i++) {
              const n = days[i][s.key];
              if (n === null) {
                if (run.length) segments.push(run);
                run = [];
              } else run.push({ i, n });
            }
            if (run.length) segments.push(run);
            return (
              <g key={s.key} stroke={s.color} fill={s.color}>
                {segments.map((segment, i) => (
                  <g key={i}>
                    {segment.length > 1 && (
                      <polyline
                        points={segment
                          .map((p) => `${x(p.i)},${y(p.n)}`)
                          .join(" ")}
                        fill="none"
                        strokeWidth="2.5"
                      />
                    )}
                    {segment.map((p) => (
                      <circle key={p.i} cx={x(p.i)} cy={y(p.n)} r="4">
                        <title>{`${days[p.i].day}，${s.label}：${p.n}`}</title>
                      </circle>
                    ))}
                  </g>
                ))}
              </g>
            );
          })}
          {[0, Math.floor((days.length - 1) / 2), days.length - 1].map((i) => (
            <text
              key={i}
              x={x(i)}
              y="275"
              textAnchor={
                i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"
              }
              fontSize="13"
            >
              {days[i].day}
            </text>
          ))}
        </svg>
      ) : (
        <p className="analytics-empty">
          暂无趋势数据。访客同意可选分析后，实际浏览和点击才会形成访问曲线；成功咨询独立来自真实入库记录。
        </p>
      )}
      <ul className="analytics-legend">
        {series.map((s) => (
          <li key={s.key}>
            <span style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <details>
        <summary>查看逐日数据（含真实0与缺失）</summary>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>上海日期</th>
                {series.map((s) => (
                  <th key={s.key}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  {series.map((s) => (
                    <td key={s.key}>{d[s.key] ?? "暂无数据"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
