import { Skeleton } from "./Skeleton";
import styles from "./PageLoader.module.scss";

export function PageLoader() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Skeleton height="12px" width="80px" />
        <Skeleton height="36px" width="60%" />
        <Skeleton height="44px" />
        <Skeleton height="44px" />
        <Skeleton height="44px" width="40%" />
      </div>
    </div>
  );
}
