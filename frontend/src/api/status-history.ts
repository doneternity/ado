import { useQuery } from "@tanstack/react-query";

export type HistoryRange = "24h" | "7d";
export type Series = { id?: string; rate: number | null; series: (number | null)[] };
export type History = {
  range: HistoryRange;
  bucketMinutes: number;
  buckets: string[];
  overall: Series;
  models: Series[];
};

// Success rate of real requests per model, per hour (24h) or six hours (7d),
// from the public /api/status/history. The Status page, the Models page cards
// and the model drawer share one cached copy per range; it refreshes hourly
// on its own (the server caches it for a minute).
export function useStatusHistory(range: HistoryRange) {
  return useQuery({
    queryKey: ["status-history", range],
    queryFn: async (): Promise<History> => {
      const r = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/api/status/history?range=${range}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as History;
    },
    staleTime: 60_000,
    refetchInterval: 60 * 60_000,
  });
}
