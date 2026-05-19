import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Copy, Check, Zap, Brain, Eye, Wrench, Layers } from "lucide-react";
import styles from "./Models.module.scss";

type Capability = "Vision" | "Tools" | "Streaming" | "Reasoning" | "Long context";
type Filter = "all" | "gemini" | "claude" | "deepseek" | "other";

interface ModelDef {
  id: string;
  name: string;
  provider: "gemini" | "claude" | "deepseek" | "other";
  context: string;
  speed: 1 | 2 | 3;
  capabilities: Capability[];
  tag?: string;
  description: string;
}

const MODELS: ModelDef[] = [
  {
    id: "[kmo]claude-opus-4.7",
    name: "Claude Opus 4.7",
    provider: "claude",
    context: "200K tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Newest",
    description: "Anthropic's most capable model. Frontier reasoning and long-context analysis.",
  },
  {
    id: "[kmo]claude-opus-4.7-thinking",
    name: "Claude Opus 4.7 Thinking",
    provider: "claude",
    context: "200K tokens",
    speed: 3,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Extended thinking mode for Opus 4.7. Deeper reasoning with visible chain-of-thought.",
  },
  {
    id: "[kmo]claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "claude",
    context: "200K tokens",
    speed: 2,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    description: "Previous Opus with strong coding and instruction-following.",
  },
  {
    id: "[kmo]claude-opus-4.6-thinking",
    name: "Claude Opus 4.6 Thinking",
    provider: "claude",
    context: "200K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Extended thinking mode for Opus 4.6.",
  },
  {
    id: "[kmo]claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "claude",
    context: "200K tokens",
    speed: 2,
    capabilities: ["Vision", "Tools", "Streaming"],
    description: "Stable Opus release with balanced speed and quality.",
  },
  {
    id: "[GG]gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Most capable",
    description: "Frontier-level reasoning and coding. Highest accuracy across benchmarks.",
  },
  {
    id: "[GG]gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    provider: "gemini",
    context: "1M tokens",
    speed: 1,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Preview",
    description: "Next-gen Flash preview. Fast hybrid reasoning with multimodal support.",
  },
  {
    id: "[GG]gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "gemini",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    description: "Latest Gemini Pro preview with improved reasoning capabilities.",
  },
  {
    id: "[momo神秘V4]DeepSeek-V4-Pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    tag: "Strongest",
    description: "DeepSeek's most capable model. Top-tier coding, math, and reasoning.",
  },
  {
    id: "[momo]DeepSeek-V4-Flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Tools", "Streaming"],
    description: "Fast DeepSeek V4 variant. Excellent speed-to-quality ratio for everyday tasks.",
  },
  {
    id: "[beagle]deepseek-ai/DeepSeek-V3.2",
    name: "DeepSeek V3.2",
    provider: "deepseek",
    context: "128K tokens",
    speed: 1,
    capabilities: ["Tools", "Streaming"],
    description: "Previous DeepSeek generation. Stable and fast for coding and analysis.",
  },
  {
    id: "[momo]Kimi-K2.6",
    name: "Kimi K2.6",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Tools", "Streaming", "Reasoning"],
    description: "Moonshot AI's latest model. Strong multilingual reasoning and tool use.",
  },
  {
    id: "[Aie]Mimo-V2.5-Pro",
    name: "Mimo V2.5 Pro",
    provider: "other",
    context: "128K tokens",
    speed: 2,
    capabilities: ["Streaming", "Reasoning"],
    description: "High-efficiency model optimized for long-form generation and analysis.",
  },
];

const CAP_ICONS: Record<Capability, ReactNode> = {
  Vision: <Eye size={12} />,
  Tools: <Wrench size={12} />,
  Streaming: <Zap size={12} />,
  Reasoning: <Brain size={12} />,
  "Long context": <Layers size={12} />,
};

const PROVIDER_CLASS: Record<ModelDef["provider"], string> = {
  gemini: styles.providerGemini ?? "",
  claude: styles.providerClaude ?? "",
  deepseek: styles.providerDeepseek ?? "",
  other: styles.providerOther ?? "",
};

const PROVIDER_LABEL: Record<ModelDef["provider"], string> = {
  gemini: "Google",
  claude: "Anthropic",
  deepseek: "DeepSeek",
  other: "Other",
};

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button className={styles.copyBtn} onClick={copy} title="Copy model ID">
      <span className={styles.modelId}>{id}</span>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: "easeOut" as const, delay: i * 0.05 },
  }),
};

export function Models() {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filter === "all" ? MODELS : MODELS.filter(m => m.provider === filter);

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <div className={styles.header}>
        <span className={styles.eyebrow}><span className={styles.eyebrowDash} />MULTI-PROVIDER // ALL ROUTES</span>
        <h1 className={styles.headline}>all models.<br />one key.</h1>
        <p className={styles.lede}>
          Every model below is reachable with your ADO key via the OpenAI-compatible API.
          Swap the model ID — nothing else changes.
        </p>
        <div className={styles.filters}>
          {(["all", "gemini", "claude", "deepseek", "other"] as Filter[]).map(f => (
            <button
              key={f}
              className={`${styles.filterBtn}${filter === f ? ` ${styles.active}` : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All models" : f === "gemini" ? "Google" : f === "claude" ? "Anthropic" : f === "deepseek" ? "DeepSeek" : "Other"}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        className={styles.grid}
        initial="hidden"
        animate="show"
      >
        {visible.map((model, i) => (
          <motion.div
            key={model.id}
            custom={i}
            variants={cardVariants}
            className={`${styles.card}${model.tag === "Newest" || model.tag === "Most capable" || model.tag === "Strongest" ? ` ${styles.featured}` : ""}`}
          >
            <div className={styles.cardTop}>
              <div className={styles.badges}>
                <span className={`${styles.providerBadge} ${PROVIDER_CLASS[model.provider]}`}>
                  {PROVIDER_LABEL[model.provider]}
                </span>
                {model.tag && <span className={styles.tagBadge}>{model.tag}</span>}
              </div>
              <div className={styles.speedBar}>
                {([1, 2, 3] as const).map(s => (
                  <span
                    key={s}
                    className={`${styles.speedDot}${s <= (4 - model.speed) ? ` ${styles.speedOn}` : ""}`}
                  />
                ))}
              </div>
            </div>

            <h3 className={styles.modelName}>{model.name}</h3>
            <p className={styles.modelDesc}>{model.description}</p>

            <div className={styles.meta}>
              <span className={styles.context}>{model.context}</span>
              <div className={styles.caps}>
                {model.capabilities.map(c => (
                  <span key={c} className={styles.cap}>
                    {CAP_ICONS[c]}<span>{c}</span>
                  </span>
                ))}
              </div>
            </div>

            <CopyId id={model.id} />
          </motion.div>
        ))}
      </motion.div>

      <section className={styles.ctaStrip}>
        <span className={styles.ctaEyebrow}><span className={styles.eyebrowDash} />FREE ACCESS</span>
        <h2 className={styles.ctaHeadline}>one key for all of them.</h2>
        <Link to="/login" className={styles.ctaBtn}>Get your free key</Link>
      </section>
    </motion.div>
  );
}
