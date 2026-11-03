import { HttpError } from "@/lib/http";
import { boundaryValue, intents, questionStatuses } from "./config";
// RFC4180 subset: UTF-8/BOM, quoted commas/newlines and escaped quotes.
export function parseCsvTable(input: string) {
  const rows: { cells: string[]; line: number }[] = [];
  let lineNumber = 1,
    rowLine = 1;
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const text = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += c;
        if (c === "\n" || (c === "\r" && text[i + 1] !== "\n")) lineNumber++;
      }
    } else if (c === '"') {
      if (cell || closed)
        throw new HttpError(
          400,
          "CSV_INVALID",
          `第${lineNumber}行的引号格式无效，请使用成对的双引号。`,
        );
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some((x) => x.trim())) rows.push({ cells: row, line: rowLine });
        row = [];
        lineNumber++;
        rowLine = lineNumber;
      }
    } else {
      if (closed)
        throw new HttpError(
          400,
          "CSV_INVALID",
          `第${lineNumber}行的引号后存在多余字符，请检查分隔符。`,
        );
      cell += c;
    }
  }
  if (quoted)
    throw new HttpError(
      400,
      "CSV_INVALID",
      `第${rowLine}行开始的引号未闭合，请补上双引号。`,
    );
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push({ cells: row, line: rowLine });
  return rows;
}
export function parseCsvQuestions(input: string) {
  const rows = parseCsvTable(input);
  const header = rows.shift();
  const expected = [
    "question",
    "category",
    "keywords",
    "intent",
    "priority",
    "status",
  ];
  const chinese = [
    "融资问题",
    "问题分类",
    "关键词",
    "搜索意图",
    "优先级",
    "问题状态",
  ];
  if (
    !header ||
    (header.cells.map((x) => x.trim()).join(",") !== expected.join(",") &&
      header.cells.map((x) => x.trim()).join(",") !== chinese.join(","))
  )
    throw new HttpError(
      400,
      "CSV_HEADER",
      "第1行表头不正确，请下载CSV模板，保留模板中的六列中文标题。",
    );
  if (!rows.length || rows.length > 100)
    throw new HttpError(400, "CSV_LIMIT", "每次导入1—100行。");
  return rows.map(({ cells: r, line }, i) => {
    if (r.length !== 6 || r.some((v) => /^[=+@\t]/.test(v)))
      throw new HttpError(
        400,
        "CSV_ROW",
        `第${line}行列数或内容不合法，请使用六列模板，文字中的逗号需用双引号包裹。`,
      );
    return {
      label: `第${i + 1}条`,
      line,
      question: r[0],
      attributes: {
        分类: r[1],
        关键词: r[2],
        搜索意图: r[3],
        优先级: r[4],
        状态: r[5],
      },
      attributeLines: {
        分类: line,
        关键词: line,
        搜索意图: line,
        优先级: line,
        状态: line,
      },
      answer: "",
      warnings: [] as string[],
      errors: [] as { line: number; message: string }[],
    };
  });
}
export function parseQuestionCsv(input: string) {
  return parseCsvQuestions(input).map((r) => ({
    question: r.question,
    category: r.attributes.分类,
    keywords: r.attributes.关键词
      .split(/[|、,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
    intent:
      boundaryValue(r.attributes.搜索意图 || "认知型", intents) ||
      r.attributes.搜索意图,
    priority: Number(r.attributes.优先级 || 3),
    status:
      boundaryValue(r.attributes.状态 || "待规划", questionStatuses) ||
      r.attributes.状态,
    articleId: null,
  }));
}
