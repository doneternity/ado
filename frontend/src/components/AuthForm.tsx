import { useState } from "react";
import { ApiError } from "../api/client";
import styles from "./AuthForm.module.scss";

type Mode = "login" | "signup";
type Props = {
  mode: Mode;
  onSubmit: (vars: { email: string; password: string; displayName?: string }) => Promise<void>;
  isPending: boolean;
};

export function AuthForm({ mode, onSubmit, isPending }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit({ email, password, displayName: displayName || undefined });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Something went wrong");
        }
      }}
    >
      <label className={styles.field}>
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
        />
      </label>
      <label className={styles.field}>
        <span>Password</span>
        <input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
        />
      </label>
      {mode === "signup" && (
        <label className={styles.field}>
          <span>Display name (optional)</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={isPending}
          />
        </label>
      )}
      {error && <div className={styles.error}>⚠ {error}</div>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
