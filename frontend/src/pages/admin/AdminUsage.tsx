import { useAdminStats } from "../../api/admin";
import styles from "./Admin.module.scss";

export function AdminUsage() {
  const { data: stats } = useAdminStats();

  const maxVal = Math.max(...(stats?.daily?.map((d) => d.total) ?? [1]), 1);

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>📊 Usage</h1>
        <p className={styles.subtitle}>Aggregate request counts — last 30 days</p>
      </div>

      {/* Bar chart */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "20px 16px", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
          {(stats?.daily ?? []).map((d) => (
            <div key={d.day} title={`${d.day}: ${d.total}`}
              style={{
                flex: 1,
                background: `rgba(0,180,255,${0.15 + 0.7 * (d.total / maxVal)})`,
                borderRadius: "3px 3px 0 0",
                height: `${Math.max(4, (d.total / maxVal) * 100)}%`,
                minWidth: 6,
              }}
            />
          ))}
        </div>
        <div style={{ color: "var(--silver)", fontSize: ".65rem", marginTop: 8, textAlign: "right" }}>
          {stats?.daily?.at(-1)?.day ?? ""}
        </div>
      </div>

      {/* Top users */}
      <div style={{ color: "var(--silver)", fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>
        Top Users This Month
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Email</th><th>Requests</th></tr></thead>
          <tbody>
            {(stats?.topUsers ?? []).map((u, i) => (
              <tr key={u.email}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: ".75rem" }}>
                  {i === 0 && <span style={{ marginRight: 6 }}>🥇</span>}{u.email}
                </td>
                <td style={{ fontWeight: 700 }}>{u.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
