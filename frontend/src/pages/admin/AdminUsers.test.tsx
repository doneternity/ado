import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminUsers } from "./AdminUsers";

const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY - 60_000).toISOString();

let deleted: string[] = [];

beforeEach(() => {
  deleted = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "DELETE") {
      deleted.push(url);
      return new Response(null, { status: 204 });
    }
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/api/admin/users")) {
      const base = { displayName: null, role: "user", banned: false, createdAt: iso(200), dailyQuotaOverride: null, planId: "free", requestsToday: 0 };
      return json([
        { ...base, id: "1", email: "fresh@example.com", lastActive: iso(3) },
        { ...base, id: "2", email: "stale@example.com", lastActive: iso(160) },
        { ...base, id: "3", email: "boss@example.com", role: "admin", lastActive: iso(0) },
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

  it("deletes a user only after confirming, and offers no delete for admins", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><AdminUsers /></QueryClientProvider>);
    await screen.findByText("boss@example.com");
    const buttons = screen.getAllByRole("button", { name: "Delete" });
    expect(buttons).toHaveLength(2); // fresh@ and stale@, not the admin

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(buttons[1]!);
    expect(deleted).toEqual([]);

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(buttons[1]!);
    await waitFor(() => expect(deleted).toEqual(["/api/admin/users/2"]));
    confirmSpy.mockRestore();
  });
});
