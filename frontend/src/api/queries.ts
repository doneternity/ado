import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentKeyResponse, FlashKeyResponse, KeyJustIssued, MeResponse } from "../types/api";
import { apiFetch, ApiError, setCsrfToken } from "./client";
import { clearRawKey, loadRawKey, saveRawKey } from "./raw-key-storage";
import { pickSampleModel } from "../data/sample-model";

export const meKey = ["me"] as const;
export const currentKeyKey = ["keys", "current"] as const;
export const rawKeyKey = ["keys", "raw"] as const;
export const publicModelsKey = ["models", "public"] as const;

export type ModelStatus = "available" | "degraded" | "down";
export type PublicModel = { id: string; status: ModelStatus };

// Shared, cached fetch of the public model list (no key required). Both hooks
// below read the same cache entry, so the list is fetched once per page.
const publicModelsQuery = {
  queryKey: publicModelsKey,
  queryFn: async (): Promise<PublicModel[]> => {
    const r = await fetch((import.meta.env.VITE_API_BASE_URL ?? "") + "/api/models");
    const d = (await r.json()) as { data?: { id: string; ado_status?: ModelStatus }[] };
    return (d.data ?? []).map((m) => ({ id: m.id, status: m.ado_status ?? "available" }));
  },
  staleTime: 5 * 60_000,
};

export function usePublicModels() {
  return useQuery({ ...publicModelsQuery, select: (ms: PublicModel[]) => ms.map((m) => m.id) });
}

export function usePublicModelStatuses() {
  return useQuery(publicModelsQuery);
}

// The example model ID for docs/snippets — live-resolved with a static fallback.
export function useSampleModel(): string {
  const { data } = usePublicModels();
  return pickSampleModel(data);
}

export function useMe(opts?: { refetchInterval?: number }) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        const me = await apiFetch<MeResponse>("/api/auth/me");
        setCsrfToken(me.csrfToken);
        // Restore the raw key from localStorage on first /me success so the
        // Playground stays pre-filled after a page reload.
        if (!qc.getQueryData(rawKeyKey)) {
          const stored = loadRawKey(me.user.id);
          if (stored) qc.setQueryData(rawKeyKey, stored);
        }
        return me;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setCsrfToken(null);
          qc.setQueryData(rawKeyKey, null);
          clearRawKey();
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

export type ModelUsage = {
  model: string;
  requests: number;
  ok: number;
  promptTokens: number;
  completionTokens: number;
  avgMs?: number;
};

// The signed-in user's requests per model over the last `days` days.
export function useMyUsageByModel(days = 30) {
  return useQuery({
    queryKey: ["keys", "usage", "models", days],
    queryFn: () => apiFetch<ModelUsage[]>(`/api/keys/usage/models?days=${days}`),
  });
}

// Reads /api/keys/flash exactly once on dashboard mount; merges into raw cache if present.
export function fetchFlashKeyOnce(qc: ReturnType<typeof useQueryClient>) {
  return apiFetch<FlashKeyResponse>("/api/keys/flash").then((res) => {
    if (res.key) {
      const issued = { key: res.key, keyPrefix: res.keyPrefix, dailyLimit: res.dailyLimit };
      qc.setQueryData(rawKeyKey, issued);
      const me = qc.getQueryData<MeResponse | null>(meKey);
      if (me) saveRawKey(me.user.id, issued);
    }
  });
}

// Whether maintenance mode is on. Polled so visitors see the site come back
// without reloading; a failed check counts as "off" so an outage of this
// endpoint never locks people out.
export function useMaintenance() {
  return useQuery({
    queryKey: ["maintenance"],
    queryFn: async () => {
      try {
        const r = await fetch((import.meta.env.VITE_API_BASE_URL ?? "") + "/api/maintenance");
        if (!r.ok) return false;
        const d = (await r.json()) as { enabled?: boolean };
        return d.enabled === true;
      } catch {
        return false;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
