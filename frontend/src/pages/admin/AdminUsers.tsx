import { useState } from "react";
import { useAdminUsers, useSetUserRole } from "../../api/admin";
import styles from "./Admin.module.scss";

export function AdminUsers() {
  const { data: users = [] } = useAdminUsers();
  const setRole = useSetUserRole();
  const [search, setSearch] = useState("");

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>👥 Users</h1>
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
              <th>Requests today</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: ".75rem" }}>{u.email}</td>
                <td>
                  {u.role === "admin"
                    ? <span className={`${styles.badge} ${styles.badgeAdmin}`}>admin</span>
                    : <span className={styles.badge} style={{ background: "rgba(255,255,255,.05)", color: "var(--silver)", border: "1px solid var(--border-sub)" }}>user</span>
                  }
                </td>
                <td>{u.requestsToday}</td>
                <td style={{ color: "var(--silver)", fontSize: ".72rem" }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td>
                  {u.role === "admin"
                    ? <button className={styles.btnSecondary} style={{ fontSize: ".68rem", padding: "3px 10px" }}
                        onClick={() => setRole.mutate({ id: u.id, role: "user" })}>Demote</button>
                    : <button className={styles.btnSecondary} style={{ fontSize: ".68rem", padding: "3px 10px" }}
                        onClick={() => setRole.mutate({ id: u.id, role: "admin" })}>Promote</button>
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
