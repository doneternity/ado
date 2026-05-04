import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyCard } from "../components/KeyCard";
import { UsageCard } from "../components/UsageCard";
import { HowToUseModal } from "../components/HowToUseModal";
import { fetchFlashKeyOnce } from "../api/queries";
import styles from "./Dashboard.module.scss";

export function Dashboard() {
  const qc = useQueryClient();
  useEffect(() => {
    void fetchFlashKeyOnce(qc);
  }, [qc]);

  return (
    <div className={styles.section}>
      <div className={styles.grid}>
        <KeyCard />
        <UsageCard />
        <div className={styles.actions}>
          <HowToUseModal />
        </div>
      </div>
    </div>
  );
}
