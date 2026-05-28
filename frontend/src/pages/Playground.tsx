import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, RotateCcw, ChevronDown, Settings2, X } from "lucide-react";
import { useMe, useRawKey, rawKeyKey } from "../api/queries";
import { clearRawKey, saveRawKey } from "../api/raw-key-storage";
import { MODELS } from "../data/models";
import type { ModelProvider } from "../data/models";
import { PROXY_REQUEST_BASE } from "../config";
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
  other:    "Other",
};

const PROXY_BASE = PROXY_REQUEST_BASE;

function inferProvider(id: string): ModelProvider {
  const key = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  if (/gemini|google|bard/i.test(key)) return "gemini";
  if (/claude|anthropic/i.test(key)) return "claude";
  if (/deepseek/i.test(key)) return "deepseek";
  if (/gpt|openai|^o\d/i.test(key)) return "openai";
  if (/grok|xai/i.test(key)) return "xai";
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
      return `No upstream provider could serve "${model}" right now. This is on the provider side, not your key — try another model or try again shortly.`;
    case "MAINTENANCE":
      return "ADO is in maintenance mode right now. Please try again in a few minutes.";
    case "QUOTA_EXCEEDED":
      return "You've hit your daily request quota. It resets at UTC midnight.";
    case "RATE_LIMITED":
      return "You're sending requests too quickly. Wait a moment and try again.";
    case "BANNED":
      return "This account has been suspended.";
    case "UNAUTHORIZED":
      return "Your ADO key is invalid or has been rotated. Enter your current key above.";
  }
  if (status === 401 || status === 403) {
    return "Your ADO key is invalid or has been rotated. Enter your current key above.";
  }
  if (status === 404) {
    return `The model "${model}" isn't available. Pick another from the model list.`;
  }
  return rawMsg || `Request failed (HTTP ${status}).`;
}

async function streamCompletion(
  apiKey: string,
  model: string,
  messages: Pick<Msg, "role" | "content">[],
  onToken: (t: string) => void,
  onDone: () => void,
  onError: (msg: string, status?: number) => void,
) {
  try {
    if (!/^[\x20-\x7E]+$/.test(apiKey)) {
      onError("API key contains invalid characters. Please check and re-enter your key.");
      return;
    }
    const resp = await fetch(`${PROXY_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!resp.ok) {
      let rawMsg = "";
      let code = "";
      try {
        const j = (await resp.json()) as { error?: { message?: string; code?: string } };
        rawMsg = j.error?.message ?? "";
        code = j.error?.code ?? "";
      } catch (_) { /* ignore */ }
      onError(friendlyError(resp.status, code, rawMsg, model), resp.status);
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
  const raw = useRawKey();
  const qc = useQueryClient();

  const [apiKey, setApiKey]         = useState(() => raw?.key ?? "");
  const [model, setModel]           = useState(MODELS[0]!.id);
  const [pickerModels, setPickerModels] = useState<PickerModel[]>(STATIC_MODELS);
  const [systemPrompt, setSystem]   = useState("");
  const [showSystem, setShowSys]    = useState(false);
  const [messages, setMessages]     = useState<Msg[]>([]);
  const [input, setInput]           = useState("");
  const [streaming, setStreaming]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (raw?.key && !apiKey) setApiKey(raw.key);
  }, [raw, apiKey]);

  const keyValid = (k: string) => k.startsWith("ado-") && k.length > 6 && /^[\x20-\x7E]+$/.test(k);

  // Persist whatever the user types into the key input so it auto-fills on
  // future visits even for keys that were issued before this client shipped.
  useEffect(() => {
    if (!me) return;
    if (!apiKey) {
      if (raw) {
        qc.setQueryData(rawKeyKey, null);
        clearRawKey();
      }
      return;
    }
    if (!keyValid(apiKey)) return;
    if (raw?.key === apiKey) return;
    const issued = {
      key: apiKey,
      keyPrefix: apiKey.slice(0, 12),
      dailyLimit: raw?.dailyLimit ?? 0,
    };
    qc.setQueryData(rawKeyKey, issued);
    saveRawKey(me.user.id, issued);
  }, [apiKey, me, raw, qc]);

  // Fetch live model list from the proxy whenever we have a valid key.
  // Debounced so each keystroke while pasting/typing doesn't fire a request.
  useEffect(() => {
    if (!keyValid(apiKey)) {
      setPickerModels(STATIC_MODELS);
      // Snap back to a static model if the current selection is live-only.
      if (!STATIC_MODELS.find(m => m.id === model)) setModel(STATIC_MODELS[0]!.id);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`${PROXY_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: { data?: { id: string }[] }) => {
          if (cancelled || !d.data?.length) return;
          const live = toPickerModels(d.data.map(m => m.id));
          setPickerModels(live);
          // If the current model isn't in the live list, switch to the first live model.
          if (!live.find(m => m.id === model)) setModel(live[0]!.id);
        })
        .catch(() => { /* keep static list */ });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

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
    if (!text || streaming || !keyValid(apiKey)) return;
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
      (msg, status) => {
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
        setStreaming(false);
        // Server rejected the key — reveal the input so the user can replace it.
        if (status === 401 || status === 403) setApiKey("");
      },
    );
  }, [input, streaming, apiKey, model, messages, systemPrompt]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  function clearChat() { setMessages([]); setError(null); }

  const isKeyValid  = keyValid(apiKey);
  const canSend     = isKeyValid && input.trim().length > 0 && !streaming;
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
      {!isKeyValid && (
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
            placeholder={isKeyValid ? "Message…" : "Enter your API key above first"}
            disabled={!isKeyValid || streaming}
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

    </div>
  );
}
