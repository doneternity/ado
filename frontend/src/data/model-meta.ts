import { MODELS } from "./models";
import type { Capability, ModelDef, ModelProvider } from "./models";

// One entry from /api/models. Providers describe their models in different
// shapes, so every metadata field is optional and several aliases are read.
export type LiveModel = {
  id: string;
  ado_status?: "available" | "degraded" | "down";
  // name
  display_name?: string;
  name?: string;
  // context size
  context_length?: number;
  context_window?: number;
  // who serves it
  provider?: string;
  owned_by?: string;
  // capabilities
  input_modalities?: string[];
  effort?: { supported_levels?: string[] };
  reasoning?: unknown;
  supported_parameters?: string[];
};

export type EnrichedModel = ModelDef & { adoStatus: "available" | "degraded" | "down" };

const LONG_CONTEXT = 500_000;

export function inferProvider(id: string): ModelProvider {
  const key = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  if (/gemini|google|bard/i.test(key)) return "gemini";
  if (/claude|anthropic/i.test(key)) return "claude";
  if (/deepseek/i.test(key)) return "deepseek";
  if (/gpt|openai|^o\d/i.test(key)) return "openai";
  if (/grok|xai/i.test(key)) return "xai";
  return "other";
}

export function providerFromLabel(label: string): ModelProvider {
  const l = label.toLowerCase();
  if (l.includes("google") || l.includes("gemini")) return "gemini";
  if (l.includes("anthropic") || l.includes("claude")) return "claude";
  if (l.includes("deepseek")) return "deepseek";
  if (l.includes("openai")) return "openai";
  if (l.includes("xai") || l.includes("grok")) return "xai";
  return "other";
}

// 131072 -> "128K", 1048576 -> "1M" (binary sizes, as model cards quote them);
// 200000 -> "200K", 1000000 -> "1M" (decimal sizes).
export function fmtCtx(n: number): string {
  const fmt = (v: number, unit: string) => `${+v.toFixed(1)}${unit} tokens`;
  if (n >= 1_000_000) return fmt(n % 1_048_576 === 0 ? n / 1_048_576 : n / 1_000_000, "M");
  if (n >= 1_000) return fmt(n % 1_024 === 0 ? n / 1_024 : n / 1_000, "K");
  return `${n} tokens`;
}

// "DeepSeek-V4.1-Flash" -> "DeepSeek V4.1 Flash"; "deepseek-flash" -> "Deepseek Flash".
export function prettyName(raw: string): string {
  return raw
    .replace(/^\[[^\]]+\]/, "")   // strip [TAG] prefix
    .replace(/^[^/]*\//, "")       // strip provider/ prefix
    .replace(/[-_]+/g, " ")
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .trim();
}

// Live data from the provider wins: it's what is actually served. The curated
// catalogue only adds what providers don't report (tag, description, speed).
export function mergeModel(live: LiveModel, curated?: ModelDef): EnrichedModel {
  const ctxTokens = live.context_length ?? live.context_window;
  const owner = live.provider ?? live.owned_by;

  const caps = new Set<Capability>(curated?.capabilities ?? ["Streaming"]);
  if (live.input_modalities?.includes("image")) caps.add("Vision");
  if (live.effort?.supported_levels?.length || live.reasoning || live.supported_parameters?.includes("reasoning")) caps.add("Reasoning");
  if (live.supported_parameters?.includes("tools")) caps.add("Tools");
  if (ctxTokens && ctxTokens >= LONG_CONTEXT) caps.add("Long context");
  const order: Capability[] = ["Streaming", "Reasoning", "Vision", "Tools", "Long context"];

  const liveName = live.display_name || live.name;
  return {
    id: live.id,
    name: liveName ? prettyName(liveName) : curated?.name ?? (prettyName(live.id) || live.id),
    provider: owner ? providerFromLabel(owner) : curated?.provider ?? inferProvider(live.id),
    context: ctxTokens ? fmtCtx(ctxTokens) : curated?.context ?? "",
    speed: curated?.speed ?? 2,
    capabilities: order.filter((c) => caps.has(c)),
    tag: curated?.tag,
    description: curated?.description ?? "",
    adoStatus: live.ado_status ?? "available",
  };
}

// Every live model, enriched. Curated models keep their catalogue order and
// come first; anything else the provider serves follows in its own order.
export function enrichAll(live: LiveModel[]): EnrichedModel[] {
  const rank = new Map(MODELS.map((m, i) => [m.id, i]));
  return live
    .map((m, i) => ({ m: mergeModel(m, MODELS.find((c) => c.id === m.id)), r: rank.get(m.id) ?? MODELS.length + i }))
    .sort((a, b) => a.r - b.r)
    .map(({ m }) => m);
}
