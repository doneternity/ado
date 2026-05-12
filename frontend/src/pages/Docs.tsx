import { useState, useEffect } from "react";
import { Copy, Check } from "lucide-react";
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
    group: "API Reference",
    links: [
      { id: "chat-completions", label: "Chat completions" },
      { id: "list-models",      label: "List models" },
    ],
  },
  {
    group: "Usage",
    links: [
      { id: "rate-limits", label: "Rate limits" },
      { id: "errors",      label: "Error codes" },
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
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className={styles.codePre}><code>{children}</code></pre>
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
    <div className={styles.page}>

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
          <span className={styles.eyebrow}>Getting Started</span>
          <h1 className={styles.pageTitle}>Quick start</h1>
          <p className={styles.lead}>
            ADO exposes an OpenAI-compatible API backed by Google Gemini.
            Any client that works with the OpenAI API works with ADO — swap the base URL and key, nothing else.
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
                body: "Point your client at https://ado.fly.dev/api/v1 instead of the default OpenAI endpoint.",
              },
              {
                n: "03",
                title: "Pick a model",
                body: "Use any model ID from the /models list, e.g. gemini-2.5-flash-preview-05-20. The model field is required on every request.",
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
          <Code lang="plaintext">https://ado.fly.dev/api/v1</Code>
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
            Keys are issued on signup and can be rotated from the dashboard.
            Rotating immediately invalidates the old key.
          </p>
          <div className={styles.callout}>
            <strong>Keep your key private.</strong>{" "}
            Treat it like a password. If it leaks, rotate it from the dashboard immediately.
          </div>
        </section>

        {/* Chat Completions */}
        <section id="chat-completions" className={styles.section}>
          <span className={styles.eyebrow}>API Reference</span>
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
          <Code lang="bash">{`curl https://ado.fly.dev/api/v1/chat/completions \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.5-flash-preview-05-20",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user",   "content": "Hello!" }
    ]
  }'`}</Code>

          <h3 className={styles.subTitle}>Example response</h3>
          <Code lang="json">{`{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "gemini-2.5-flash-preview-05-20",
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

        {/* List Models */}
        <section id="list-models" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="GET" />{" /models"}
          </h2>
          <p>
            Returns all model IDs available through ADO. Requires a valid key.
            This endpoint does not count against your daily quota.
          </p>
          <Code lang="bash">{`curl https://ado.fly.dev/api/v1/models \\
  -H "Authorization: Bearer ado-your-key"`}</Code>
        </section>

        {/* Rate Limits */}
        <section id="rate-limits" className={styles.section}>
          <span className={styles.eyebrow}>Usage</span>
          <h2 className={styles.sectionTitle}>Rate limits</h2>

          <div className={styles.limitCards}>
            <div className={styles.limitCard}>
              <span className={styles.limitNum}>50</span>
              <span className={styles.limitLabel}>requests / day</span>
            </div>
            <div className={styles.limitCard}>
              <span className={styles.limitNum}>UTC</span>
              <span className={styles.limitLabel}>midnight reset</span>
            </div>
          </div>

          <p>
            Each key gets 50 chat completion requests per UTC calendar day.
            The quota resets at 00:00 UTC regardless of your timezone.
            Calls to <code className={styles.inlineCode}>/models</code> are free and not counted.
          </p>
          <p>When your limit is exceeded:</p>
          <Code lang="json">{`HTTP/1.1 429 Too Many Requests

{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "daily quota exceeded",
    "limit": 50
  }
}`}</Code>
        </section>

        {/* Error Codes */}
        <section id="errors" className={styles.section}>
          <h2 className={styles.sectionTitle}>Error codes</h2>
          <p>All errors follow the same envelope shape:</p>
          <Code lang="json">{`{
  "error": {
    "code": "ERROR_CODE",
    "message": "human-readable description"
  }
}`}</Code>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>HTTP</th><th>Code</th><th>Description</th></tr>
              </thead>
              <tbody>
                {[
                  { status: "401", code: "UNAUTHORIZED",  desc: "Key is missing, malformed, or has been revoked." },
                  { status: "429", code: "QUOTA_EXCEEDED", desc: "Daily request limit reached. Resets at UTC midnight." },
                  { status: "403", code: "INVALID_CSRF",  desc: "CSRF token missing or invalid. Only applies to the web dashboard API." },
                  { status: "500", code: "INTERNAL",      desc: "Unexpected server error. Safe to retry after a short delay." },
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
          <span className={styles.eyebrow}>Examples</span>
          <h2 className={styles.sectionTitle}>cURL</h2>
          <Code lang="bash">{`# Non-streaming
curl https://ado.fly.dev/api/v1/chat/completions \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.5-flash-preview-05-20",
    "messages": [{ "role": "user", "content": "Write a haiku." }]
  }'

# Streaming
curl https://ado.fly.dev/api/v1/chat/completions \\
  -H "Authorization: Bearer ado-your-key" \\
  -H "Content-Type: application/json" \\
  --no-buffer \\
  -d '{
    "model": "gemini-2.5-flash-preview-05-20",
    "messages": [{ "role": "user", "content": "Write a haiku." }],
    "stream": true
  }'`}</Code>
        </section>

        {/* JavaScript */}
        <section id="example-js" className={styles.section}>
          <h2 className={styles.sectionTitle}>JavaScript</h2>
          <p>
            Uses the official <code className={styles.inlineCode}>openai</code> npm package —
            no custom client needed.
          </p>
          <Code lang="javascript">{`import OpenAI from "openai";

const client = new OpenAI({
  apiKey:  "ado-your-key",
  baseURL: "https://ado.fly.dev/api/v1",
});

// Non-streaming
const res = await client.chat.completions.create({
  model:    "gemini-2.5-flash-preview-05-20",
  messages: [{ role: "user", content: "Write a haiku." }],
});
console.log(res.choices[0].message.content);

// Streaming
const stream = await client.chat.completions.create({
  model:    "gemini-2.5-flash-preview-05-20",
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
    base_url = "https://ado.fly.dev/api/v1",
)

# Non-streaming
response = client.chat.completions.create(
    model    = "gemini-2.5-flash-preview-05-20",
    messages = [{"role": "user", "content": "Write a haiku."}],
)
print(response.choices[0].message.content)

# Streaming
with client.chat.completions.stream(
    model    = "gemini-2.5-flash-preview-05-20",
    messages = [{"role": "user", "content": "Write a haiku."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)`}</Code>
        </section>

      </div>
    </div>
  );
}
