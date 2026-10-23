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
  max_output_tokens?: number;
  // who serves it
  provider?: string;
  owned_by?: string;
  // capabilities
  input_modalities?: string[];
  effort?: { supported_levels?: string[]; default_level?: string };
  // some providers group these under one object instead
  capabilities?: { contextWindow?: number; vision?: boolean; reasoning?: boolean };
  reasoning?: unknown;
  supported_parameters?: string[];
};

export type EnrichedModel = ModelDef & {
  adoStatus: "available" | "degraded" | "down";
  // reasoning effort levels the provider says the model takes, if any
  effortLevels?: string[];
  effortDefault?: string;
  // raw token counts, for compact "1M context" style labels
  contextTokens?: number;
  maxOutputTokens?: number;
};

const LONG_CONTEXT = 500_000;

export function inferProvider(id: string): ModelProvider {
  const key = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  if (/gemini|google|bard/i.test(key)) return "gemini";
  if (/claude|anthropic/i.test(key)) return "claude";
  if (/deepseek/i.test(key)) return "deepseek";
  if (/gpt|openai|^o\d/i.test(key)) return "openai";
  if (/grok|xai/i.test(key)) return "xai";
  if (/glm|zhipu/i.test(key)) return "zai";
  if (/kimi|moonshot/i.test(key)) return "moonshot";
  return "other";
}

export function providerFromLabel(label: string): ModelProvider {
  const l = label.toLowerCase();
  if (l.includes("google") || l.includes("gemini")) return "gemini";
  if (l.includes("anthropic") || l.includes("claude")) return "claude";
  if (l.includes("deepseek")) return "deepseek";
  if (l.includes("openai")) return "openai";
  if (l.includes("xai") || l.includes("grok")) return "xai";
  if (l.includes("z-ai") || l.includes("z.ai") || l.includes("zai") || l.includes("zhipu")) return "zai";
  if (l.includes("moonshot") || l.includes("kimi")) return "moonshot";
  return "other";
}

// Who made a live model. The ID decides when it names a family ("gemini-…"):
// resellers often report every model as owned by "openai" (OpenAI's API
// format), which once filed a Gemini model under OpenAI. The owner field is
// only used for IDs that say nothing, and owners like "system" say nothing either.
export function providerOf(live: Pick<LiveModel, "id" | "provider" | "owned_by">, fallback?: ModelProvider): ModelProvider {
  const fromId = inferProvider(live.id);
  if (fromId !== "other") return fromId;
  const owner = live.provider ?? live.owned_by;
  const fromOwner = owner ? providerFromLabel(owner) : "other";
  if (fromOwner !== "other") return fromOwner;
  return fallback ?? "other";
}

type FamilyInfo = Pick<ModelDef, "description" | "capabilities" | "speed">;

// What can truthfully be said about a model family the catalogue doesn't list
// by ID, so new GLM and Kimi releases show up described instead of blank.
// Live metadata (context size, image input) is still added on top.
export function familyInfo(id: string): FamilyInfo | undefined {
  const key = id.toLowerCase().replace(/^.*\//, "");
  const thinking = /thinking/.test(key);
  const light = /flash|air|turbo|mini|lite/.test(key);
  const speed = light ? 1 : 2;
  if (/^(chat)?glm/.test(key)) {
    if (/^glm-[\d.]+v|vision/.test(key)) {
      return { description: "Z.ai's GLM vision model, for questions about images as well as text.", capabilities: ["Streaming", "Vision"], speed };
    }
    return {
      description: light ? "A lighter, faster GLM model from Z.ai for everyday tasks." : "Z.ai's GLM model for chat, coding and agent tasks.",
      capabilities: thinking ? ["Streaming", "Reasoning"] : ["Streaming"],
      speed,
    };
  }
  if (/^gemini/.test(key)) {
    if (/pro/.test(key)) return { description: "Google's Gemini Pro model for harder reasoning, coding and long documents.", capabilities: ["Streaming"], speed: 2 };
    if (light) return { description: "A fast Gemini model from Google for everyday, high-volume tasks.", capabilities: ["Streaming"], speed: 1 };
    return { description: "Google's Gemini model for chat, coding and long documents.", capabilities: ["Streaming"], speed };
  }
  if (/^(kimi|moonshot)/.test(key)) {
    if (/vision|-vl\b/.test(key)) {
      return { description: "Moonshot AI's Kimi vision model, for questions about images as well as text.", capabilities: ["Streaming", "Vision"], speed };
    }
    if (thinking) {
      return { description: "Moonshot AI's Kimi thinking model, which reasons step by step before it answers.", capabilities: ["Streaming", "Reasoning"], speed };
    }
    return { description: "Moonshot AI's Kimi model for chat, coding and long documents.", capabilities: ["Streaming"], speed };
  }
  return undefined;
}

// 131072 -> "128K", 1048576 -> "1M" (binary sizes, as model cards quote them);
// 200000 -> "200K", 1000000 -> "1M" (decimal sizes).
export function fmtCtx(n: number): string {
  return n >= 1_000 ? `${fmtTokens(n)} tokens` : `${n} tokens`;
}

// The number part alone: 1048576 -> "1M", 393216 -> "384K", 65535 -> "64K".
export function fmtTokens(n: number): string {
  const fmt = (v: number, unit: string, digits = 1) => `${+v.toFixed(digits)}${unit}`;
  // Two decimals for millions, so 1,050,000 reads "1.05M", not a rounded-up "1.1M".
  if (n >= 1_000_000) return fmt(n % 1_048_576 === 0 ? n / 1_048_576 : n / 1_000_000, "M", 2);
  // 65535 is a 64K limit minus one, not "65.5K".
  if (n >= 1_000) return fmt((n + 1) % 1_024 === 0 || n % 1_024 === 0 ? Math.round(n / 1_024) : n / 1_000, "K");
  return String(n);
}

// "DeepSeek-V4.1-Flash" -> "DeepSeek V4.1 Flash"; "deepseek-flash" -> "Deepseek Flash".
export function prettyName(raw: string): string {
  return raw
    .replace(/^\[[^\]]+\]/, "")   // strip [TAG] prefix
    .replace(/^[^/]*\//, "")       // strip provider/ prefix
    .replace(/[-_]+/g, " ")
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Glm|Gpt)\b/g, (w) => w.toUpperCase()) // "glm-5.3" -> "GLM 5.3"
    .replace(/(\d)v\b/g, "$1V")                       // "4.5v" -> "4.5V"
    .trim();
}

// Live data from the provider wins: it's what is actually served. The curated
// catalogue only adds what providers don't report (tag, description, speed).
export function mergeModel(live: LiveModel, curated?: ModelDef): EnrichedModel {
  const ctxTokens = live.context_length ?? live.context_window ?? live.capabilities?.contextWindow;
  const family = curated ? undefined : familyInfo(live.id);

  const caps = new Set<Capability>(curated?.capabilities ?? family?.capabilities ?? ["Streaming"]);
  if (live.input_modalities?.includes("image") || live.capabilities?.vision) caps.add("Vision");
  if (live.capabilities?.reasoning) caps.add("Reasoning");
  if (live.effort?.supported_levels?.length || live.reasoning || live.supported_parameters?.includes("reasoning")) caps.add("Reasoning");
  if (live.supported_parameters?.includes("tools")) caps.add("Tools");
  if (ctxTokens && ctxTokens >= LONG_CONTEXT) caps.add("Long context");
  const order: Capability[] = ["Streaming", "Reasoning", "Vision", "Tools", "Long context"];

  const liveName = live.display_name || live.name;
  return {
    id: live.id,
    // A name with spaces is already written for people ("GPT-6 Sol"); one
    // without is ID-like ("DeepSeek-V4.1-Flash") and gets tidied.
    name: liveName ? (/\s/.test(liveName.trim()) ? liveName.trim() : prettyName(liveName)) : curated?.name ?? (prettyName(live.id) || live.id),
    provider: providerOf(live, curated?.provider),
    context: ctxTokens ? fmtCtx(ctxTokens) : curated?.context ?? "",
    speed: curated?.speed ?? family?.speed ?? 2,
    capabilities: order.filter((c) => caps.has(c)),
    tag: curated?.tag,
    description: curated?.description ?? family?.description ?? "",
    adoStatus: live.ado_status ?? "available",
    effortLevels: live.effort?.supported_levels?.length ? live.effort.supported_levels : undefined,
    effortDefault: live.effort?.default_level,
    contextTokens: ctxTokens,
    maxOutputTokens: live.max_output_tokens,
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
