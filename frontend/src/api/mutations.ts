import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuthResponse, KeyJustIssued, SignupResponse } from "../types/api";
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

export function useSignup() {
  return useMutation({
    mutationFn: (vars: { email: string; password: string; displayName?: string }) =>
      apiFetch<SignupResponse>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      apiFetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: (r) => adoptAuthResponse(qc, r),
  });
}

export function useVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<AuthResponse>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: (r) => adoptAuthResponse(qc, r),
  });
}

export function useResendVerify() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<{ ok: true }>("/api/auth/verify/resend", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
  });
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
