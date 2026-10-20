import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Playground } from "./Playground";

let calls: { url: string; init?: RequestInit }[] = [];
const DEFAULT_MODELS: Record<string, unknown>[] = [
  { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro", owned_by: "deepseek", context_window: 1048576, effort: { supported_levels: ["low", "high", "max"], default_level: "high" } },
  { id: "deepseek-flash", name: "DeepSeek-V4.1-Flash", owned_by: "deepseek", context_window: 1048576 },
  { id: "glm-5.3", owned_by: "z-ai", ado_status: "degraded" },
];
let liveModels = DEFAULT_MODELS;
let hasKey = true;
let usedToday = 0;

function sseDeltas(...deltas: Record<string, string>[]) {
  const body = deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: d }] })}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function sse(...chunks: string[]) {
  return sseDeltas(...chunks.map((content) => ({ content })));
}

// What the next chat request streams back.
let nextReply: () => Response;

function chatBodies() {
  return calls
    .filter((c) => c.url.includes("/api/playground/chat/completions"))
    .map((c) => JSON.parse(c.init!.body as string) as { model: string; messages: { role: string; content: string }[] });
}

async function say(text: string) {
  const box = screen.getByPlaceholderText("Message…");
  await waitFor(() => expect(box).not.toBeDisabled());
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}

beforeEach(() => {
  calls = [];
  hasKey = true;
  usedToday = 0;
  liveModels = DEFAULT_MODELS;
  nextReply = () => sse("Hel", "lo");
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/api/auth/me")) return json({ user: { id: "u1", email: "me@example.com" }, csrfToken: "csrf-123" });
    if (url.includes("/api/keys/current")) {
      return hasKey
        ? json({ keyPrefix: "ado-abc123", dailyLimit: 100, used: usedToday, resetsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), createdAt: "" })
        : json({ error: { code: "NOT_FOUND", message: "no active key" } }, 404);
    }
    if (url.includes("/api/playground/chat/completions")) return nextReply();
    if (url.includes("/models")) return json({ data: liveModels });
    return json({});
  }));
});
afterEach(() => vi.unstubAllGlobals());

function renderPage(path = "/playground") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><Playground /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Playground", () => {
  it("chats with the signed-in session, without asking for a key", async () => {
    renderPage();
    expect(await screen.findByText("0 / 100 today")).toBeInTheDocument();
    // The header stays compact: no email, no key bar.
    expect(screen.queryByText("me@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/ado-abc123/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ado-x/)).not.toBeInTheDocument();

    const box = screen.getByPlaceholderText("Message…");
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.keyDown(box, { key: "Enter" });

    expect(await screen.findByText("Hello")).toBeInTheDocument();
    const chat = calls.find((c) => c.url.includes("/api/playground/chat/completions"))!;
    expect(JSON.parse(chat.init!.body as string).model).toBe("deepseek-v4-pro");
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

  it("finds a model by search, picks it with the keyboard and remembers it", async () => {
    renderPage();
    const button = await screen.findByRole("button", { name: "Model: DeepSeek V4 Pro" });
    fireEvent.click(button);

    const search = screen.getByRole("combobox", { name: "Search models" });
    fireEvent.change(search, { target: { value: "glm" } });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("GLM 5.3");
    expect(options[0]).toHaveTextContent("Degraded");
    expect(screen.getByRole("group", { name: "Z.ai" })).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Model: GLM 5.3" })).toBeInTheDocument();
    expect(localStorage.getItem("ado:playground-model")).toBe("glm-5.3");

    const box = screen.getByPlaceholderText("Message…");
    fireEvent.change(box, { target: { value: "hi" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText("Hello")).toBeInTheDocument();
    const chat = calls.find((c) => c.url.includes("/api/playground/chat/completions"))!;
    expect(JSON.parse(chat.init!.body as string).model).toBe("glm-5.3");
  });

  it("picks the model named in the link from a Models page card", async () => {
    renderPage("/playground?model=glm-5.3");
    expect(await screen.findByRole("button", { name: "Model: GLM 5.3" })).toBeInTheDocument();
  });

  it("starts on the remembered model", async () => {
    localStorage.setItem("ado:playground-model", "deepseek-flash");
    renderPage();
    expect(await screen.findByRole("button", { name: "Model: DeepSeek V4.1 Flash" })).toBeInTheDocument();
  });

  it("falls back to a served model when the remembered one is gone", async () => {
    localStorage.setItem("ado:playground-model", "retired-model");
    renderPage();
    expect(await screen.findByRole("button", { name: "Model: DeepSeek V4 Pro" })).toBeInTheDocument();
  });

  it("says when no models are available instead of offering made-up ones", async () => {
    liveModels = [];
    renderPage();
    expect(await screen.findByText("No models available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a model" })).toBeDisabled();
  });

  it("shows the model's reasoning in a section that folds away once the answer starts", async () => {
    nextReply = () => sseDeltas({ reasoning_content: "Let me think" }, { reasoning_content: " about it." }, { content: "The answer is **4**." });
    renderPage();
    await screen.findByRole("button", { name: "Model: DeepSeek V4 Pro" });
    await say("2+2?");

    const answer = await screen.findByText("4");
    expect(answer.tagName).toBe("STRONG"); // rendered as Markdown
    const toggle = screen.getByRole("button", { name: /Thought for/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Let me think about it.")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("Let me think about it.")).toBeInTheDocument();

    // The reasoning is never sent back with the next message.
    await say("and 3+3?");
    await waitFor(() => expect(chatBodies()).toHaveLength(2));
    expect(chatBodies()[1]!.messages.map((m) => m.content)).toEqual(["2+2?", "The answer is **4**.", "and 3+3?"]);
  });

  it("regenerates the last reply from the same conversation", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Model: DeepSeek V4 Pro" });
    await say("hi");
    await screen.findByText("Hello");

    nextReply = () => sse("Hi again");
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("Hi again")).toBeInTheDocument();
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
    expect(chatBodies()[1]!.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("edits an earlier message and continues from there", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Model: DeepSeek V4 Pro" });
    await say("hi");
    await screen.findByText("Hello");
    nextReply = () => sse("Second reply");
    await say("tell me more");
    await screen.findByText("Second reply");

    nextReply = () => sse("Edited reply");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit and resend" })[0]!);
    const edit = screen.getByRole("textbox", { name: "Edit message" });
    fireEvent.change(edit, { target: { value: "hey there" } });
    fireEvent.keyDown(edit, { key: "Enter" });

    expect(await screen.findByText("Edited reply")).toBeInTheDocument();
    expect(screen.queryByText("tell me more")).not.toBeInTheDocument();
    expect(screen.queryByText("Second reply")).not.toBeInTheDocument();
    expect(chatBodies()[2]!.messages).toEqual([{ role: "user", content: "hey there" }]);
  });

  it("copies a reply", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderPage();
    await screen.findByRole("button", { name: "Model: DeepSeek V4 Pro" });
    await say("hi");
    await screen.findByText("Hello");
    // [the user message's copy button, the reply's]
    fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[1]!);
    expect(writeText).toHaveBeenCalledWith("Hello");
  });

  it("sends the chosen settings, and only effort levels the model supports", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Model: DeepSeek V4 Pro" });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByLabelText(/Temperature/), { target: { value: "0.3" } });
    fireEvent.change(screen.getByLabelText("Max tokens"), { target: { value: "256" } });
    fireEvent.click(screen.getByRole("button", { name: "max" }));
    expect(screen.getByRole("button", { name: "Settings (changed)" })).toBeInTheDocument();

    await say("hi");
    await screen.findByText("Hello");
    expect(chatBodies()[0]).toMatchObject({ temperature: 0.3, max_tokens: 256, reasoning_effort: "max" });

    // GLM lists no effort levels, so the effort isn't sent to it.
    fireEvent.click(screen.getByRole("button", { name: "Model: DeepSeek V4 Pro" }));
    fireEvent.click(screen.getByRole("option", { name: /GLM 5.3/ }));
    expect(screen.queryByRole("group", { name: "Reasoning effort" })).not.toBeInTheDocument();
    await say("again");
    await waitFor(() => expect(chatBodies()).toHaveLength(2));
    expect(chatBodies()[1]).not.toHaveProperty("reasoning_effort");
    expect(chatBodies()[1]).toMatchObject({ model: "glm-5.3", temperature: 0.3, max_tokens: 256 });

    // Settings are remembered.
    expect(JSON.parse(localStorage.getItem("ado:playground-settings")!)).toEqual({ temperature: 0.3, maxTokens: 256, effort: "max" });
  });

  it("shows today's usage, and says when the limit resets once it's reached", async () => {
    usedToday = 42;
    const first = renderPage();
    expect(await screen.findByText("42 / 100 today")).toBeInTheDocument();
    first.unmount();

    usedToday = 100;
    renderPage();
    expect(await screen.findByText("Daily limit reached")).toBeInTheDocument();
    expect(screen.getByText(/More are available in (2h 5\dm|3h), at/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Daily limit reached")).toBeDisabled();
  });

  it("keeps the chat across a reload, and forgets it when cleared", async () => {
    const first = renderPage();
    await screen.findByRole("button", { name: "Model: DeepSeek V4 Pro" });
    await say("remember me");
    await screen.findByText("Hello");
    await waitFor(() => expect(localStorage.getItem("ado:playground-chat:u1")).toContain("Hello"));
    first.unmount();

    renderPage();
    expect(await screen.findByText("remember me")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Clear chat"));
    expect(screen.queryByText("remember me")).not.toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("ado:playground-chat:u1")).toBeNull());
  });
});
