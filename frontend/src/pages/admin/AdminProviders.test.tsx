import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminProviders } from "./AdminProviders";

let saved: { mode: string; ids: string[] } | null = null;

beforeEach(() => {
  saved = null;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/models") && init?.method === "PUT") {
      saved = JSON.parse(String(init.body));
      return json(saved);
    }
    if (url.includes("/api/admin/providers/p1/models")) {
      return json({
        mode: "all",
        ids: ["deepseek-old"], // hidden earlier, no longer listed by the provider
        models: [
          { id: "deepseek-flash", name: "DeepSeek V4.1 Flash" },
          { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
          { id: "deepseek-chat" },
        ],
      });
    }
    if (url.endsWith("/api/admin/providers")) {
      return json([{
        id: "p1", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", isActive: true, priority: 0,
        modelSuffix: "", modelMode: "all", modelIds: ["deepseek-old"],
        keys: [{ id: "k1", label: "", suffix: "ab12", isActive: true }],
      }]);
    }
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("AdminProviders models", () => {
  it("lets an admin show only some of a provider's models", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><AdminProviders /></QueryClientProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /Models.*all models shown except 1 hidden/ }));
    expect(await screen.findByText("3 of 3 shown")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Show only the ones I tick" }));
    expect(screen.getByText(/stay hidden until you tick them/)).toBeInTheDocument();
    const row = screen.getByText("deepseek-chat").closest("label")!;
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(screen.getByText("2 of 3 shown")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(saved).not.toBeNull());
    // The ticked models, plus the earlier ID the provider doesn't list now.
    expect(saved).toEqual({ mode: "only", ids: ["deepseek-flash", "deepseek-v4-pro", "deepseek-old"] });
  });
});
