import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import styles from "./StatusPage.module.scss";

const DISCORD_INVITE = import.meta.env.VITE_DISCORD_INVITE_URL || "https://discord.gg";

export function JoinRequired() {
  return (
    <motion.div
      className={`${styles.page} ${styles.centered}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" as const }}
    >
      <div className={`${styles.icon} ${styles.iconError}`}>
        <AlertCircle size={28} />
      </div>
      <h1 className={styles.title}>Join Required.</h1>
      <p className={styles.body}>
        Access to ADO is restricted to members of our Discord server.
        Join below and then sign in again.
      </p>

      <div className={styles.actions}>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.primary}
        >
          Join Discord Server
        </a>
      </div>

      <Link to="/login" className={styles.back}>
        ← Back to sign in
      </Link>
    </motion.div>
  );
}
