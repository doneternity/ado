import { Link } from "react-router-dom";
import { usePublicModelStatuses, type PublicModel } from "../api/queries";
import { MODELS } from "../data/models";
import styles from "./ModelMarquee.module.scss";

const MAX = 24;

// Infinite strip of model IDs with live status dots. Falls back to the static
// catalogue (no dots) when the live list is empty, e.g. while providers are down.
export function ModelMarquee() {
  const { data } = usePublicModelStatuses();
  const live = (data ?? []).slice(0, MAX);
  const items: (PublicModel | { id: string; status?: undefined })[] =
    live.length > 0 ? live : MODELS.slice(0, MAX).map((m) => ({ id: m.id }));

  // Rendered twice so the CSS loop is seamless; the copy is hidden from screen readers.
  const row = (copy: boolean) => (
    <ul className={styles.row} aria-hidden={copy || undefined}>
      {items.map((m) => (
        <li key={m.id} className={styles.item}>
          {m.status && <span className={`${styles.dot} ${styles[m.status]}`} title={m.status} />}
          {m.id}
        </li>
      ))}
    </ul>
  );

  return (
    <Link to="/models" className={styles.strip} aria-label="See all models">
      <div className={styles.track}>
        {row(false)}
        {row(true)}
      </div>
    </Link>
  );
}
