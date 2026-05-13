import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import styles from "./StatusPage.module.scss";

export function NotFound() {
  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" as const }}
    >
      <span className={styles.code}>404</span>
      <h1 className={styles.title}>Page not found.</h1>
      <p className={styles.body}>
        The URL you typed doesn&apos;t match any page on ADO.
      </p>
      <div className={styles.actions}>
        <Link to="/" className={styles.primary}>Go home</Link>
        <Link to="/dashboard" className={styles.secondary}>Dashboard</Link>
      </div>
    </motion.div>
  );
}
