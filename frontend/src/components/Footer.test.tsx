import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Footer } from "./Footer";

let models: { id: string; ado_status: string }[] = [];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ data: models }), { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

function renderFooter() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Footer /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Footer", () => {
  it("shows the live model status and links to the Status page", async () => {
    models = [{ id: "a", ado_status: "available" }, { id: "b", ado_status: "degraded" }];
    renderFooter();
    const link = await screen.findByRole("link", { name: "Some models degraded" });
    expect(link).toHaveAttribute("href", "/status");
    expect(screen.queryByText("All systems operational")).not.toBeInTheDocument();
  });

  it("says when every model is down", async () => {
    models = [{ id: "a", ado_status: "down" }];
    renderFooter();
    expect(await screen.findByText("Models unavailable")).toBeInTheDocument();
  });
});
