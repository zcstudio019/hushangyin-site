import { Fragment, type ReactNode } from "react";
import Image from "next/image";
export function safeHref(value: string): string | null {
  if (
    /^\/[a-z0-9][a-z0-9/_-]*(?:#[a-z0-9_-]+)?$/i.test(value) ||
    /^#[a-z0-9_-]+$/i.test(value)
  )
    return value;
  try {
    const u = new URL(value);
    if (
      ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !/[\u0000-\u0020\\]/.test(value)
    )
      return u.href;
  } catch {}
  return null;
}
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re =
    /(!?)\[([^\]\n]{1,300})\]\(([^)\s]{1,1000})\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
  let end = 0;
  for (const m of text.matchAll(re)) {
    const pos = m.index!;
    parts.push(text.slice(end, pos));
    const key = String(pos);
    if (m[4]) parts.push(<strong key={key}>{m[4]}</strong>);
    else if (m[5]) parts.push(<code key={key}>{m[5]}</code>);
    else if (m[1]) {
      const ok = /^\/assets\/[a-z0-9/_-]+\.(?:png|jpe?g|webp|gif)$/i.test(m[3]);
      parts.push(
        ok ? (
          <Image
            key={key}
            src={m[3]}
            alt={m[2]}
            width={1200}
            height={800}
            unoptimized
            style={{ maxWidth: "100%", height: "auto" }}
          />
        ) : (
          <span key={key}>[图片路径不可用：{m[2]}]</span>
        ),
      );
    } else {
      const href = safeHref(m[3]);
      parts.push(
        href ? (
          <a
            key={key}
            href={href}
            rel={
              href.startsWith("http")
                ? "noopener noreferrer nofollow"
                : undefined
            }
          >
            {m[2]}
          </a>
        ) : (
          <span key={key}>{m[2]}</span>
        ),
      );
    }
    end = pos + m[0].length;
  }
  parts.push(text.slice(end));
  return parts;
}
const cells = (s: string) =>
  s
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .slice(0, 12)
    .map((c) => c.trim());
// Raw HTML is always React text, never executable markup. Only this grammar creates elements.
export function SafeMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n"),
    nodes: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i],
      key = i;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      i++;
      const code: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```"))
        code.push(lines[i++]);
      i++;
      nodes.push(
        <pre key={key}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      nodes.push(
        heading[1].length === 3 ? (
          <h3 key={key}>{inline(heading[2])}</h3>
        ) : (
          <h2 key={key}>{inline(heading[2])}</h2>
        ),
      );
      i++;
      continue;
    }
    if (
      line.includes("|") &&
      /^\s*\|?\s*:?-{3,}.*\|/.test(lines[i + 1] || "")
    ) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && rows.length < 200)
        rows.push(cells(lines[i++]));
      nodes.push(
        <div className="geo-table-wrap" key={key}>
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, j) => (
                <tr key={j}>
                  {head.map((_, k) => (
                    <td key={k}>{inline(r[k] || "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]))
        quote.push(lines[i++].replace(/^>\s?/, ""));
      nodes.push(<blockquote key={key}>{inline(quote.join("\n"))}</blockquote>);
      continue;
    }
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line),
        items: ReactNode[] = [];
      while (
        i < lines.length &&
        (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])
      ) {
        items.push(
          <li key={i}>
            {inline(lines[i++].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""))}
          </li>,
        );
      }
      nodes.push(
        ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>,
      );
      continue;
    }
    const paragraph = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(?:#{1,3}\s|>|```|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]) &&
      !(lines[i].includes("|") && /\|/.test(lines[i + 1] || ""))
    )
      paragraph.push(lines[i++]);
    nodes.push(<p key={key}>{inline(paragraph.join("\n"))}</p>);
  }
  return (
    <div className="geo-prose">
      {nodes.map((n, j) => (
        <Fragment key={j}>{n}</Fragment>
      ))}
    </div>
  );
}
