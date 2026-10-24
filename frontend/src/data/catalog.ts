// What ADO actually serves right now, summarised from the live /api/models
// list. Marketing copy reads from here instead of naming providers or model
// counts by hand, so it can't claim models the upstream doesn't have.
import type { PublicModel } from "../api/queries";
import { inferProvider } from "./model-meta";
import type { ModelProvider } from "./models";

export const PROVIDER_NAME: Record<ModelProvider, string> = {
  claude:   "Anthropic",
  gemini:   "Google",
  deepseek: "DeepSeek",
  openai:   "OpenAI",
  xai:      "xAI",
  zai:      "Z.ai",
  moonshot: "Moonshot AI",
  minimax:  "MiniMax",
  other:    "Other",
};

// An accent per provider as "r, g, b", for rgba() in badges. Plain colours
// only, never a company's logo.
export const PROVIDER_COLOR: Record<ModelProvider, string> = {
  claude:   "160, 145, 255",
  gemini:   "70, 170, 255",
  deepseek: "5, 196, 139",
  openai:   "16, 163, 127",
  xai:      "29, 155, 240",
  zai:      "130, 160, 255",
  moonshot: "255, 185, 90",
  minimax:  "255, 110, 140",
  other:    "200, 200, 210",
};

export type ProviderSummary = {
  provider: ModelProvider;
  name: string;
  models: string[];
  status: "operational" | "degraded" | "down";
};

// Groups models by provider, largest first. A provider is operational when all
// its models are up, down when none are, and degraded in between.
export function summarizeProviders(models: PublicModel[]): ProviderSummary[] {
  const groups = new Map<ModelProvider, PublicModel[]>();
  for (const m of models) {
    const p = inferProvider(m.id);
    groups.set(p, [...(groups.get(p) ?? []), m]);
  }
  return [...groups.entries()]
    .map(([provider, ms]) => {
      const up = ms.filter((m) => m.status !== "down").length;
      const allUp = ms.every((m) => m.status === "available");
      return {
        provider,
        name: PROVIDER_NAME[provider],
        models: ms.map((m) => m.id),
        status: up === 0 ? "down" as const : allUp ? "operational" as const : "degraded" as const,
      };
    })
    .sort((a, b) => b.models.length - a.models.length || a.name.localeCompare(b.name));
}

// "DeepSeek", "DeepSeek and Google", "DeepSeek, Google and OpenAI".
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
