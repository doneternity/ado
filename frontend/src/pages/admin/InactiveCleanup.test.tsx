import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InactiveCleanup } from "./InactiveCleanup";

let posted: unknown = null;

beforeEach(() => {
  posted = null;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/admin/users/inactive/delete")) {
      posted = JSON.parse(init!.body as string);
      return json({ deleted: 2 });
    }
    if (url.includes("/api/admin/users/inactive?days=150")) {
      return json({ days: 150, users: [
        { id: "a", email: "old-one@example.com", createdAt: "2026-04-01T00:00:00Z", lastActive: "2026-04-02T00:00:00Z" },
        { id: "b", email: "old-two@example.com", createdAt: "2026-04-01T00:00:00Z", lastActive: "2026-05-01T00:00:00Z" },
      ] });
    }
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><InactiveCleanup /></QueryClientProvider>);
}

describe("InactiveCleanup", () => {
  it("previews, then deletes exactly the previewed accounts after confirming", async () => {
    renderPanel();
    expect(screen.queryByText(/Delete \d+ account/)).not.toBeInTheDocument(); // nothing until asked

    fireEvent.click(screen.getByText("Find inactive accounts"));
    expect(await screen.findByText("old-one@example.com")).toBeInTheDocument();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByText("Delete 2 accounts"));
    expect(posted).toBeNull(); // cancelled

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByText("Delete 2 accounts"));
    await waitFor(() => expect(posted).toEqual({ days: 150, ids: ["a", "b"] }));
    confirmSpy.mockRestore();
  });
});
