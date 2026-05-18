import { useState, useRef, useEffect, useCallback } from "react";
import { Send, RotateCcw, ChevronDown } from "lucide-react";
import { useMe } from "../api/queries";
import { useRawKey } from "../api/queries";
import styles from "./Playground.module.scss";

type Role = "user" | "assistant" | "system";
type Msg = { role: Role; content: string; id: number };

const MODELS = [
  { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash",     tag: "Newest" },
  { id: "gemini-2.5-pro-preview-05-06",   label: "Gemini 2.5 Pro",       tag: "Most capable" },
  { id: "gemini-2.0-flash",               label: "Gemini 2.0 Flash",     tag: "Stable" },
  { id: "gemini-2.0-flash-lite",          label: "Gemini 2.0 Flash-Lite", tag: "" },
  { id: "gemini-1.5-pro",                 label: "Gemini 1.5 Pro",       tag: "Long context" },
  { id: "gemini-1.5-flash",               label: "Gemini 1.5 Flash",     tag: "" },
];

const PROXY_BASE = import.meta.env.VITE_PROXY_BASE_URL ?? "/api/v1";
if (import.meta.env.PROD && !import.meta.env.VITE_PROXY_BASE_URL) {
  console.warn("VITE_PROXY_BASE_URL is not set — Playground requests will fail");
}

async function streamCompletion(
  apiKey: string,
  model: string,
  messages: Pick<Msg, "role" | "content">[],
  onToken: (t: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
) {
  try {
    const resp = await fetch(`${PROXY_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!resp.ok) {
      let msg = `Error ${resp.status}`;
      try {
        const j = (await resp.json()) as { error?: { message?: string } };
        msg = j.error?.message ?? msg;
      } catch (_) { /* ignore parse errors */ }
      onError(msg);
      return;
    }

    const reader = resp.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";

    // eslint-disable-next-line no-constant-condition
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
        } catch (_) { /* ignore malformed SSE chunks */ }
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : "Network error");
  }
}

let msgIdCounter = 0;

export function Playground() {
  const { data: me } = useMe();
  const raw = useRawKey();

  const [apiKey, setApiKey]       = useState(() => raw?.key ?? "");
  const [model, setModel]         = useState(MODELS[0]!.id);
  const [systemPrompt, setSystem] = useState("");
  const [showSystem, setShowSys]  = useState(false);
  const [messages, setMessages]   = useState<Msg[]>([]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  // Pre-fill key when raw key becomes available (e.g., after dashboard visit)
  useEffect(() => {
    if (raw?.key && !apiKey) setApiKey(raw.key);
  }, [raw, apiKey]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !apiKey.startsWith("ado-")) return;
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

    await streamCompletion(
      apiKey,
      model,
      history,
      (tok) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: m.content + tok } : m,
          ),
        );
      },
      () => setStreaming(false),
      (msg) => {
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
        setStreaming(false);
      },
    );
  }, [input, streaming, apiKey, model, messages, systemPrompt]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function clearChat() {
    setMessages([]);
    setError(null);
  }

  const keyValid   = apiKey.startsWith("ado-") && apiKey.length > 6;
  const canSend    = keyValid && input.trim().length > 0 && !streaming;
  const empty      = messages.length === 0;

  return (
    <div className={styles.page}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.title}>playground</span>
          <span className={styles.subtitle}>
            {me ? `signed in as ${me.user.email}` : "not signed in"}
          </span>
        </div>
        <div className={styles.controls}>
          {/* Model selector */}
          <div className={styles.selectWrap}>
            <select
              className={styles.select}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}{m.tag ? ` — ${m.tag}` : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className={styles.selectCaret} />
          </div>

          {/* System prompt toggle */}
          <button
            className={`${styles.iconBtn}${showSystem ? ` ${styles.iconBtnActive}` : ""}`}
            onClick={() => setShowSys((v) => !v)}
            title="System prompt"
          >
            SYS
          </button>

          {/* Clear */}
          <button
            className={styles.iconBtn}
            onClick={clearChat}
            disabled={empty && !error}
            title="Clear chat"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Key banner if invalid */}
      {!keyValid && (
        <div className={styles.keyBanner}>
          <div className={styles.keyBannerInner}>
            <span className={styles.keyLabel}>Your ADO key</span>
            <input
              className={styles.keyInput}
              type="text"
              placeholder="ado-xxxxxxxxxxxxxxxx"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              spellCheck={false}
            />
            <span className={styles.keyHint}>
              {me
                ? "Key hidden after login session expires — rotate your key on the dashboard to reveal it."
                : "Sign in to get a free key, or paste yours here."}
            </span>
          </div>
        </div>
      )}

      {/* System prompt editor */}
      {showSystem && (
        <div className={styles.sysWrap}>
          <span className={styles.sysLabel}>System prompt</span>
          <textarea
            className={styles.sysArea}
            value={systemPrompt}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="You are a helpful assistant..."
            rows={3}
          />
        </div>
      )}

      {/* Messages */}
      <div className={styles.messages}>
        {empty && !error && (
          <div className={styles.emptyState}>
            <div className={styles.emptyGlyph}>_</div>
            <p className={styles.emptyText}>Type a message to start</p>
            <p className={styles.emptyModel}>
              Using <span>{MODELS.find((m) => m.id === model)?.label ?? model}</span>
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className={`${styles.msg} ${msg.role === "user" ? styles.msgUser : styles.msgAssistant}`}
          >
            <span className={styles.msgRole}>{msg.role}</span>
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
            <span className={styles.errorLabel}>error</span>
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={keyValid ? "Message… (Enter to send, Shift+Enter for newline)" : "Enter your API key above first"}
          disabled={!keyValid || streaming}
          rows={1}
        />
        <button
          className={styles.sendBtn}
          onClick={() => void send()}
          disabled={!canSend}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
