import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Copy, Check, ArrowRight } from "lucide-react";
import { useCurrentKey, useLiveModels, useMe, useSampleModel } from "../api/queries";
import { API_BASE_URL, DISCORD_INVITE_URL } from "../config";
import { CodeBlock, useCopy } from "../components/CodeBlock";
import { CodeTabs } from "../components/CodeTabs";
import type { Lang } from "../components/CodeTabs";
import { enrichAll } from "../data/model-meta";
import { joinNames } from "../data/catalog";
import styles from "./Docs.module.scss";

const NAV = [
  {
    group: "Getting started",
    links: [
      { id: "quick-start",    label: "Quick start" },
      { id: "authentication", label: "Authentication" },
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
    group: "Chat",
    links: [
      { id: "chat-completions", label: "Chat completions" },
      { id: "streaming",        label: "Streaming" },
      { id: "vision",           label: "Images" },
      { id: "reasoning",        label: "Reasoning" },
    ],
  },
  {
    group: "Reference",
    links: [
      { id: "list-models",     label: "List models" },
      { id: "other-endpoints", label: "Other endpoints" },
      { id: "messages",        label: "Messages (Anthropic)" },
      { id: "realtime",        label: "Realtime" },
    ],
  },
  {
    group: "Usage",
    links: [
      { id: "rate-limits", label: "Limits" },
      { id: "errors",      label: "Errors and fixes" },
    ],
  },
];

const ALL_IDS = NAV.flatMap(g => g.links.map(l => l.id));

// The first-request and streaming examples, in each language. The key comes
// from ADO_API_KEY, like the Models page snippets.
function firstRequest(base: string, model: string): Record<Lang, string> {
  const id = JSON.stringify(model);
  return {
    curl: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $ADO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": ${id},
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ]
  }'`,
    python: `import os
from openai import OpenAI

client = OpenAI(base_url="${base}", api_key=os.environ["ADO_API_KEY"])

reply = client.chat.completions.create(
    model=${id},
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"},
    ],
)
print(reply.choices[0].message.content)`,
    javascript: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${base}", apiKey: process.env.ADO_API_KEY });

const reply = await client.chat.completions.create({
  model: ${id},
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
  ],
});
console.log(reply.choices[0].message.content);`,
  };
}

function streamingRequest(base: string, model: string): Record<Lang, string> {
  const id = JSON.stringify(model);
  return {
    curl: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $ADO_API_KEY" \\
  -H "Content-Type: application/json" \\
  --no-buffer \\
  -d '{
    "model": ${id},
    "messages": [{"role": "user", "content": "Write a haiku."}],
    "stream": true
  }'`,
    python: `import os
from openai import OpenAI

client = OpenAI(base_url="${base}", api_key=os.environ["ADO_API_KEY"])

stream = client.chat.completions.create(
    model=${id},
    messages=[{"role": "user", "content": "Write a haiku."}],
    stream=True,
)
for chunk in stream:
    if chunk.choices:
        print(chunk.choices[0].delta.content or "", end="", flush=True)`,
    javascript: `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${base}", apiKey: process.env.ADO_API_KEY });

const stream = await client.chat.completions.create({
  model: ${id},
  messages: [{ role: "user", content: "Write a haiku." }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
  };
}

// Scrolls to a section and puts it in the address bar. Plain #links don't
// work here: the router's scroll restoration puts the page back where it was.
function jump(id: string) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  history.replaceState(history.state, "", `#${id}`);
}

function SectionLink({ to, className, children, current }: { to: string; className?: string; children: ReactNode; current?: boolean }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      aria-current={current ? "location" : undefined}
      onClick={e => { e.preventDefault(); jump(to); }}
    >
      {children}
    </a>
  );
}

function Code({ children, lang }: { children: string; lang?: string }) {
  return <div className={styles.code}><CodeBlock code={children} lang={lang} /></div>;
}

function Tabs({ snippets }: { snippets: Record<Lang, string> }) {
  return <div className={styles.code}><CodeTabs snippets={snippets} /></div>;
}

function C({ children }: { children: ReactNode }) {
  return <code className={styles.inlineCode}>{children}</code>;
}

function Badge({ method }: { method: "GET" | "POST" }) {
  return (
    <span className={`${styles.badge} ${method === "GET" ? styles.badgeGet : styles.badgePost}`}>
      {method}
    </span>
  );
}

function Param({
  name, type, required, children,
}: {
  name: string; type: string; required?: boolean; children: ReactNode;
}) {
  return (
    <tr>
      <td>
        <div className={styles.nameCell}>
          <code className={styles.paramName}>{name}</code>
          <span className={styles.paramType}>{type}</span>
          {required && <span className={styles.tagRequired}>required</span>}
        </div>
      </td>
      <td className={styles.paramDesc}>{children}</td>
    </tr>
  );
}

function BaseUrl({ url }: { url: string }) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" className={styles.baseUrl} onClick={() => copy(url)} aria-label={`Copy the base URL, ${url}`}>
      <span className={styles.baseUrlLabel}>Base URL</span>
      <code className={styles.baseUrlValue}>{url}</code>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

// The visitor's own limits when they're signed in, so the numbers in the
// examples below aren't the only ones they see.
function YourLimits() {
  const { data: me } = useMe();
  const { data: key } = useCurrentKey({ enabled: !!me });
  if (!me) {
    return (
      <p className={styles.limitsNote}>
        <Link to="/login">Sign in</Link> to see your own limits here. Plans and their limits are on the{" "}
        <Link to="/pricing">Pricing page</Link>.
      </p>
    );
  }
  if (!key) return null;
  return (
    <div className={styles.limitCards}>
      <div className={styles.limitCard}>
        <span className={styles.limitNum}>{key.dailyLimit.toLocaleString()}</span>
        <span className={styles.limitLabel}>requests a day</span>
      </div>
      {key.rpmLimit !== undefined && key.rpmLimit > 0 && (
        <div className={styles.limitCard}>
          <span className={styles.limitNum}>{key.rpmLimit}</span>
          <span className={styles.limitLabel}>requests a minute</span>
        </div>
      )}
      <div className={styles.limitCard}>
        <span className={styles.limitNum}>{key.used.toLocaleString()}</span>
        <span className={styles.limitLabel}>used today</span>
      </div>
      {key.plan && (
        <div className={styles.limitCard}>
          <span className={styles.limitNum}>{key.plan.name}</span>
          <span className={styles.limitLabel}>plan</span>
        </div>
      )}
    </div>
  );
}

export function Docs() {
  const [activeId, setActiveId] = useState("quick-start");
  const base = API_BASE_URL;
  const model = useSampleModel();
  const { data: me } = useMe();
  const { data: live } = useLiveModels();
  const enriched = live ? enrichAll(live) : [];
  const vision = enriched.filter(m => m.capabilities.includes("Vision"));
  const visionModel = vision[0]?.id ?? model;
  const effortModel = enriched.find(m => m.effortLevels?.length);

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

  // A link to /docs#section from another page lands on that section.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && ALL_IDS.includes(id)) document.getElementById(id)?.scrollIntoView();
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
        <nav aria-label="Docs sections">
          {NAV.map(group => (
            <div key={group.group} className={styles.sidebarGroup}>
              <p className={styles.sidebarGroupLabel}>{group.group}</p>
              {group.links.map(link => (
                <SectionLink
                  key={link.id}
                  to={link.id}
                  className={`${styles.sidebarLink}${activeId === link.id ? ` ${styles.active}` : ""}`}
                  current={activeId === link.id}
                >
                  {link.label}
                </SectionLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── content ── */}
      <div className={styles.content}>

        <header className={styles.hero}>
          <h1 className={styles.headline}>swap the url.<br />keep your code.</h1>
          <p className={styles.lede}>
            ADO speaks the OpenAI API. Point any OpenAI client or app at the base URL below,
            use your ADO key, and pick a model. Nothing else changes.
          </p>
          <BaseUrl url={base} />
          <div className={styles.heroLinks}>
            <Link to={me ? "/dashboard" : "/login"} className={styles.heroLink}>
              {me ? "Your key" : "Get a key"} <ArrowRight size={13} />
            </Link>
            <Link to="/models" className={styles.heroLink}>Models <ArrowRight size={13} /></Link>
            {me && <Link to="/playground" className={styles.heroLink}>Playground <ArrowRight size={13} /></Link>}
          </div>

          <label className={styles.mobileJump}>
            <span>Jump to</span>
            <select value="" onChange={e => { if (e.target.value) jump(e.target.value); }}>
              <option value="">Choose a section</option>
              {NAV.map(group => (
                <optgroup key={group.group} label={group.group}>
                  {group.links.map(link => <option key={link.id} value={link.id}>{link.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        </header>

        {/* Quick start */}
        <section id="quick-start" className={styles.section}>
          <h2 className={styles.sectionTitle}>Quick start</h2>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNum}>01</span>
              <div>
                <p className={styles.stepTitle}>Get your key</p>
                <p className={styles.stepBody}>
                  Sign in with Discord and copy your key from the <Link to="/dashboard">dashboard</Link>.
                  Keys start with <C>ado-</C> and are shown in full once, when they&apos;re created or rotated.
                </p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>02</span>
              <div>
                <p className={styles.stepTitle}>Put it in an environment variable</p>
                <p className={styles.stepBody}>The examples on this page read it from <C>ADO_API_KEY</C>, so they&apos;re safe to share.</p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>03</span>
              <div>
                <p className={styles.stepTitle}>Pick a model</p>
                <p className={styles.stepBody}>
                  Copy an ID from the <Link to="/models">Models page</Link>, such as <C>{model}</C>.
                  Every request needs one.
                </p>
              </div>
            </li>
          </ol>
          <Code lang="bash">{`# macOS and Linux
export ADO_API_KEY="ado-your-key"

# Windows PowerShell
$env:ADO_API_KEY = "ado-your-key"`}</Code>
          <h3 className={styles.subTitle}>Your first request</h3>
          <Tabs snippets={firstRequest(base, model)} />
          <p>
            The Python and JavaScript examples use OpenAI&apos;s own SDKs (<C>pip install openai</C>,{" "}
            <C>npm install openai</C>). Any library or app that lets you change the base URL works the same way.
          </p>
        </section>

        {/* Authentication */}
        <section id="authentication" className={styles.section}>
          <h2 className={styles.sectionTitle}>Authentication</h2>
          <p>Send your key in the <C>Authorization</C> header on every request:</p>
          <Code lang="http">Authorization: Bearer ado-your-key</Code>
          <p>
            Tools built for Anthropic&apos;s API (the Anthropic SDK, Claude Code) send it as <C>x-api-key</C> instead,
            which works too.
          </p>
          <p>
            Rotating your key on the dashboard gives you a new one and stops the old one at once.
            Too many requests with a wrong key from one address are blocked for a few minutes.
          </p>
          <div className={styles.callout}>
            <strong>Keep your key private.</strong>{" "}
            Treat it like a password: don&apos;t put it in a website&apos;s code or a public repository.
            If it leaks, rotate it.
          </div>
        </section>

        {/* SillyTavern */}
        <section id="sillytavern" className={styles.section}>
          <h2 className={styles.sectionTitle}>SillyTavern</h2>
          <p>Connect SillyTavern to ADO as a custom OpenAI-compatible source:</p>
          <ol className={styles.stepList}>
            <li>Open <strong>API Connections</strong> (the plug icon in the top bar).</li>
            <li>Set <strong>API</strong> to <strong>Chat Completion</strong>, and <strong>Chat Completion Source</strong> to <strong>Custom (OpenAI-compatible)</strong>.</li>
            <li>In <strong>Custom Endpoint (Base URL)</strong>, enter <C>{base}</C></li>
            <li>Paste your ADO key into <strong>Custom API Key</strong>.</li>
            <li>Click <strong>Connect</strong>, then pick a model from the list, or type an ID such as <C>{model}</C> into <strong>Enter a Model ID</strong>.</li>
          </ol>
          <p>
            Every message, swipe and regenerate is one request against your daily quota. Streaming works as usual.
            If SillyTavern can&apos;t connect, check that the base URL ends in <C>/v1</C> with nothing after it.
          </p>
        </section>

        {/* JanitorAI */}
        <section id="janitorai" className={styles.section}>
          <h2 className={styles.sectionTitle}>JanitorAI</h2>
          <p>Use ADO as JanitorAI&apos;s proxy:</p>
          <ol className={styles.stepList}>
            <li>In a chat, open the menu and choose <strong>API Settings</strong>.</li>
            <li>Choose <strong>Proxy</strong>.</li>
            <li>For the model, enter a model ID such as <C>{model}</C>. The <Link to="/models">Models page</Link> lists them all.</li>
            <li>For the proxy URL, enter the full chat address: <C>{base}/chat/completions</C></li>
            <li>Paste your ADO key as the API key, save, and reload the chat.</li>
          </ol>
          <p>
            JanitorAI needs the whole address ending in <C>/chat/completions</C>,
            unlike SillyTavern, which takes the base URL. Field names can differ a little between versions.
          </p>
        </section>

        {/* Chat Completions */}
        <section id="chat-completions" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" /><span className={styles.path}>/chat/completions</span>
          </h2>
          <p>
            Generates a reply to a conversation. It works like OpenAI&apos;s Chat Completions API, so the
            request and response look the same.
          </p>

          <h3 className={styles.subTitle}>Request body</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                <Param name="model" type="string" required>A model ID from the <Link to="/models">Models page</Link>.</Param>
                <Param name="messages" type="array" required>
                  The conversation so far: objects with a <C>role</C> (<C>system</C>, <C>user</C>, <C>assistant</C>{" "}
                  or <C>tool</C>) and <C>content</C>. Content can also be a list of parts, to <SectionLink to="vision">send images</SectionLink>.
                </Param>
                <Param name="stream" type="boolean">Send the reply as it&apos;s written. See <SectionLink to="streaming">Streaming</SectionLink>.</Param>
                <Param name="max_tokens" type="integer">The longest reply to write, in tokens.</Param>
                <Param name="temperature" type="number">From 0 to 2. Higher is more varied, lower is more focused.</Param>
                <Param name="top_p" type="number">Only consider the most likely tokens that add up to this probability.</Param>
                <Param name="stop" type="string or array">Stop writing when one of these appears.</Param>
                <Param name="tools" type="array">Functions the model can ask to call, for models with the Tools tag. Add <C>tool_choice</C> to steer it.</Param>
                <Param name="response_format" type="object"><C>{`{"type": "json_object"}`}</C> asks for JSON, on models that support it.</Param>
                <Param name="reasoning_effort" type="string">How hard a thinking model thinks. See <SectionLink to="reasoning">Reasoning</SectionLink>.</Param>
              </tbody>
            </table>
          </div>
          <p>Other OpenAI fields go to the model as they are; a model that doesn&apos;t support one may ignore it or return an error.</p>

          <h3 className={styles.subTitle}>Response</h3>
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
          <p>
            Each call is one request against your daily quota, however long it is. Requests the model rejects
            (a 4xx) and ones no provider can answer aren&apos;t counted.
          </p>
        </section>

        {/* Streaming */}
        <section id="streaming" className={styles.section}>
          <h2 className={styles.sectionTitle}>Streaming</h2>
          <p>
            With <C>&quot;stream&quot;: true</C>, the reply arrives as server-sent events: one <C>data:</C> line per
            chunk, each with a piece of the text in <C>choices[0].delta.content</C>, and <C>data: [DONE]</C> at the end.
          </p>
          <Tabs snippets={streamingRequest(base, model)} />
          <p>
            To get token counts in a stream, add <C>{`"stream_options": {"include_usage": true}`}</C>; the last chunk
            then has <C>usage</C> and an empty <C>choices</C> list. If you stop a request before the model starts
            answering, it isn&apos;t counted.
          </p>
        </section>

        {/* Images */}
        <section id="vision" className={styles.section}>
          <h2 className={styles.sectionTitle}>Images</h2>
          <p>
            Models with the Vision tag can read images. Send the message content as a list of parts: text,
            then one or more images as a data URL (base64) or a public link.
          </p>
          <p className={styles.dynamicNote}>
            {live === undefined
              ? "Checking which models take images…"
              : vision.length
                ? <>Models that take images right now: {joinNames(vision.slice(0, 6).map(m => m.name))}{vision.length > 6 ? ` and ${vision.length - 6} more` : ""}.</>
                : "No model on ADO takes images right now."}
          </p>
          <Code lang="json">{`{
  "model": "${visionModel}",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What's in this picture?" },
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,/9j/4AAQ..." } }
      ]
    }
  ]
}`}</Code>
          <p>
            A request can be up to 16 MB, images included. Large photos are better shrunk first: models scale
            them down anyway, and smaller requests are faster. The <Link to="/playground">Playground</Link> does this for you.
          </p>
        </section>

        {/* Reasoning */}
        <section id="reasoning" className={styles.section}>
          <h2 className={styles.sectionTitle}>Reasoning</h2>
          <p>
            Thinking models work through a problem before they answer. Their reasoning comes separately from the
            answer, in <C>reasoning_content</C> (or <C>reasoning</C>) on the message, or on each <C>delta</C> when
            streaming. Some models put it at the start of the answer inside <C>{"<think>…</think>"}</C> instead.
            Show it or hide it as you like, but don&apos;t send it back in later messages; only the answer belongs in the history.
          </p>
          <p>
            Models that let you choose how hard they think take <C>reasoning_effort</C>.
            {effortModel?.effortLevels
              ? <> For example, {effortModel.name} takes {joinNames(effortModel.effortLevels.map(l => `"${l}"`))}.</>
              : null}{" "}
            The <Link to="/models">Models page</Link> lists the levels for each model.
          </p>
          <p>
            <strong>Reasoning mode</strong> on the dashboard is different: it asks every model to show its steps in
            the answer itself, for all chat requests made with your key. Turn it off there if your app shows
            replies to other people.
          </p>
        </section>

        {/* List Models */}
        <section id="list-models" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="GET" /><span className={styles.path}>/models</span>
          </h2>
          <p>
            Lists every model you can use, with what each one can do and whether it&apos;s working right now.
            It doesn&apos;t count against your quota (up to 30 calls a minute).
          </p>
          <Code lang="bash">{`curl ${base}/models -H "Authorization: Bearer $ADO_API_KEY"`}</Code>
          <Code lang="json">{`{
  "object": "list",
  "data": [
    {
      "id": "${model}",
      "object": "model",
      "owned_by": "deepseek",
      "display_name": "...",
      "context_length": 128000,
      "ado_status": "available"
    }
  ]
}`}</Code>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                <Param name="id" type="string">What to put in <C>model</C>.</Param>
                <Param name="display_name" type="string">A readable name, when the provider gives one.</Param>
                <Param name="context_length" type="integer">How many tokens the model can take in at once, when known.</Param>
                <Param name="ado_status" type="string"><C>available</C>, <C>degraded</C> (some requests failing) or <C>down</C>. The <Link to="/status">Status page</Link> shows the same.</Param>
                <Param name="owned_by" type="string">Who made the model, or <C>ado</C> when that isn&apos;t known.</Param>
              </tbody>
            </table>
          </div>
          <p>Some models also list <C>input_modalities</C>, <C>capabilities</C> or <C>effort</C> levels.</p>
        </section>

        {/* Other endpoints */}
        <section id="other-endpoints" className={styles.section}>
          <h2 className={styles.sectionTitle}>Other endpoints</h2>
          <p>
            These follow OpenAI&apos;s API too. ADO passes them to the model&apos;s provider as they are, so each one
            works only when a provider on ADO serves that kind of model. Requests it can&apos;t serve aren&apos;t counted;
            the rest count as one request each.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <tbody>
                {[
                  { path: "/responses", desc: "OpenAI's Responses API. /responses/compact too." },
                  { path: "/embeddings", desc: "Vectors for search and similarity." },
                  { path: "/rerank", desc: "Scores documents against a query." },
                  { path: "/images/generations", desc: "Image generation. /images/edits and /images/variations take file uploads." },
                  { path: "/audio/speech", desc: "Text to speech, returning audio." },
                  { path: "/audio/transcriptions", desc: "Speech to text from an uploaded file. /audio/translations too." },
                  { path: "/moderations", desc: "Checks text against content policies." },
                ].map(({ path, desc }) => (
                  <tr key={path}>
                    <td><div className={styles.nameCell}><Badge method="POST" /><code className={styles.paramName}>{path}</code></div></td>
                    <td className={styles.paramDesc}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Uploads can be up to 25 MB. Each request takes a <C>model</C> from the Models page, like chat does.</p>
        </section>

        {/* Messages (Anthropic) */}
        <section id="messages" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="POST" /><span className={styles.path}>/messages</span>
          </h2>
          <p>
            Anthropic&apos;s Messages format, for clients built on it rather than on OpenAI&apos;s. It&apos;s passed
            through like the endpoints above, so it works when the model&apos;s provider offers it.
          </p>
          <Code lang="bash">{`curl ${base}/messages \\
  -H "x-api-key: $ADO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</Code>
        </section>

        {/* Realtime */}
        <section id="realtime" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Badge method="GET" /><span className={styles.path}>/realtime</span>
          </h2>
          <p>
            A WebSocket for live, two-way sessions with realtime models. Name the model in the URL and send your
            key in the <C>Authorization</C> header. Browsers can&apos;t set that header on a WebSocket, so connect from
            a server. Each connection counts as one request.
          </p>
          <Code lang="javascript">{`import WebSocket from "ws";

const ws = new WebSocket("${base.replace(/^http/, "ws")}/realtime?model=your-realtime-model", {
  headers: { Authorization: \`Bearer \${process.env.ADO_API_KEY}\` },
});`}</Code>
        </section>

        {/* Rate Limits */}
        <section id="rate-limits" className={styles.section}>
          <h2 className={styles.sectionTitle}>Limits</h2>
          <p>
            Each key has a daily request quota, which resets at 00:00 UTC whatever your timezone, and a per-minute
            limit shared by every endpoint. <C>/models</C> calls aren&apos;t counted.
          </p>
          <YourLimits />
          <p>Every response says where you stand, so your app can slow down before it hits a limit:</p>
          <Code lang="http">{`X-Ado-Quota-Limit: 100
X-Ado-Quota-Remaining: 58
X-Ado-Quota-Reset: 2026-10-22T00:00:00Z
X-Ratelimit-Limit-Requests: 20
X-Ratelimit-Remaining-Requests: 19
X-Ratelimit-Reset-Requests: 42s`}</Code>
          <p>
            When the daily quota is used up, the error says when it resets, and <C>Retry-After</C> gives the
            seconds to wait:
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
          <p>Errors have the same shape as OpenAI&apos;s, so SDKs show the message as they would for OpenAI:</p>
          <Code lang="json">{`{
  "error": {
    "code": "MODEL_NOT_FOUND",
    "type": "not_found_error",
    "message": "the model \\"gpt-4\\" isn't available; see https://adoai.space/models for the models you can use"
  }
}`}</Code>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Code</th><th>What to do</th></tr>
              </thead>
              <tbody>
                {[
                  { status: "400", code: "MODEL_REQUIRED",     desc: "Add a model field (for Realtime, ?model= in the address). The Models page lists the IDs." },
                  { status: "400", code: "INVALID_INPUT",      desc: "The request itself is wrong, and the message says how: not valid JSON (with where it breaks), a field of the wrong type, missing or empty messages, over 16 MB (images included), or a model name over 200 characters." },
                  { status: "401", code: "UNAUTHORIZED",       desc: "The key is missing, isn't an ADO key (they start with ado-), isn't sent as \"Bearer <key>\", or is mistyped or rotated. Copy your current key from the dashboard." },
                  { status: "403", code: "BANNED",             desc: "This account has been suspended. Ask in our Discord server." },
                  { status: "404", code: "MODEL_NOT_FOUND",    desc: "No model has that ID. Check the spelling against the Models page." },
                  { status: "404", code: "NOT_FOUND",          desc: "There's no endpoint at that address. The message points out common mix-ups, like /v1 twice or a missing /v1." },
                  { status: "405", code: "METHOD_NOT_ALLOWED", desc: "Wrong method for that endpoint: /models and /realtime take GET, the rest POST." },
                  { status: "429", code: "RATE_LIMITED",       desc: "Over your per-minute limit. Wait for Retry-After seconds, then retry." },
                  { status: "429", code: "QUOTA_EXCEEDED",     desc: "Today's quota is used up. It resets at 00:00 UTC, and the message says how long that is." },
                  { status: "429", code: "TOO_MANY_BAD_KEYS",  desc: "Your address sent too many requests with a missing or invalid key. Fix the key and wait for Retry-After." },
                  { status: "503", code: "NO_PROVIDER",        desc: "Every provider for that model was down, overloaded or too slow. It isn't your key. Try again shortly or use another model; the Status page shows what's affected." },
                  { status: "503", code: "MAINTENANCE",        desc: "ADO is down for maintenance. Try again in a few minutes." },
                  { status: "500", code: "INTERNAL",           desc: "Something went wrong on our side, and the message says what couldn't be done. Safe to retry after a short delay." },
                ].map(({ status, code, desc }) => (
                  <tr key={code}>
                    <td>
                      <div className={styles.nameCell}>
                        <span className={styles.statusCode}>{status}</span>
                        <code className={styles.paramName}>{code}</code>
                      </div>
                    </td>
                    <td className={styles.paramDesc}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Errors with a different code come from the model&apos;s provider, passed on as they are (a conversation
            longer than the model&apos;s context, say). 429s and 5xx errors are worth retrying after a wait; other 4xx
            errors need a change to the request first.
          </p>
          <p>
            If a streamed reply breaks partway because the provider stalls or drops the connection, the stream ends
            with an error event (code <C>STREAM_INTERRUPTED</C>) instead of just stopping, so OpenAI&apos;s SDKs raise an
            error rather than handing you a cut-off reply. What arrived before it is kept.
          </p>

          <div className={styles.help}>
            <p className={styles.helpTitle}>Still stuck?</p>
            <p className={styles.helpBody}>
              Ask in our <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Discord server</a>,
              or check the <Link to="/status">Status page</Link> to see if a model is having trouble.
            </p>
          </div>
        </section>

      </div>
    </motion.div>
  );
}
