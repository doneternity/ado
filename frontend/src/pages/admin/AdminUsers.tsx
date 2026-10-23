import { useState } from "react";
import { motion } from "framer-motion";
import { useAdminUsers, useSetUserRole, useSetUserBanned, useAdminPlans, useSetUserPlan, useDeleteUser } from "../../api/admin";
import { useUiStore } from "../../stores/ui-store";
import { InactiveCleanup, MIN_INACTIVE_DAYS } from "./InactiveCleanup";
import { Select } from "../../components/Select";
import styles from "./Admin.module.scss";

const DAY_MS = 24 * 60 * 60 * 1000;

// "12 Oct 2026 · 6d ago". Accounts past the cleanup threshold are flagged.
function LastActive({ iso }: { iso: string }) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  const ago = days <= 0 ? "today" : `${days}d ago`;
  const stale = days >= MIN_INACTIVE_DAYS;
  return (
    <span className={stale ? styles.cellStale : styles.cellSubtle} title={stale ? "Eligible for the inactive-account cleanup" : undefined}>
      {new Date(iso).toLocaleDateString()} · {ago}
    </span>
  );
}

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

export function AdminUsers() {
  const { data: users = [] } = useAdminUsers();
  const setRole = useSetUserRole();
  const setBanned = useSetUserBanned();
  const { data: plans = [] } = useAdminPlans();
  const setPlan = useSetUserPlan();
  const deleteUser = useDeleteUser();
  const showToast = useUiStore((s) => s.showToast);
  const [search, setSearch] = useState("");

  const onErr = (fallback: string) => (err: unknown) =>
    showToast(err instanceof Error ? err.message : fallback);

  const q = search.toLowerCase();
  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(q) ||
    (u.displayName ?? "").toLowerCase().includes(q)
  );

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>Users</h1>
        <p className={styles.subtitle}>View accounts, promote to admin ({users.length} total)</p>
      </div>

      <input
        className={`${styles.input} ${styles.searchInput}`}
        placeholder="Search by email or username…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Requests today</th>
              <th>Last active</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className={u.banned ? styles.rowBanned : undefined}>
                <td className={styles.cellMono}>{u.email}</td>
                <td className={styles.cellSubtle}>{u.displayName ?? "—"}</td>
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
                <td>
                  <Select
                    size="sm"
                    label={`Plan for ${u.email}`}
                    value={u.planId}
                    onChange={(planId) => setPlan.mutate({ id: u.id, planId }, { onError: onErr("Could not change plan") })}
                    options={[
                      ...plans.map((p) => ({ value: p.id, label: p.name })),
                      ...(plans.some((p) => p.id === u.planId) ? [] : [{ value: u.planId, label: u.planId }]),
                    ]}
                  />
                </td>
                <td>{u.requestsToday}</td>
                <td><LastActive iso={u.lastActive} /></td>
                <td className={styles.cellSubtle}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td>
                  <div className={styles.btnRow}>
                    {u.role === "admin"
                      ? <button className={`${styles.btnSecondary} ${styles.btnXs}`}
                          onClick={() => setRole.mutate({ id: u.id, role: "user" }, { onError: onErr("Could not change role") })}>Demote</button>
                      : <button className={`${styles.btnSecondary} ${styles.btnXs}`}
                          onClick={() => setRole.mutate({ id: u.id, role: "admin" }, { onError: onErr("Could not change role") })}>Promote</button>
                    }
                    {u.banned
                      ? <button className={`${styles.btnSecondary} ${styles.btnXs}`}
                          onClick={() => setBanned.mutate({ id: u.id, banned: false }, { onError: onErr("Could not unban user") })}>Unban</button>
                      : <button className={`${styles.btnDanger} ${styles.btnXs}`}
                          onClick={() => setBanned.mutate({ id: u.id, banned: true }, { onError: onErr("Could not ban user") })}>Ban</button>
                    }
                    {u.role !== "admin" && (
                      <button
                        className={`${styles.btnDanger} ${styles.btnXs}`}
                        disabled={deleteUser.isPending}
                        onClick={() => {
                          if (!confirm(
                            `Permanently delete ${u.email}, with their key, usage and request history?` +
                            (u.banned ? "\n\nThey are banned: deleting the account lifts the ban, so they could sign up again." : "") +
                            "\n\nThis can't be undone here. Only a database backup can bring it back.",
                          )) return;
                          deleteUser.mutate(u.id, {
                            onSuccess: () => showToast(`Deleted ${u.email}`),
                            onError: onErr("Could not delete user"),
                          });
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ color: "var(--silver)", textAlign: "center", padding: 24 }}>
                {users.length === 0 ? "No users yet" : "No users match your search"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <InactiveCleanup />
    </motion.div>
  );
}
