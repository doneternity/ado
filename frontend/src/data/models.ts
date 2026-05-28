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
    id: "kiro/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "claude",
    context: "200K tokens",
    speed: 2,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Most capable",
    description: "Anthropic's flagship Sonnet. Top-tier coding, reasoning, and tool use.",
  },
  {
    id: "codebuddy/claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "claude",
    context: "200K tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    description: "Anthropic's most powerful model for the hardest reasoning tasks.",
  },
  {
    id: "kiro/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "claude",
    context: "200K tokens",
    speed: 1,
    capabilities: ["Vision", "Tools", "Streaming"],
    description: "Fast, lightweight Claude. Great speed-to-quality for everyday tasks.",
  },
  // ── Google ─────────────────────────────────────────────────────────────
  {
    id: "codebuddy/gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    provider: "gemini",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Newest",
    description: "Google's most capable Gemini with a 1M-token context window and vision.",
  },
  {
    id: "codebuddy/gemini-3.0-flash",
    name: "Gemini 3.0 Flash",
    provider: "gemini",
    context: "1M tokens",
    speed: 1,
    capabilities: ["Vision", "Tools", "Streaming"],
    description: "Fast Gemini Flash. Great speed-to-quality for high-volume workloads.",
  },
  {
    id: "codebuddy/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    context: "1M tokens",
    speed: 2,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    description: "Proven Gemini Pro with strong multimodal reasoning.",
  },
  // ── OpenAI ─────────────────────────────────────────────────────────────
  {
    id: "codex/gpt-5.5",
    name: "GPT-5.5",
    provider: "openai",
    context: "256K tokens",
    speed: 2,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Strongest",
    description: "OpenAI's flagship model with strong reasoning and instruction following.",
  },
  {
    id: "codex/gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    provider: "openai",
    context: "256K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Codex-tuned GPT for agentic coding and large refactors.",
  },
  // ── DeepSeek ───────────────────────────────────────────────────────────
  {
    id: "kiro/deepseek-3.2",
    name: "DeepSeek 3.2",
    provider: "deepseek",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Tools", "Streaming"],
    description: "Fast DeepSeek for coding and analysis.",
  },
  {
    id: "kiro/deepseek-3.2-thinking",
    name: "DeepSeek 3.2 Thinking",
    provider: "deepseek",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "Chain-of-thought reasoning variant of DeepSeek 3.2.",
  },
  // ── Other ──────────────────────────────────────────────────────────────
  {
    id: "kiro/qwen3-coder-next",
    name: "Qwen3 Coder Next",
    provider: "other",
    context: "256K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming"],
    description: "Alibaba's Qwen3 tuned for coding and tool use.",
  },
  {
    id: "kiro/glm-5",
    name: "GLM 5",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Zhipu's latest GLM. Strong multilingual reasoning and tool use.",
  },
  {
    id: "kiro/minimax-m2.5",
    name: "MiniMax M2.5",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "MiniMax's flagship model for capable general-purpose reasoning.",
  },
  {
    id: "codebuddy/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Moonshot AI's Kimi. Strong long-context reasoning and tool use.",
  },
];
