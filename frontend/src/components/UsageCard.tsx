import { useEffect, useState } from "react";
import { useCurrentKey } from "../api/queries";
import { Skeleton } from "./Skeleton";
import styles from "./UsageCard.module.scss";

function fmt(n: number) { return String(n).padStart(2, "0"); }

function useCountdown(toIso: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!toIso) return "--:--:--";
  const diff = Math.max(0, new Date(toIso).getTime() - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return `${fmt(h)}:${fmt(m)}:${fmt(s)}`;
}

export function UsageCard() {
  const { data, isLoading } = useCurrentKey({ enabled: true });
  const ts = useCountdown(data?.resetsAt);

  if (isLoading) {
    return (
      <div className={styles.card}>
        <div className={styles.row}>
          <Skeleton width="3.5rem" height="0.7rem" />
          <Skeleton width="5rem" height="2rem" />
        </div>
        <Skeleton height="11px" />
        <div className={styles.row}>
          <Skeleton width="4rem" height="0.7rem" />
          <Skeleton width="6rem" height="0.7rem" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const pct = Math.min(100, Math.round((data.used / data.dailyLimit) * 100));
  const nearLimit = pct >= 80;

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <span className={styles.label}>Today</span>
        <span className={`${styles.count}${nearLimit ? ` ${styles.warn}` : ""}`}>
          {data.used}<span className={styles.of}> / {data.dailyLimit}</span>
        </span>
      </div>
      <div className={styles.bar}>
        <div
          className={`${styles.fill}${nearLimit ? ` ${styles.fillWarn}` : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>Resets in</span>
        <span className={styles.timer}>{ts}</span>
      </div>
    </div>
  );
}
