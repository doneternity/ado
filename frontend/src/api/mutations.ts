import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuthResponse, KeyJustIssued } from "../types/api";
import { apiFetch, setCsrfToken } from "./client";
import { meKey, rawKeyKey, currentKeyKey } from "./queries";

function adoptAuthResponse(qc: ReturnType<typeof useQueryClient>, r: AuthResponse) {
  setCsrfToken(r.csrfToken);
  qc.setQueryData(meKey, { user: r.user, csrfToken: r.csrfToken });
  if (r.keyJustIssued) {
    qc.setQueryData(rawKeyKey, r.keyJustIssued);
  }
  qc.invalidateQueries({ queryKey: currentKeyKey });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      setCsrfToken(null);
      qc.setQueryData(meKey, null);
      qc.setQueryData(rawKeyKey, null);
      qc.removeQueries({ queryKey: currentKeyKey });
    },
  });
}

export function useRotateKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<KeyJustIssued>("/api/keys/rotate", { method: "POST" }),
    onSuccess: (k) => {
      qc.setQueryData(rawKeyKey, k);
      qc.invalidateQueries({ queryKey: currentKeyKey });
    },
  });
}

// Keep adoptAuthResponse available for pages that consume the flash key on load
export { adoptAuthResponse };
