import { useEffect } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { KeyCard } from "../components/KeyCard";
import { UsageCard } from "../components/UsageCard";
import { HowToUseModal } from "../components/HowToUseModal";
import { fetchFlashKeyOnce } from "../api/queries";
import { useMe } from "../api/queries";
import styles from "./Dashboard.module.scss";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" as const } },
};

export function Dashboard() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  useEffect(() => { void fetchFlashKeyOnce(qc); }, [qc]);

  const greeting = me?.user.displayName
    ? `welcome back, ${me.user.displayName}.`
    : "welcome back.";

  return (
    <div className={styles.page}>
      <motion.div
        className={styles.inner}
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div className={styles.header} variants={itemVariants}>
          <span className={styles.eyebrow}>Dashboard</span>
          <h1 className={styles.greeting}>{greeting}</h1>
          <p className={styles.subtext}>
            Your API key and usage for today.{" "}
            <Link to="/playground" className={styles.tryLink}>Try the playground →</Link>
          </p>
        </motion.div>

        {/* Cards */}
        <motion.div className={styles.grid} variants={itemVariants}>
          <KeyCard />
          <UsageCard />
        </motion.div>

        {/* How to use */}
        <motion.div className={styles.howRow} variants={itemVariants}>
          <HowToUseModal />
        </motion.div>
      </motion.div>
    </div>
  );
}
