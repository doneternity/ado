import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Docs } from "./Docs";

let signedIn = false;

beforeEach(() => {
  localStorage.clear();
  signedIn = false;
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/models")) {
      return json({ data: [
        { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro", owned_by: "deepseek" },
        { id: "deepseek-v4-flash", name: "DeepSeek-V4-Flash", owned_by: "deepseek", input_modalities: ["text", "image"] },
      ] });
    }
    if (url.includes("/api/auth/me")) {
      return signedIn
        ? json({ user: { id: "u1", email: "a@example.com", emailVerified: true, role: "user" }, csrfToken: "t" })
        : json({ error: { code: "UNAUTHORIZED" } }, 401);
    }
    if (url.includes("/api/keys/current")) {
      return json({ keyPrefix: "ado-abc", dailyLimit: 250, rpmLimit: 37, used: 7, resetsAt: "2026-10-22T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", plan: { id: "free", name: "Free" } });
    }
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Docs /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Docs", () => {
  it("shows the base URL and examples that read the key from ADO_API_KEY, in the language picked", async () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Copy the base URL/ })).toHaveTextContent("https://adoai.space/v1");

    const quickStart = document.getElementById("quick-start")!;
    expect(await within(quickStart).findByText(/"deepseek-v4-pro"/)).toBeInTheDocument();
    expect(quickStart.querySelector("[role=tabpanel] pre")).toHaveTextContent("$ADO_API_KEY");

    // Picking Python switches every example on the page, and is remembered.
    fireEvent.click(within(quickStart).getByRole("tab", { name: "Python" }));
    expect(quickStart.querySelector("[role=tabpanel] pre")).toHaveTextContent('os.environ["ADO_API_KEY"]');
    const streaming = document.getElementById("streaming")!;
    expect(within(streaming).getByRole("tab", { name: "Python" })).toHaveAttribute("aria-selected", "true");
    expect(streaming.querySelector("pre")).toHaveTextContent("stream=True");
    expect(localStorage.getItem("ado:snippet-lang")).toBe("python");

    // Nothing on the page looks like a real key.
    expect(document.body.textContent).not.toMatch(/ado-[A-Za-z0-9]{8,}/);
  });

  it("names the models that take images from the live list", async () => {
    renderPage();
    const vision = document.getElementById("vision")!;
    expect(await within(vision).findByText(/Models that take images right now: DeepSeek V4 Flash/)).toBeInTheDocument();
    expect(vision.querySelector("pre")).toHaveTextContent('"model": "deepseek-v4-flash"');
  });

  it("asks visitors to sign in to see their own limits", async () => {
    renderPage();
    const limits = document.getElementById("rate-limits")!;
    expect(await within(limits).findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("shows a signed-in user's own limits", async () => {
    signedIn = true;
    renderPage();
    const limits = document.getElementById("rate-limits")!;
    expect(await within(limits).findByText("250")).toBeInTheDocument();
    expect(within(limits).getByText("requests a day")).toBeInTheDocument();
    expect(within(limits).getByText("37")).toBeInTheDocument();
    expect(within(limits).getByText("Free")).toBeInTheDocument();
  });
});
