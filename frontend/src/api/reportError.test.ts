let fetchMock: ReturnType<typeof vi.fn>;

// The module remembers what it already sent, so each test gets a fresh copy.
async function load() {
  vi.resetModules();
  const [mod, client] = await Promise.all([import("./reportError"), import("./client")]);
  return { ...mod, ApiError: client.ApiError };
}

beforeEach(() => {
  vi.stubEnv("PROD", true);
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function sentBodies() {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

describe("reportError", () => {
  it("sends the message, stack and page path", async () => {
    const { reportError } = await load();
    window.history.pushState({}, "", "/dashboard?tab=keys");
    reportError("render", new TypeError("x is undefined"));
    expect(fetchMock).toHaveBeenCalledWith("/api/client-errors", expect.objectContaining({ method: "POST", credentials: "omit" }));
    const [body] = sentBodies();
    expect(body).toMatchObject({ kind: "render", message: "TypeError: x is undefined", page: "/dashboard" });
    expect(typeof body.stack).toBe("string");
  });

  it("sends each distinct error once, and at most five per page load", async () => {
    const { reportError } = await load();
    reportError("render", new Error("same"));
    reportError("render", new Error("same"));
    for (let i = 0; i < 10; i++) reportError("error", new Error(`e${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("skips API errors, stale chunks, and development builds", async () => {
    const { reportError, ApiError } = await load();
    reportError("promise", new ApiError(403, "FORBIDDEN", "no"));
    reportError("render", new TypeError("Failed to fetch dynamically imported module: /assets/x.js"));
    vi.stubEnv("PROD", false);
    reportError("render", new Error("dev only"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("describes non-Error values", async () => {
    const { reportError } = await load();
    reportError("promise", { reason: "boom" });
    expect(sentBodies()[0].message).toBe('Error: {"reason":"boom"}');
  });
});
