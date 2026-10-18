import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useMe } from "../api/queries";
import shared from "./StatusPage.module.scss";
import styles from "./NotFound.module.scss";

export function NotFound() {
  const { pathname } = useLocation();
  const { data: me } = useMe();

  return (
    <div className={styles.wrap}>
      <div className={styles.grid} aria-hidden="true" />
      <motion.span
        className={styles.big}
        aria-hidden="true"
        initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        404
      </motion.span>
      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.25, ease: "easeOut" }}
      >
        <h1 className={shared.title}>Page not found.</h1>
        <p className={shared.body}>
          Nothing lives at <code className={styles.path}>{pathname}</code>. It may have moved, or the link is mistyped.
        </p>
        <div className={shared.actions}>
          <Link to="/" className={shared.primary}>Go home</Link>
          <Link to={me ? "/dashboard" : "/docs"} className={shared.secondary}>{me ? "Dashboard" : "Read the docs"}</Link>
        </div>
      </motion.div>
    </div>
  );
}
