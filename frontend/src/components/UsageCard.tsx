import { useEffect, useState } from "react";
import { useCurrentKey } from "../api/queries";
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
  const { data } = useCurrentKey({ enabled: true });
  const ts = useCountdown(data?.resetsAt);
  if (!data) return null;
  const pct = Math.min(100, Math.round((data.used / data.dailyLimit) * 100));
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <span>Today</span>
        <span className={styles.count}>{data.used} / {data.dailyLimit}</span>
      </div>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.row}>
        <span>Resets in</span>
        <span className={styles.timer}>{ts}</span>
      </div>
    </div>
  );
}
