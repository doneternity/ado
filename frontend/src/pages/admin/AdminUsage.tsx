import { motion } from "framer-motion";
import { BarChart2 } from "lucide-react";
import { useAdminStats } from "../../api/admin";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

export function AdminUsage() {
  const { data: stats } = useAdminStats();

  const maxVal = Math.max(...(stats?.daily?.map((d) => d.total) ?? [1]), 1);

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}><BarChart2 size={18} className={styles.titleIcon} /> Usage</h1>
        <p className={styles.subtitle}>Aggregate request counts, last 30 days</p>
      </div>

      <div className={styles.chartWrap}>
        <div className={styles.chartBars}>
          {(stats?.daily ?? []).map((d) => (
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
        <div className={styles.chartDate}>{stats?.daily?.at(-1)?.day ?? ""}</div>
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
    </motion.div>
  );
}
