import { useMaintenanceStatus, useToggleMaintenance } from "../../api/admin";
import styles from "./Admin.module.scss";

export function AdminMaintenance() {
  const { data: status } = useMaintenanceStatus();
  const toggle = useToggleMaintenance();
  const on = status?.enabled ?? false;

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>🔧 Maintenance</h1>
        <p className={styles.subtitle}>Blocks all /api/v1/* proxy requests with 503</p>
      </div>

      <div className={styles.statCard} style={{ maxWidth: 440 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div className={styles.statLabel}>Status</div>
          <span className={`${styles.maintenanceBadge} ${on ? styles.maintenanceOn : styles.maintenanceOff}`}>
            {on ? "● MAINTENANCE" : "● ONLINE"}
          </span>
        </div>
        <p style={{ color: "var(--silver)", fontSize: ".78rem", lineHeight: 1.5, marginBottom: 20 }}>
          {on
            ? "All API traffic is blocked. Users will receive a 503 error."
            : "All systems operational. Enabling this will block all API traffic for all users."}
        </p>
        <label className={styles.toggle}>
          <input type="checkbox" checked={on} onChange={() => toggle.mutate()} disabled={toggle.isPending} />
          <span />
        </label>
        {!on && (
          <p style={{ color: "rgba(225,29,72,.6)", fontSize: ".72rem", marginTop: 14 }}>
            ⚠ This blocks all API traffic for all users immediately.
          </p>
        )}
      </div>
    </>
  );
}
