import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ArrowRight, X } from "lucide-react";
import { ModelDrawer } from "../components/ModelDrawer";
import { CAP_ICONS, CapList, CopyId, MakerMark, SHOWN_CAPS, StatusPill, makerStyle, specsOf } from "../components/ModelBits";
import { band, fmtRate } from "../components/UptimeHistory";
import type { Capability, ModelProvider } from "../data/models";
import { enrichAll } from "../data/model-meta";
import type { EnrichedModel } from "../data/model-meta";
import { PROVIDER_NAME } from "../data/catalog";
import { useLiveModels, useMe } from "../api/queries";
import { useStatusHistory } from "../api/status-history";
import type { Series } from "../api/status-history";
import { ApiError } from "../api/client";
import styles from "./Models.module.scss";

const LOAD_FAILED = "Couldn't load the model list. Try again in a minute, or check the Status page.";

// Capability filters as they appear in the URL (?need=vision,reasoning).
const CAP_SLUG: Record<Capability, string> = {
  Reasoning: "reasoning", Vision: "vision", Tools: "tools", "Long context": "long-context", Streaming: "streaming",
};

type Group = { provider: ModelProvider; name: string; models: EnrichedModel[] };

// Models grouped by maker, the biggest group first and "Other" always last.
// Within a group the catalogue order holds, except that models that are down go last.
function groupByMaker(models: EnrichedModel[]): Group[] {
  const groups = new Map<ModelProvider, EnrichedModel[]>();
  for (const m of models) groups.set(m.provider, [...(groups.get(m.provider) ?? []), m]);
  return [...groups.entries()]
    .map(([provider, ms]) => ({
      provider,
      name: PROVIDER_NAME[provider],
      models: [...ms.filter((m) => m.adoStatus !== "down"), ...ms.filter((m) => m.adoStatus === "down")],
    }))
    .sort((a, b) =>
      Number(a.provider === "other") - Number(b.provider === "other") ||
      b.models.length - a.models.length ||
      a.name.localeCompare(b.name));
}

// A provider is fine when all its models are up, down when none are.
function groupStatus(ms: EnrichedModel[]): "available" | "degraded" | "down" {
  if (ms.every((m) => m.adoStatus === "down")) return "down";
  if (ms.every((m) => m.adoStatus === "available")) return "available";
  return "degraded";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// The last 24 hours at a glance: one slot an hour, coloured by success rate.
function SuccessBar({ s, loading }: { s?: Series; loading: boolean }) {
  if (!s) {
    if (!loading) return null;
    return <div className={styles.success}><div className={`${styles.successStrip} ${styles.successLoading}`} /></div>;
  }
  const label = s.rate === null ? "No requests in the last 24 hours" : `${fmtRate(s.rate)} of requests got an answer in the last 24 hours`;
  return (
    <div className={styles.success} title={label}>
      <div className={styles.successStrip} role="img" aria-label={label}>
        {s.series.map((r, i) => <span key={i} className={styles[`slot_${band(r)}`]} />)}
      </div>
      <span className={`${styles.successRate} ${styles[`rate_${band(s.rate)}`]}`}>
        {s.rate === null ? "quiet" : fmtRate(s.rate)}
        <span className={styles.successSpan}>24h</span>
      </span>
    </div>
  );
}

function ModelCard({ model: m, history, historyLoading, onOpen }: {
  model: EnrichedModel;
  history?: Series;
  historyLoading: boolean;
  onOpen: () => void;
}) {
  const specs = specsOf(m);
  return (
    <article
      className={[styles.card, styles[`card_${m.adoStatus}`]].filter(Boolean).join(" ")}
      style={makerStyle(m.provider)}
      // Clicking the card opens its details; the buttons and links inside keep their own action.
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) onOpen(); }}
    >
      <div className={styles.cardHead}>
        <div className={styles.nameBlock}>
          {m.tag && <span className={styles.tag}>{m.tag}</span>}
          <h3 className={styles.modelName}>
            <button type="button" className={styles.nameBtn} onClick={onOpen} aria-label={`Details for ${m.name}`}>{m.name}</button>
          </h3>
        </div>
        <StatusPill status={m.adoStatus} />
      </div>

      {m.description && <p className={styles.modelDesc}>{m.description}</p>}

      {specs.length > 0 && (
        <dl className={styles.specs}>
          {specs.map(([k, v]) => (
            <div key={k} className={styles.spec}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <CapList caps={m.capabilities} />

      <div className={styles.cardFoot}>
        <SuccessBar s={history} loading={historyLoading} />
        <div className={styles.footRow}>
          <CopyId id={m.id} />
          <Link to={`/playground?model=${encodeURIComponent(m.id)}`} className={styles.tryBtn} aria-label={`Try ${m.name} in the Playground`}>
            Try it <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function Models() {
  const { data: me } = useMe();
  const { data: live, isLoading, error, refetch, isFetching } = useLiveModels();
  const { data: history, isLoading: historyLoading } = useStatusHistory("24h");
  const [params, setParams] = useSearchParams();

  const models = useMemo(() => enrichAll(live ?? []), [live]);
  const makers = useMemo(() => groupByMaker(models), [models]);
  const historyById = useMemo(() => new Map((history?.models ?? []).map((s) => [s.id, s])), [history]);

  // Filters live in the URL, so a filtered list (or an open model) can be shared.
  const makerParam = params.get("provider");
  const activeMaker = makers.find((g) => g.provider === makerParam)?.provider ?? "all";
  const needParam = (params.get("need") ?? "").split(",").filter(Boolean);
  const search = params.get("q") ?? "";
  const openId = params.get("model");
  const open = openId ? models.find((m) => m.id === openId) : undefined;

  function update(changes: Record<string, string | null>) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v); else next.delete(k);
      }
      return next;
    // Same page, so ScrollRestoration mustn't jump to the top on every filter.
    }, { replace: true, preventScrollReset: true });
  }

  // A capability filter only helps when it splits the list.
  const capFilters = SHOWN_CAPS.filter((c) => {
    const n = models.filter((m) => m.capabilities.includes(c)).length;
    return n > 0 && n < models.length;
  });
  const activeNeed = capFilters.filter((c) => needParam.includes(CAP_SLUG[c]));
  const q = search.trim().toLowerCase();

  const matches = (m: EnrichedModel) =>
    (activeMaker === "all" || m.provider === activeMaker) &&
    activeNeed.every((c) => m.capabilities.includes(c)) &&
    (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || PROVIDER_NAME[m.provider].toLowerCase().includes(q));
  const groups = makers.map((g) => ({ ...g, models: g.models.filter(matches) })).filter((g) => g.models.length > 0);

  const down = models.filter((m) => m.adoStatus === "down").length;
  const degraded = models.filter((m) => m.adoStatus === "degraded").length;
  const available = models.length - down - degraded;

  const showMakers = makers.length > 1;
  const showSearch = models.length > 6;
  const showToolbar = showMakers || capFilters.length > 0 || showSearch;

  function toggleNeed(c: Capability) {
    const next = activeNeed.includes(c) ? activeNeed.filter((x) => x !== c) : [...activeNeed, c];
    update({ need: next.map((x) => CAP_SLUG[x]).join(",") || null });
  }
  function clearFilters() {
    update({ provider: null, need: null, q: null });
  }

  let loadErr = "";
  if (error && !live) {
    const msg = error instanceof ApiError ? error.message : "";
    loadErr = msg ? msg.charAt(0).toUpperCase() + msg.slice(1) + "." : LOAD_FAILED;
  }

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <header className={styles.hero}>
        <h1 className={styles.headline}>all models.<br />one key.</h1>
        <p className={styles.lede}>
          Every model below works with your one ADO key through the OpenAI-compatible API.
          Swap the model ID; nothing else changes.
        </p>
        {live && models.length > 0 && (
          <p className={styles.summary}>
            <span>{plural(models.length, "model")} from {plural(makers.length, "provider")}</span>
            <span className={styles.summaryDot} aria-hidden>·</span>
            <span>
              {down + degraded === 0
                ? "all available"
                : [available && `${available} available`, degraded && `${degraded} degraded`, down && `${down} down`].filter(Boolean).join(", ")}
            </span>
            <Link to="/status" className={styles.summaryLink}>Status <ArrowRight size={12} /></Link>
          </p>
        )}
      </header>

      {showToolbar && (
        <div className={styles.toolbarWrap}>
          <div className={styles.toolbar}>
            {showMakers && (
              <div className={styles.pills} role="group" aria-label="Provider">
                <button
                  type="button"
                  className={`${styles.pill}${activeMaker === "all" ? ` ${styles.pillOn}` : ""}`}
                  aria-pressed={activeMaker === "all"}
                  onClick={() => update({ provider: null })}
                >
                  All ({models.length})
                </button>
                {makers.map((g) => (
                  <button
                    key={g.provider}
                    type="button"
                    className={`${styles.pill}${activeMaker === g.provider ? ` ${styles.pillOn}` : ""}`}
                    aria-pressed={activeMaker === g.provider}
                    onClick={() => update({ provider: g.provider })}
                  >
                    {g.name} ({g.models.length})
                  </button>
                ))}
              </div>
            )}

            {capFilters.length > 0 && (
              <div className={styles.pills} role="group" aria-label="Capabilities">
                {capFilters.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.capPill}${activeNeed.includes(c) ? ` ${styles.capPillOn}` : ""}`}
                    aria-pressed={activeNeed.includes(c)}
                    onClick={() => toggleNeed(c)}
                  >
                    {CAP_ICONS[c]}{c}
                  </button>
                ))}
              </div>
            )}

            {showSearch && (
              <div className={styles.searchWrap}>
                <Search size={13} className={styles.searchIcon} />
                <input
                  className={styles.searchInput}
                  type="search"
                  placeholder="Search models"
                  aria-label="Search models"
                  value={search}
                  onChange={(e) => update({ q: e.target.value || null })}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.body}>
        {isLoading && (
          <div className={styles.grid} aria-label="Loading models">
            {[0, 1, 2].map((i) => <div key={i} className={styles.skeleton} />)}
          </div>
        )}

        {loadErr && (
          <div className={styles.notice}>
            <p>{loadErr}</p>
            <button type="button" className={styles.noticeBtn} onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? "Trying…" : "Try again"}
            </button>
          </div>
        )}

        {live && models.length === 0 && (
          <div className={styles.notice}>
            <p>No models are being served right now. Check the Status page for what&apos;s going on.</p>
            <Link to="/status" className={styles.noticeBtn}>Status</Link>
          </div>
        )}

        {models.length > 0 && groups.length === 0 && (
          <div className={styles.notice}>
            <p>{q ? <>No models match &ldquo;{search.trim()}&rdquo;{activeMaker !== "all" || activeNeed.length > 0 ? " with these filters" : ""}.</> : "No models match these filters."}</p>
            <button type="button" className={styles.noticeBtn} onClick={clearFilters}><X size={13} /> Clear filters</button>
          </div>
        )}

        {groups.map((g) => {
          const status = groupStatus(g.models);
          return (
            <section key={g.provider} className={styles.group} aria-labelledby={`group-${g.provider}`}>
              <h2 id={`group-${g.provider}`} className={styles.groupTitle}>
                <MakerMark provider={g.provider} size={24} />
                {g.name}
                <span className={styles.groupCount}>{plural(g.models.length, "model")}</span>
                <span className={`${styles.groupDot} ${styles[`groupDot_${status}`]}`} title={status === "available" ? "All available" : status === "down" ? "All down" : "Some degraded or down"} />
              </h2>
              <div className={`${styles.grid}${g.models.length === 1 ? ` ${styles.gridOne}` : ""}`}>
                {g.models.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    history={historyById.get(m.id)}
                    historyLoading={historyLoading}
                    onOpen={() => update({ model: m.id })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {open && <ModelDrawer model={open} onClose={() => update({ model: null })} />}

      <section className={styles.ctaStrip}>
        <h2 className={styles.ctaHeadline}>one key for all of them.</h2>
        {me
          ? <Link to="/dashboard" className={styles.ctaBtn}>Go to your dashboard</Link>
          : <Link to="/sign-up" className={styles.ctaBtn}>Get your free key</Link>}
      </section>
    </motion.div>
  );
}
