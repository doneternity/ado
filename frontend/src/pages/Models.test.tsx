import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Models } from "./Models";
import { snippetFor } from "../components/ModelDrawer";

let modelsReply: { status: number; body: unknown };

beforeEach(() => {
  localStorage.clear();
  modelsReply = { status: 200, body: { data: [
    { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro", owned_by: "deepseek" },
    { id: "glm-5.3", owned_by: "z-ai" },
  ] } };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/models")) return json(modelsReply.body, modelsReply.status);
    if (url.includes("/api/status/history")) {
      const n = 24;
      return json({
        range: "24h", bucketMinutes: 60,
        buckets: Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 9, 23, i)).toISOString()),
        overall: { rate: 97.5, series: Array(n).fill(97.5) },
        models: [{ id: "glm-5.3", rate: 97.5, series: [null, ...Array(n - 1).fill(97.5)] }],
      });
    }
    if (url.includes("/api/auth/me")) return json({ error: { code: "UNAUTHORIZED" } }, 401);
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(path = "/models") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><Models /><Search /></MemoryRouter>
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

  it("opens a drawer with the model's reliability and code, and closes on Escape", async () => {
    renderPage();
    expect(await screen.findByText("Z.ai's GLM model for chat, coding and agent tasks.")).toBeInTheDocument();
    // The card shows the last 24 hours.
    expect(await screen.findByRole("img", { name: "97.5% of requests got an answer in the last 24 hours" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Details for GLM 5.3" }));
    expect(screen.getByTestId("search")).toHaveTextContent("?model=glm-5.3"); // shareable
    const dialog = screen.getByRole("dialog", { name: "GLM 5.3" });
    expect(within(dialog).getByText(/of requests got an answer in the last 24 hours/)).toBeInTheDocument();
    expect(dialog.querySelector("pre")).toHaveTextContent('"model": "glm-5.3"');

    fireEvent.click(within(dialog).getByRole("tab", { name: "Python" }));
    expect(dialog.querySelector("pre")).toHaveTextContent('model="glm-5.3"');
    expect(localStorage.getItem("ado:snippet-lang")).toBe("python");
    expect(within(dialog).getByRole("link", { name: "Try it in the Playground" })).toHaveAttribute("href", "/playground?model=glm-5.3");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent(/^$/);
  });

  it("opens a model and applies filters straight from the URL", async () => {
    renderPage("/models?provider=zai&model=glm-5.3");
    expect(await screen.findByRole("dialog", { name: "GLM 5.3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Z.ai (1)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "DeepSeek V4 Pro" })).not.toBeInTheDocument();
  });

  it("offers provider filters for two providers, but no search for a short list", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "All (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Z.ai (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search models" })).not.toBeInTheDocument();
  });

  it("files models by the maker their ID names, not the reseller's owned_by", async () => {
    modelsReply.body = { data: [
      { id: "deepseek-flash", owned_by: "deepseek", input_modalities: ["text", "image"], context_window: 1048576, max_output_tokens: 393216 },
      { id: "gemini-3.6-flash", owned_by: "openai", context_length: 1000000 },
      { id: "gemini-3-flash", owned_by: "google gemini", ado_status: "down" },
    ] };
    renderPage();
    const google = await screen.findByRole("region", { name: /Google/ });
    expect(within(google).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Gemini 3.6 Flash", "Gemini 3 Flash"]);
    expect(screen.queryByRole("region", { name: /OpenAI/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /OpenAI/ })).not.toBeInTheDocument();
    expect(screen.getByText("3 models from 2 providers")).toBeInTheDocument();
    expect(screen.getByText("2 available, 1 down")).toBeInTheDocument();
    expect(screen.getByText("384K")).toBeInTheDocument(); // max output
  });

  it("puts the Other group last, however many models it has", async () => {
    modelsReply.body = { data: [
      { id: "nemotron-3-ultra-550b-a55b", owned_by: "openai" },
      { id: "mystery-model", owned_by: "openai" },
      { id: "glm-4.7-flash", owned_by: "z-ai" },
    ] };
    renderPage();
    await screen.findByRole("region", { name: /Other/ });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.id).filter(Boolean)).toEqual(["group-zai", "group-other"]);
  });

  it("filters by capability and offers to clear filters when nothing matches", async () => {
    modelsReply.body = { data: [
      { id: "deepseek-flash", owned_by: "deepseek", input_modalities: ["text", "image"] },
      { id: "deepseek-v4-pro", owned_by: "deepseek", input_modalities: ["text"] },
      { id: "glm-5.3", owned_by: "z-ai" },
    ] };
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Vision" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["DeepSeek V4.1 Flash"]);
    expect(screen.getByTestId("search")).toHaveTextContent("?need=vision");

    fireEvent.click(screen.getByRole("button", { name: "Z.ai (1)" }));
    expect(screen.getByText("No models match these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
  });

  it("says why the list couldn't load and lets you try again", async () => {
    modelsReply = { status: 429, body: { error: { code: "RATE_LIMITED", message: "too many requests; try again in a minute" } } };
    renderPage();
    expect(await screen.findByText("Too many requests; try again in a minute.")).toBeInTheDocument();
    modelsReply = { status: 200, body: { data: [{ id: "glm-5.3", owned_by: "z-ai" }] } };
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "GLM 5.3" })).toBeInTheDocument();
  });
});
