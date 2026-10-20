import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UptimeHistory, band, fmtRate } from "./UptimeHistory";

const calls: string[] = [];

function history(range: "24h" | "7d") {
  const n = range === "24h" ? 24 : 28;
  const buckets = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 20) + i * 3_600_000).toISOString());
  const series = Array.from({ length: n }, (_, i) => (i === n - 1 ? 90 : i === n - 2 ? 100 : null));
  return {
    range, bucketMinutes: range === "24h" ? 60 : 360, buckets,
    overall: { rate: 96.5, series },
    models: [{ id: "glm-5.3", rate: 96.5, series }],
  };
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/status/history")) return json(history(url.includes("range=7d") ? "7d" : "24h"));
    if (url.includes("/api/models")) return json({ data: [{ id: "glm-5.3", owned_by: "z-ai" }] });
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("UptimeHistory", () => {
  it("bands success rates and formats them", () => {
    expect([band(100), band(99), band(97), band(80), band(null)]).toEqual(["good", "good", "fair", "poor", "none"]);
    expect([fmtRate(100), fmtRate(96.5), fmtRate(null)]).toEqual(["100%", "96.5%", "No requests"]);
  });

  it("shows the overall rate, a strip per model with its name, and switches range", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><UptimeHistory /></QueryClientProvider>);

    expect(await screen.findByText(/of requests succeeded in the last 24 hours/)).toBeInTheDocument();
    expect(await screen.findByText("GLM 5.3")).toBeInTheDocument();
    const strip = screen.getByRole("img", { name: "GLM 5.3: 96.5% over the last 24 hours" });
    expect(strip.children).toHaveLength(24);

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(await screen.findByText(/of requests succeeded in the last 7 days/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("img", { name: "GLM 5.3: 96.5% over the last 7 days" }).children).toHaveLength(28));
    expect(calls.some(u => u.includes("range=7d"))).toBe(true);
  });
});
