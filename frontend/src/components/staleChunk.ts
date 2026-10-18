// Detecting and recovering from "stale chunk" errors: after a deploy, a tab
// running the old build asks for code-split chunks that no longer exist.

const RELOADED_AT = "ado:stale-reload-at";
const LOOP_GUARD_MS = 60_000;

export function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically/i.test(msg);
}

// Reloads the page once. If we already reloaded in the last minute the new
// build must be broken too, so we stop instead of looping.
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
    if (Date.now() - last < LOOP_GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    // Storage blocked: still reload; worst case the visitor sees the error page.
  }
  window.location.reload();
  return true;
}
