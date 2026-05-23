import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Copy, Check, Zap, Brain, Eye, Wrench, Layers, Search, RefreshCw } from "lucide-react";
import { MODELS } from "../data/models";
import type { ModelDef, ModelProvider, Capability } from "../data/models";
import styles from "./Models.module.scss";

type LiveModel = {
  id: string;
  ado_status?: "available" | "degraded" | "down";
  context_length?: number;
  display_name?: string;
  provider?: string;
};

type EnrichedModel = ModelDef & { adoStatus: "available" | "degraded" | "down" };

const CAP_ICONS: Record<Capability, ReactNode> = {
  Vision: <Eye size={12} />,
  Tools: <Wrench size={12} />,
  Streaming: <Zap size={12} />,
  Reasoning: <Brain size={12} />,
  "Long context": <Layers size={12} />,
};

const PROVIDER_CLASS: Record<ModelDef["provider"], string> = {
  gemini:   styles.providerGemini   ?? "",
  claude:   styles.providerClaude   ?? "",
  deepseek: styles.providerDeepseek ?? "",
  openai:   styles.providerOpenai   ?? "",
  xai:      styles.providerXai      ?? "",
  other:    styles.providerOther    ?? "",
};

const PROVIDER_LABEL: Record<ModelDef["provider"], string> = {
  gemini:   "Google",
  claude:   "Anthropic",
  deepseek: "DeepSeek",
  openai:   "OpenAI",
  xai:      "xAI",
  other:    "Other",
};

function inferProvider(id: string): ModelProvider {
  const key = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  if (/gemini|google|bard/i.test(key)) return "gemini";
  if (/claude|anthropic/i.test(key)) return "claude";
  if (/deepseek/i.test(key)) return "deepseek";
  if (/gpt|openai|^o\d/i.test(key)) return "openai";
  if (/grok|xai/i.test(key)) return "xai";
  return "other";
}

function providerFromLabel(label: string): ModelProvider {
  const l = label.toLowerCase();
  if (l.includes("google") || l.includes("gemini")) return "gemini";
  if (l.includes("anthropic") || l.includes("claude")) return "claude";
  if (l.includes("deepseek")) return "deepseek";
  if (l.includes("openai")) return "openai";
  if (l.includes("xai") || l.includes("grok")) return "xai";
  return "other";
}

function fmtCtx(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(0)}M tokens`
       : n >= 1_000     ? `${(n / 1_000).toFixed(0)}K tokens`
       : `${n} tokens`;
}

function enrich(live: LiveModel): EnrichedModel {
  const match = MODELS.find(m => m.id === live.id);
  const adoStatus = live.ado_status ?? "available";
  if (match) return { ...match, adoStatus };

  const provider: ModelProvider = live.provider
    ? providerFromLabel(live.provider)
    : inferProvider(live.id);

  const rawName = (live.display_name || live.id)
    .replace(/^\[[^\]]+\]/, "")   // strip [TAG] prefix
    .replace(/^[^/]*\//, "")       // strip PROVIDER/ prefix
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();

  return {
    id: live.id,
    name: rawName || live.id,
    provider,
    context: live.context_length ? fmtCtx(live.context_length) : "",
    speed: 2 as const,
    capabilities: [] as Capability[],
    description: "",
    adoStatus,
  };
}

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
    opacity: 1, y: 0,
    transition: { duration: 0.28, ease: "easeOut" as const, delay: Math.min(i * 0.04, 0.5) },
  }),
};

export function Models() {
  const [liveModels, setLiveModels] = useState<LiveModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => { doLoad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function doLoad() {
    setLoading(true);
    setLoadErr(null);
    try {
      const r = await fetch("/api/models");
      const d = await r.json() as { data?: LiveModel[]; error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? `HTTP ${r.status}`);
      setLiveModels(d.data ?? []);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }

  // Build display list
  const enriched: EnrichedModel[] = liveModels
    ? liveModels.map(enrich)
    : MODELS.map(m => ({ ...m, adoStatus: "available" as const }));

  // Dynamic provider list for filter pills
  const providers = [...new Set(enriched.map(m => m.provider))];

  // Apply filter + search
  let visible = enriched;
  if (filter !== "all") visible = visible.filter(m => m.provider === filter);
  if (search) {
    const q = search.toLowerCase();
    visible = visible.filter(m =>
      m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    );
  }

  // Stats (live only)
  const stats = liveModels ? {
    total:     liveModels.length,
    available: liveModels.filter(m => !m.ado_status || m.ado_status === "available").length,
    degraded:  liveModels.filter(m => m.ado_status === "degraded").length,
    down:      liveModels.filter(m => m.ado_status === "down").length,
    providers: new Set(liveModels.map(m => m.provider ?? "Main")).size,
  } : null;

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <div className={styles.header}>
        <h1 className={styles.headline}>all models.<br />one key.</h1>
        <p className={styles.lede}>
          Every model below is reachable with your ADO key via the OpenAI-compatible API.
          Swap the model ID. Nothing else changes.
        </p>

        <div className={styles.keyBar}>
          <button
            className={styles.loadBtn}
            onClick={() => doLoad()}
            disabled={loading}
          >
            {loading ? <span className={styles.btnSpinner} /> : <RefreshCw size={13} />}
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {loadErr && <p className={styles.keyError}>{loadErr}</p>}

        {/* Stats — only when live */}
        {stats && (
          <div className={styles.statsRow}>
            <div className={styles.statCell}>
              <span className={styles.statLabel}>Total</span>
              <span className={styles.statVal}>{stats.total}</span>
            </div>
            <div className={styles.statCell}>
              <span className={styles.statLabel}>Available</span>
              <span className={`${styles.statVal} ${styles.statGreen}`}>{stats.available}</span>
            </div>
            <div className={styles.statCell}>
              <span className={styles.statLabel}>Degraded</span>
              <span className={`${styles.statVal} ${styles.statWarn}`}>{stats.degraded}</span>
            </div>
            <div className={styles.statCell}>
              <span className={styles.statLabel}>Down</span>
              <span className={`${styles.statVal} ${styles.statRed}`}>{stats.down}</span>
            </div>
            <div className={styles.statCell}>
              <span className={styles.statLabel}>Providers</span>
              <span className={styles.statVal}>{stats.providers}</span>
            </div>
          </div>
        )}

        {/* Filters + search */}
        <div className={styles.filterRow}>
          <div className={styles.filters}>
            <button
              className={`${styles.filterBtn}${filter === "all" ? ` ${styles.active}` : ""}`}
              onClick={() => setFilter("all")}
            >
              {liveModels ? `All (${enriched.length})` : "All models"}
            </button>
            {providers.map(p => {
              const count = enriched.filter(m => m.provider === p).length;
              const label = PROVIDER_LABEL[p as ModelDef["provider"]] ?? p;
              return (
                <button
                  key={p}
                  className={`${styles.filterBtn}${filter === p ? ` ${styles.active}` : ""}`}
                  onClick={() => setFilter(p)}
                >
                  {label}{liveModels ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>

          {liveModels && (
            <div className={styles.searchWrap}>
              <Search size={13} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search models…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        {!liveModels && !loading && (
          <p className={styles.staticNote}>
            Showing a curated selection. Live roster unavailable.
          </p>
        )}
      </div>

      <motion.div className={styles.grid} initial="hidden" animate="show">
        {visible.map((model, i) => {
          const featured = model.tag === "Newest" || model.tag === "Most capable" || model.tag === "Strongest";
          return (
            <motion.div
              key={model.id}
              custom={i}
              variants={cardVariants}
              className={[
                styles.card,
                featured ? styles.featured : "",
                model.adoStatus === "degraded" ? styles.cardDegraded : "",
                model.adoStatus === "down"      ? styles.cardDown      : "",
              ].filter(Boolean).join(" ")}
            >
              <div className={styles.cardTop}>
                <div className={styles.badges}>
                  <span className={`${styles.providerBadge} ${PROVIDER_CLASS[model.provider]}`}>
                    {PROVIDER_LABEL[model.provider] ?? model.provider}
                  </span>
                  {model.tag && <span className={styles.tagBadge}>{model.tag}</span>}
                  {model.adoStatus === "degraded" && <span className={styles.statusDegraded}>⚡ Degraded</span>}
                  {model.adoStatus === "down"      && <span className={styles.statusDown}>✕ Down</span>}
                </div>

                <div className={styles.speedBar}>
                  {liveModels
                    ? <span className={`${styles.statusDot} ${styles[`dot_${model.adoStatus}`]}`} />
                    : ([1, 2, 3] as const).map(s => (
                        <span key={s} className={`${styles.speedDot}${s <= (4 - model.speed) ? ` ${styles.speedOn}` : ""}`} />
                      ))
                  }
                </div>
              </div>

              <h3 className={styles.modelName}>{model.name}</h3>

              <div className={styles.meta}>
                {model.context && <span className={styles.context}>{model.context}</span>}
                {model.capabilities.length > 0 && (
                  <div className={styles.caps}>
                    {model.capabilities.map(c => (
                      <span key={c} className={styles.cap}>
                        {CAP_ICONS[c]}<span>{c}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <CopyId id={model.id} />
            </motion.div>
          );
        })}
      </motion.div>

      <section className={styles.ctaStrip}>
        <span className={styles.ctaEyebrow}><span className={styles.eyebrowDash} />FREE ACCESS</span>
        <h2 className={styles.ctaHeadline}>one key for all of them.</h2>
        <Link to="/login" className={styles.ctaBtn}>Get your free key</Link>
      </section>
    </motion.div>
  );
}
