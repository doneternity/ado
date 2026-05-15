import { useState } from "react";
import { useAdminErrors, useDeleteError, useBulkDeleteErrors } from "../../api/admin";
import styles from "./Admin.module.scss";

export function AdminErrors() {
  const [page, setPage] = useState(1);
  const { data } = useAdminErrors(page);
  const del = useDeleteError();
  const bulk = useBulkDeleteErrors();

  return (
    <>
      <div className={styles.pageHeader}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 className={styles.title}>⚠️ Errors</h1>
            <p className={styles.subtitle}>Proxy error log — {data?.total ?? 0} entries</p>
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
                <td style={{ color: "var(--silver)", fontSize: ".68rem", whiteSpace: "nowrap" }}>
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td>
                  <span className={`${styles.badge} ${e.level === "error" ? styles.badgeError : styles.badgeWarn}`}>
                    {e.level}
                  </span>
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: ".72rem", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.message}
                </td>
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
    </>
  );
}
