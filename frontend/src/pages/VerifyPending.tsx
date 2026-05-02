import { useLocation } from "react-router-dom";
import { useResendVerify } from "../api/mutations";
import { useState } from "react";
import { ApiError } from "../api/client";

export function VerifyPending() {
  const loc = useLocation();
  const email = (loc.state as { email?: string } | null)?.email ?? "";
  const resend = useResendVerify();
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h2>Check your email</h2>
      <p style={{ color: "var(--muted)" }}>
        We sent a verification link to <strong>{email || "your email"}</strong>.
      </p>
      <p>
        <button
          disabled={!email || resend.isPending}
          onClick={async () => {
            try {
              await resend.mutateAsync(email);
              setStatus("Verification email resent.");
            } catch (err) {
              setStatus(err instanceof ApiError ? err.message : "Could not resend.");
            }
          }}
        >
          {resend.isPending ? "Sending…" : "Resend verification email"}
        </button>
      </p>
      {status && <p style={{ color: "var(--muted)" }}>{status}</p>}
      <p><a href="/login">Back to sign in</a></p>
    </div>
  );
}
