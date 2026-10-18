import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "./Layout";

type Role = "user" | "admin" | null;

// Fake backend: maintenance flag plus an optional signed-in user.
function mockApi(maintenance: boolean, role: Role) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/api/maintenance")) return json(200, { enabled: maintenance });
    if (url.endsWith("/api/auth/me")) {
      return role
        ? json(200, { user: { id: "u1", email: "a@example.com", emailVerified: true, role }, csrfToken: "x" })
        : json(401, { error: { code: "UNAUTHORIZED", message: "not signed in" } });
    }
    return json(200, { full: false });
  }));
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Layout><p>page content</p></Layout>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("maintenance mode", () => {
  it("shows the maintenance screen to visitors", async () => {
    mockApi(true, null);
    renderAt("/");
    expect(await screen.findByText("We'll be right back.")).toBeInTheDocument();
    expect(screen.queryByText("page content")).toBeNull();
  });

  it("shows it to signed-in non-admins too", async () => {
    mockApi(true, "user");
    renderAt("/dashboard");
    expect(await screen.findByText("We'll be right back.")).toBeInTheDocument();
  });

  it("lets admins through with a banner", async () => {
    mockApi(true, "admin");
    renderAt("/");
    expect(await screen.findByText(/Maintenance mode is on/)).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("keeps the sign-in page reachable", async () => {
    mockApi(true, null);
    renderAt("/login");
    expect(await screen.findByText("page content")).toBeInTheDocument();
  });

  it("shows the normal site when maintenance is off", async () => {
    mockApi(false, null);
    renderAt("/");
    expect(await screen.findByText("page content")).toBeInTheDocument();
    expect(screen.queryByText("We'll be right back.")).toBeNull();
  });
});
