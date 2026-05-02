import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useVerify } from "../api/mutations";
import { ApiError } from "../api/client";

export function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const verify = useVerify();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setError("Missing token in URL.");
      return;
    }
    verify.mutateAsync(token)
      .then(() => navigate("/dashboard"))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Unable to verify.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
        <h2>Verification failed</h2>
        <p style={{ color: "var(--muted)" }}>{error}</p>
        <a href="/login">Back to sign in</a>
      </div>
    );
  }
  return <div style={{ textAlign: "center", margin: "4rem 0" }}>Verifying…</div>;
}
