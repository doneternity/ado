import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useResendVerify } from "../api/mutations";
import { ApiError } from "../api/client";
import styles from "./StatusPage.module.scss";

export function VerifyPending() {
  const loc = useLocation();
  const email = (loc.state as { email?: string } | null)?.email ?? "";
  const resend = useResendVerify();
  const [status, setStatus] = useState<string | null>(null);

  async function handleResend() {
    try {
      await resend.mutateAsync(email);
      setStatus("Verification email sent — check your inbox.");
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : "Could not resend.");
    }
  }

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" as const }}
    >
      <div className={styles.icon}>
        <Mail size={28} />
      </div>
      <h1 className={styles.title}>Check your email.</h1>
      <p className={styles.body}>
        We sent a verification link to{" "}
        <strong>{email || "your email address"}</strong>.
        Click the link to activate your account and get your API key.
      </p>
      <p className={styles.sub}>
        Didn&apos;t get it? Check your spam folder or resend below.
      </p>

      <div className={styles.actions}>
        <button
          className={styles.primary}
          disabled={!email || resend.isPending}
          onClick={() => void handleResend()}
        >
          {resend.isPending ? "Sending…" : "Resend email"}
        </button>
      </div>

      {status && (
        <p className={styles.statusMsg}>{status}</p>
      )}

      <Link to="/login" className={styles.back}>
        <ArrowLeft size={14} />
        Back to sign in
      </Link>
    </motion.div>
  );
}
