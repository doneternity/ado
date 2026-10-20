// Shared wording for the daily quota, so the dashboard and the Playground say
// the same thing about when it resets.

// 22_380_000 -> "6h 13m"; under an hour -> "41m"; under a minute -> "less than a minute".
export function fmtDuration(ms: number): string {
  const mins = Math.ceil(Math.max(0, ms) / 60_000);
  if (mins <= 1) return ms <= 0 ? "now" : "less than a minute";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// The reset moment in the viewer's own clock, e.g. "01:00".
export function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export type QuotaState = {
  used: number;
  limit: number;
  left: number;
  pct: number;        // 0 to 100
  exhausted: boolean;
  nearLimit: boolean; // 80% or more used
};

export function quotaState(used: number, limit: number): QuotaState {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return {
    used,
    limit,
    left: Math.max(0, limit - used),
    pct,
    exhausted: used >= limit,
    nearLimit: pct >= 80,
  };
}
