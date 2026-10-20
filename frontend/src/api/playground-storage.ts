// Browser-only storage for the Playground: the current chat (per account, so
// another account on the same browser never sees it) and the generation
// settings. Nothing here is sent to the server. Every access is wrapped,
// since storage can be blocked or full; then the page just doesn't remember.

const CHAT_PREFIX = "ado:playground-chat:";
const SETTINGS_KEY = "ado:playground-settings";

// Keep a saved chat well under the ~5 MB localStorage limit.
const MAX_CHAT_BYTES = 1_500_000;
const MAX_MESSAGES = 200;

export type SavedChat<M> = { messages: M[]; systemPrompt: string };

export function loadChat<M>(userId: string): SavedChat<M> | null {
  try {
    const raw = localStorage.getItem(CHAT_PREFIX + userId);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedChat<M>>;
    if (!Array.isArray(v.messages)) return null;
    return { messages: v.messages, systemPrompt: typeof v.systemPrompt === "string" ? v.systemPrompt : "" };
  } catch {
    return null;
  }
}

// Saves the chat, dropping the oldest messages if it's too big to keep.
export function saveChat<M>(userId: string, chat: SavedChat<M>) {
  try {
    if (!chat.messages.length && !chat.systemPrompt) {
      localStorage.removeItem(CHAT_PREFIX + userId);
      return;
    }
    let messages = chat.messages.slice(-MAX_MESSAGES);
    let json = JSON.stringify({ messages, systemPrompt: chat.systemPrompt });
    while (json.length > MAX_CHAT_BYTES && messages.length > 1) {
      messages = messages.slice(Math.ceil(messages.length / 4));
      json = JSON.stringify({ messages, systemPrompt: chat.systemPrompt });
    }
    localStorage.setItem(CHAT_PREFIX + userId, json);
  } catch { /* full or blocked: the chat just isn't kept */ }
}

// Removes every saved chat on this browser (sign-out, account deletion).
export function clearSavedChats() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(CHAT_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

export type GenSettings = {
  temperature: number | null; // null: the model's default
  maxTokens: number | null;   // null: the model's default
  effort: string | null;      // null: the model's default
};

export const DEFAULT_SETTINGS: GenSettings = { temperature: null, maxTokens: null, effort: null };

export function loadSettings(): GenSettings {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<GenSettings>;
    return {
      temperature: typeof v.temperature === "number" ? v.temperature : null,
      maxTokens: typeof v.maxTokens === "number" ? v.maxTokens : null,
      effort: typeof v.effort === "string" ? v.effort : null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: GenSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}
