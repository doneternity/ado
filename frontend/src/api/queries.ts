import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentKeyResponse, FlashKeyResponse, KeyJustIssued, MeResponse } from "../types/api";
import { apiFetch, ApiError, setCsrfToken } from "./client";

export const meKey = ["me"] as const;
export const currentKeyKey = ["keys", "current"] as const;
export const rawKeyKey = ["keys", "raw"] as const;

export function useMe(opts?: { refetchInterval?: number }) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        const me = await apiFetch<MeResponse>("/api/auth/me");
        setCsrfToken(me.csrfToken);
        return me;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setCsrfToken(null);
          qc.setQueryData(rawKeyKey, null);
          return null;
        }
        throw err;
      }
    },
    refetchOnWindowFocus: true,
    refetchInterval: opts?.refetchInterval,
  });
}

export function useCurrentKey(opts: { enabled: boolean }) {
  return useQuery({
    queryKey: currentKeyKey,
    queryFn: () => apiFetch<CurrentKeyResponse>("/api/keys/current"),
    enabled: opts.enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

// Read-only selector for the raw key cache slot. Populated by mutations / flash; never refetched.
export function useRawKey(): KeyJustIssued | null {
  const { data } = useQuery<KeyJustIssued | null>({
    queryKey: rawKeyKey,
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? null;
}

export function useKeyUsageHistory() {
  return useQuery({
    queryKey: ["keys", "usage"],
    queryFn: () => apiFetch<{ day: string; used: number }[]>("/api/keys/usage"),
  });
}

// Reads /api/keys/flash exactly once on dashboard mount; merges into raw cache if present.
export function fetchFlashKeyOnce(qc: ReturnType<typeof useQueryClient>) {
  return apiFetch<FlashKeyResponse>("/api/keys/flash").then((res) => {
    if (res.key) {
      qc.setQueryData(rawKeyKey, {
        key: res.key,
        keyPrefix: res.keyPrefix,
        dailyLimit: res.dailyLimit,
      });
    }
  });
}
