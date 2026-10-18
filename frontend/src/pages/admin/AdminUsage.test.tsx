import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AdminUsage } from "./AdminUsage";

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/admin/stats")) return json({ daily: [], topUsers: [] });
    if (url.includes("/api/admin/usage/models")) {
      return json([{ model: "deepseek-flash", requests: 1200, ok: 1188, promptTokens: 45000, completionTokens: 9000, avgMs: 1800 }]);
    }
    if (url.includes("/api/admin/requests")) {
      return json([{ id: 1, createdAt: "2026-10-18T10:00:00Z", email: "a@example.com", endpoint: "/chat/completions", model: "deepseek-flash", status: 200, durationMs: 950, stream: true, provider: "api.deepseek.com", promptTokens: 12, completionTokens: 30 }]);
    }
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AdminUsage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminUsage", () => {
  it("shows per-model totals and recent requests", async () => {
    renderPage();
    expect(await screen.findByText("1.2K")).toBeInTheDocument();      // requests
    expect(screen.getByText("99%")).toBeInTheDocument();              // success rate
    expect(await screen.findByText("/chat/completions (stream)")).toBeInTheDocument();
    expect(screen.getByText("12 / 30")).toBeInTheDocument();
    expect(screen.getByText("api.deepseek.com")).toBeInTheDocument();
  });

  it("applies the email filter on Enter, not on every keystroke", async () => {
    renderPage();
    await screen.findByText("1.2K");
    const before = calls.filter((u) => u.includes("/api/admin/requests")).length;
    const input = screen.getByPlaceholderText(/Filter by exact email/);
    fireEvent.change(input, { target: { value: "a@example.com" } });
    expect(calls.filter((u) => u.includes("/api/admin/requests")).length).toBe(before);
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("a@example.com");
    expect(calls.some((u) => u.includes("email=a%40example.com"))).toBe(true);
  });
});
