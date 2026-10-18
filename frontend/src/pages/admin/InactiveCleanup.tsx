import { useState } from "react";
import { useInactiveUsers, useDeleteInactiveUsers } from "../../api/admin";
import { useUiStore } from "../../stores/ui-store";
import styles from "./Admin.module.scss";

// The backend refuses anything shorter than 150 days (MinInactiveDays), which
// is also what the privacy policy promises.
const PERIODS = [
  { days: 150, label: "5 months" },
  { days: 183, label: "6 months" },
  { days: 365, label: "12 months" },
];
const SHOWN = 50;

// Finds accounts nobody has used for a while and deletes them, with their keys,
// usage and request history. Preview first, then delete exactly what was shown.
export function InactiveCleanup() {
  const [days, setDays] = useState(PERIODS[0]!.days);
  const [checked, setChecked] = useState<number | null>(null);
  const { data, isFetching, error } = useInactiveUsers(checked);
  const del = useDeleteInactiveUsers();
  const showToast = useUiStore((s) => s.showToast);

  const found = checked !== null && data?.days === checked ? data.users : null;

  const deleteAll = () => {
    if (!found?.length || checked === null) return;
    const n = found.length;
    if (!confirm(
      `Permanently delete ${n} account${n === 1 ? "" : "s"}, with their keys, usage and request history?\n\n` +
      "This can't be undone here. Only a database backup can bring them back.",
    )) return;
    del.mutate({ days: checked, ids: found.map((u) => u.id) }, {
      onSuccess: (r) => {
        const skipped = n - r.deleted;
        showToast(`Deleted ${r.deleted} account${r.deleted === 1 ? "" : "s"}` +
          (skipped > 0 ? ` (${skipped} became active and were kept)` : ""));
      },
      onError: (err) => showToast(err instanceof Error ? err.message : "Could not delete accounts"),
    });
  };

  return (
    <div className={styles.cleanup}>
      <div className={styles.sectionLabel}>Inactive accounts</div>
      <p className={styles.cleanupText}>
        Accounts with no sign-in, dashboard visit or API call for the chosen time. Admins, banned users and paid
        plans are never included. Deleting removes the account with its keys, usage and request history for good,
        so run a database backup first (GitHub → Actions → Database backup → Run workflow).
      </p>
      <div className={styles.btnRow}>
        <select
          className={`${styles.input} ${styles.inputSm}`}
          value={days}
          onChange={(e) => { setDays(Number(e.target.value)); setChecked(null); }}
          aria-label="Inactive for"
        >
          {PERIODS.map((p) => <option key={p.days} value={p.days}>inactive {p.label}</option>)}
        </select>
        <button className={styles.btnSecondary} onClick={() => setChecked(days)} disabled={isFetching}>
          {isFetching ? "Checking…" : "Find inactive accounts"}
        </button>
      </div>

      {error && <p className={styles.formError}>{error instanceof Error ? error.message : "Could not check"}</p>}

      {found && (
        found.length === 0 ? (
          <p className={styles.cleanupText}>No accounts have been inactive that long.</p>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Email</th><th>Last active</th><th>Joined</th></tr></thead>
                <tbody>
                  {found.slice(0, SHOWN).map((u) => (
                    <tr key={u.id}>
                      <td className={styles.cellMono}>{u.email}</td>
                      <td className={styles.cellSubtle}>{new Date(u.lastActive).toLocaleDateString()}</td>
                      <td className={styles.cellSubtle}>{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {found.length > SHOWN && <p className={styles.cleanupText}>…and {found.length - SHOWN} more.</p>}
            <button className={styles.btnDanger} onClick={deleteAll} disabled={del.isPending} style={{ padding: "8px 16px" }}>
              {del.isPending ? "Deleting…" : `Delete ${found.length} account${found.length === 1 ? "" : "s"}`}
            </button>
          </>
        )
      )}
    </div>
  );
}
