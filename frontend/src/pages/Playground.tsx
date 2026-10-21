import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Send, Square, RotateCcw, ChevronDown, Settings2, SlidersHorizontal, X, Search, Check, Copy, Pencil, RefreshCw, Brain, ImagePlus } from "lucide-react";
import { Markdown, useCopy } from "../components/Markdown";
import { splitThink } from "../data/think";
import { MAX_IMAGES, messageContent, prepareImage } from "../data/images";
import type { ContentPart } from "../data/images";
import { fmtDuration, localTime, quotaState } from "../data/quota";
import { loadChat, saveChat, loadSettings, saveSettings, DEFAULT_SETTINGS } from "../api/playground-storage";
import type { GenSettings } from "../api/playground-storage";
import { useMe, useCurrentKey, useLiveModels } from "../api/queries";
import { ApiError, getCsrfToken } from "../api/client";
import { PROVIDER_NAME } from "../data/catalog";
import { enrichAll } from "../data/model-meta";
import type { EnrichedModel } from "../data/model-meta";
import type { ModelProvider } from "../data/models";
import styles from "./Playground.module.scss";

type Role = "user" | "assistant" | "system";
type Msg = {
  role: Role;
  content: string;
  id: number;
  // user only: attached images (data URLs). Not kept in the saved chat;
  // imagesDropped counts the ones a reload left out.
  images?: string[];
  imagesDropped?: number;
  // assistant only: the model's streamed reasoning, when it sends any
  reasoning?: string;
  // when reasoning started arriving, and how long until the answer began
  thinkStart?: number;
  thinkMs?: number;
  // assistant only: tokens the request used, from the stream's usage chunk
  usage?: Usage;
};

type Usage = { prompt: number; completion: number };

function fmtThinkTime(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// The model's reasoning, open while it's being written and folded away once
// the answer starts. A click overrides that either way.
function Thinking({ text, live, ms }: { text: string; live: boolean; ms?: number }) {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;
  const label = live ? "Thinking…" : ms !== undefined ? `Thought for ${fmtThinkTime(ms)}` : "Thought process";
  return (
    <div className={styles.thinking}>
      <button
        type="button"
        className={`${styles.thinkingToggle}${live ? ` ${styles.thinkingLive}` : ""}`}
        onClick={() => setManual(!open)}
        aria-expanded={open}
      >
        <Brain size={12} />
        <span>{label}</span>
        <ChevronDown size={12} className={`${styles.thinkingCaret}${open ? ` ${styles.thinkingCaretOpen}` : ""}`} />
      </button>
      {open && <div className={styles.thinkingBody}>{text}</div>}
    </div>
  );
}

function ActionButton({ label, onClick, disabled, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={styles.msgAction} onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, copy] = useCopy();
  return (
    <ActionButton label={copied ? "Copied" : "Copy"} onClick={() => copy(text)} disabled={!text}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </ActionButton>
  );
}

// Editing a sent message: Enter resends (and drops everything after it),
// Shift+Enter adds a line, Esc cancels.
function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight leaves out the border, so add it back or a scrollbar shows.
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, 300)}px`;
  }, [text]);
  const canSave = text.trim().length > 0;
  return (
    <div className={styles.editBox}>
      <textarea
        ref={ref}
        autoFocus
        className={styles.editArea}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSave) onSave(text); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        aria-label="Edit message"
        rows={1}
      />
      <div className={styles.editActions}>
        <button type="button" className={styles.editCancel} onClick={onCancel}>Cancel</button>
        <button type="button" className={styles.editSave} onClick={() => onSave(text)} disabled={!canSave}>Send</button>
      </div>
    </div>
  );
}

// Chats run as the signed-in user's own key through their session, so the
// browser never needs the raw key (the backend only keeps its hash).
const PLAYGROUND_URL = (import.meta.env.VITE_API_BASE_URL ?? "") + "/api/playground/chat/completions";

// The last model picked here, so a reload keeps it.
const MODEL_STORAGE_KEY = "ado:playground-model";

function loadSavedModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveModel(id: string) {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, id);
  } catch { /* storage blocked: the choice just won't survive a reload */ }
}

const STATUS_LABEL = { degraded: "Degraded", down: "Down" } as const;

// Groups models by provider, in the order providers first appear.
function groupByProvider(models: EnrichedModel[]): [ModelProvider, EnrichedModel[]][] {
  const groups = new Map<ModelProvider, EnrichedModel[]>();
  for (const m of models) groups.set(m.provider, [...(groups.get(m.provider) ?? []), m]);
  return [...groups.entries()];
}

function sentence(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".");
}

// Translate the backend's error code/status into a message that tells the user
// whether the problem is their key, our quota, or the upstream provider.
// Anything not listed is the server's or provider's own message, which says
// what's wrong (bad JSON, a context that's too long, and so on).
function friendlyError(status: number, code: string, rawMsg: string, model: string, retryAfter: string | null): string {
  switch (code) {
    case "NO_PROVIDER":
      return `"${model}" isn't answering right now: every provider for it is down, overloaded or too slow. This isn't your key. Try again in a minute or pick another model.`;
    case "MODEL_NOT_FOUND":
      return `The model "${model}" isn't available anymore. Pick another from the model list.`;
    case "MAINTENANCE":
      return "ADO is down for maintenance. Try again in a few minutes.";
    case "QUOTA_EXCEEDED": {
      const now = new Date();
      const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
      return `You've used all of today's requests. More are available in ${fmtDuration(new Date(reset).getTime() - now.getTime())}, at ${localTime(reset)} your time.`;
    }
    case "RATE_LIMITED": {
      const secs = Number(retryAfter);
      return secs > 0
        ? `You're sending requests faster than your per-minute limit. Try again in ${fmtDuration(secs * 1000)}.`
        : "You're sending requests faster than your per-minute limit. Wait a moment and try again.";
    }
    case "BANNED":
      return "This account has been suspended. Ask in ADO's Discord server if you think this is a mistake.";
    case "NO_KEY":
      return "You don't have an active API key right now. Create one on the dashboard, then come back.";
    case "UNAUTHORIZED":
      return "You're signed out. Sign in again to keep chatting.";
    case "INVALID_CSRF":
      return "This page is out of date. Reload it and try again.";
  }
  if (rawMsg) return sentence(rawMsg);
  if (status === 413) return "This message is too large to send. Remove an image or shorten it.";
  if (status >= 500) return `ADO couldn't be reached (HTTP ${status}). Try again in a minute.`;
  return `Request failed (HTTP ${status}).`;
}

// Model plus the optional generation settings; unset ones are left out so
// the provider uses its own defaults.
type ChatParams = { model: string; temperature?: number; max_tokens?: number; reasoning_effort?: string };

async function streamCompletion(
  params: ChatParams,
  messages: { role: Role; content: string | ContentPart[] }[],
  signal: AbortSignal,
  onDelta: (content: string, reasoning: string) => void,
  onUsage: (usage: Usage) => void,
  onDone: () => void,
  onError: (msg: string, status?: number) => void,
) {
  try {
    const resp = await fetch(PLAYGROUND_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": getCsrfToken() ?? "",
      },
      // include_usage adds a last chunk with the token counts.
      body: JSON.stringify({ ...params, messages, stream: true, stream_options: { include_usage: true } }),
      signal,
    });

    if (!resp.ok) {
      let rawMsg = "";
      let code = "";
      try {
        // ADO's errors and most providers' use { error: { message } }; some
        // providers put the message at the top level instead.
        const j = (await resp.json()) as { error?: { message?: string; code?: string } | string; message?: string; detail?: string };
        if (typeof j.error === "string") rawMsg = j.error;
        else {
          rawMsg = j.error?.message ?? j.message ?? (typeof j.detail === "string" ? j.detail : "");
          code = j.error?.code ?? "";
        }
      } catch { /* not JSON, e.g. a gateway error page */ }
      onError(friendlyError(resp.status, code, rawMsg, params.model, resp.headers.get("Retry-After")), resp.status);
      return;
    }

    const reader = resp.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (d === "[DONE]") { onDone(); return; }
        try {
          // Thinking models stream their reasoning separately from the answer:
          // DeepSeek, Z.ai and Moonshot as reasoning_content, others as reasoning.
          const chunk = JSON.parse(d) as {
            choices?: [{ delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }];
            error?: { message?: string };
            usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
          };
          if (chunk.usage && typeof chunk.usage.completion_tokens === "number") {
            onUsage({ prompt: chunk.usage.prompt_tokens ?? 0, completion: chunk.usage.completion_tokens });
          }
          // The stream broke partway (the provider stalled or dropped): ADO
          // ends it with an error event rather than letting it stop silently.
          if (chunk.error) {
            onError(chunk.error.message ? sentence(chunk.error.message) : "The reply was cut off partway. Try again.");
            return;
          }
          const delta = chunk.choices?.[0]?.delta;
          const content = delta?.content ?? "";
          const reasoning = delta?.reasoning_content ?? (typeof delta?.reasoning === "string" ? delta.reasoning : "");
          if (content || reasoning) onDelta(content, reasoning);
        } catch { /* ignore */ }
      }
    }
    onDone();
  } catch (err) {
    // an aborted stream (stop / navigation) isn't an error
    if (err instanceof DOMException && err.name === "AbortError") return;
    onError("Couldn't reach ADO. Check your connection and try again.");
  }
}

let msgIdCounter = 0;

function isDefault(s: GenSettings) {
  return s.temperature === null && s.maxTokens === null && s.effort === null;
}

// Generation settings. Anything left on Default isn't sent, so the provider's
// own default applies. Reasoning effort only shows for models that list levels.
function SettingsPanel({ value, onChange, onClose, effortLevels, effortDefault }: {
  value: GenSettings;
  onChange: (s: GenSettings) => void;
  onClose: () => void;
  effortLevels?: string[];
  effortDefault?: string;
}) {
  const t = value.temperature;
  return (
    <div className={styles.sysPanel}>
      <div className={styles.sysPanelHeader}>
        <span className={styles.sysLabel}>Settings</span>
        <button className={styles.sysClose} onClick={onClose} aria-label="Close settings">
          <X size={12} />
        </button>
      </div>
      <div className={styles.settingsGrid}>
        <div className={styles.setting}>
          <label className={styles.settingName} htmlFor="pg-temperature">
            Temperature
            <span className={styles.settingValue}>{t === null ? "Default" : t.toFixed(1)}</span>
          </label>
          <input
            id="pg-temperature"
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={t ?? 1}
            onChange={e => onChange({ ...value, temperature: Number(e.target.value) })}
            className={styles.settingRange}
          />
          <span className={styles.settingHint}>Lower is more focused, higher is more varied.</span>
        </div>

        <div className={styles.setting}>
          <label className={styles.settingName} htmlFor="pg-max-tokens">Max tokens</label>
          <input
            id="pg-max-tokens"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            placeholder="Default"
            value={value.maxTokens ?? ""}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              onChange({ ...value, maxTokens: Number.isFinite(n) && n > 0 ? n : null });
            }}
            className={styles.settingInput}
          />
          <span className={styles.settingHint}>The longest reply allowed. Empty uses the model&apos;s default.</span>
        </div>

        {effortLevels && (
          <div className={styles.setting} role="group" aria-labelledby="pg-effort">
            <span className={styles.settingName} id="pg-effort">Reasoning effort</span>
            <div className={styles.segmented}>
              {[null, ...effortLevels].map(level => (
                <button
                  type="button"
                  key={level ?? "default"}
                  aria-pressed={value.effort === level}
                  className={`${styles.segment}${value.effort === level ? ` ${styles.segmentOn}` : ""}`}
                  onClick={() => onChange({ ...value, effort: level })}
                >
                  {level ?? `Default${effortDefault ? ` (${effortDefault})` : ""}`}
                </button>
              ))}
            </div>
            <span className={styles.settingHint}>How much the model thinks before it answers.</span>
          </div>
        )}
      </div>
      <button type="button" className={styles.settingsReset} onClick={() => onChange(DEFAULT_SETTINGS)} disabled={isDefault(value)}>
        Reset to defaults
      </button>
    </div>
  );
}

// A searchable model menu: type to filter by name, ID or provider, arrow keys
// to move, Enter to pick, Esc to close. Each row shows the model ID, context
// size and live status, so you can tell models apart without the Models page.
function ModelPicker({ value, onChange, models, loading }: {
  value: string;
  onChange: (id: string) => void;
  models: EnrichedModel[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = models.find(m => m.id === value);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? models.filter(m => [m.name, m.id, PROVIDER_NAME[m.provider]].some(s => s.toLowerCase().includes(q)))
      : models;
    return groupByProvider(matches);
  }, [models, query]);
  // Display order, which arrow keys follow.
  const ordered = useMemo(() => groups.flatMap(([, ms]) => ms), [groups]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function openMenu() {
    setQuery("");
    const all = groupByProvider(models).flatMap(([, ms]) => ms);
    setActive(Math.max(0, all.findIndex(m => m.id === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    btnRef.current?.focus();
  }

  function choose(m: EnrichedModel) {
    onChange(m.id);
    close();
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(a => Math.min(a + 1, ordered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = ordered[active];
      if (m) choose(m);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const listId = "playground-model-list";

  return (
    <div className={styles.pickerWrap} ref={wrapRef}>
      <button
        ref={btnRef}
        className={styles.pickerBtn}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={e => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); openMenu(); } }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current ? `Model: ${current.name}` : "Choose a model"}
        disabled={!models.length}
      >
        {current ? (
          <>
            <span className={`${styles.pickerDot} ${styles[`dot_${current.provider}`]}`} />
            <span className={styles.pickerLabel}>{current.name}</span>
            {current.adoStatus !== "available" && (
              <span className={`${styles.pickerStatus} ${styles[`pickerStatus_${current.adoStatus}`]}`}>
                {STATUS_LABEL[current.adoStatus]}
              </span>
            )}
          </>
        ) : (
          <span className={styles.pickerLabel}>{loading ? "Loading models…" : "No models available"}</span>
        )}
        <ChevronDown size={12} className={`${styles.pickerCaret}${open ? ` ${styles.pickerCaretOpen}` : ""}`} />
      </button>

      {open && (
        <div className={styles.pickerDropdown}>
          <div className={styles.pickerSearch}>
            <Search size={13} />
            <input
              autoFocus
              value={query}
              onChange={e => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onSearchKey}
              placeholder={`Search ${models.length} model${models.length === 1 ? "" : "s"}`}
              aria-label="Search models"
              aria-controls={listId}
              aria-activedescendant={ordered[active] ? `${listId}-${active}` : undefined}
              role="combobox"
              aria-expanded
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className={styles.pickerList} id={listId} role="listbox" aria-label="Models" ref={listRef}>
            {ordered.length === 0 && <p className={styles.pickerEmpty}>No models match &ldquo;{query.trim()}&rdquo;.</p>}
            {groups.map(([provider, ms]) => (
              <div key={provider} className={styles.pickerGroup} role="group" aria-label={PROVIDER_NAME[provider]}>
                <span className={styles.pickerGroupLabel}>
                  {PROVIDER_NAME[provider]}
                  <span className={styles.pickerGroupCount}>{ms.length}</span>
                </span>
                {ms.map(m => {
                  const i = ordered.indexOf(m);
                  const selected = m.id === value;
                  return (
                    <div
                      key={m.id}
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={selected}
                      title={m.description || undefined}
                      className={[
                        styles.pickerOption,
                        i === active ? styles.pickerOptionFocus : "",
                        selected ? styles.pickerOptionActive : "",
                      ].filter(Boolean).join(" ")}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => choose(m)}
                    >
                      <span className={`${styles.pickerDot} ${styles[`dot_${m.provider}`]}`} />
                      <span className={styles.pickerOptionText}>
                        <span className={styles.pickerOptionName}>
                          {m.name}
                          {m.tag && <span className={styles.pickerOptionTag}>{m.tag}</span>}
                        </span>
                        <span className={styles.pickerOptionMeta}>
                          {m.id}{m.context && ` · ${m.context}`}
                        </span>
                      </span>
                      {m.adoStatus !== "available" && (
                        <span className={`${styles.pickerStatus} ${styles[`pickerStatus_${m.adoStatus}`]}`}>
                          {STATUS_LABEL[m.adoStatus]}
                        </span>
                      )}
                      {selected && <Check size={13} className={styles.pickerCheck} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Playground() {
  const { data: me } = useMe();
  // Only used to say whether there's a key to chat with; the chat itself
  // authenticates with the session (see PLAYGROUND_URL).
  const currentKey = useCurrentKey({ enabled: !!me });
  const noKey = currentKey.error instanceof ApiError && currentKey.error.status === 404;
  const refetchKey = currentKey.refetch;

  // The model list comes from the public /models endpoint (no key needed),
  // enriched the same way as the Models page. Only models ADO actually serves
  // are offered, never the curated catalogue.
  const { data: live, isLoading: modelsLoading } = useLiveModels();
  const pickerModels = useMemo(() => enrichAll(live ?? []), [live]);

  const [model, setModelState]      = useState(loadSavedModel);
  const setModel = useCallback((id: string) => { setModelState(id); saveModel(id); }, []);
  const [systemPrompt, setSystem]   = useState("");
  const [showSystem, setShowSys]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettingsState] = useState<GenSettings>(loadSettings);
  const setSettings = useCallback((s: GenSettings) => { setSettingsState(s); saveSettings(s); }, []);
  const [messages, setMessages]     = useState<Msg[]>([]);
  const [input, setInput]           = useState("");
  const [streaming, setStreaming]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);
  // Follow the reply as it streams, unless the reader has scrolled up.
  const stickRef  = useRef(true);

  // abort any in-flight stream on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // Restore this account's saved chat once we know who's signed in, then keep
  // it saved in this browser (shortly after each change, so a streaming reply
  // is kept as far as it got if the page is closed).
  const userId = me?.user.id;
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  useEffect(() => {
    if (!userId || restoredFor === userId) return;
    const saved = loadChat<Msg>(userId);
    if (saved) {
      setMessages(saved.messages);
      setSystem(saved.systemPrompt);
      if (saved.systemPrompt) setShowSys(true);
      msgIdCounter = Math.max(msgIdCounter, ...saved.messages.map(m => m.id));
    }
    setRestoredFor(userId);
  }, [userId, restoredFor]);
  useEffect(() => {
    if (!userId || restoredFor !== userId) return;
    // Images aren't kept: a few photos would fill the browser's storage.
    const kept = messages.map(m => (m.images?.length ? { ...m, images: undefined, imagesDropped: m.images.length } : m));
    const t = setTimeout(() => saveChat(userId, { messages: kept, systemPrompt }), 400);
    return () => clearTimeout(t);
  }, [userId, restoredFor, messages, systemPrompt]);

  // A link like /playground?model=glm-5.3 (from a Models page card) picks
  // that model once the list has loaded, then tidies the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const wantedModel = searchParams.get("model");
  useEffect(() => {
    if (!wantedModel || !pickerModels.length) return;
    if (pickerModels.some(m => m.id === wantedModel)) setModel(wantedModel);
    setSearchParams(p => { p.delete("model"); return p; }, { replace: true });
  }, [wantedModel, pickerModels, setModel, setSearchParams]);

  // Keep the selected model valid as the live list loads/changes: the saved
  // choice if it's still served, else the first model that isn't down. Not
  // saved, so a model that's briefly missing is picked again once it's back.
  useEffect(() => {
    if (wantedModel) return; // a linked model is about to be picked
    if (pickerModels.length && !pickerModels.find(m => m.id === model)) {
      setModelState((pickerModels.find(m => m.adoStatus !== "down") ?? pickerModels[0]!).id);
    }
  }, [pickerModels, model, wantedModel]);

  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, error]);

  function onMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const quota = currentKey.data ? quotaState(currentKey.data.used, currentKey.data.dailyLimit) : null;
  const canRun = !streaming && !noKey && !quota?.exhausted && pickerModels.some(m => m.id === model);
  // Images only go to models that take them.
  const takesImages = !!pickerModels.find(m => m.id === model)?.capabilities.includes("Vision");
  const imagesBlocked = attachments.length > 0 && !takesImages;

  // Streams a new reply after `base`, which ends with the user's message.
  // send, regenerate and edit all come through here.
  const run = useCallback(async (base: Msg[]) => {
    if (!canRun) return;
    setError(null);
    setEditingId(null);
    stickRef.current = true;

    const assistantMsg: Msg = { role: "assistant", content: "", reasoning: "", id: ++msgIdCounter };
    setMessages([...base, assistantMsg]);
    setStreaming(true);

    // Earlier replies go back without their reasoning: it isn't part of the
    // conversation, and some providers reject it in the input.
    const history: { role: Role; content: string | ContentPart[] }[] = [
      ...(systemPrompt.trim() ? [{ role: "system" as Role, content: systemPrompt.trim() }] : []),
      ...base.map((m) => ({
        role: m.role,
        content: m.role === "assistant" ? splitThink(m.content).answer : messageContent(m.content, m.images),
      })),
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    const params: ChatParams = { model };
    if (settings.temperature !== null) params.temperature = settings.temperature;
    if (settings.maxTokens !== null) params.max_tokens = settings.maxTokens;
    const levels = pickerModels.find(m => m.id === model)?.effortLevels;
    if (settings.effort && levels?.includes(settings.effort)) params.reasoning_effort = settings.effort;

    await streamCompletion(
      params, history, controller.signal,
      (content, reasoning) => {
        const now = Date.now();
        setMessages((prev) => prev.map((m) => {
          if (m.id !== assistantMsg.id) return m;
          const next = { ...m, content: m.content + content, reasoning: (m.reasoning ?? "") + reasoning };
          if (reasoning && next.thinkStart === undefined) next.thinkStart = now;
          if (content && next.thinkStart !== undefined && next.thinkMs === undefined) next.thinkMs = now - next.thinkStart;
          return next;
        }));
      },
      (usage) => setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, usage } : m))),
      () => setStreaming(false),
      (msg) => {
        setError(msg);
        // Keep a reply that had started; drop the empty placeholder.
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id || m.content || m.reasoning));
        setStreaming(false);
      },
    );
    if (abortRef.current === controller) abortRef.current = null;
    // The key may have been revoked or rotated meanwhile; refresh what we show.
    void refetchKey();
  }, [canRun, model, settings, pickerModels, systemPrompt, refetchKey]);

  const send = useCallback(() => {
    const text = input.trim();
    if ((!text && !attachments.length) || !canRun || imagesBlocked) return;
    setInput("");
    setAttachments([]);
    setAttachError(null);
    const msg: Msg = { role: "user", content: text, id: ++msgIdCounter };
    if (attachments.length) msg.images = attachments;
    void run([...messages, msg]);
  }, [input, attachments, imagesBlocked, canRun, messages, run]);

  // Adds images from the file picker or a paste, up to MAX_IMAGES.
  async function addImages(files: File[]) {
    const images = files.filter(f => f.type.startsWith("image/"));
    if (!images.length) return;
    setAttachError(null);
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) {
      setAttachError(`You can attach up to ${MAX_IMAGES} images.`);
      return;
    }
    const added: string[] = [];
    for (const f of images.slice(0, room)) {
      try {
        added.push(await prepareImage(f));
      } catch (e) {
        setAttachError(e instanceof Error ? e.message : "That image couldn't be read.");
      }
    }
    if (images.length > room) setAttachError(`You can attach up to ${MAX_IMAGES} images.`);
    setAttachments(prev => [...prev, ...added].slice(0, MAX_IMAGES));
  }

  // A new reply to the last user message, replacing the one after it (or
  // retrying after an error, when there's no reply yet).
  const regenerate = useCallback(() => {
    let last = -1;
    messages.forEach((m, i) => { if (m.role === "user") last = i; });
    if (last >= 0) void run(messages.slice(0, last + 1));
  }, [messages, run]);

  // Resend an earlier message with new text. Everything after it is dropped,
  // since the conversation branches from there.
  const resendEdited = useCallback((id: number, text: string) => {
    const idx = messages.findIndex(m => m.id === id);
    const trimmed = text.trim();
    if (idx < 0 || !trimmed) return;
    void run([...messages.slice(0, idx), { ...messages[idx]!, content: trimmed }]);
  }, [messages, run]);

  // stop a running generation; the partial reply stays in the transcript
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function clearChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setError(null);
    setEditingId(null);
  }

  const currentModel = pickerModels.find(m => m.id === model);
  const canSend     = canRun && !imagesBlocked && (input.trim().length > 0 || attachments.length > 0);
  const lastUserIdx = messages.reduce((acc, m, i) => (m.role === "user" ? i : acc), -1);
  const empty       = messages.length === 0;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.title}>playground</span>
          {quota && !quota.exhausted && (
            <span className={styles.subtitle} title="Chats here count toward your key's daily quota">
              {quota.used} / {quota.limit} today
            </span>
          )}
        </div>
        <div className={styles.controls}>
          <ModelPicker value={model} onChange={setModel} models={pickerModels} loading={modelsLoading} />

          <button
            className={`${styles.ctrlBtn}${showSystem ? ` ${styles.ctrlBtnActive}` : ""}`}
            onClick={() => setShowSys(v => !v)}
            title="System prompt"
          >
            <Settings2 size={13} />
            <span>System</span>
          </button>

          <button
            className={`${styles.ctrlBtn}${showSettings ? ` ${styles.ctrlBtnActive}` : ""}`}
            onClick={() => setShowSettings(v => !v)}
            title="Settings"
            aria-label={isDefault(settings) ? "Settings" : "Settings (changed)"}
            aria-expanded={showSettings}
          >
            <SlidersHorizontal size={13} />
            <span>Settings</span>
            {!isDefault(settings) && <span className={styles.ctrlDot} aria-hidden="true" />}
          </button>

          <button
            className={styles.ctrlBtn}
            onClick={clearChat}
            disabled={empty && !error}
            title="Clear chat"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* ── Key banner: only when there's no key, or today's quota is used up ── */}
      {noKey ? (
        <div className={styles.keyBanner}>
          <span className={styles.keyLabel}>ADO Key</span>
          <span className={styles.keyHint}>
            You don&apos;t have an active key right now. <Link to="/dashboard" className={styles.keyLink}>Get one on the dashboard</Link>, then come back.
          </span>
        </div>
      ) : currentKey.data && quota?.exhausted && (
        <div className={`${styles.keyBanner} ${styles.keyBannerLimit}`} role="status">
          <span className={styles.keyLabel}>Daily limit reached</span>
          <span className={styles.keyHintStrong}>
            You&apos;ve used all {quota.limit} requests for today. More are available in{" "}
            {fmtDuration(new Date(currentKey.data.resetsAt).getTime() - Date.now())}, at {localTime(currentKey.data.resetsAt)} your time.
          </span>
        </div>
      )}

      {/* ── System prompt ── */}
      {showSystem && (
        <div className={styles.sysPanel}>
          <div className={styles.sysPanelHeader}>
            <span className={styles.sysLabel}>System prompt</span>
            <button className={styles.sysClose} onClick={() => setShowSys(false)}>
              <X size={12} />
            </button>
          </div>
          <textarea
            className={styles.sysArea}
            value={systemPrompt}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="You are a helpful assistant…"
            rows={3}
          />
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          value={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
          effortLevels={currentModel?.effortLevels}
          effortDefault={currentModel?.effortDefault}
        />
      )}

      {/* ── Messages ── */}
      <div className={styles.messages} onScroll={onMessagesScroll}>
        {empty && !error && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Ask anything.</p>
            <p className={styles.emptyModel}>
              {currentModel && (
                <>
                  <span className={`${styles.provDot} ${styles[`dot_${currentModel.provider}`]}`} />
                  {currentModel.name}
                </>
              )}
            </p>
            {currentModel?.description && <p className={styles.emptyDesc}>{currentModel.description}</p>}
            <div className={styles.emptyHints}>
              <span>Enter to send</span>
              <span>Shift+Enter for newline</span>
              <span>SYS for system prompt</span>
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const live = streaming && isLast;

          if (msg.role === "user") {
            const editing = editingId === msg.id;
            return (
              <div key={msg.id} className={`${styles.msg} ${styles.msgUser}`}>
                <div className={styles.msgMeta}>
                  <span className={styles.msgRole}>user</span>
                </div>
                {editing ? (
                  <EditBox
                    initial={msg.content}
                    onSave={(text) => resendEdited(msg.id, text)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    {msg.images && msg.images.length > 0 && (
                      <div className={styles.msgImages}>
                        {msg.images.map((src, k) => (
                          <img key={k} src={src} alt={`Attached image ${k + 1}`} className={styles.msgImage} />
                        ))}
                      </div>
                    )}
                    {msg.content && <div className={styles.msgContent}>{msg.content}</div>}
                    {!!msg.imagesDropped && (
                      <span className={styles.msgImagesNote}>
                        {msg.imagesDropped === 1 ? "1 image" : `${msg.imagesDropped} images`} sent (images aren&apos;t kept after a reload)
                      </span>
                    )}
                    <div className={styles.msgActions}>
                      <CopyButton text={msg.content} />
                      <ActionButton label="Edit and resend" onClick={() => setEditingId(msg.id)} disabled={!canRun}>
                        <Pencil size={13} />
                      </ActionButton>
                    </div>
                  </>
                )}
              </div>
            );
          }

          const inline = splitThink(msg.content);
          const reasoning = (msg.reasoning ?? "") + (msg.reasoning && inline.reasoning ? "\n\n" : "") + inline.reasoning;
          const answer = inline.answer;
          return (
            <div key={msg.id} className={`${styles.msg} ${styles.msgAssistant}`}>
              <div className={styles.msgMeta}>
                <span className={styles.msgRole}>assistant</span>
              </div>
              {reasoning && <Thinking text={reasoning} live={live && !answer} ms={msg.thinkMs} />}
              <div className={styles.msgContent}>
                {answer
                  ? <Markdown text={answer} />
                  : live && !reasoning ? <span className={styles.cursor}>▋</span> : null}
              </div>
              {!live && (
                <div className={styles.msgActions}>
                  <CopyButton text={answer} />
                  {i > lastUserIdx && (
                    <ActionButton label="Regenerate" onClick={regenerate} disabled={!canRun}>
                      <RefreshCw size={13} />
                    </ActionButton>
                  )}
                  {msg.usage && (
                    <span
                      className={styles.msgTokens}
                      title={`${msg.usage.prompt.toLocaleString()} tokens in (the conversation so far), ${msg.usage.completion.toLocaleString()} out (this reply, thinking included)`}
                    >
                      {msg.usage.completion.toLocaleString()} tokens
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {error && (
          <div className={styles.errorMsg}>
            <div className={styles.msgMeta}>
              <span className={`${styles.msgRole} ${styles.msgRoleError}`}>error</span>
            </div>
            <div className={styles.msgContent}>{error}</div>
            {lastUserIdx >= 0 && (
              <div className={styles.msgActions}>
                <button type="button" className={styles.retryBtn} onClick={regenerate} disabled={!canRun}>
                  <RefreshCw size={12} /> Try again
                </button>
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className={styles.inputArea}>
        <div className={styles.inputWrap}>
          {attachments.length > 0 && (
            <div className={styles.attachRow}>
              {attachments.map((src, k) => (
                <div key={k} className={styles.attachThumb}>
                  <img src={src} alt={`Image ${k + 1} to send`} />
                  <button
                    type="button"
                    className={styles.attachRemove}
                    onClick={() => setAttachments(prev => prev.filter((_, j) => j !== k))}
                    aria-label={`Remove image ${k + 1}`}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {(attachError || imagesBlocked) && (
            <p className={styles.attachError} role="status">
              {imagesBlocked
                ? `${currentModel?.name ?? "This model"} doesn't take images. Pick a model that does, or remove them.`
                : attachError}
            </p>
          )}
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.some(f => f.type.startsWith("image/")) && takesImages) {
                e.preventDefault();
                void addImages(files);
              }
            }}
            placeholder={noKey ? "Get a key on the dashboard first" : quota?.exhausted ? "Daily limit reached" : "Message…"}
            disabled={noKey || streaming || !!quota?.exhausted}
            rows={1}
          />
          <div className={styles.inputFooter}>
            <div className={styles.inputFooterLeft}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void addImages(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className={styles.attachBtn}
                onClick={() => fileRef.current?.click()}
                disabled={!takesImages || noKey || streaming || !!quota?.exhausted || attachments.length >= MAX_IMAGES}
                title={takesImages ? "Attach images (or paste them)" : `${currentModel?.name ?? "This model"} doesn't take images`}
                aria-label="Attach images"
              >
                <ImagePlus size={15} />
              </button>
              <span className={styles.inputHint}>Enter to send · Shift+Enter for newline</span>
            </div>
            {streaming ? (
              <button
                className={styles.sendBtn}
                onClick={stop}
                aria-label="Stop generating"
              >
                <Square size={14} />
                Stop
              </button>
            ) : (
              <button
                className={styles.sendBtn}
                onClick={() => void send()}
                disabled={!canSend}
                aria-label="Send"
              >
                <Send size={14} />
                Send
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
