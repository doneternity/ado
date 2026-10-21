import { usePublicModelStatuses } from "./queries";

export type ServiceStatus = { tone: "ok" | "warn" | "down" | "unknown"; label: string; detail: string };

// One line on how the models are doing, for headers and footers.
export const HEALTH_TEXT: Record<ServiceStatus["tone"], string> = {
  ok: "All models live",
  warn: "Some models degraded",
  down: "Models unavailable",
  unknown: "Checking…",
};

// What the live model list says right now, never a fixed "all systems live".
// Shares the cached public model list, so it adds no request to pages that
// already load it.
export function useServiceStatus(): ServiceStatus {
  const { data, isError } = usePublicModelStatuses();
  if (isError) return { tone: "unknown", label: "Unknown", detail: "status couldn't be checked" };
  if (!data) return { tone: "unknown", label: "Checking", detail: "checking the models" };
  if (data.length === 0) return { tone: "down", label: "Down", detail: "no models are being served" };
  const trouble = data.filter((m) => m.status !== "available").length;
  if (data.every((m) => m.status === "down")) return { tone: "down", label: "Down", detail: "no models are answering" };
  if (trouble > 0) return { tone: "warn", label: "Degraded", detail: `${trouble} of ${data.length} models having trouble` };
  return { tone: "ok", label: "Live", detail: `all ${data.length} model${data.length === 1 ? "" : "s"} available` };
}
