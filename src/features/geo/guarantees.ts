export function guaranteeMatches(content: string) {
  const rawLines = content.split("\n");
  content = content.normalize("NFKC").replace(/[\u200b-\u200f\ufeff]/g, "");
  const matches: {
    kind: "question" | "assertion";
    location: string;
    excerpt: string;
  }[] = [];
  const promises =
    /百分(?:之)?百(?:放款|通过|获批)|包过|保证.{0,4}(审批|放款|下款|获批)|确保.{0,4}(获得贷款|获批|放款)|无视征信.{0,5}获批|100%\s*(放款|通过)|无条件放款/g;
  for (const match of content.matchAll(promises)) {
    const index = match.index || 0;
    const clause = content.slice(Math.max(0, index - 80), index);
    // A negative warning may govern a coordinated phrase: “不应…保证获批或保证放款”.
    const negatives = [
      ...clause.matchAll(
        /不应|不得|不能|无法|不会|不要|不代表|不等于|不可|并非|并不|避免|警惕|拒绝|禁止|不存在|切勿|不/g,
      ),
    ];
    const negative = negatives.at(-1);
    const scope = negative ? clause.slice(negative.index) : "";
    const limit =
      negative &&
      /不应|不得|不能|不要|避免|警惕|拒绝|禁止|切勿/.test(negative[0])
        ? 60
        : 8;
    if (
      scope &&
      scope.length <= limit &&
      !/[。！？!?\n；;，,]|但是|但|却|然而|不过|仍|就|即可|只要|无需|也/.test(
        scope,
      )
    )
      continue;
    const line = content.slice(0, index).split("\n").length;
    const lineText = content.split("\n")[line - 1];
    const column = index - (content.lastIndexOf("\n", index - 1) + 1);
    const excerpt = rawLines[line - 1].slice(
      Math.max(0, column - 80),
      Math.max(0, column - 80) + 240,
    );
    const questionPrefix =
      content
        .slice(content.lastIndexOf("\n", index - 1) + 1, index)
        .split(/[。！？!?；;，,]/)
        .at(-1) || "";
    if (
      /[？?]/.test(
        lineText.slice(index - (content.lastIndexOf("\n", index - 1) + 1)),
      ) &&
      /是否|能否|是不是|(?:服务|咨询).*(?:等于|意味着)|(?:能|可以|会)$/.test(
        questionPrefix,
      )
    ) {
      matches.push({
        kind: "question",
        location: `正文第${line}行`,
        excerpt,
      });
      continue;
    }
    matches.push({
      kind: "assertion",
      location: `正文第${line}行`,
      excerpt,
    });
  }
  return matches;
}
