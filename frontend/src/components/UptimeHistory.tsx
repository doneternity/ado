import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useLiveModels } from "../api/queries";
import { useStatusHistory } from "../api/status-history";
import type { History, Series } from "../api/status-history";
import { enrichAll } from "../data/model-meta";
import styles from "./UptimeHistory.module.scss";

export const RANGES = [
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

const time = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// What a slot covers: just the hours in the 24-hour view, the day too in the
// 7-day view ("Tue 21 Oct, 12:00 to 18:00").
export function slotLabel(startIso: string, minutes: number, range: History["range"]): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + minutes * 60_000);
  const span = `${time(start)} to ${time(end)}`;
  if (range === "24h") return span;
  const day = start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${span}`;
}

// A row of slots. Hovering a slot (or tapping it, or moving along with the
// arrow keys) shows a tooltip with its time and success rate.
export function Strip({ s, h, label }: { s: Series; h: History; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const n = s.series.length;

  // A tap elsewhere closes a tooltip opened by tapping.
  useEffect(() => {
    if (active === null) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [active]);

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setActive(a => Math.min(n - 1, Math.max(0, a === null ? (step > 0 ? 0 : n - 1) : a + step)));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : n - 1);
    } else if (e.key === "Escape") {
      setActive(null);
    }
  }

  // Keep the tooltip inside the strip at either end.
  let tipStyle: CSSProperties | undefined;
  if (active !== null) {
    const centre = ((active + 0.5) / n) * 100;
    tipStyle = centre < 15
      ? { left: `${(active / n) * 100}%` }
      : centre > 85
        ? { right: `${((n - active - 1) / n) * 100}%` }
        : { left: `${centre}%`, transform: "translateX(-50%)" };
  }
  const rate = active === null ? null : s.series[active] ?? null;

  return (
    <div
      ref={wrapRef}
      className={styles.stripWrap}
      onPointerLeave={e => { if (e.pointerType === "mouse") setActive(null); }}
    >
      <div
        className={styles.strip}
        role="img"
        aria-label={`${label}: ${fmtRate(s.rate)} over ${RANGES.find(r => r.id === h.range)!.phrase}`}
        aria-describedby={active !== null ? tipId : undefined}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        {s.series.map((r, i) => (
          <span
            key={h.buckets[i]}
            className={`${styles.bar} ${styles[`bar_${band(r)}`]}${active === i ? ` ${styles.barActive}` : ""}`}
            onPointerEnter={e => { if (e.pointerType === "mouse") setActive(i); }}
            onClick={() => setActive(a => (a === i ? null : i))}
          />
        ))}
      </div>
      {active !== null && (
        <div id={tipId} role="tooltip" className={styles.tip} style={tipStyle}>
          <span className={styles.tipTime}>{slotLabel(h.buckets[active]!, h.bucketMinutes, h.range)}</span>
          <span className={styles.tipRate}>
            <i className={`${styles.key} ${styles[`bar_${band(rate)}`]}`} />
            {rate === null ? "No requests" : `${fmtRate(rate)} succeeded`}
          </span>
        </div>
      )}
    </div>
  );
}

// Success rate of real requests per model, from ADO's request log: the share
// that got an answer from the model. Client errors (bad input, limits) aren't
// counted, since they say nothing about the model.
export function UptimeHistory() {
  const [range, setRange] = useState<"24h" | "7d">("24h");
  const { data, isError, isLoading } = useStatusHistory(range);
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
