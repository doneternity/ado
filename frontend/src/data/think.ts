// Some models put their reasoning in the reply itself, as <think>…</think>
// at the start. Split it out so it shows in the thinking section instead.
// While the closing tag hasn't arrived yet, everything so far is reasoning.
export function splitThink(content: string): { reasoning: string; answer: string } {
  const m = /^\s*<think>([\s\S]*?)(<\/think>|$)/.exec(content);
  if (!m) return { reasoning: "", answer: content };
  return { reasoning: m[1]!.trim(), answer: content.slice(m[0].length).trimStart() };
}
