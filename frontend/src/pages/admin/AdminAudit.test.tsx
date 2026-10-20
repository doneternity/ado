import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminAudit, actionLabel } from "./AdminAudit";

const entry = (id: number, action: string, target: string, details: Record<string, unknown>) => ({
  id, createdAt: "2026-10-20T12:00:00Z", actor: "admin@example.com", action, target, details,
});

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("before=0")) {
      // A full first page, so there's an older one to load.
      return json(Array.from({ length: 50 }, (_, i) =>
        i === 0
          ? entry(100, "PATCH /providers/{id}/active", "Z.ai", { id: "3f2a", active: false })
          : entry(100 - i, "PUT /quotas/global", "global daily quota", { limit: 150 })));
    }
    if (url.includes("before=51")) return json([entry(10, "PUT /announcement", "announcement", { message: "We moved Discord servers." })]);
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminAudit", () => {
  it("names actions in plain English, using the details where they matter", () => {
    expect(actionLabel({ action: "PATCH /users/{id}/banned", details: { banned: true } })).toBe("Banned user");
    expect(actionLabel({ action: "POST /maintenance/toggle", details: { enabled: false } })).toBe("Turned maintenance off");
    expect(actionLabel({ action: "POST /something/new", details: {} })).toBe("POST /something/new");
  });

  it("lists changes with who made them, hides route IDs, and loads older pages", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><AdminAudit /></QueryClientProvider>);

    expect(await screen.findByText("Turned provider off")).toBeInTheDocument();
    expect(screen.getByText("Z.ai")).toBeInTheDocument();
    expect(screen.getAllByText("admin@example.com").length).toBeGreaterThan(1);
    expect(screen.queryByText("3f2a")).not.toBeInTheDocument();
    expect(screen.getAllByText("Set the daily quota")).toHaveLength(49);

    fireEvent.click(screen.getByRole("button", { name: "Load older" }));
    expect(await screen.findByText("Set the announcement")).toBeInTheDocument();
    expect(screen.getByText("We moved Discord servers.")).toBeInTheDocument();
    expect(calls.some((u) => u.includes("before=51"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Load older" })).not.toBeInTheDocument();
  });
});
