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

// IDs below match what the provider network actually serves (see /v1/models).
export const MODELS: ModelDef[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────
  {
    id: "claude-opus-4-7",
    name: "Claude Opus 4.7",
    provider: "claude",
    context: "200K tokens",
    speed: 3,
    capabilities: ["Streaming", "Reasoning"],
    tag: "Most capable",
    description: "Anthropic's most powerful model for the hardest reasoning tasks.",
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "claude",
    context: "200K tokens",
    speed: 3,
    capabilities: ["Streaming", "Reasoning"],
    description: "Flagship Claude Opus. Top-tier coding, reasoning, and analysis.",
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "claude",
    context: "200K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "Balanced Claude Sonnet. Fast, capable everyday workhorse.",
  },
  // ── Google ─────────────────────────────────────────────────────────────
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    provider: "gemini",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Streaming", "Reasoning", "Long context"],
    tag: "Newest",
    description: "Google's most capable Gemini, with built-in web search and a 1M-token context.",
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "gemini",
    context: "1M tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning", "Long context"],
    description: "Powerful Gemini Pro with built-in web search and a 1M-token context.",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    context: "1M tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning", "Long context"],
    description: "Proven Gemini Pro with strong reasoning and a 1M-token context.",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    context: "1M tokens",
    speed: 1,
    capabilities: ["Streaming", "Long context"],
    description: "Fast Gemini Flash. Great speed-to-quality for high-volume workloads.",
  },
  // ── OpenAI ─────────────────────────────────────────────────────────────
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    provider: "openai",
    context: "256K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    tag: "Strongest",
    description: "OpenAI's flagship model with strong reasoning and instruction following.",
  },
  {
    id: "gpt-5.1",
    name: "GPT-5.1",
    provider: "openai",
    context: "256K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "Capable GPT-5 generation model for general-purpose tasks.",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Streaming"],
    description: "Fast, well-rounded GPT-4o for everyday chat and generation.",
  },
  {
    id: "o3",
    name: "o3",
    provider: "openai",
    context: "200K tokens",
    speed: 3,
    capabilities: ["Streaming", "Reasoning"],
    description: "OpenAI's deep-reasoning model for complex multi-step problems.",
  },
  // ── DeepSeek ───────────────────────────────────────────────────────────
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    tag: "Strongest",
    description: "DeepSeek's most capable model. Excellent coding and reasoning.",
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Streaming"],
    description: "Fast DeepSeek variant optimised for speed and everyday tasks.",
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "deepseek",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "Open reasoning model with strong chain-of-thought performance.",
  },
  // ── xAI ────────────────────────────────────────────────────────────────
  {
    id: "grok-4",
    name: "Grok 4",
    provider: "xai",
    context: "256K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "xAI's flagship Grok with strong reasoning and a large context window.",
  },
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "xai",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Streaming"],
    description: "Capable general-purpose Grok model from xAI.",
  },
  // ── Other ──────────────────────────────────────────────────────────────
  {
    id: "qwen-3-max",
    name: "Qwen 3 Max",
    provider: "other",
    context: "256K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "Alibaba's largest Qwen 3. Strong multilingual reasoning and coding.",
  },
  {
    id: "qwen/qwen3.5-397b-a17b",
    name: "Qwen 3.5 397B",
    provider: "other",
    context: "256K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "Large mixture-of-experts Qwen 3.5 for demanding reasoning tasks.",
  },
  {
    id: "kimi-k2",
    name: "Kimi K2",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "Moonshot AI's Kimi. Strong long-context reasoning.",
  },
  {
    id: "llama-3.3-70b",
    name: "Llama 3.3 70B",
    provider: "other",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Streaming"],
    description: "Meta's open-weight Llama 3.3. Fast, capable general-purpose model.",
  },
];
