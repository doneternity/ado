import { motion } from "framer-motion";
import { Wrench, AlertTriangle } from "lucide-react";
import { useMaintenanceStatus, useToggleMaintenance } from "../../api/admin";
import { useUiStore } from "../../stores/ui-store";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

export function AdminMaintenance() {
  const { data: status } = useMaintenanceStatus();
  const toggle = useToggleMaintenance();
  const showToast = useUiStore((s) => s.showToast);
  const on = status?.enabled ?? false;

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}><Wrench size={18} className={styles.titleIcon} /> Maintenance</h1>
        <p className={styles.subtitle}>Blocks all /api/v1/* proxy requests with 503</p>
      </div>

      <div className={styles.statCard} style={{ maxWidth: 440 }}>
        <div className={styles.statusRow}>
          <div className={styles.statLabel}>Status</div>
          <span className={`${styles.maintenanceBadge} ${on ? styles.maintenanceOn : styles.maintenanceOff}`}>
            {on ? "● MAINTENANCE" : "● ONLINE"}
          </span>
        </div>
        <p className={styles.infoText}>
          {on
            ? "All API traffic is blocked. Users will receive a 503 error."
            : "All systems operational. Enabling this will block all API traffic for all users."}
        </p>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={on}
            onChange={() => {
              if (!on && !confirm("Block ALL API traffic for every user right now?")) return;
              toggle.mutate(undefined, { onError: (err) => showToast(err instanceof Error ? err.message : "Could not toggle maintenance") });
            }}
            disabled={toggle.isPending}
          />
          <span />
        </label>
        {!on && (
          <p className={styles.maintenanceWarning}>
            <AlertTriangle size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            This blocks all API traffic for all users immediately.
          </p>
        )}
      </div>
    </motion.div>
  );
}
