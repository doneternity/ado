import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useAdminErrors, useDeleteError, useBulkDeleteErrors } from "../../api/admin";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

export function AdminErrors() {
  const [page, setPage] = useState(1);
  const { data } = useAdminErrors(page);
  const del = useDeleteError();
  const bulk = useBulkDeleteErrors();

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <div className={styles.pageRow}>
          <div>
            <h1 className={styles.title}><AlertTriangle size={18} className={styles.titleIcon} /> Errors</h1>
            <p className={styles.subtitle}>Proxy error log: {data?.total ?? 0} entries</p>
          </div>
          <button className={styles.btnDanger} onClick={() => bulk.mutate(7)} style={{ padding: "8px 16px" }}>
            Clear older than 7 days
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Time</th><th>Level</th><th>Message</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {(data?.logs ?? []).map((e) => (
              <tr key={e.id}>
                <td className={styles.cellDate}>{new Date(e.createdAt).toLocaleString()}</td>
                <td>
                  <span className={`${styles.badge} ${e.level === "error" ? styles.badgeError : styles.badgeWarn}`}>
                    {e.level}
                  </span>
                </td>
                <td className={styles.cellMessage}>{e.message}</td>
                <td>
                  <button className={styles.btnDanger} onClick={() => del.mutate(e.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {(data?.logs ?? []).length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--silver)", textAlign: "center", padding: 24 }}>No errors logged</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(data?.total ?? 0) > 50 && (
        <div className={styles.btnRow} style={{ marginTop: 16, justifyContent: "center" }}>
          <button className={styles.btnSecondary} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span style={{ color: "var(--silver)", fontSize: ".78rem" }}>Page {page}</span>
          <button className={styles.btnSecondary} onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= (data?.total ?? 0)}>Next →</button>
        </div>
      )}
    </motion.div>
  );
}
