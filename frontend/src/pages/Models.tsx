import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Copy, Check, Zap, Brain, Eye, Wrench, Layers } from "lucide-react";
import styles from "./Models.module.scss";

type Capability = "Vision" | "Tools" | "Streaming" | "Reasoning" | "Long context";
type Filter = "all" | "flash" | "pro";

interface ModelDef {
  id: string;
  name: string;
  family: "2.5" | "2.0" | "1.5";
  tier: "flash" | "pro";
  context: string;
  speed: 1 | 2 | 3;
  capabilities: Capability[];
  tag?: string;
  description: string;
}

const MODELS: ModelDef[] = [
  {
    id: "gemini-2.5-flash-preview-05-20",
    name: "Gemini 2.5 Flash",
    family: "2.5",
    tier: "flash",
    context: "1M tokens",
    speed: 1,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Newest",
    description: "Latest Flash with hybrid reasoning. Best speed-to-capability ratio.",
  },
  {
    id: "gemini-2.5-pro-preview-05-06",
    name: "Gemini 2.5 Pro",
    family: "2.5",
    tier: "pro",
    context: "1M tokens",
    speed: 3,
    capabilities: ["Vision", "Tools", "Streaming", "Reasoning"],
    tag: "Most capable",
    description: "Frontier-level reasoning and coding. Highest accuracy, slower output.",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    family: "2.0",
    tier: "flash",
    context: "1M tokens",
    speed: 1,
    capabilities: ["Vision", "Tools", "Streaming"],
    tag: "Stable",
    description: "Fast, reliable, multimodal. Production-grade with broad capability support.",
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    family: "2.0",
    tier: "flash",
    context: "1M tokens",
    speed: 1,
    capabilities: ["Streaming"],
    description: "Lightest model. Ideal for simple tasks where speed is everything.",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    family: "1.5",
    tier: "pro",
    context: "2M tokens",
    speed: 2,
    capabilities: ["Vision", "Tools", "Streaming", "Long context"],
    tag: "Long context",
    description: "Previous gen Pro with the largest context window. Up to 2M token input.",
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    family: "1.5",
    tier: "flash",
    context: "1M tokens",
    speed: 1,
    capabilities: ["Vision", "Streaming"],
    description: "Previous gen Flash. Lightweight with broad language support.",
  },
];

const CAP_ICONS: Record<Capability, ReactNode> = {
  Vision: <Eye size={12} />,
  Tools: <Wrench size={12} />,
  Streaming: <Zap size={12} />,
  Reasoning: <Brain size={12} />,
  "Long context": <Layers size={12} />,
};

const FAMILY_CLASS = {
  "2.5": styles.family25,
  "2.0": styles.family20,
  "1.5": styles.family15,
} as Record<ModelDef["family"], string>;

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
  const visible = filter === "all" ? MODELS : MODELS.filter(m => m.tier === filter);

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <div className={styles.header}>
        <span className={styles.eyebrow}>GOOGLE GEMINI // ALL ROUTES</span>
        <h1 className={styles.headline}>all models.<br />one key.</h1>
        <p className={styles.lede}>
          Every model below is reachable with your ADO key via the OpenAI-compatible API.
          Swap the model ID — nothing else changes.
        </p>
        <div className={styles.filters}>
          {(["all", "flash", "pro"] as Filter[]).map(f => (
            <button
              key={f}
              className={`${styles.filterBtn}${filter === f ? ` ${styles.active}` : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All models" : f === "flash" ? "Flash" : "Pro"}
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
            className={`${styles.card}${model.tag === "Newest" || model.tag === "Most capable" ? ` ${styles.featured}` : ""}`}
          >
            <div className={styles.cardTop}>
              <div className={styles.badges}>
                <span className={`${styles.familyBadge} ${FAMILY_CLASS[model.family]}`}>
                  {model.family}
                </span>
                <span className={`${styles.tierBadge} ${model.tier === "pro" ? styles.tierPro : styles.tierFlash}`}>
                  {model.tier}
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
        <span className={styles.ctaEyebrow}>FREE ACCESS</span>
        <h2 className={styles.ctaHeadline}>one key for all of them.</h2>
        <Link to="/login" className={styles.ctaBtn}>Get your free key</Link>
      </section>
    </motion.div>
  );
}
