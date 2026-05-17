import { useState } from "react";
import { useAdminUsers, useSetUserRole, useSetUserBanned } from "../../api/admin";
import styles from "./Admin.module.scss";

export function AdminUsers() {
  const { data: users = [] } = useAdminUsers();
  const setRole = useSetUserRole();
  const setBanned = useSetUserBanned();
  const [search, setSearch] = useState("");

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.subtitle}>View accounts, promote to admin ({users.length} total)</p>
      </div>

      <input
        className={styles.input}
        placeholder="Search by email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 16, width: "100%", maxWidth: 360 }}
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Requests today</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} style={{ opacity: u.banned ? 0.55 : 1 }}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: ".75rem" }}>{u.email}</td>
                <td>
                  {u.role === "admin"
                    ? <span className={`${styles.badge} ${styles.badgeAdmin}`}>admin</span>
                    : <span className={styles.badge} style={{ background: "rgba(255,255,255,.05)", color: "var(--silver)", border: "1px solid var(--border-sub)" }}>user</span>
                  }
                </td>
                <td>
                  {u.banned
                    ? <span className={styles.badge} style={{ background: "rgba(225,29,72,.15)", color: "#e11d48", border: "1px solid rgba(225,29,72,.3)" }}>banned</span>
                    : <span className={styles.badge} style={{ background: "rgba(5,196,139,.1)", color: "var(--green)", border: "1px solid rgba(5,196,139,.25)" }}>active</span>
                  }
                </td>
                <td>{u.requestsToday}</td>
                <td style={{ color: "var(--silver)", fontSize: ".72rem" }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td style={{ display: "flex", gap: 6 }}>
                  {u.role === "admin"
                    ? <button className={styles.btnSecondary} style={{ fontSize: ".68rem", padding: "3px 10px" }}
                        onClick={() => setRole.mutate({ id: u.id, role: "user" })}>Demote</button>
                    : <button className={styles.btnSecondary} style={{ fontSize: ".68rem", padding: "3px 10px" }}
                        onClick={() => setRole.mutate({ id: u.id, role: "admin" })}>Promote</button>
                  }
                  {u.banned
                    ? <button className={styles.btnSecondary} style={{ fontSize: ".68rem", padding: "3px 10px" }}
                        onClick={() => setBanned.mutate({ id: u.id, banned: false })}>Unban</button>
                    : <button className={styles.btnSecondary} style={{ fontSize: ".68rem", padding: "3px 10px", color: "#e11d48", borderColor: "rgba(225,29,72,.4)" }}
                        onClick={() => setBanned.mutate({ id: u.id, banned: true })}>Ban</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
