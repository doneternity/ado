import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { ApiError } from "../api/client";
import styles from "./AuthForm.module.scss";

type Mode = "login" | "signup";
type Props = {
  mode: Mode;
  onSubmit: (vars: { email: string; password: string; displayName?: string }) => Promise<void>;
  isPending: boolean;
};

export function AuthForm({ mode, onSubmit, isPending }: Props) {
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [displayName, setDisplay] = useState("");
  const [error, setError]         = useState<string | null>(null);

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit({ email, password, displayName: displayName.trim() || undefined });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Something went wrong");
        }
      }}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          className={styles.input}
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          className={styles.input}
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
          maxLength={128}
          placeholder={mode === "signup" ? "at least 8 characters" : "your password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
        />
        {mode === "signup" && (
          <span className={styles.hint}>8–128 characters</span>
        )}
      </div>

      {mode === "signup" && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="auth-name">
            Display name{" "}
            <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id="auth-name"
            className={styles.input}
            type="text"
            autoComplete="name"
            placeholder="how others see you"
            maxLength={80}
            value={displayName}
            onChange={(e) => setDisplay(e.target.value)}
            disabled={isPending}
          />
        </div>
      )}

      {error && (
        <div className={styles.error} role="alert">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending
          ? "Working…"
          : mode === "login"
            ? "Sign in"
            : "Create account — it's free"}
      </button>
    </form>
  );
}
