export type ModelProvider = "claude" | "gemini" | "deepseek" | "openai" | "xai" | "other";
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
  // ── Gemini ─────────────────────────────────────────────────────────────
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "gemini",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Newest",
    description: "Latest Gemini Pro preview with improved reasoning and multimodal support.",
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    provider: "gemini",
    context: "1M tokens",
    speed: 1,
    capabilities: ["Vision", "Tools", "Streaming"],
    description: "Fast next-gen Flash preview. Great speed-to-quality for everyday tasks.",
  },
  // ── DeepSeek ───────────────────────────────────────────────────────────
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    tag: "Strongest",
    description: "DeepSeek's most capable model. Top-tier coding, math, and reasoning.",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Tools", "Streaming"],
    description: "Fast DeepSeek V4 variant optimised for speed and everyday tasks.",
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "deepseek",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Tools", "Streaming"],
    description: "Stable previous-generation DeepSeek. Fast for coding and analysis.",
  },
  {
    id: "deepseek/deepseek-v3.2-thinking",
    name: "DeepSeek V3.2 Thinking",
    provider: "deepseek",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "Chain-of-thought reasoning variant of DeepSeek V3.2.",
  },
  // ── OpenAI ─────────────────────────────────────────────────────────────
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "openai",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Most capable",
    description: "OpenAI's flagship model with strong reasoning and instruction following.",
  },
  // ── Other ──────────────────────────────────────────────────────────────
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
    description: "MiniMax's flagship model, capable general-purpose reasoning.",
  },
];
