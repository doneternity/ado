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

  it("tells our own scripts from ones a browser or extension injected", async () => {
    const { isOurScript } = await load();
    const origin = window.location.origin;
    expect(isOurScript(`${origin}/assets/index-abc.js`, undefined)).toBe(true);
    // Firefox for iOS / Dark Reader report the page itself as the file.
    expect(isOurScript(`${origin}/sign-up`, undefined)).toBe(false);
    expect(isOurScript(undefined, `global code@${origin}/sign-up:1:11`)).toBe(false);
    expect(isOurScript(undefined, `at x (${origin}/assets/Dashboard-abc.js:1:2)`)).toBe(true);
    expect(isOurScript(undefined, undefined)).toBe(false);
  });

  it("doesn't report injected-script errors that reach the window", async () => {
    const { installErrorReporting } = await load();
    installErrorReporting();
    const origin = window.location.origin;
    window.dispatchEvent(new ErrorEvent("error", {
      message: "ReferenceError: Can't find variable: DarkReader",
      filename: `${origin}/sign-up`,
      error: new ReferenceError("Can't find variable: DarkReader"),
    }));
    expect(fetchMock).not.toHaveBeenCalled();

    window.dispatchEvent(new ErrorEvent("error", {
      message: "TypeError: boom",
      filename: `${origin}/assets/index-abc.js`,
      error: new TypeError("boom"),
    }));
    expect(fetchMock).toHaveBeenCalled();
  });
});
