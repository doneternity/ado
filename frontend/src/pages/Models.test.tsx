import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Models } from "./Models";
import { snippetFor } from "../components/ModelCodeDialog";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/models")) {
      return json({ data: [
        { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro", owned_by: "deepseek" },
        { id: "glm-5.3", owned_by: "z-ai" },
      ] });
    }
    if (url.includes("/api/auth/me")) return json({ error: { code: "UNAUTHORIZED" } }, 401);
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Models /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("model code snippets", () => {
  it("puts the model ID in every language, with the key from an environment variable", () => {
    for (const lang of ["curl", "python", "javascript"] as const) {
      const code = snippetFor(lang, "glm-5.3");
      expect(code).toContain('"glm-5.3"');
      expect(code).toContain("https://adoai.space/v1");
      expect(code).toContain("ADO_API_KEY");
      expect(code).not.toMatch(/ado-[A-Za-z0-9]{6,}/); // never a real-looking key
    }
  });

  it("opens from a card with the model's code, switches language and closes on Escape", async () => {
    renderPage();
    expect(await screen.findByText("Z.ai's GLM model for chat, coding and agent tasks.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Code for GLM 5.3" }));
    const dialog = screen.getByRole("dialog", { name: "Use GLM 5.3" });
    expect(dialog.querySelector("pre")).toHaveTextContent('"model": "glm-5.3"');

    fireEvent.click(within(dialog).getByRole("tab", { name: "Python" }));
    expect(dialog.querySelector("pre")).toHaveTextContent('model="glm-5.3"');
    expect(localStorage.getItem("ado:snippet-lang")).toBe("python");
    expect(within(dialog).getByRole("link", { name: "Try it in the Playground" })).toHaveAttribute("href", "/playground?model=glm-5.3");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers provider filters for two providers, but no search for a short list", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "All (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Z.ai (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search models" })).not.toBeInTheDocument();
  });
});
