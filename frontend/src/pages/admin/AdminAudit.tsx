import { motion } from "framer-motion";
import { ScrollText } from "lucide-react";
import { useAdminAudit, type AuditEntry } from "../../api/admin";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

// Plain-English names for the admin routes the audit log records. Anything
// not listed (a newer endpoint) shows its method and route instead.
const ACTIONS: Record<string, string | ((d: Record<string, unknown>) => string)> = {
  "POST /providers": "Added provider",
  "PUT /providers/{id}": "Edited provider",
  "DELETE /providers/{id}": "Deleted provider",
  "PATCH /providers/{id}/active": (d) => (d.active ? "Turned provider on" : "Turned provider off"),
  "PUT /providers/{id}/models": (d) => (d.mode === "only" ? `Chose ${d.models} models to show` : Number(d.models) > 0 ? `Hid ${d.models} models` : "Showed all models"),
  "POST /providers/{id}/keys": "Added provider keys",
  "PATCH /providers/{id}/keys/{keyId}/active": (d) => (d.active ? "Turned a provider key on" : "Turned a provider key off"),
  "DELETE /providers/{id}/keys/{keyId}": "Deleted a provider key",
  "PATCH /users/{id}/role": "Changed role",
  "PATCH /users/{id}/banned": (d) => (d.banned ? "Banned user" : "Unbanned user"),
  "DELETE /users/{id}": "Deleted account",
  "PUT /users/{id}/plan": "Changed plan",
  "POST /users/inactive/delete": "Deleted inactive accounts",
  "PUT /plans/{id}": "Saved plan",
  "DELETE /plans/{id}": "Deleted plan",
  "PUT /quotas/global": "Set the daily quota",
  "PUT /quotas/rpm": "Set the rate limit",
  "PUT /quotas/users/by-email": "Set a user's quota",
  "DELETE /quotas/users/{id}": "Removed a user's quota",
  "PUT /slots": "Set free tier slots",
  "DELETE /errors/{id}": "Deleted an error entry",
  "DELETE /errors": "Cleared old errors",
  "POST /maintenance/toggle": (d) => (d.enabled ? "Turned maintenance on" : "Turned maintenance off"),
  "PUT /announcement": (d) => (d.cleared ? "Cleared the announcement" : "Set the announcement"),
};

export function actionLabel(e: Pick<AuditEntry, "action" | "details">): string {
  const a = ACTIONS[e.action];
  if (typeof a === "function") return a(e.details);
  return a ?? e.action;
}

// Details worth reading. Route IDs are left out (the target names the thing),
// and values the action label already says are skipped.
const HIDDEN = new Set(["id", "keyId", "active", "banned", "enabled", "cleared"]);

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "default";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Details({ details }: { details: Record<string, unknown> }) {
  const items = Object.entries(details).filter(([k]) => !HIDDEN.has(k));
  if (items.length === 0) return null;
  return (
    <span className={styles.auditDetails}>
      {items.map(([k, v]) => (
        <span key={k}><span className={styles.auditKey}>{k}</span> {fmtValue(v)}</span>
      ))}
    </span>
  );
}

export function AdminAudit() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useAdminAudit();
  const entries = data?.pages.flat() ?? [];

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}><ScrollText size={18} className={styles.titleIcon} /> Audit log</h1>
        <p className={styles.subtitle}>Every change made in the admin area, newest first. Kept for a year.</p>
      </div>

      {isError && <p className={styles.subtitle}>The audit log couldn&apos;t be loaded.</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Time</th><th>Who</th><th>What</th><th>On</th><th>Details</th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className={styles.cellDate}>{new Date(e.createdAt).toLocaleString()}</td>
                <td className={styles.cellMono}>{e.actor}</td>
                <td>{actionLabel(e)}</td>
                <td className={styles.cellMono}>{e.target}</td>
                <td><Details details={e.details} /></td>
              </tr>
            ))}
            {!isLoading && entries.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--silver)", textAlign: "center", padding: 24 }}>No changes logged yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasNextPage && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <button className={styles.btnSecondary} onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? "Loading…" : "Load older"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
