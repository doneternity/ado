import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Send, Square, RotateCcw, ChevronDown, Settings2, X } from "lucide-react";
import { useMe, useCurrentKey, usePublicModels } from "../api/queries";
import { ApiError, getCsrfToken } from "../api/client";
import { MODELS } from "../data/models";
import type { ModelProvider } from "../data/models";
import styles from "./Playground.module.scss";

type Role = "user" | "assistant" | "system";
type Msg = { role: Role; content: string; id: number };

type PickerModel = { id: string; name: string; provider: ModelProvider; tag?: string };

const PROVIDER_LABEL: Record<ModelProvider, string> = {
  claude:   "Anthropic",
  gemini:   "Google",
  deepseek: "DeepSeek",
  openai:   "OpenAI",
  xai:      "xAI",
  zai:      "Z.ai",
  moonshot: "Moonshot AI",
  other:    "Other",
};

// Chats run as the signed-in user's own key through their session, so the
// browser never needs the raw key (the backend only keeps its hash).
const PLAYGROUND_URL = (import.meta.env.VITE_API_BASE_URL ?? "") + "/api/playground/chat/completions";

function inferProvider(id: string): ModelProvider {
  const key = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  if (/gemini|google|bard/i.test(key)) return "gemini";
  if (/claude|anthropic/i.test(key)) return "claude";
  if (/deepseek/i.test(key)) return "deepseek";
  if (/gpt|openai|^o\d/i.test(key)) return "openai";
  if (/grok|xai/i.test(key)) return "xai";
  if (/glm|zhipu/i.test(key)) return "zai";
  if (/kimi|moonshot/i.test(key)) return "moonshot";
  return "other";
}

function toPickerModels(ids: string[]): PickerModel[] {
  return ids.map(id => {
    const static_ = MODELS.find(m => m.id === id);
    if (static_) return { id, name: static_.name, provider: static_.provider, tag: static_.tag };
    return {
      id,
      name: id
        .replace(/^\[[^\]]+\]/, "")
        .replace(/^[^/]*\//, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim() || id,
      provider: inferProvider(id),
    };
  });
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
  onToken: (t: string) => void,
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
        if (!line.startsWith("data: ")) continue;
        const d = line.slice(6).trim();
        if (d === "[DONE]") { onDone(); return; }
        try {
          const chunk = JSON.parse(d) as {
            choices?: [{ delta?: { content?: string } }];
          };
          const tok = chunk.choices?.[0]?.delta?.content;
          if (tok) onToken(tok);
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

function ModelPicker({ value, onChange, models }: {
  value: string;
  onChange: (id: string) => void;
  models: PickerModel[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = models.find(m => m.id === value) ?? models[0];

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const grouped = models.reduce<Record<string, PickerModel[]>>((acc, m) => {
    const p = PROVIDER_LABEL[m.provider];
    (acc[p] ??= []).push(m);
    return acc;
  }, {});

  if (!current) return null;

  return (
    <div className={styles.pickerWrap} ref={ref}>
      <button
        className={styles.pickerBtn}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className={`${styles.pickerDot} ${styles[`dot_${current.provider}`]}`} />
        <span className={styles.pickerLabel}>{current.name}</span>
        {current.tag && <span className={styles.pickerTag}>{current.tag}</span>}
        <ChevronDown size={12} className={`${styles.pickerCaret}${open ? ` ${styles.pickerCaretOpen}` : ""}`} />
      </button>

      {open && (
        <div className={styles.pickerDropdown}>
          {Object.entries(grouped).map(([provider, ms]) => (
            <div key={provider} className={styles.pickerGroup}>
              <span className={styles.pickerGroupLabel}>{provider}</span>
              {ms.map(m => (
                <button
                  key={m.id}
                  className={`${styles.pickerOption}${m.id === value ? ` ${styles.pickerOptionActive}` : ""}`}
                  onClick={() => { onChange(m.id); setOpen(false); }}
                >
                  <span className={`${styles.pickerDot} ${styles[`dot_${m.provider}`]}`} />
                  <span>{m.name}</span>
                  {m.tag && <span className={styles.pickerOptionTag}>{m.tag}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATIC_MODELS: PickerModel[] = MODELS.map(m => ({
  id: m.id, name: m.name, provider: m.provider, tag: m.tag,
}));

export function Playground() {
  const { data: me } = useMe();
  // Only used to say whether there's a key to chat with; the chat itself
  // authenticates with the session (see PLAYGROUND_URL).
  const currentKey = useCurrentKey({ enabled: !!me });
  const noKey = currentKey.error instanceof ApiError && currentKey.error.status === 404;
  const refetchKey = currentKey.refetch;

  // The full model list comes from the public /models endpoint (no key needed),
  // so the picker always reflects the live provider — not the curated subset.
  const { data: liveIds } = usePublicModels();
  const pickerModels = useMemo<PickerModel[]>(
    () => (liveIds && liveIds.length ? toPickerModels(liveIds) : STATIC_MODELS),
    [liveIds],
  );

  const [model, setModel]           = useState(MODELS[0]!.id);
  const [systemPrompt, setSystem]   = useState("");
  const [showSystem, setShowSys]    = useState(false);
  const [messages, setMessages]     = useState<Msg[]>([]);
  const [input, setInput]           = useState("");
  const [streaming, setStreaming]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  // abort any in-flight stream on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the selected model valid as the live list loads/changes.
  useEffect(() => {
    if (pickerModels.length && !pickerModels.find(m => m.id === model)) {
      setModel(pickerModels[0]!.id);
    }
  }, [pickerModels, model]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || noKey) return;
    setError(null);

    const userMsg: Msg = { role: "user", content: text, id: ++msgIdCounter };
    const assistantMsg: Msg = { role: "assistant", content: "", id: ++msgIdCounter };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setStreaming(true);

    const history: Pick<Msg, "role" | "content">[] = [
      ...(systemPrompt.trim() ? [{ role: "system" as Role, content: systemPrompt.trim() }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as Role, content: text },
    ];

    const controller = new AbortController();
    abortRef.current = controller;

    await streamCompletion(
      model, history, controller.signal,
      (tok) => {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + tok } : m),
        );
      },
      () => setStreaming(false),
      (msg) => {
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
        setStreaming(false);
      },
    );
    if (abortRef.current === controller) abortRef.current = null;
    // The key may have been revoked or rotated meanwhile; refresh what we show.
    void refetchKey();
  }, [input, streaming, noKey, model, messages, systemPrompt, refetchKey]);

  // stop a running generation; the partial reply stays in the transcript
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  function clearChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setError(null);
  }

  const canSend     = !noKey && input.trim().length > 0 && !streaming;
  const empty       = messages.length === 0;
  const currentModel = pickerModels.find(m => m.id === model) ?? pickerModels[0];

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.title}>playground</span>
          {me && <span className={styles.subtitle}>{me.user.email}</span>}
        </div>
        <div className={styles.controls}>
          <ModelPicker value={model} onChange={setModel} models={pickerModels} />

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
      <div className={styles.messages}>
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
            <div className={styles.emptyHints}>
              <span>Enter to send</span>
              <span>Shift+Enter for newline</span>
              <span>SYS for system prompt</span>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className={`${styles.msg} ${msg.role === "user" ? styles.msgUser : styles.msgAssistant}`}
          >
            <div className={styles.msgMeta}>
              <span className={styles.msgRole}>{msg.role}</span>
            </div>
            <div className={styles.msgContent}>
              {msg.content || (
                streaming && i === messages.length - 1
                  ? <span className={styles.cursor}>▋</span>
                  : null
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className={styles.errorMsg}>
            <div className={styles.msgMeta}>
              <span className={`${styles.msgRole} ${styles.msgRoleError}`}>error</span>
            </div>
            <div className={styles.msgContent}>{error}</div>
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
