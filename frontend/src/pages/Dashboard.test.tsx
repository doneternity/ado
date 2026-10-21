import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";

let hasKey = false;
let rotated = 0;

beforeEach(() => {
  hasKey = false;
  rotated = 0;
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/auth/me")) return json({ user: { id: "u1", email: "me@example.com", role: "user" }, csrfToken: "c" });
    if (url.includes("/api/keys/rotate") && init?.method === "POST") {
      rotated++;
      hasKey = true;
      return json({ key: "ado-newkeynewkeynewkeynewkeynewkey12", keyPrefix: "ado-newkeyne", dailyLimit: 100 });
    }
    if (url.includes("/api/keys/current")) {
      return hasKey
        ? json({ keyPrefix: "ado-newkeyne", dailyLimit: 100, used: 0, resetsAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString() })
        : json({ error: { code: "NOT_FOUND", message: "you don't have an active API key; create one on the dashboard" } }, 404);
    }
    if (url.includes("/api/keys/flash")) return json({ key: null });
    if (url.includes("/models")) return json({ data: [{ id: "deepseek-v4-pro" }] });
    return json([]);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Dashboard", () => {
  it("lets a user whose key was turned off get a new one", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><Dashboard /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("No active API key")).toBeInTheDocument();
    expect(screen.getByText(/turned off after 14 days without use/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Get a new key/ }));
    expect(await screen.findByText("Your API Key")).toBeInTheDocument();
    expect(rotated).toBe(1);
  });
});
