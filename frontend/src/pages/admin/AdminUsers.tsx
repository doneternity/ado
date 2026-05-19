import { useState } from "react";
import { motion } from "framer-motion";
import { useAdminUsers, useSetUserRole, useSetUserBanned } from "../../api/admin";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

export function AdminUsers() {
  const { data: users = [] } = useAdminUsers();
  const setRole = useSetUserRole();
  const setBanned = useSetUserBanned();
  const [search, setSearch] = useState("");

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.subtitle}>View accounts, promote to admin ({users.length} total)</p>
      </div>

      <input
        className={`${styles.input} ${styles.searchInput}`}
        placeholder="Search by email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
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
              <tr key={u.id} className={u.banned ? styles.rowBanned : undefined}>
                <td className={styles.cellMono}>{u.email}</td>
                <td>
                  {u.role === "admin"
                    ? <span className={`${styles.badge} ${styles.badgeAdmin}`}>admin</span>
                    : <span className={`${styles.badge} ${styles.badgeUser}`}>user</span>
                  }
                </td>
                <td>
                  {u.banned
                    ? <span className={`${styles.badge} ${styles.badgeError}`}>banned</span>
                    : <span className={`${styles.badge} ${styles.badgeGreen}`}>active</span>
                  }
                </td>
                <td>{u.requestsToday}</td>
                <td className={styles.cellSubtle}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td>
                  <div className={styles.btnRow}>
                    {u.role === "admin"
                      ? <button className={`${styles.btnSecondary} ${styles.btnXs}`}
                          onClick={() => setRole.mutate({ id: u.id, role: "user" })}>Demote</button>
                      : <button className={`${styles.btnSecondary} ${styles.btnXs}`}
                          onClick={() => setRole.mutate({ id: u.id, role: "admin" })}>Promote</button>
                    }
                    {u.banned
                      ? <button className={`${styles.btnSecondary} ${styles.btnXs}`}
                          onClick={() => setBanned.mutate({ id: u.id, banned: false })}>Unban</button>
                      : <button className={`${styles.btnDanger} ${styles.btnXs}`}
                          onClick={() => setBanned.mutate({ id: u.id, banned: true })}>Ban</button>
                    }
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
