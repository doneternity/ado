import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DISCORD_INVITE_URL } from "../config";
import styles from "./MaintenanceScreen.module.scss";

// Shown to everyone except admins while maintenance mode is on.
export function MaintenanceScreen() {
  return (
    <main id="main-content" className={styles.wrap}>
      <div className={styles.grid} aria-hidden="true" />
      <span className={styles.wordmark}>ADO</span>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <span className={styles.eyebrow}><span className={styles.dot} />Maintenance</span>
        <h1 className={styles.title}>We&apos;ll be right back.</h1>
        <p className={styles.body}>
          ADO is down for maintenance. Your account and key are safe, and API requests
          will work again as soon as we&apos;re done. This page refreshes on its own.
        </p>
        <div className={styles.actions}>
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className={styles.primary}>
            Updates on Discord
          </a>
          <Link to="/login" className={styles.secondary}>Admin sign in</Link>
        </div>
      </motion.div>
    </main>
  );
}

// Slim notice for admins, who still see the site while maintenance is on.
export function MaintenanceBanner() {
  return (
    <div className={styles.banner} role="status">
      Maintenance mode is on. Only admins can see the site.{" "}
      <Link to="/admin/maintenance">Turn it off</Link>
    </div>
  );
}
