import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Pricing } from "./Pricing";

function renderAs(signedIn: boolean) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/me")) {
      return signedIn
        ? new Response(JSON.stringify({ user: { id: "u1", email: "me@example.com" }, csrfToken: "t" }), { status: 200 })
        : new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "no" } }), { status: 401 });
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Pricing /></MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => vi.unstubAllGlobals());

describe("Pricing calls to action", () => {
  it("sends signed-in users to their dashboard instead of sign-up", async () => {
    renderAs(true);
    expect(await screen.findByText("You're all set.")).toBeInTheDocument();
    expect(screen.queryByText("Create free account")).not.toBeInTheDocument();
    expect(screen.queryByText("Get your free key")).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Go to your dashboard" })) {
      expect(link).toHaveAttribute("href", "/dashboard");
    }
  });

  it("invites visitors to sign up", async () => {
    renderAs(false);
    expect(await screen.findByRole("link", { name: "Create free account" })).toHaveAttribute("href", "/sign-up");
    expect(screen.getByRole("link", { name: "Get your free key" })).toHaveAttribute("href", "/sign-up");
  });
});
