// Single source of truth for the model catalogue shown across the app
// (Models page, Playground picker, Dashboard featured list). Every id below is
// a real identifier returned by one of ADO's active upstream providers.

export type ModelProvider = "claude" | "gemini" | "deepseek" | "other";
export type Capability = "Vision" | "Tools" | "Streaming" | "Reasoning" | "Long context";

export interface ModelDef {
  id: string;
  name: string;
  provider: ModelProvider;
  context: string;
  speed: 1 | 2 | 3;
  capabilities: Capability[];
  tag?: string;
  description: string;
}

export const MODELS: ModelDef[] = [
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "claude",
    context: "200K tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Newest",
    description: "Anthropic's most capable model. Frontier reasoning and long-context analysis.",
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "claude",
    context: "200K tokens",
    speed: 2,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    description: "Previous Opus release — strong coding and instruction-following.",
  },
  {
    id: "[GG]gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "gemini",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Preview",
    description: "Latest Gemini Pro preview with improved reasoning and multimodal support.",
  },
  {
    id: "[GG]gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Most capable",
    description: "Frontier-level reasoning and coding with a 1M-token context window.",
  },
  {
    id: "[GG]gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    provider: "gemini",
    context: "1M tokens",
    speed: 1,
    capabilities: ["Vision", "Tools", "Streaming"],
    description: "Fast next-gen Flash preview. Great speed-to-quality for everyday tasks.",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    tag: "Strongest",
    description: "DeepSeek's most capable model. Top-tier coding, math, and reasoning.",
  },
  {
    id: "[beagle]deepseek-ai/DeepSeek-V3.2",
    name: "DeepSeek V3.2",
    provider: "deepseek",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Tools", "Streaming"],
    description: "Stable previous-generation DeepSeek. Fast for coding and analysis.",
  },
  {
    id: "GLM-5.1",
    name: "GLM 5.1",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Zhipu's latest GLM. Strong multilingual reasoning and tool use.",
  },
  {
    id: "Kimi-K2.6",
    name: "Kimi K2.6",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Moonshot AI's latest model. Strong long-context reasoning and tool use.",
  },
  {
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "MiniMax's flagship model — capable general-purpose reasoning.",
  },
  {
    id: "[Aie]Mimo-V2.5-Pro",
    name: "Mimo V2.5 Pro",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "High-efficiency model optimized for long-form generation.",
  },
];
