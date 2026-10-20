import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { PROVIDER_NAME } from "../data/catalog";
import { providerOf } from "../data/model-meta";
import type { ModelProvider } from "../data/models";
import { UptimeHistory } from "../components/UptimeHistory";
import styles from "./Status.module.scss";

const BASE = (import.meta.env.VITE_API_BASE_URL ?? "") as string;

type AdoStatus = "available" | "degraded" | "down";

type LiveModel = {
  id: string;
  ado_status: AdoStatus;
  provider?: string;
  owned_by?: string;
  display_name: string;
  context_length: number;
};

type ProviderKey = ModelProvider;

const PROVIDER_LABELS = PROVIDER_NAME;

const PROVIDER_ORDER: ProviderKey[] = ["gemini", "deepseek", "openai", "claude", "xai", "zai", "moonshot", "other"];

type ProviderStatus = "operational" | "degraded" | "down" | "unknown";

type ProviderRow = {
  key: ProviderKey;
  label: string;
  status: ProviderStatus;
  count: number;
};

type OverallStatus = "operational" | "degraded" | "outage" | "unknown";

function computeProviderStatus(models: LiveModel[]): ProviderStatus {
  if (models.length === 0) return "down";
  const statuses = models.map(m => m.ado_status);
  const allDown = statuses.every(s => s === "down");
  if (allDown) return "down";
  const anyDegraded = statuses.some(s => s === "degraded");
  const anyDown = statuses.some(s => s === "down");
  if (anyDegraded || anyDown) return "degraded";
  return "operational";
}

function computeOverall(rows: ProviderRow[]): OverallStatus {
  if (rows.length === 0) return "outage"; // reached ADO, but nothing is being served
  if (rows.every(r => r.status === "unknown")) return "unknown";
  if (rows.every(r => r.status === "operational")) return "operational";
  if (rows.some(r => r.status === "down")) return "outage";
  if (rows.some(r => r.status === "degraded")) return "degraded";
  return "operational";
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

export function Status() {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [overall, setOverall] = useState<OverallStatus>("unknown");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => { doFetch(); }, []);

  async function doFetch() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/models`);
      const d = await r.json() as { data?: LiveModel[] };
      const models: LiveModel[] = d.data ?? [];

      const grouped = new Map<ProviderKey, LiveModel[]>();
      for (const m of models) {
        const pk = providerOf(m);
        if (!grouped.has(pk)) grouped.set(pk, []);
        grouped.get(pk)!.push(m);
      }

      const built: ProviderRow[] = PROVIDER_ORDER
        .filter(pk => grouped.has(pk))
        .map(pk => ({
          key:    pk,
          label:  PROVIDER_LABELS[pk],
          status: computeProviderStatus(grouped.get(pk)!),
          count:  grouped.get(pk)!.length,
        }));

      setRows(built);
      setOverall(computeOverall(built));
      setUpdatedAt(new Date());
    } catch {
      // Don't list providers we can't confirm; say the check failed instead.
      setRows([]);
      setOverall("unknown");
      setUpdatedAt(new Date());
    } finally {
      setLoading(false);
    }
  }

  const overallText = {
    operational: "All systems operational",
    degraded:    "Degraded performance",
    outage:      "Service outage",
    unknown:     "Checking status…",
  }[overall];

  return (
    <motion.div className={styles.page} {...fade}>

      <div className={styles.hero}>
        <h1 className={styles.headline}>status.</h1>
        <p className={styles.sub}>Live health of ADO&apos;s AI provider network.</p>
      </div>

      <div className={styles.overallCard} data-status={overall}>
        <div className={styles.overallLeft}>
          <span className={`${styles.pulseDot} ${styles[`dot_${overall}`]}`} />
          <div>
            <p className={styles.overallLabel}>{overallText}</p>
            {updatedAt && (
              <p className={styles.updatedAt}>updated {fmtTime(updatedAt)}</p>
            )}
          </div>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={doFetch}
          disabled={loading}
          aria-label="Refresh status"
        >
          <RefreshCw size={13} className={loading ? styles.spinning : undefined} />
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      <div className={styles.providerSection}>
        <p className={styles.sectionLabel}>Providers</p>

        {rows === null ? (
          <div className={styles.providerList}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className={styles.skeletonRow} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className={styles.sub}>
            {overall === "unknown" ? "The status check couldn't reach ADO. Try refreshing in a minute." : "No models are being served right now."}
          </p>
        ) : (
          <div className={styles.providerList}>
            {rows.map((row, i) => (
              <motion.div
                key={row.key}
                className={styles.providerRow}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut", delay: i * 0.04 }}
              >
                <div className={styles.providerInfo}>
                  <span className={`${styles.rowDot} ${styles[`rowDot_${row.status}`]}`} />
                  <span className={styles.providerName}>{row.label}</span>
                  {row.count > 0 && (
                    <span className={styles.modelCount}>{row.count} model{row.count !== 1 ? "s" : ""}</span>
                  )}
                </div>
                <StatusBadge status={row.status} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <UptimeHistory />

    </motion.div>
  );
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
      {status === "operational" && "Operational"}
      {status === "degraded"    && "Degraded"}
      {status === "down"        && "Down"}
      {status === "unknown"     && "Unknown"}
    </span>
  );
}
