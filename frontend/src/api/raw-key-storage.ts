import type { KeyJustIssued } from "../types/api";

// localStorage persistence for the raw API key. The backend stores only the
// hash, so to keep the Playground filled across page reloads we cache the raw
// key in the browser, tied to the owning user id.

const STORAGE_KEY = "ado-raw-key-v1";

type Stored = KeyJustIssued & { userId: string };

export function saveRawKey(userId: string, k: KeyJustIssued) {
  try {
    const v: Stored = { ...k, userId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch { /* quota / disabled — ignore */ }
}

export function loadRawKey(userId: string): KeyJustIssued | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    if (v.userId !== userId || !v.key || !v.keyPrefix) return null;
    return { key: v.key, keyPrefix: v.keyPrefix, dailyLimit: v.dailyLimit ?? 0 };
  } catch { return null; }
}

export function clearRawKey() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
