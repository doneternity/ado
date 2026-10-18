import type { ReactNode } from "react";

// Minimal syntax colouring for the docs' bash/js/python/json/http snippets.
// Not a real parser: it only picks out comments, strings, keywords, numbers
// and CLI flags, which is all these short examples need.

const KEYWORDS: Record<string, string[]> = {
  javascript: ["import", "from", "const", "let", "await", "async", "new", "return", "for", "of", "true", "false", "null"],
  python: ["import", "from", "def", "return", "for", "in", "with", "as", "True", "False", "None", "print"],
  bash: ["curl", "export"],
  json: ["true", "false", "null"],
};

const COMMENT: Record<string, string> = { javascript: "//[^\\n]*", python: "#[^\\n]*", bash: "#[^\\n]*" };

// CSS-module class lookups are typed string | undefined, so allow that.
export type TokenClasses = Record<"comment" | "string" | "key" | "keyword" | "number" | "flag", string | undefined>;

export function highlight(code: string, lang: string | undefined, cls: TokenClasses): ReactNode[] {
  const l = lang ?? "";
  const kw = KEYWORDS[l] ?? [];
  const parts = [
    COMMENT[l] ? `(?<comment>${COMMENT[l]})` : null,
    `(?<string>"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')`,
    kw.length ? `(?<keyword>\\b(?:${kw.join("|")})\\b)` : null,
    `(?<number>\\b\\d+(?:\\.\\d+)?\\b)`,
    l === "bash" ? `(?<flag>(?<=\\s)--?[A-Za-z][\\w-]*)` : null,
  ].filter(Boolean);
  const re = new RegExp(parts.join("|"), "g");

  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of code.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(code.slice(last, idx));
    const g = m.groups ?? {};
    let c = g.comment ? cls.comment : g.keyword ? cls.keyword : g.number ? cls.number : g.flag ? cls.flag : cls.string;
    // A string followed by ":" is an object key (JSON / JS / Python dicts).
    if (g.string && /^\s*:/.test(code.slice(idx + m[0].length))) c = cls.key;
    out.push(<span key={i++} className={c}>{m[0]}</span>);
    last = idx + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
