import { useState, useRef, useEffect, useCallback } from "react";
import { Send, RotateCcw, ChevronDown, Settings2, X } from "lucide-react";
import { useMe } from "../api/queries";
import { useRawKey } from "../api/queries";
import styles from "./Playground.module.scss";

type Role = "user" | "assistant" | "system";
type Msg = { role: Role; content: string; id: number };

interface ModelDef {
  id: string;
  label: string;
  provider: "anthropic" | "google" | "deepseek" | "other";
  tag?: string;
}

const MODELS: ModelDef[] = [
  { id: "[kmo]claude-opus-4.7",          label: "Claude Opus 4.7",          provider: "anthropic", tag: "Newest" },
  { id: "[kmo]claude-opus-4.7-thinking", label: "Claude Opus 4.7 Thinking", provider: "anthropic" },
  { id: "[kmo]claude-opus-4.6",          label: "Claude Opus 4.6",          provider: "anthropic" },
  { id: "[kmo]claude-opus-4.5",          label: "Claude Opus 4.5",          provider: "anthropic" },
  { id: "[GG]gemini-2.5-pro",            label: "Gemini 2.5 Pro",           provider: "google",    tag: "Most capable" },
  { id: "[GG]gemini-3-flash-preview",    label: "Gemini 3 Flash",           provider: "google",    tag: "Preview" },
  { id: "[GG]gemini-3.1-pro-preview",    label: "Gemini 3.1 Pro",           provider: "google" },
  { id: "[momo神秘V4]DeepSeek-V4-Pro",  label: "DeepSeek V4 Pro",          provider: "deepseek",  tag: "Strongest" },
  { id: "[momo]DeepSeek-V4-Flash",       label: "DeepSeek V4 Flash",        provider: "deepseek" },
  { id: "[beagle]deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2",      provider: "deepseek" },
  { id: "[momo]Kimi-K2.6",               label: "Kimi K2.6",                provider: "other" },
  { id: "[Aie]Mimo-V2.5-Pro",            label: "Mimo V2.5 Pro",            provider: "other" },
];

const PROVIDER_LABEL: Record<ModelDef["provider"], string> = {
  anthropic: "Anthropic",
  google:    "Google",
  deepseek:  "DeepSeek",
  other:     "Other",
};

const PROXY_BASE = import.meta.env.VITE_PROXY_BASE_URL ?? "https://ado-aii.vercel.app/v1";
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
      } catch (_) { /* ignore */ }
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
        } catch (_) { /* ignore */ }
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : "Network error");
  }
}

let msgIdCounter = 0;

function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find(m => m.id === value) ?? MODELS[0]!;

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const grouped = MODELS.reduce<Record<string, ModelDef[]>>((acc, m) => {
    const p = PROVIDER_LABEL[m.provider];
    (acc[p] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className={styles.pickerWrap} ref={ref}>
      <button
        className={styles.pickerBtn}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className={`${styles.pickerDot} ${styles[`dot_${current.provider}`]}`} />
        <span className={styles.pickerLabel}>{current.label}</span>
        {current.tag && <span className={styles.pickerTag}>{current.tag}</span>}
        <ChevronDown size={12} className={`${styles.pickerCaret}${open ? ` ${styles.pickerCaretOpen}` : ""}`} />
      </button>

      {open && (
        <div className={styles.pickerDropdown}>
          {Object.entries(grouped).map(([provider, models]) => (
            <div key={provider} className={styles.pickerGroup}>
              <span className={styles.pickerGroupLabel}>{provider}</span>
              {models.map(m => (
                <button
                  key={m.id}
                  className={`${styles.pickerOption}${m.id === value ? ` ${styles.pickerOptionActive}` : ""}`}
                  onClick={() => { onChange(m.id); setOpen(false); }}
                >
                  <span className={`${styles.pickerDot} ${styles[`dot_${m.provider}`]}`} />
                  <span>{m.label}</span>
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

  useEffect(() => {
    if (raw?.key && !apiKey) setApiKey(raw.key);
  }, [raw, apiKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

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
      apiKey, model, history,
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
  }, [input, streaming, apiKey, model, messages, systemPrompt]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  function clearChat() { setMessages([]); setError(null); }

  const keyValid = apiKey.startsWith("ado-") && apiKey.length > 6;
  const canSend  = keyValid && input.trim().length > 0 && !streaming;
  const empty    = messages.length === 0;
  const currentModel = MODELS.find(m => m.id === model) ?? MODELS[0]!;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <span className={styles.title}>playground</span>
          {me && <span className={styles.subtitle}>{me.user.email}</span>}
        </div>
        <div className={styles.controls}>
          <ModelPicker value={model} onChange={setModel} />

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
      {!keyValid && (
        <div className={styles.keyBanner}>
          <span className={styles.keyLabel}>ADO Key</span>
          <input
            className={styles.keyInput}
            type="text"
            placeholder="ado-xxxxxxxxxxxxxxxx"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <span className={styles.keyHint}>
            {me
              ? "Rotate your key on the dashboard to reveal it."
              : "Sign in to get a free key, or paste yours here."}
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

      {/* ── Messages ── */}
      <div className={styles.messages}>
        {empty && !error && (
          <div className={styles.emptyState}>
            <div className={styles.emptyGlyph}>_</div>
            <p className={styles.emptyTitle}>Start a conversation</p>
            <p className={styles.emptyModel}>
              <span className={`${styles.provDot} ${styles[`dot_${currentModel.provider}`]}`} />
              {currentModel.label}
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
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={keyValid ? "Message…" : "Enter your API key above first"}
          disabled={!keyValid || streaming}
          rows={1}
        />
        <div className={styles.inputFooter}>
          <span className={styles.inputHint}>Enter to send · Shift+Enter for newline</span>
          <button
            className={styles.sendBtn}
            onClick={() => void send()}
            disabled={!canSend}
            aria-label="Send"
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </div>

    </div>
  );
}
