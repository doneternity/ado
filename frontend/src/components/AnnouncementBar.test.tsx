import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnnouncementBar } from "./AnnouncementBar";

let notice: Record<string, string> = {};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(notice), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AnnouncementBar /></QueryClientProvider>);
}

describe("AnnouncementBar", () => {
  it("shows the notice with its link, and stays hidden once dismissed", async () => {
    notice = { id: "a1", message: "We moved Discord servers.", linkUrl: "https://discord.gg/x", linkLabel: "Join" };
    const first = renderBar();
    expect(await screen.findByText("We moved Discord servers.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute("href", "https://discord.gg/x");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss announcement" }));
    expect(screen.queryByText("We moved Discord servers.")).not.toBeInTheDocument();
    first.unmount();

    renderBar(); // a later visit, same message
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("We moved Discord servers.")).not.toBeInTheDocument();
  });

  it("shows a new message even after the previous one was dismissed", async () => {
    localStorage.setItem("ado:announcement-dismissed", "a1");
    notice = { id: "b2", message: "Maintenance tonight at 22:00 UTC." };
    renderBar();
    expect(await screen.findByText("Maintenance tonight at 22:00 UTC.")).toBeInTheDocument();
  });

  it("renders nothing when there is no notice", async () => {
    notice = {};
    const { container } = renderBar();
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
