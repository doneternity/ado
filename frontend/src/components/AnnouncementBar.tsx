import { useState } from "react";
import { X } from "lucide-react";
import { useAnnouncement } from "../api/queries";
import styles from "./AnnouncementBar.module.scss";

const DISMISSED = "ado:announcement-dismissed";

function dismissedId(): string | null {
  try { return localStorage.getItem(DISMISSED); } catch { return null; }
}

// The site-wide notice admins set in Admin > Maintenance. Dismissing hides
// that message only: a new one (new id) shows again. `raised` lifts it above
// the maintenance banner when both are on screen.
export function AnnouncementBar({ raised = false }: { raised?: boolean }) {
  const { data } = useAnnouncement();
  const [hidden, setHidden] = useState<string | null>(dismissedId);
  if (!data?.message || !data.id || hidden === data.id) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED, data.id!); } catch { /* storage blocked: hide for this visit */ }
    setHidden(data.id!);
  };

  return (
    <div className={`${styles.bar}${raised ? ` ${styles.raised}` : ""}`} role="status">
      <span className={styles.message}>{data.message}</span>
      {data.linkUrl && (
        <a href={data.linkUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
          {data.linkLabel || "Learn more"}
        </a>
      )}
      <button className={styles.close} onClick={dismiss} aria-label="Dismiss announcement">
        <X size={13} />
      </button>
    </div>
  );
}
