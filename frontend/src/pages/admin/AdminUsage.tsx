import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart2 } from "lucide-react";
import { useAdminStats, useAdminUsageByModel, useAdminRecentRequests } from "../../api/admin";
import { compact } from "../../data/format";
import { Select } from "../../components/Select";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

export function AdminUsage() {
  const { data: stats } = useAdminStats();
  const [period, setPeriod] = useState(7);
  const [emailInput, setEmailInput] = useState("");
  const [email, setEmail] = useState(""); // applied on Enter, not per keystroke
  const { data: byModel = [] } = useAdminUsageByModel(period);
  const { data: recent = [] } = useAdminRecentRequests(email);

  // The API only returns days that had traffic. Zero-fill a fixed 30-day window
  // so the chart shows a continuous axis instead of a few uneven bars.
  const byDay = new Map((stats?.daily ?? []).map((d) => [d.day, d.total]));
  const days: { day: string; total: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, total: byDay.get(key) ?? 0 });
  }
  const maxVal = Math.max(...days.map((d) => d.total), 1);

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}><BarChart2 size={18} className={styles.titleIcon} /> Usage</h1>
        <p className={styles.subtitle}>Requests per day, per model, and the latest individual requests</p>
      </div>

      <div className={styles.chartWrap}>
        <div className={styles.chartBars}>
          {days.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.total}`}
              style={{
                flex: 1,
                background: `rgba(236,168,214,${0.15 + 0.7 * (d.total / maxVal)})`,
                borderRadius: "3px 3px 0 0",
                height: `${Math.max(4, (d.total / maxVal) * 100)}%`,
                minWidth: 6,
              }}
            />
          ))}
        </div>
        <div className={styles.chartDate}>{days.at(-1)?.day ?? ""}</div>
      </div>

      <div className={styles.sectionLabel}>Top Users This Month</div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Email</th><th>Requests</th></tr></thead>
          <tbody>
            {(stats?.topUsers ?? []).map((u, i) => (
              <tr key={u.email}>
                <td className={styles.cellMono}>
                  <span className={styles.rankNum}>{i + 1}</span>
                  {u.email}
                </td>
                <td style={{ fontWeight: 700 }}>{u.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.sectionLabel} style={{ margin: "32px 0 12px", display: "flex", alignItems: "center", gap: 12 }}>
        By model
        <Select
          size="sm"
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 1, label: "last 24 hours" },
            { value: 7, label: "last 7 days" },
            { value: 30, label: "last 30 days" },
            { value: 90, label: "last 90 days" },
          ]}
        />
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Model</th><th>Requests</th><th>Success</th><th>Prompt tokens</th><th>Completion tokens</th><th>Avg time</th></tr>
          </thead>
          <tbody>
            {byModel.map((m) => (
              <tr key={m.model || "unknown"}>
                <td className={`${styles.cellMono} ${styles.cellModel}`} title={m.model || undefined}>{m.model || "unknown"}</td>
                <td style={{ fontWeight: 700 }}>{compact(m.requests)}</td>
                <td>{m.requests ? `${Math.round((m.ok / m.requests) * 100)}%` : "-"}</td>
                <td>{compact(m.promptTokens)}</td>
                <td>{compact(m.completionTokens)}</td>
                <td className={styles.cellSubtle}>{m.avgMs != null ? `${(m.avgMs / 1000).toFixed(1)}s` : "-"}</td>
              </tr>
            ))}
            {byModel.length === 0 && (
              <tr><td colSpan={6} style={{ color: "var(--silver)", textAlign: "center", padding: 20 }}>No requests in this period</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.sectionLabel} style={{ margin: "32px 0 12px" }}>Recent requests</div>
      <input
        className={`${styles.input} ${styles.searchInput}`}
        placeholder="Filter by exact email, then press Enter"
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") setEmail(emailInput); }}
        onBlur={() => setEmail(emailInput)}
      />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Time</th><th>User</th><th>Endpoint</th><th>Model</th><th>Status</th><th>Tokens (in / out)</th><th>Took</th><th>Provider</th></tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td className={styles.cellSubtle}>{new Date(r.createdAt).toLocaleString()}</td>
                <td className={styles.cellMono}>{r.email}</td>
                <td className={styles.cellMono}>{r.endpoint}{r.stream ? " (stream)" : ""}</td>
                <td className={`${styles.cellMono} ${styles.cellModel}`} title={r.model ?? undefined}>{r.model ?? "-"}</td>
                <td>
                  <span className={`${styles.badge} ${r.status < 400 ? styles.badgeGreen : styles.badgeError}`}>{r.status}</span>
                </td>
                <td>
                  {r.promptTokens != null || r.completionTokens != null
                    ? `${r.promptTokens ?? 0} / ${r.completionTokens ?? 0}`
                    : "-"}
                </td>
                <td className={styles.cellSubtle}>{(r.durationMs / 1000).toFixed(1)}s</td>
                <td className={styles.cellSubtle}>{r.provider ?? "-"}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr><td colSpan={8} style={{ color: "var(--silver)", textAlign: "center", padding: 20 }}>No requests yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
