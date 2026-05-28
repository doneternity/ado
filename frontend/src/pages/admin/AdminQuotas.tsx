import { useState } from "react";
import { motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { useAdminQuotas, useSetGlobalQuota, useSetGlobalRpm, useSetFreeTierSlots, useSetUserQuota, useRemoveUserQuota } from "../../api/admin";
import { useUiStore } from "../../stores/ui-store";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

export function AdminQuotas() {
  const { data: quotas } = useAdminQuotas();
  const setGlobal = useSetGlobalQuota();
  const setRpm = useSetGlobalRpm();
  const setSlots = useSetFreeTierSlots();
  const setUser = useSetUserQuota();
  const removeUser = useRemoveUserQuota();
  const showToast = useUiStore((s) => s.showToast);
  const [globalInput, setGlobalInput] = useState("");
  const [rpmInput, setRpmInput] = useState("");
  const [slotsInput, setSlotsInput] = useState("");
  const [overrideEmail, setOverrideEmail] = useState("");
  const [overrideLimit, setOverrideLimit] = useState("");

  const onErr = (fallback: string) => (err: unknown) =>
    showToast(err instanceof Error ? err.message : fallback);

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}><SlidersHorizontal size={18} className={styles.titleIcon} /> Quotas</h1>
        <p className={styles.subtitle}>Global daily request limit and per-user overrides</p>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div className={styles.statCard} style={{ maxWidth: 360 }}>
          <div className={styles.statLabel}>Global Daily Limit (RPD)</div>
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
              onClick={() => { setGlobal.mutate(Number(globalInput), { onError: onErr("Could not update global limit") }); setGlobalInput(""); }}
              disabled={!globalInput}
            >
              Save
            </button>
          </div>
        </div>

        <div className={styles.statCard} style={{ maxWidth: 360 }}>
          <div className={styles.statLabel}>Global Rate Limit (RPM)</div>
          <div className={styles.statValue} style={{ fontSize: "2rem" }}>{quotas?.globalRpmLimit ?? "—"}</div>
          <div className={styles.inputRow}>
            <input
              className={`${styles.input} ${styles.inputSm}`}
              type="number"
              min={1}
              placeholder="New limit"
              value={rpmInput}
              onChange={(e) => setRpmInput(e.target.value)}
            />
            <button
              className={styles.btnPrimary}
              onClick={() => { setRpm.mutate(Number(rpmInput), { onError: onErr("Could not update rate limit") }); setRpmInput(""); }}
              disabled={!rpmInput}
            >
              Save
            </button>
          </div>
        </div>

        <div className={styles.statCard} style={{ maxWidth: 360 }}>
          <div className={styles.statLabel}>Free-tier Slots</div>
          <div className={styles.statValue} style={{ fontSize: "2rem" }}>
            {quotas != null ? `${quotas.slotsUsed} / ${quotas.slotsLimit} used` : "—"}
          </div>
          <div className={styles.inputRow}>
            <input
              className={`${styles.input} ${styles.inputSm}`}
              type="number"
              min={1}
              placeholder="New limit"
              value={slotsInput}
              onChange={(e) => setSlotsInput(e.target.value)}
            />
            <button
              className={styles.btnPrimary}
              onClick={() => { setSlots.mutate(Number(slotsInput), { onError: onErr("Could not update slot limit") }); setSlotsInput(""); }}
              disabled={!slotsInput}
            >
              Save
            </button>
          </div>
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
                <td><button className={styles.btnDanger} onClick={() => removeUser.mutate(o.userId, { onError: onErr("Could not remove override") })}>Remove</button></td>
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
            <label className={styles.label}>Email</label>
            <input className={styles.input} type="email" placeholder="user@example.com"
              value={overrideEmail} onChange={(e) => setOverrideEmail(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Daily Limit</label>
            <input className={styles.input} type="number" min={1} placeholder="100"
              value={overrideLimit} onChange={(e) => setOverrideLimit(e.target.value)} />
          </div>
        </div>
        <button
          className={styles.btnPrimary}
          onClick={() => { setUser.mutate({ email: overrideEmail, limit: Number(overrideLimit) }, { onError: onErr("Could not save override") }); setOverrideEmail(""); setOverrideLimit(""); }}
          disabled={!overrideEmail || !overrideLimit}
        >
          Save override
        </button>
      </div>
    </motion.div>
  );
}
