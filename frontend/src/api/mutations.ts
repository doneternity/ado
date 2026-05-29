import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuthResponse, CurrentKeyResponse, KeyJustIssued, MeResponse } from "../types/api";
import { apiFetch, setCsrfToken } from "./client";
import { meKey, rawKeyKey, currentKeyKey } from "./queries";
import { clearRawKey, saveRawKey } from "./raw-key-storage";

function adoptAuthResponse(qc: ReturnType<typeof useQueryClient>, r: AuthResponse) {
  setCsrfToken(r.csrfToken);
  qc.setQueryData(meKey, { user: r.user, csrfToken: r.csrfToken });
  if (r.keyJustIssued) {
    qc.setQueryData(rawKeyKey, r.keyJustIssued);
    saveRawKey(r.user.id, r.keyJustIssued);
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
      clearRawKey();
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
      const me = qc.getQueryData<MeResponse | null>(meKey);
      if (me) saveRawKey(me.user.id, k);
    },
  });
}

export function useSetReasoningMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch<{ reasoningMode: boolean }>("/api/keys/reasoning", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (res) => {
      // Patch the cached key so the toggle reflects the new state immediately.
      qc.setQueryData<CurrentKeyResponse>(currentKeyKey, (prev) =>
        prev ? { ...prev, reasoningMode: res.reasoningMode } : prev,
      );
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/me", { method: "DELETE" }),
    onSuccess: () => {
      // Mirror logout: the account (and its session) no longer exist, so wipe
      // all auth state — otherwise RedirectIfAuthed bounces back to /dashboard.
      setCsrfToken(null);
      qc.setQueryData(meKey, null);
      qc.setQueryData(rawKeyKey, null);
      qc.removeQueries({ queryKey: currentKeyKey });
      clearRawKey();
    },
  });
}

// Keep adoptAuthResponse available for pages that consume the flash key on load
export { adoptAuthResponse };
