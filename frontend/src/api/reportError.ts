// Sends website crashes to the backend's error log (Admin > Errors), so they
// don't go unnoticed until someone mentions them on Discord. Only the error
// message, its stack trace and the page path are sent: no user, no query
// string, no browser details.
import { ApiError } from "./client";
import { isStaleChunkError } from "../components/staleChunk";

export type ErrorKind = "render" | "error" | "promise";

// One broken page can throw the same error on every render; a few distinct
// reports per page load are plenty.
const MAX_PER_PAGE_LOAD = 5;
const sent = new Set<string>();

export function reportError(kind: ErrorKind, err: unknown): void {
  if (!import.meta.env.PROD) return;
  // API errors are already logged by the backend, and 4xx ones are expected.
  // Stale chunks after a deploy are handled by reloading.
  if (err instanceof ApiError || isStaleChunkError(err)) return;

  const e = err instanceof Error ? err : new Error(describe(err));
  const message = `${e.name}: ${e.message}`.slice(0, 300);
  const key = `${kind}:${message}`;
  if (sent.has(key) || sent.size >= MAX_PER_PAGE_LOAD) return;
  sent.add(key);

  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message, stack: (e.stack ?? "").slice(0, 4000), page: window.location.pathname }),
      credentials: "omit",
      keepalive: true, // still sent if the visitor navigates away
    }).catch(() => {});
  } catch {
    // Reporting must never cause a second error.
  }
}

// Catches errors that happen outside React rendering (event handlers, timers,
// promises nobody awaited). Rendering errors go through RouteError.
export function installErrorReporting(): void {
  window.addEventListener("error", (e) => {
    // Only our own scripts: errors from browser extensions aren't our bugs.
    if (!e.filename?.startsWith(window.location.origin)) return;
    reportError("error", e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => reportError("promise", e.reason));
}

function describe(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
