import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { useSampleModel } from "../api/queries";
import { API_BASE_URL } from "../config";
import { highlight } from "../components/highlight";
import styles from "./Docs.module.scss";

const NAV = [
  {
    group: "Getting Started",
    links: [
      { id: "quick-start",     label: "Quick start" },
      { id: "base-url",        label: "Base URL" },
      { id: "authentication",  label: "Authentication" },
    ],
  },
  {
    group: "Apps",
    links: [
      { id: "sillytavern", label: "SillyTavern" },
      { id: "janitorai",   label: "JanitorAI" },
    ],
  },
  {
    group: "API Reference",
    links: [
      { id: "chat-completions", label: "Chat completions" },
      { id: "responses",        label: "Responses" },
      { id: "messages",         label: "Messages (Claude)" },
      { id: "embeddings",       label: "Embeddings" },
      { id: "rerank",           label: "Rerank" },
      { id: "images",           label: "Images" },
      { id: "audio",            label: "Audio" },
      { id: "moderations",      label: "Moderations" },
      { id: "realtime",         label: "Realtime" },
      { id: "list-models",      label: "List models" },
    ],
  },
  {
    group: "Usage",
    links: [
      { id: "rate-limits", label: "Rate limits" },
      { id: "errors",      label: "Errors and fixes" },
    ],
  },
  {
    group: "Examples",
    links: [
      { id: "example-curl",   label: "cURL" },
      { id: "example-js",     label: "JavaScript" },
      { id: "example-python", label: "Python" },
    ],
  },
];

const ALL_IDS = NAV.flatMap(g => g.links.map(l => l.id));

const TOKEN_CLASSES = {
  comment: styles.tokComment, string: styles.tokString, key: styles.tokKey,
  keyword: styles.tokKeyword, number: styles.tokNumber, flag: styles.tokFlag,
};

function Code({ children, lang }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeTop}>
        {lang && <span className={styles.codeLang}>{lang}</span>}
        <button className={styles.codeCopy} onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className={styles.codePre}><code>{highlight(children, lang, TOKEN_CLASSES)}</code></pre>
    </div>
  );
}

function Badge({ method }: { method: "GET" | "POST" }) {
  return (
    <span className={`${styles.badge} ${method === "GET" ? styles.badgeGet : styles.badgePost}`}>
      {method}
    </span>
  );
}

function Param({
  name, type, required, desc,
}: {
  name: string; type: string; required?: boolean; desc: string;
}) {
  return (
    <tr>
      <td><code className={styles.paramName}>{name}</code></td>
      <td><span className={styles.paramType}>{type}</span></td>
      <td>
        <span className={required ? styles.tagRequired : styles.tagOptional}>
          {required ? "required" : "optional"}
        </span>
      </td>
      <td className={styles.paramDesc}>{desc}</td>
    </tr>
  );
}

export function Docs() {
  const [activeId, setActiveId] = useState("quick-start");
  const PROXY_BASE = API_BASE_URL;
  const model = useSampleModel();

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-8% 0px -85% 0px" },
    );
    ALL_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      className={styles.page}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >

      {/* ── sidebar ── */}
      <aside className={styles.sidebar}>
        <p className={styles.sidebarTitle}>Documentation</p>
        {NAV.map(group => (
          <div key={group.group} className={styles.sidebarGroup}>
            <p className={styles.sidebarGroupLabel}>{group.group}</p>
            {group.links.map(link => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className={`${styles.sidebarLink}${activeId === link.id ? ` ${styles.active}` : ""}`}
              >
                {link.label}
              </a>
            ))}
          </div>
        ))}
      </aside>

      {/* ── content ── */}
      <div className={styles.content}>

        {/* Quick Start */}
        <section id="quick-start" className={styles.section}>
          <h1 className={styles.pageTitle}>Quick start</h1>
          <p className={styles.lead}>
            ADO exposes an OpenAI-compatible API that routes to every model on the models page.
            Any client that works with the OpenAI API works with ADO. Swap the base URL and key, nothing else.
          </p>
          <div className={styles.steps}>
            {[
              {
                n: "01",
                title: "Get your key",
                body: "Sign up and copy your key from the dashboard. Keys start with ado- and are shown once on account creation.",
              },
              {
                n: "02",
                title: "Set the base URL",
                body: `Point your client at ${PROXY_BASE} instead of the default OpenAI endpoint.`,
              },
              {
                n: "03",
                title: "Pick a model",
                body: `Use any model ID from the /models list, e.g. ${model}. The model field is required on every request.`,
              },
            ].map(({ n, title, body }) => (
              <div key={n} className={styles.step}>
                <span className={styles.stepNum}>{n}</span>
                <div>
                  <p className={styles.stepTitle}>{title}</p>
                  <p className={styles.stepBody}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Base URL */}
        <section id="base-url" className={styles.section}>
          <h2 className={styles.sectionTitle}>Base URL</h2>
          <p>All proxy requests go to:</p>
          <Code lang="plaintext">{PROXY_BASE}</Code>
          <p>
            This is the drop-in replacement for{" "}
            <code className={styles.inlineCode}>https://api.openai.com/v1</code>.
            The request and response shapes are identical to the OpenAI spec.
          </p>
        </section>

        {/* Authentication */}
        <section id="authentication" className={styles.section}>
          <h2 className={styles.sectionTitle}>Authentication</h2>
          <p>
            Pass your ADO key in the <code className={styles.inlineCode}>Authorization</code> header on every proxy request.
          </p>
          <Code lang="http">Authorization: Bearer ado-xxxxxxxxxxxxxxxx</Code>
          <p>
            Tools built for Anthropic&apos;s API (the Anthropic SDK, Claude Code) send the key as{" "}
            <code className={styles.inlineCode}>x-api-key</code> instead, which works too.
          </p>
          <p>
            Keys are issued on signup and can be rotated from the dashboard.
            Rotating immediately invalidates the old key.
          </p>
          <div className={styles.callout}>
            <strong>Keep your key private.</strong>{" "}
            Treat it like a password. If it leaks, rotate it from the dashboard immediately.
          </div>
        </section>

        {/* SillyTavern */}
        <section id="sillytavern" className={styles.section}>
          <h2 className={styles.sectionTitle}>SillyTavern</h2>
          <p>Connect SillyTavern to ADO as a custom OpenAI-compatible source:</p>
          <ol className={styles.stepList}>
            <li>Open <strong>API Connections</strong> (the plug icon in the top bar).</li>
            <li>Set <strong>API</strong> to <strong>Chat Completion</strong>, and <strong>Chat Completion Source</strong> to <strong>Custom (OpenAI-compatible)</strong>.</li>
            <li>In <strong>Custom Endpoint (Base URL)</strong>, enter <code className={styles.inlineCode}>{PROXY_BASE}</code></li>
            <li>Paste your ADO key into <strong>Custom API Key</strong>.</li>
            <li>Click <strong>Connect</strong>, then pick a model from the list, or type an ID such as <code className={styles.inlineCode}>{model}</code> into <strong>Enter a Model ID</strong>.</li>
          </ol>
          <p>
            Every message, swipe and regenerate is one request against your daily quota. Streaming works as usual.
            If SillyTavern can&apos;t connect, check that the base URL ends in <code className={styles.inlineCode}>/v1</code> with nothing after it.
          </p>
        </section>

        {/* JanitorAI */}
        <section id="janitorai" className={styles.section}>
          <h2 className={styles.sectionTitle}>JanitorAI</h2>
          <p>Use ADO as JanitorAI&apos;s proxy:</p>
          <ol className={styles.stepList}>
            <li>In a chat, open the menu and choose <strong>API Settings</strong>.</li>
            <li>Choose <strong>Proxy</strong>.</li>
            <li>For the model, enter a model ID such as <code className={styles.inlineCode}>{model}</code>. The <a href="/models">Models page</a> lists them all.</li>
            <li>For the proxy URL, enter the full chat address: <code className={styles.inlineCode}>{PROXY_BASE}/chat/completions</code></li>
            <li>Paste your ADO key as the API key, save, and reload the chat.</li>
          </ol>
          <p>
            JanitorAI needs the whole address ending in <code className={styles.inlineCode}>/chat/completions</code>,
            unlike SillyTavern, which takes the base URL. Field names can differ a little between versions.
          </p>
        </section>

        {/* Chat Completions */}
        <section id="chat-completions" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" />{" /chat/completions"}
          </h2>
          <p>
            Generates a model response for the given messages.
            Fully compatible with the OpenAI Chat Completions API including streaming via SSE.
          </p>

          <h3 className={styles.subTitle}>Request body</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Parameter</th><th>Type</th><th></th><th>Description</th>
                </tr>
              </thead>
              <tbody>
                <Param name="model"       type="string"  required desc="Model ID to use. See /models for the full list." />
                <Param name="messages"    type="array"   required desc="Array of message objects with role and content fields." />
                <Param name="stream"      type="boolean"          desc="Stream the response with SSE. Defaults to false." />
                <Param name="max_tokens"  type="integer"          desc="Maximum number of tokens to generate." />
                <Param name="temperature" type="number"           desc="Sampling temperature from 0 to 2. Higher = more creative." />
                <Param name="top_p"       type="number"           desc="Nucleus sampling probability cutoff." />
              </tbody>
            </table>
          </div>

          <h3 className={styles.subTitle}>Example request</h3>
          <Code lang="bash">{`curl ${PROXY_BASE}/chat/completions \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user",   "content": "Hello!" }
    ]
  }'`}</Code>

          <h3 className={styles.subTitle}>Example response</h3>
          <Code lang="json">{`{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "${model}",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 9,
    "total_tokens": 29
  }
}`}</Code>
        </section>

        {/* Responses */}
        <section id="responses" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" />{" /responses"}
          </h2>
          <p>
            OpenAI Responses API. Same request and response shape as OpenAI.
            A compact variant is available at{" "}
            <code className={styles.inlineCode}>/responses/compact</code>.
          </p>
          <div className={styles.callout}>
            Endpoints below are OpenAI-compatible passthroughs. They forward to the
            active upstream provider unchanged, so availability depends on which
            models and endpoints that provider supports. Each call counts as one
            request against your daily quota; failed requests (4xx) are refunded.
          </div>
          <Code lang="bash">{`curl ${PROXY_BASE}/responses \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "input": "Write a haiku about the sea."
  }'`}</Code>
        </section>

        {/* Messages (Claude-native) */}
        <section id="messages" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" />{" /messages"}
          </h2>
          <p>
            Anthropic-native Messages API, for clients built against Claude&apos;s
            own format rather than the OpenAI one.
          </p>
          <Code lang="bash">{`curl ${PROXY_BASE}/messages \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4-7",
    "max_tokens": 256,
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'`}</Code>
        </section>

        {/* Embeddings */}
        <section id="embeddings" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" />{" /embeddings"}
          </h2>
          <p>
            Returns a vector embedding for the given input. Compatible with the
            OpenAI Embeddings API.
          </p>
          <Code lang="bash">{`curl ${PROXY_BASE}/embeddings \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-model",
    "input": "The quick brown fox."
  }'`}</Code>
        </section>

        {/* Rerank */}
        <section id="rerank" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" />{" /rerank"}
          </h2>
          <p>
            Reranks a set of documents against a query, returning relevance
            scores. Useful for retrieval pipelines.
          </p>
          <Code lang="bash">{`curl ${PROXY_BASE}/rerank \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "rerank-model",
    "query": "What is the capital of France?",
    "documents": ["Paris is the capital of France.", "Berlin is in Germany."]
  }'`}</Code>
        </section>

        {/* Images */}
        <section id="images" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" />{" /images/generations"}
          </h2>
          <p>
            Image generation. Edits and variations are available at{" "}
            <code className={styles.inlineCode}>/images/edits</code> and{" "}
            <code className={styles.inlineCode}>/images/variations</code>{" "}
            (both accept <code className={styles.inlineCode}>multipart/form-data</code> uploads).
          </p>
          <Code lang="bash">{`curl ${PROXY_BASE}/images/generations \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "image-model",
    "prompt": "a watercolor fox in a forest",
    "n": 1,
    "size": "1024x1024"
  }'`}</Code>
        </section>

        {/* Audio */}
        <section id="audio" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" />{" /audio/speech"}
          </h2>
          <p>
            Text-to-speech (<code className={styles.inlineCode}>/audio/speech</code>),
            plus transcription (<code className={styles.inlineCode}>/audio/transcriptions</code>)
            and translation (<code className={styles.inlineCode}>/audio/translations</code>),
            which take <code className={styles.inlineCode}>multipart/form-data</code> audio uploads.
          </p>
          <Code lang="bash">{`# Text to speech (returns audio bytes)
curl ${PROXY_BASE}/audio/speech \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "tts-model", "input": "Hello there", "voice": "alloy" }' \\
  --output speech.mp3

# Transcription (audio file -> text)
curl ${PROXY_BASE}/audio/transcriptions \\
  -H "Authorization: Bearer ado-your-key" \\
  -F model="whisper-model" \\
  -F file="@audio.mp3"`}</Code>
        </section>

        {/* Moderations */}
        <section id="moderations" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" />{" /moderations"}
          </h2>
          <p>
            Classifies text for policy violations. Compatible with the OpenAI
            Moderations API.
          </p>
          <Code lang="bash">{`curl ${PROXY_BASE}/moderations \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{ "input": "text to classify" }'`}</Code>
        </section>

        {/* Realtime */}
        <section id="realtime" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="GET" />{" /realtime"}
          </h2>
          <p>
            WebSocket endpoint for low-latency, bidirectional sessions. Connect a
            WebSocket and pass your key in the{" "}
            <code className={styles.inlineCode}>Authorization</code> header.
            Browser clients cannot set that header on a WebSocket, so this is
            intended for server-side use.
          </p>
          <Code lang="javascript">{`import WebSocket from "ws";

const ws = new WebSocket("${PROXY_BASE.replace(/^http/, "ws")}/realtime", {
  headers: { Authorization: "Bearer ado-your-key" },
});`}</Code>
        </section>

        {/* List Models */}
        <section id="list-models" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="GET" />{" /models"}
          </h2>
          <p>
            Returns all model IDs available through ADO. Requires a valid key.
            This endpoint does not count against your daily quota.
          </p>
          <Code lang="bash">{`curl ${PROXY_BASE}/models \\
  -H "Authorization: Bearer ado-your-key"`}</Code>
        </section>

        {/* Rate Limits */}
        <section id="rate-limits" className={styles.section}>
          <h2 className={styles.sectionTitle}>Rate limits</h2>

          <div className={styles.limitCards}>
            <div className={styles.limitCard}>
              <span className={styles.limitNum}>Daily</span>
              <span className={styles.limitLabel}>request quota</span>
            </div>
            <div className={styles.limitCard}>
              <span className={styles.limitNum}>UTC</span>
              <span className={styles.limitLabel}>midnight reset</span>
            </div>
          </div>

          <p>
            Each key has a daily request quota, which resets at 00:00 UTC whatever your timezone,
            and a per-minute limit shared by every endpoint.
            Calls to <code className={styles.inlineCode}>/models</code> are free and not counted.
            Your dashboard shows today&apos;s usage.
          </p>
          <p>Every response says where you stand, so your app can slow down before it hits a limit:</p>
          <Code lang="http">{`X-Ado-Quota-Limit: 100
X-Ado-Quota-Remaining: 58
X-Ado-Quota-Reset: 2026-10-22T00:00:00Z
X-Ratelimit-Limit-Requests: 20
X-Ratelimit-Remaining-Requests: 19
X-Ratelimit-Reset-Requests: 42s`}</Code>
          <p>
            When the daily quota is used up, the error says when it resets, and{" "}
            <code className={styles.inlineCode}>Retry-After</code> gives the seconds to wait:
          </p>
          <Code lang="json">{`HTTP/1.1 429 Too Many Requests
Retry-After: 22380

{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "type": "rate_limit_error",
    "message": "you've used all 100 requests for today; the quota resets at 00:00 UTC, in 6h 13m",
    "limit": 100,
    "resets_at": "2026-10-22T00:00:00Z"
  }
}`}</Code>
        </section>

        {/* Error Codes */}
        <section id="errors" className={styles.section}>
          <h2 className={styles.sectionTitle}>Errors and fixes</h2>
          <p>All errors follow the same shape, like OpenAI&apos;s:</p>
          <Code lang="json">{`{
  "error": {
    "code": "ERROR_CODE",
    "type": "invalid_request_error",
    "message": "human-readable description"
  }
}`}</Code>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>HTTP</th><th>Code</th><th>What to do</th></tr>
              </thead>
              <tbody>
                {[
                  { status: "400", code: "MODEL_REQUIRED",    desc: "Add a model field. The Models page lists the IDs." },
                  { status: "400", code: "INVALID_INPUT",     desc: "The request isn't valid: bad JSON, over 16 MB (images included), or a model name over 200 characters." },
                  { status: "401", code: "UNAUTHORIZED",      desc: "The key is missing, mistyped, or was rotated. Copy your current key from the dashboard." },
                  { status: "403", code: "BANNED",            desc: "This account has been suspended. Ask in our Discord server." },
                  { status: "404", code: "MODEL_NOT_FOUND",   desc: "No model has that ID. Check the spelling against the Models page." },
                  { status: "429", code: "RATE_LIMITED",      desc: "Too many requests this minute. Wait for Retry-After seconds, then retry." },
                  { status: "429", code: "QUOTA_EXCEEDED",    desc: "Today's quota is used up. It resets at 00:00 UTC, and the message says how long that is." },
                  { status: "429", code: "TOO_MANY_BAD_KEYS", desc: "Too many requests with an invalid key from your address. Fix the key and wait a few minutes." },
                  { status: "503", code: "NO_PROVIDER",       desc: "No provider could answer right now. Try again shortly or use another model; the Status page shows what's affected." },
                  { status: "503", code: "MAINTENANCE",       desc: "ADO is in maintenance. Try again in a few minutes." },
                  { status: "500", code: "INTERNAL",          desc: "Unexpected server error. Safe to retry after a short delay." },
                ].map(({ status, code, desc }) => (
                  <tr key={code}>
                    <td><span className={styles.statusCode}>{status}</span></td>
                    <td><code className={styles.paramName}>{code}</code></td>
                    <td className={styles.paramDesc}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* cURL */}
        <section id="example-curl" className={styles.section}>
          <h2 className={styles.sectionTitle}>cURL</h2>
          <Code lang="bash">{`# Non-streaming
curl ${PROXY_BASE}/chat/completions \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [{ "role": "user", "content": "Write a haiku." }]
  }'

# Streaming
curl ${PROXY_BASE}/chat/completions \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  --no-buffer \\
  -d '{
    "model": "${model}",
    "messages": [{ "role": "user", "content": "Write a haiku." }],
    "stream": true
  }'`}</Code>
        </section>

        {/* JavaScript */}
        <section id="example-js" className={styles.section}>
          <h2 className={styles.sectionTitle}>JavaScript</h2>
          <p>
            Uses the official <code className={styles.inlineCode}>openai</code> npm package,
            no custom client needed.
          </p>
          <Code lang="javascript">{`import OpenAI from "openai";

const client = new OpenAI({
  apiKey:  "ado-your-key",
  baseURL: "${PROXY_BASE}",
});

// Non-streaming
const res = await client.chat.completions.create({
  model:    "${model}",
  messages: [{ role: "user", content: "Write a haiku." }],
});
console.log(res.choices[0].message.content);

// Streaming
const stream = await client.chat.completions.create({
  model:    "${model}",
  messages: [{ role: "user", content: "Write a haiku." }],
  stream:   true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`}</Code>
        </section>

        {/* Python */}
        <section id="example-python" className={styles.section}>
          <h2 className={styles.sectionTitle}>Python</h2>
          <p>
            Uses the official <code className={styles.inlineCode}>openai</code> PyPI package.
          </p>
          <Code lang="python">{`from openai import OpenAI

client = OpenAI(
    api_key  = "ado-your-key",
    base_url = "${PROXY_BASE}",
)

# Non-streaming
response = client.chat.completions.create(
    model    = "${model}",
    messages = [{"role": "user", "content": "Write a haiku."}],
)
print(response.choices[0].message.content)

# Streaming
with client.chat.completions.stream(
    model    = "${model}",
    messages = [{"role": "user", "content": "Write a haiku."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)`}</Code>
        </section>

      </div>
    </motion.div>
  );
}
