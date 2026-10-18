import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminUsers } from "./AdminUsers";

const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY - 60_000).toISOString();

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/api/admin/users")) {
      const base = { displayName: null, role: "user", banned: false, createdAt: iso(200), dailyQuotaOverride: null, planId: "free", requestsToday: 0 };
      return json([
        { ...base, id: "1", email: "fresh@example.com", lastActive: iso(3) },
        { ...base, id: "2", email: "stale@example.com", lastActive: iso(160) },
      ]);
    }
    if (url.includes("/api/admin/plans")) return json([{ id: "free", name: "Free", dailyQuota: null, rpm: null, users: 2 }]);
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminUsers last active", () => {
  it("shows how long ago each user was active and flags cleanup candidates", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><AdminUsers /></QueryClientProvider>);

    expect(await screen.findByText(/· 3d ago/)).toBeInTheDocument();
    const stale = screen.getByText(/· 160d ago/);
    expect(stale).toHaveAttribute("title", "Eligible for the inactive-account cleanup");
    expect(screen.getByText(/· 3d ago/)).not.toHaveAttribute("title");
  });
});
