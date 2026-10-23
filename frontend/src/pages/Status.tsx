import { motion } from "framer-motion";
import { PROVIDER_NAME } from "../data/catalog";
import { providerOf } from "../data/model-meta";
import type { LiveModel } from "../data/model-meta";
import type { ModelProvider } from "../data/models";
import { useLiveModels } from "../api/queries";
import { UptimeHistory } from "../components/UptimeHistory";
import styles from "./Status.module.scss";

// The page checks again on its own every hour (and when you come back to the
// tab after a few minutes). There's no refresh button: one that anyone can
// click repeatedly only adds load.
const REFRESH_MS = 60 * 60_000;

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
  const statuses = models.map(m => m.ado_status ?? "available");
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
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

// Providers in a fixed order, each with how many of its models are up.
function buildRows(models: LiveModel[]): ProviderRow[] {
  const grouped = new Map<ProviderKey, LiveModel[]>();
  for (const m of models) {
    const pk = providerOf(m);
    if (!grouped.has(pk)) grouped.set(pk, []);
    grouped.get(pk)!.push(m);
  }
  return PROVIDER_ORDER
    .filter(pk => grouped.has(pk))
    .map(pk => ({
      key:    pk,
      label:  PROVIDER_LABELS[pk],
      status: computeProviderStatus(grouped.get(pk)!),
      count:  grouped.get(pk)!.length,
    }));
}

export function Status() {
  const { data: models, isError, dataUpdatedAt, errorUpdatedAt } = useLiveModels({ refetchInterval: REFRESH_MS });
  // Don't list providers we can't confirm; a failed check says so instead.
  const failed = isError && !models;
  const rows = models ? buildRows(models) : failed ? [] : null;
  const overall: OverallStatus = models ? computeOverall(rows ?? []) : "unknown";
  const updated = dataUpdatedAt || errorUpdatedAt;
  const updatedAt = updated ? new Date(updated) : null;

  const overallText = {
    operational: "All systems operational",
    degraded:    "Degraded performance",
    outage:      "Service outage",
    unknown:     failed ? "Status unavailable" : "Checking status…",
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
              <p className={styles.updatedAt}>updated {fmtTime(updatedAt)} · refreshes hourly</p>
            )}
          </div>
        </div>
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
            {failed ? "The status check couldn't reach ADO. Reload the page in a minute to try again." : "No models are being served right now."}
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
