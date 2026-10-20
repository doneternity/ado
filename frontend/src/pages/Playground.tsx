import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Send, Square, RotateCcw, ChevronDown, Settings2, X, Search, Check, Copy, Pencil, RefreshCw, Brain } from "lucide-react";
import { Markdown, useCopy } from "../components/Markdown";
import { splitThink } from "../data/think";
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
  // assistant only: the model's streamed reasoning, when it sends any
  reasoning?: string;
  // when reasoning started arriving, and how long until the answer began
  thinkStart?: number;
  thinkMs?: number;
};

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

// Translate the backend's error code/status into a message that tells the user
// whether the problem is their key, our quota, or the upstream provider.
function friendlyError(status: number, code: string, rawMsg: string, model: string): string {
  switch (code) {
    case "NO_PROVIDER":
      return `No upstream provider could serve "${model}" right now. This is on the provider side, not your key. Try another model or try again shortly.`;
    case "MAINTENANCE":
      return "ADO is in maintenance mode right now. Please try again in a few minutes.";
    case "QUOTA_EXCEEDED":
      return "You've hit your daily request quota. It resets at UTC midnight.";
    case "RATE_LIMITED":
      return "You're sending requests too quickly. Wait a moment and try again.";
    case "BANNED":
      return "This account has been suspended.";
    case "NO_KEY":
      return "You don't have an active key right now. Get one on the dashboard, then come back.";
    case "UNAUTHORIZED":
      return "Your session has expired. Sign in again to keep chatting.";
    case "INVALID_CSRF":
      return "This page is out of date. Reload it and try again.";
  }
  if (status === 401) {
    return "Your session has expired. Sign in again to keep chatting.";
  }
  if (status === 404) {
    return `The model "${model}" isn't available. Pick another from the model list.`;
  }
  return rawMsg || `Request failed (HTTP ${status}).`;
}

async function streamCompletion(
  model: string,
  messages: Pick<Msg, "role" | "content">[],
  signal: AbortSignal,
  onDelta: (content: string, reasoning: string) => void,
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
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });

    if (!resp.ok) {
      let rawMsg = "";
      let code = "";
      try {
        const j = (await resp.json()) as { error?: { message?: string; code?: string } };
        rawMsg = j.error?.message ?? "";
        code = j.error?.code ?? "";
      } catch { /* ignore */ }
      onError(friendlyError(resp.status, code, rawMsg, model), resp.status);
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
          };
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
    onError(err instanceof Error ? err.message : "Network error");
  }
}

let msgIdCounter = 0;

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
  const [messages, setMessages]     = useState<Msg[]>([]);
  const [input, setInput]           = useState("");
  const [streaming, setStreaming]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);
  // Follow the reply as it streams, unless the reader has scrolled up.
  const stickRef  = useRef(true);

  // abort any in-flight stream on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the selected model valid as the live list loads/changes: the saved
  // choice if it's still served, else the first model that isn't down. Not
  // saved, so a model that's briefly missing is picked again once it's back.
  useEffect(() => {
    if (pickerModels.length && !pickerModels.find(m => m.id === model)) {
      setModelState((pickerModels.find(m => m.adoStatus !== "down") ?? pickerModels[0]!).id);
    }
  }, [pickerModels, model]);

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

  const canRun = !streaming && !noKey && pickerModels.some(m => m.id === model);

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
    const history: Pick<Msg, "role" | "content">[] = [
      ...(systemPrompt.trim() ? [{ role: "system" as Role, content: systemPrompt.trim() }] : []),
      ...base.map((m) => ({ role: m.role, content: m.role === "assistant" ? splitThink(m.content).answer : m.content })),
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    await streamCompletion(
      model, history, controller.signal,
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
  }, [canRun, model, systemPrompt, refetchKey]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !canRun) return;
    setInput("");
    void run([...messages, { role: "user", content: text, id: ++msgIdCounter }]);
  }, [input, canRun, messages, run]);

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
  const canSend     = canRun && input.trim().length > 0;
  const lastUserIdx = messages.reduce((acc, m, i) => (m.role === "user" ? i : acc), -1);
  const empty       = messages.length === 0;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.title}>playground</span>
          {me && <span className={styles.subtitle}>{me.user.email}</span>}
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
            className={styles.ctrlBtn}
            onClick={clearChat}
            disabled={empty && !error}
            title="Clear chat"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* ── Key banner ── */}
      {noKey ? (
        <div className={styles.keyBanner}>
          <span className={styles.keyLabel}>ADO Key</span>
          <span className={styles.keyHint}>
            You don&apos;t have an active key right now. <Link to="/dashboard" className={styles.keyLink}>Get one on the dashboard</Link>, then come back.
          </span>
        </div>
      ) : currentKey.data && (
        <div className={styles.keyBanner}>
          <span className={styles.keyLabel}>ADO Key</span>
          <code className={styles.keyPrefix}>{currentKey.data.keyPrefix}…</code>
          <span className={styles.keyHint}>Chats here use your current key and count toward its daily quota.</span>
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
                    <div className={styles.msgContent}>{msg.content}</div>
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
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={noKey ? "Get a key on the dashboard first" : "Message…"}
            disabled={noKey || streaming}
            rows={1}
          />
          <div className={styles.inputFooter}>
            <span className={styles.inputHint}>Enter to send · Shift+Enter for newline</span>
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
