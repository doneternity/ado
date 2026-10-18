import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Playground } from "./Playground";

let calls: { url: string; init?: RequestInit }[] = [];
let hasKey = true;

function sse(...chunks: string[]) {
  const body = chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

beforeEach(() => {
  calls = [];
  hasKey = true;
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/auth/me")) return json({ user: { id: "u1", email: "me@example.com" }, csrfToken: "csrf-123" });
    if (url.includes("/api/keys/current")) {
      return hasKey
        ? json({ keyPrefix: "ado-abc123", dailyLimit: 100, used: 0, resetsAt: "", createdAt: "" })
        : json({ error: { code: "NOT_FOUND", message: "no active key" } }, 404);
    }
    if (url.includes("/api/playground/chat/completions")) return sse("Hel", "lo");
    if (url.includes("/models")) return json({ data: [] });
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Playground /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Playground", () => {
  it("chats with the signed-in session, without asking for a key", async () => {
    renderPage();
    expect(await screen.findByText("ado-abc123…")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ado-x/)).not.toBeInTheDocument();

    const box = screen.getByPlaceholderText("Message…");
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(await screen.findByText("Hello")).toBeInTheDocument();
    const chat = calls.find((c) => c.url.includes("/api/playground/chat/completions"))!;
    const headers = chat.init!.headers as Record<string, string>;
    expect(chat.init!.credentials).toBe("include");
    expect(headers["X-CSRF-Token"]).toBe("csrf-123");
    expect(headers).not.toHaveProperty("Authorization");
  });

  it("points to the dashboard when there is no active key", async () => {
    hasKey = false;
    renderPage();
    expect(await screen.findByRole("link", { name: /Get one on the dashboard/ })).toHaveAttribute("href", "/dashboard");
    await waitFor(() => expect(screen.getByPlaceholderText("Get a key on the dashboard first")).toBeDisabled());
  });
});
