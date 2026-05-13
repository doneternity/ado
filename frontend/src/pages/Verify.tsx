import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useVerify } from "../api/mutations";
import { ApiError } from "../api/client";
import styles from "./StatusPage.module.scss";

export function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const verify = useVerify();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    if (!token) { setError("Missing token in URL."); return; }
    verify.mutateAsync(token)
      .then(() => navigate("/dashboard"))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Unable to verify.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <motion.div
        className={styles.page}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" as const }}
      >
        <div className={`${styles.icon} ${styles.iconError}`}>
          <XCircle size={28} />
        </div>
        <h1 className={styles.title}>Verification failed.</h1>
        <p className={styles.body}>{error}</p>
        <div className={styles.actions}>
          <Link to="/login" className={styles.primary}>Back to sign in</Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`${styles.page} ${styles.centered}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.28 }}
    >
      <div className={styles.spinner}>
        <Loader size={24} className={styles.spin} />
      </div>
      <p className={styles.body}>Verifying your email…</p>
    </motion.div>
  );
}
