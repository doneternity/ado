import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { ModelUsage } from "./queries";
import type {
  AdminProvider, AdminProviderKey, AdminUser, AdminStats, AdminQuotas,
  AdminErrorsResponse, MaintenanceStatus, AdminPlan,
} from "../types/api";

// ── Providers ──────────────────────────────────────────────
export function useAdminProviders() {
  return useQuery({
    queryKey: ["admin", "providers"],
    queryFn: () => apiFetch<AdminProvider[]>("/api/admin/providers"),
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; baseUrl: string; apiKeys: string[]; priority?: number }) =>
      apiFetch<AdminProvider>("/api/admin/providers", {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; baseUrl: string; priority?: number }) =>
      apiFetch<void>(`/api/admin/providers/${id}`, {
        method: "PUT", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });
}

export function useSetProviderActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<void>(`/api/admin/providers/${id}/active`, {
        method: "PATCH", body: JSON.stringify({ active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });
}

export function useAddProviderKeys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; apiKeys: string[]; label?: string }) =>
      apiFetch<AdminProviderKey[]>(`/api/admin/providers/${id}/keys`, {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });
}

export function useSetProviderKeyActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keyId, active }: { id: string; keyId: string; active: boolean }) =>
      apiFetch<void>(`/api/admin/providers/${id}/keys/${keyId}/active`, {
        method: "PATCH", body: JSON.stringify({ active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });
}

export function useDeleteProviderKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, keyId }: { id: string; keyId: string }) =>
      apiFetch<void>(`/api/admin/providers/${id}/keys/${keyId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });
}

export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/providers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });
}

// ── Users ──────────────────────────────────────────────────
export type InactiveUser = { id: string; email: string; createdAt: string; lastActive: string };

// Accounts with no sign-in, session or API activity for `days` days (preview only).
export function useInactiveUsers(days: number | null) {
  return useQuery({
    queryKey: ["admin", "users", "inactive", days],
    queryFn: () => apiFetch<{ days: number; users: InactiveUser[] }>(`/api/admin/users/inactive?days=${days}`),
    enabled: days !== null,
  });
}

export function useDeleteInactiveUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { days: number; ids: string[] }) =>
      apiFetch<{ deleted: number }>("/api/admin/users/inactive/delete", {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => apiFetch<AdminUser[]>("/api/admin/users"),
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: "user" | "admin" }) =>
      apiFetch<void>(`/api/admin/users/${id}/role`, {
        method: "PATCH", body: JSON.stringify({ role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useSetUserBanned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, banned }: { id: string; banned: boolean }) =>
      apiFetch<void>(`/api/admin/users/${id}/banned`, {
        method: "PATCH", body: JSON.stringify({ banned }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

// ── Stats ──────────────────────────────────────────────────
export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => apiFetch<AdminStats>("/api/admin/stats"),
    refetchInterval: 30_000,
  });
}

// ── Quotas ─────────────────────────────────────────────────
export function useAdminQuotas() {
  return useQuery({
    queryKey: ["admin", "quotas"],
    queryFn: () => apiFetch<AdminQuotas>("/api/admin/quotas"),
  });
}

export function useSetGlobalQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit: number) =>
      apiFetch<void>("/api/admin/quotas/global", {
        method: "PUT", body: JSON.stringify({ limit }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "quotas"] }),
  });
}

export function useSetUserQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, limit }: { email: string; limit: number }) =>
      apiFetch<void>(`/api/admin/quotas/users/by-email`, {
        method: "PUT", body: JSON.stringify({ email, limit }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "quotas"] }),
  });
}

export function useRemoveUserQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/quotas/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "quotas"] }),
  });
}

export function useSetGlobalRpm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit: number) =>
      apiFetch<void>("/api/admin/quotas/rpm", {
        method: "PUT", body: JSON.stringify({ limit }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "quotas"] }),
  });
}

export function useSetFreeTierSlots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit: number) =>
      apiFetch<void>("/api/admin/slots", {
        method: "PUT", body: JSON.stringify({ limit }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "quotas"] }),
  });
}

// ── Errors ─────────────────────────────────────────────────
export function useAdminErrors(page = 1) {
  return useQuery({
    queryKey: ["admin", "errors", page],
    queryFn: () => apiFetch<AdminErrorsResponse>(`/api/admin/errors?page=${page}`),
  });
}

export function useDeleteError() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/admin/errors/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "errors"] }),
  });
}

export function useBulkDeleteErrors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (days: number) =>
      apiFetch<void>(`/api/admin/errors?days=${days}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "errors"] }),
  });
}

// ── Maintenance ────────────────────────────────────────────
export function useMaintenanceStatus() {
  return useQuery({
    queryKey: ["admin", "maintenance"],
    queryFn: () => apiFetch<MaintenanceStatus>("/api/admin/maintenance"),
  });
}

export function useToggleMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    // backend expects the explicit target state, not a blind flip
    mutationFn: (enabled: boolean) =>
      apiFetch<MaintenanceStatus>("/api/admin/maintenance/toggle", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "maintenance"] }),
  });
}

// ── Plans ──────────────────────────────────────────────────
export function useAdminPlans() {
  return useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => apiFetch<AdminPlan[]>("/api/admin/plans"),
  });
}

export function useUpsertPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; dailyQuota: number | null; rpm: number | null }) =>
      apiFetch<AdminPlan>(`/api/admin/plans/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}

export function useSetUserPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, planId }: { id: string; planId: string }) =>
      apiFetch<void>(`/api/admin/users/${id}/plan`, { method: "PUT", body: JSON.stringify({ planId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
    },
  });
}

// ── Request log ────────────────────────────────────────────
export type AdminRequest = {
  id: number;
  createdAt: string;
  email: string;
  endpoint: string;
  model: string | null;
  status: number;
  durationMs: number;
  stream: boolean;
  provider: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
};

export function useAdminRecentRequests(email: string) {
  const q = email.trim();
  return useQuery({
    queryKey: ["admin", "requests", q],
    queryFn: () => apiFetch<AdminRequest[]>(`/api/admin/requests?limit=100${q ? `&email=${encodeURIComponent(q)}` : ""}`),
  });
}

export function useAdminUsageByModel(days: number) {
  return useQuery({
    queryKey: ["admin", "usage", "models", days],
    queryFn: () => apiFetch<ModelUsage[]>(`/api/admin/usage/models?days=${days}`),
  });
}
