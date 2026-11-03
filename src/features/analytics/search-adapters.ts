import { parseCsvTable } from "@/features/geo/csv";
import { HttpError } from "@/lib/http";
import { localDay } from "./config";
export type SearchRow = {
  day: string;
  clicks: number;
  impressions: number;
  averagePosition: number | null;
};
export interface SearchAdapter {
  parse(csv: string): SearchRow[];
  automaticSyncAvailable: boolean;
}
export const googleDailyCsv: SearchAdapter = {
  automaticSyncAvailable: false,
  parse(csv) {
    if (Buffer.byteLength(csv, "utf8") > 1024 * 1024)
      throw new HttpError(413, "CSV_TOO_LARGE", "文件不得超过1MB。");
    const rows = parseCsvTable(csv),
      header = rows.shift()?.cells.map((v) => v.trim());
    const aliases: Record<string, string> = {
      Date: "day",
      日期: "day",
      Clicks: "clicks",
      点击次数: "clicks",
      Impressions: "impressions",
      展示次数: "impressions",
      CTR: "ctr",
      点击率: "ctr",
      Position: "position",
      排名: "position",
      平均排名: "position",
    };
    if (
      !header ||
      header.length !== 5 ||
      header.some((h) => !aliases[h]) ||
      new Set(header.map((h) => aliases[h])).size !== 5
    )
      throw new HttpError(
        400,
        "CSV_HEADER",
        "请导入Google按日期导出的CSV：日期、点击次数、展示次数、点击率、排名。暂不支持对比、查询或网页分组，避免重复统计。",
      );
    if (!rows.length || rows.length > 1000)
      throw new HttpError(400, "CSV_ROWS", "一次须导入1至1000条日记录。");
    const seen = new Set<string>();
    return rows
      .map((row) => {
        const fail = (message: string): never => {
          throw new HttpError(400, "CSV_ROW", `第${row.line}行：${message}`);
        };
        if (row.cells.length !== 5) fail("字段数量不正确。");
        const v = Object.fromEntries(
          header.map((h, i) => [aliases[h], row.cells[i].trim()]),
        );
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(v.day) ||
          !Number.isFinite(Date.parse(v.day)) ||
          new Date(v.day).toISOString().slice(0, 10) !== v.day ||
          v.day > localDay()
        )
          fail("日期须为有效且不晚于今天的YYYY-MM-DD。");
        if (seen.has(v.day))
          fail("同一文件有重复日期，请使用单一站点日期维度。");
        seen.add(v.day);
        const number = (text: string) =>
          /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)
            ? Number(text.replaceAll(",", ""))
            : NaN;
        const clicks = number(v.clicks),
          impressions = number(v.impressions);
        if (
          !Number.isSafeInteger(clicks) ||
          !Number.isSafeInteger(impressions) ||
          clicks < 0 ||
          impressions < clicks ||
          impressions > 2147483647
        )
          fail("点击与展示必须为有效非负整数，展示不得小于点击。");
        const ctr =
          Number(v.ctr.replace("%", "")) / (v.ctr.endsWith("%") ? 100 : 1);
        if (
          !Number.isFinite(ctr) ||
          ctr < 0 ||
          ctr > 1 ||
          Math.abs(ctr - (impressions ? clicks / impressions : 0)) > 0.005
        )
          fail("点击率与点击/展示不一致，请检查是否混入其他维度。");
        const pos =
          v.position === "" || v.position === "-" || !impressions
            ? null
            : Number(v.position);
        if (pos !== null && (!Number.isFinite(pos) || pos <= 0 || pos > 10000))
          fail("平均排名须为正数；无展示时不伪造排名。");
        return { day: v.day, clicks, impressions, averagePosition: pos };
      })
      .sort((a, b) => a.day.localeCompare(b.day));
  },
};
export function searchAdapter(platform: string) {
  if (platform !== "GOOGLE")
    throw new HttpError(
      501,
      "EXPORT_NOT_ADAPTED",
      "此平台尚未核验真实导出格式，请提供官方导出样例后适配；不会以网站访问代替曝光数据。",
    );
  return googleDailyCsv;
}
