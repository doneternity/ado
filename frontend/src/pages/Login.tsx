import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AuthForm } from "../components/AuthForm";
import { GoogleButton } from "../components/GoogleButton";
import { useLogin, useSignup } from "../api/mutations";
import styles from "./Login.module.scss";

export function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const navigate = useNavigate();
  const login = useLogin();
  const signup = useSignup();

  return (
    <div className={styles.page}>
      <div className={styles.formCol}>
        <span className={styles.eyebrow}>ADO // v1</span>
        <h1 className={styles.headline}>
          {mode === "login" ? "welcome back" : "get your key"}
        </h1>

        <div className={styles.tabs}>
          <button
            className={mode === "login" ? styles.tabActive : styles.tab}
            onClick={() => setMode("login")}
          >
            sign in
          </button>
          <button
            className={mode === "signup" ? styles.tabActive : styles.tab}
            onClick={() => setMode("signup")}
          >
            sign up
          </button>
        </div>

        <AuthForm
          mode={mode}
          isPending={login.isPending || signup.isPending}
          onSubmit={async (vars) => {
            if (mode === "login") {
              await login.mutateAsync(vars);
              navigate("/dashboard");
            } else {
              await signup.mutateAsync(vars);
              navigate("/dashboard");
            }
          }}
        />

        <div className={styles.divider}>or</div>
        <GoogleButton />
      </div>

      <div className={styles.terminalCol}>
        <div className={styles.terminalCard}>
          <div className={styles.terminalTop}>
            <span className={styles.terminalDot} />
            <span className={styles.terminalLabel}>ado terminal v1.0</span>
          </div>
          <div className={styles.kineticWord}>
            {["A", "D", "O"].map((letter, i) => (
              <motion.span
                key={letter}
                animate={{ y: [0, -14, 0] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 }}
              >
                {letter}
              </motion.span>
            ))}
          </div>
          <div className={styles.bootLines}>
            {[
              "initializing ado runtime...",
              "connecting to gemini api...",
              "quota engine ready.",
              <><span className={styles.operational}>● system operational</span><b className={styles.cursor}> _</b></>,
            ].map((line, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.4 + 0.2, duration: 0.45 }}
              >
                {line}
              </motion.p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
