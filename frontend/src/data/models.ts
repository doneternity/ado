// Single source of truth for the model catalogue shown across the app
// (Models page, Playground picker, Dashboard featured list). IDs are the
// real identifiers accepted by the active upstream provider.

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
    id: "claude-sonnet-4-6-thinking",
    name: "Claude Sonnet 4.6 Thinking",
    provider: "claude",
    context: "200K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Extended thinking mode — deeper reasoning with visible chain-of-thought.",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "claude",
    context: "200K tokens",
    speed: 2,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    description: "Balanced Claude for everyday coding and instruction-following.",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "claude",
    context: "200K tokens",
    speed: 1,
    capabilities: ["Vision", "Tools", "Streaming"],
    description: "Fastest Claude. Snappy responses for high-volume, lightweight tasks.",
  },
  {
    id: "vertex-gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "gemini",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Preview",
    description: "Latest Gemini Pro preview with improved reasoning and multimodal support.",
  },
  {
    id: "vertex-gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Most capable",
    description: "Frontier-level reasoning and coding with a 1M-token context window.",
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
    id: "deepseek-v4-pro-thinking",
    name: "DeepSeek V4 Pro Thinking",
    provider: "deepseek",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Extended reasoning mode for DeepSeek V4 Pro.",
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Tools", "Streaming"],
    description: "Fast DeepSeek V4 variant. Excellent speed-to-quality ratio for everyday tasks.",
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
    id: "GLM-5",
    name: "GLM 5",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming"],
    description: "Stable GLM 5 release. Reliable general-purpose generation.",
  },
  {
    id: "deepinfra-Kimi-K2.6",
    name: "Kimi K2.6",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Moonshot AI's latest model. Strong long-context reasoning and tool use.",
  },
];
