import type { ApiErrorBody } from "../types/api";

export class ApiError extends Error {
  status: number;
  code: string;
  data: Record<string, unknown>;

  constructor(status: number, code: string, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    let body: ApiErrorBody | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // not JSON
    }
    const code = body?.error?.code ?? "UNKNOWN";
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    const data: Record<string, unknown> = {};
    if (body?.error) {
      for (const [k, v] of Object.entries(body.error)) {
        if (k !== "code" && k !== "message") data[k] = v;
      }
    }
    return new ApiError(res.status, code, message, data);
  }
}

// Holder for the current CSRF token. Set by useMe / auth mutations after each /me read.
let currentCsrf: string | null = null;
export function setCsrfToken(t: string | null) {
  currentCsrf = t;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (currentCsrf) {
      headers.set("X-CSRF-Token", currentCsrf);
    }
  }

  const res = await fetch((import.meta.env.VITE_API_BASE_URL ?? "") + path, { ...init, credentials: "include", headers });

  if (!res.ok) {
    throw await ApiError.fromResponse(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
