import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, apiFetch, setCsrfToken } from "./client";

describe("apiFetch", () => {
  beforeEach(() => {
    setCsrfToken("CSRF123");
    vi.restoreAllMocks();
  });

  it("attaches X-CSRF-Token on POST", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await apiFetch("/api/auth/logout", { method: "POST" });
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("X-CSRF-Token")).toBe("CSRF123");
    expect(init.credentials).toBe("include");
  });

  it("does not attach CSRF on GET", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await apiFetch("/api/auth/me");
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.has("X-CSRF-Token")).toBe(false);
  });

  it("prefixes VITE_API_BASE_URL when set", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    await apiFetch("/api/auth/me");
    const url = spy.mock.calls[0]?.[0] as string;
    expect(url).toBe("https://api.example.com/api/auth/me");
    vi.unstubAllEnvs();
  });

  it("throws ApiError on non-ok with code/message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "INVALID_CREDENTIALS", message: "nope" } }), { status: 401 }),
    );
    await expect(apiFetch("/api/auth/login", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
  });
});
