import type { ReactNode } from "react";

// Minimal syntax colouring for the docs' snippets and code blocks in Playground
// replies. Not a real parser: it only picks out comments, strings, keywords,
// numbers and CLI flags, which is enough to make code easy to scan.

const CLIKE = ["if", "else", "for", "while", "return", "break", "continue", "switch", "case", "default", "new", "class", "struct", "public", "private", "static", "void", "const", "true", "false", "null"];

const KEYWORDS: Record<string, string[]> = {
  javascript: ["import", "from", "const", "let", "await", "async", "new", "return", "for", "of", "true", "false", "null"],
  typescript: ["import", "from", "export", "const", "let", "var", "function", "await", "async", "new", "return", "if", "else", "for", "of", "in", "class", "interface", "type", "extends", "true", "false", "null", "undefined"],
  python: ["import", "from", "def", "class", "return", "if", "elif", "else", "for", "while", "in", "with", "as", "try", "except", "True", "False", "None", "print"],
  bash: ["curl", "export", "echo", "cd", "if", "then", "fi", "for", "do", "done"],
  json: ["true", "false", "null"],
  go: ["package", "import", "func", "return", "if", "else", "for", "range", "var", "const", "type", "struct", "interface", "go", "defer", "nil", "true", "false"],
  rust: ["fn", "let", "mut", "pub", "use", "mod", "struct", "enum", "impl", "match", "if", "else", "for", "in", "return", "true", "false", "None", "Some"],
  clike: CLIKE,
  sql: ["SELECT", "FROM", "WHERE", "AND", "OR", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "JOIN", "ON", "GROUP", "BY", "ORDER", "LIMIT", "CREATE", "TABLE", "NULL", "NOT", "AS"],
};

const SLASH = "//[^\\n]*";
const COMMENT: Record<string, string> = {
  javascript: SLASH, typescript: SLASH, go: SLASH, rust: SLASH, clike: SLASH,
  python: "#[^\\n]*", bash: "#[^\\n]*", sql: "--[^\\n]*",
};

const ALIASES: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", node: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", python3: "python",
  sh: "bash", shell: "bash", zsh: "bash", console: "bash", shellscript: "bash",
  jsonc: "json",
  golang: "go", rs: "rust",
  c: "clike", cpp: "clike", "c++": "clike", java: "clike", csharp: "clike", cs: "clike", kotlin: "clike", swift: "clike", php: "clike",
};

// "py" -> "python", "TSX" -> "typescript"; unknown names pass through.
export function normalizeLang(lang: string | undefined): string {
  const l = (lang ?? "").toLowerCase();
  return ALIASES[l] ?? l;
}

// CSS-module class lookups are typed string | undefined, so allow that.
export type TokenClasses = Record<"comment" | "string" | "key" | "keyword" | "number" | "flag", string | undefined>;

export function highlight(code: string, lang: string | undefined, cls: TokenClasses): ReactNode[] {
  const l = normalizeLang(lang);
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
