import { useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Copy, Check, Zap, Brain, Eye, Wrench, Layers } from "lucide-react";
import { MODELS } from "../data/models";
import type { ModelDef, Capability } from "../data/models";
import styles from "./Models.module.scss";

type Filter = "all" | "gemini" | "claude" | "deepseek" | "other";

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
