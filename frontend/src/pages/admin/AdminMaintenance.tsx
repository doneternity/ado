import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wrench, AlertTriangle, Megaphone } from "lucide-react";
import { useMaintenanceStatus, useToggleMaintenance, useAdminAnnouncement, useSetAnnouncement } from "../../api/admin";
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
              toggle.mutate(!on, { onError: (err) => showToast(err instanceof Error ? err.message : "Could not toggle maintenance") });
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

      <AnnouncementEditor />
    </motion.div>
  );
}

// The notice every visitor sees at the bottom of the screen until they
// dismiss it. Saving a new message shows it again to everyone.
function AnnouncementEditor() {
  const { data: current } = useAdminAnnouncement();
  const save = useSetAnnouncement();
  const showToast = useUiStore((s) => s.showToast);
  const [message, setMessage] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  useEffect(() => {
    setMessage(current?.message ?? "");
    setLinkUrl(current?.linkUrl ?? "");
    setLinkLabel(current?.linkLabel ?? "");
  }, [current]);

  const live = Boolean(current?.message);
  const onErr = (err: unknown) => showToast(err instanceof Error ? err.message : "Could not save the announcement");

  return (
    <div className={styles.statCard} style={{ maxWidth: 560, marginTop: 24 }}>
      <div className={styles.statusRow}>
        <div className={styles.statLabel}><Megaphone size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />Site announcement</div>
        <span className={`${styles.badge} ${live ? styles.badgeGreen : styles.badgeInactive}`}>{live ? "showing" : "off"}</span>
      </div>
      <p className={styles.infoText}>
        Shown to every visitor at the bottom of the screen until they dismiss it. Saving a changed message shows it to everyone again.
      </p>
      <form
        className={styles.announceForm}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ message, linkUrl, linkLabel }, {
            onSuccess: (a) => showToast(a.message ? "Announcement is live" : "Announcement cleared"),
            onError: onErr,
          });
        }}
      >
        <textarea
          className={`${styles.input} ${styles.keyTextarea}`}
          placeholder="e.g. We've moved to a new Discord server. Join it to keep signing in."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={280}
          rows={2}
        />
        <div className={styles.announceRow}>
          <input className={styles.input} placeholder="Link (optional), https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <input className={styles.input} placeholder="Link text, e.g. Join Discord" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={40} />
        </div>
        <div className={styles.btnRow}>
          <button className={styles.btnPrimary} type="submit" disabled={save.isPending || !message.trim()}>
            {live ? "Update" : "Publish"}
          </button>
          {live && (
            <button
              className={styles.btnSecondary}
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate({ message: "" }, { onSuccess: () => showToast("Announcement cleared"), onError: onErr })}
            >
              Remove
            </button>
          )}
          <span className={styles.fieldHint}>{message.length}/280</span>
        </div>
      </form>
    </div>
  );
}
