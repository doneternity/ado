import { useState } from "react";
import { motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useAdminQuotas, useSetGlobalQuota, useSetUserQuota, useRemoveUserQuota } from "../../api/admin";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

export function AdminQuotas() {
  const { data: quotas } = useAdminQuotas();
  const setGlobal = useSetGlobalQuota();
  const setUser = useSetUserQuota();
  const removeUser = useRemoveUserQuota();
  const [globalInput, setGlobalInput] = useState("");
  const [overrideId, setOverrideId] = useState("");
  const [overrideLimit, setOverrideLimit] = useState("");

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}><SlidersHorizontal size={18} className={styles.titleIcon} /> Quotas</h1>
        <p className={styles.subtitle}>Global daily request limit and per-user overrides</p>
      </div>

      <div className={styles.statCard} style={{ maxWidth: 360, marginBottom: 24 }}>
        <div className={styles.statLabel}>Global Daily Limit</div>
        <div className={styles.statValue} style={{ fontSize: "2rem" }}>{quotas?.globalLimit ?? "—"}</div>
        <div className={styles.inputRow}>
          <input
            className={`${styles.input} ${styles.inputSm}`}
            type="number"
            min={1}
            placeholder="New limit"
            value={globalInput}
            onChange={(e) => setGlobalInput(e.target.value)}
          />
          <button
            className={styles.btnPrimary}
            onClick={() => { setGlobal.mutate(Number(globalInput)); setGlobalInput(""); }}
            disabled={!globalInput}
          >
            Save
          </button>
        </div>
      </div>

      <div className={styles.sectionLabel} style={{ marginBottom: 12 }}>Per-User Overrides</div>
      <div className={styles.tableWrap} style={{ marginBottom: 16 }}>
        <table className={styles.table}>
          <thead><tr><th>Email</th><th>Limit</th><th>Actions</th></tr></thead>
          <tbody>
            {(quotas?.overrides ?? []).map((o) => (
              <tr key={o.userId}>
                <td className={styles.cellMono}>{o.email}</td>
                <td style={{ fontWeight: 700 }}>{o.limit}</td>
                <td><button className={styles.btnDanger} onClick={() => removeUser.mutate(o.userId)}>Remove</button></td>
              </tr>
            ))}
            {(quotas?.overrides ?? []).length === 0 && (
              <tr><td colSpan={3} style={{ color: "var(--silver)", textAlign: "center", padding: "20px" }}>No overrides set</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.inlineForm}>
        <div className={styles.inlineFormTitle}>Add override</div>
        <div className={styles.formRow}>
          <div className={styles.field}>
            <label className={styles.label}>User ID</label>
            <input className={styles.input} placeholder="uuid" value={overrideId}
              onChange={(e) => setOverrideId(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Daily Limit</label>
            <input className={styles.input} type="number" min={1} placeholder="100"
              value={overrideLimit} onChange={(e) => setOverrideLimit(e.target.value)} />
          </div>
        </div>
        <button
          className={styles.btnPrimary}
          onClick={() => { setUser.mutate({ id: overrideId, limit: Number(overrideLimit) }); setOverrideId(""); setOverrideLimit(""); }}
          disabled={!overrideId || !overrideLimit}
        >
          Save override
        </button>
      </div>
    </motion.div>
  );
}
