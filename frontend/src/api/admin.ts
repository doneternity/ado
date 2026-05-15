import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type {
  AdminProvider, AdminUser, AdminStats, AdminQuotas,
  AdminErrorsResponse, MaintenanceStatus,
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
    mutationFn: (data: { name: string; baseUrl: string; apiKey: string }) =>
      apiFetch<AdminProvider>("/api/admin/providers", {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; baseUrl: string; apiKey?: string }) =>
      apiFetch<AdminProvider>(`/api/admin/providers/${id}`, {
        method: "PUT", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "providers"] }),
  });
}

export function useSetActiveProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/providers/${id}/active`, { method: "PATCH" }),
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
    mutationFn: ({ id, limit }: { id: string; limit: number }) =>
      apiFetch<void>(`/api/admin/quotas/users/${id}`, {
        method: "PUT", body: JSON.stringify({ limit }),
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
    mutationFn: () =>
      apiFetch<MaintenanceStatus>("/api/admin/maintenance/toggle", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "maintenance"] }),
  });
}
