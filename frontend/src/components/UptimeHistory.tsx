import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLiveModels } from "../api/queries";
import { enrichAll } from "../data/model-meta";
import styles from "./UptimeHistory.module.scss";

type Series = { id?: string; rate: number | null; series: (number | null)[] };
type History = {
  range: "24h" | "7d";
  bucketMinutes: number;
  buckets: string[];
  overall: Series;
  models: Series[];
};

const RANGES = [
  { id: "24h", label: "24 hours", phrase: "the last 24 hours" },
  { id: "7d", label: "7 days", phrase: "the last 7 days" },
] as const;

// Colour band for a success rate, null meaning no requests in that slot.
export function band(rate: number | null): "good" | "fair" | "poor" | "none" {
  if (rate === null) return "none";
  if (rate >= 99) return "good";
  if (rate >= 95) return "fair";
  return "poor";
}

export function fmtRate(rate: number | null): string {
  if (rate === null) return "No requests";
  return `${rate % 1 === 0 ? rate.toFixed(0) : rate.toFixed(1)}%`;
}

function slotLabel(startIso: string, minutes: number): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + minutes * 60_000);
  const day = start.toLocaleDateString([], { month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${t(start)} to ${t(end)}`;
}

function Strip({ s, h, label }: { s: Series; h: History; label: string }) {
  return (
    <div className={styles.strip} role="img" aria-label={`${label}: ${fmtRate(s.rate)} over ${RANGES.find(r => r.id === h.range)!.phrase}`}>
      {s.series.map((rate, i) => (
        <span
          key={h.buckets[i]}
          className={`${styles.bar} ${styles[`bar_${band(rate)}`]}`}
          title={`${slotLabel(h.buckets[i]!, h.bucketMinutes)}: ${fmtRate(rate)}`}
        />
      ))}
    </div>
  );
}

// Success rate of real requests per model, from ADO's request log: the share
// that got an answer from the model. Client errors (bad input, limits) aren't
// counted, since they say nothing about the model.
export function UptimeHistory() {
  const [range, setRange] = useState<"24h" | "7d">("24h");
  const { data, isError, isLoading } = useQuery({
    queryKey: ["status-history", range],
    queryFn: async (): Promise<History> => {
      const r = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/api/status/history?range=${range}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as History;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const { data: live } = useLiveModels();
  const names = new Map(enrichAll(live ?? []).map(m => [m.id, m.name]));
  const phrase = RANGES.find(r => r.id === range)!.phrase;

  return (
    <section className={styles.section} aria-labelledby="uptime-title">
      <div className={styles.head}>
        <p className={styles.label} id="uptime-title">Success rate</p>
        <div className={styles.toggle} role="group" aria-label="Time range">
          {RANGES.map(r => (
            <button
              key={r.id}
              type="button"
              aria-pressed={range === r.id}
              className={`${styles.toggleBtn}${range === r.id ? ` ${styles.toggleOn}` : ""}`}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className={styles.skeleton} />}
      {isError && <p className={styles.note}>The history couldn&apos;t be loaded. Try again in a minute.</p>}

      {data && (
        <>
          <div className={styles.overall}>
            <p className={styles.overallText}>
              {data.overall.rate === null
                ? `No requests in ${phrase} yet.`
                : <><strong>{fmtRate(data.overall.rate)}</strong> of requests succeeded in {phrase}.</>}
            </p>
            <Strip s={data.overall} h={data} label="All models" />
            <div className={styles.axis} aria-hidden="true">
              <span>{range === "24h" ? "24h ago" : "7d ago"}</span>
              <span>now</span>
            </div>
          </div>

          {data.models.length > 0 && (
            <div className={styles.models}>
              {data.models.map(m => (
                <div key={m.id} className={styles.modelRow}>
                  <div className={styles.modelHead}>
                    <span className={styles.modelName}>{names.get(m.id!) ?? m.id}</span>
                    <span className={`${styles.modelRate} ${styles[`rate_${band(m.rate)}`]}`}>{fmtRate(m.rate)}</span>
                  </div>
                  <Strip s={m} h={data} label={names.get(m.id!) ?? m.id!} />
                </div>
              ))}
            </div>
          )}

          <div className={styles.legend}>
            <span><i className={`${styles.key} ${styles.bar_good}`} /> 99% or more</span>
            <span><i className={`${styles.key} ${styles.bar_fair}`} /> 95 to 99%</span>
            <span><i className={`${styles.key} ${styles.bar_poor}`} /> under 95%</span>
            <span><i className={`${styles.key} ${styles.bar_none}`} /> no requests (quiet, not down)</span>
          </div>
          <p className={styles.note}>
            The share of requests that got an answer from the model. Requests turned away for bad input or usage
            limits aren&apos;t counted. A grey slot only means nobody used the model then; live health is in the
            list above.
          </p>
        </>
      )}
    </section>
  );
}
