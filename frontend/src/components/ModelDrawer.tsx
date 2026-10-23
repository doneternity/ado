import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import { API_BASE_URL } from "../config";
import { PROVIDER_NAME } from "../data/catalog";
import type { EnrichedModel } from "../data/model-meta";
import { useStatusHistory } from "../api/status-history";
import type { HistoryRange } from "../api/status-history";
import { CodeTabs, LANGS } from "./CodeTabs";
import type { Lang } from "./CodeTabs";
import { CapList, CopyId, MakerMark, StatusPill, makerStyle, specsOf } from "./ModelBits";
import { RANGES, Strip, band, fmtRate } from "./UptimeHistory";
import { useDialog } from "./useDialog";
import styles from "./ModelDrawer.module.scss";

// Ready-to-paste chat completion for one model. The key comes from an
// ADO_API_KEY environment variable, so the snippet is safe to share as is.
export function snippetFor(lang: Lang, modelId: string): string {
  const id = JSON.stringify(modelId);
  switch (lang) {
    case "curl":
      return `curl ${API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer $ADO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": ${id},
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;
    case "python":
      return `import os
from openai import OpenAI

client = OpenAI(base_url="${API_BASE_URL}", api_key=os.environ["ADO_API_KEY"])

reply = client.chat.completions.create(
    model=${id},
    messages=[{"role": "user", "content": "Hello!"}],
)
print(reply.choices[0].message.content)`;
    case "javascript":
      return `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${API_BASE_URL}", apiKey: process.env.ADO_API_KEY });

const reply = await client.chat.completions.create({
  model: ${id},
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(reply.choices[0].message.content);`;
  }
}

// Everything about one model: specs, how reliably it has answered lately,
// and code to call it. A side panel on wide screens, a bottom sheet on phones.
export function ModelDrawer({ model: m, onClose }: { model: EnrichedModel; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose);
  const [range, setRange] = useState<HistoryRange>("24h");
  const { data: history, isLoading, isError } = useStatusHistory(range);
  const series = history?.models?.find((s) => s.id === m.id);
  const snippets = Object.fromEntries(LANGS.map((l) => [l.id, snippetFor(l.id, m.id)])) as Record<Lang, string>;
  const specs = specsOf(m);
  const phrase = RANGES.find((r) => r.id === range)!.phrase;

  // The page behind doesn't scroll while the drawer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.drawer} ref={ref} role="dialog" aria-modal="true" aria-labelledby="model-drawer-title" style={makerStyle(m.provider)}>
        <div className={styles.head}>
          <span className={styles.maker}>
            <MakerMark provider={m.provider} size={20} />
            {PROVIDER_NAME[m.provider]}
          </span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.titleRow}>
            <div>
              {m.tag && <span className={styles.tag}>{m.tag}</span>}
              <h2 id="model-drawer-title" className={styles.title}>{m.name}</h2>
            </div>
            <StatusPill status={m.adoStatus} />
          </div>
          {m.description && <p className={styles.desc}>{m.description}</p>}

          <div className={styles.idRow}><CopyId id={m.id} /></div>

          {specs.length > 0 && (
            <dl className={styles.specs}>
              {specs.map(([k, v]) => (
                <div key={k} className={styles.spec}>
                  <dt>{k}</dt>
                  <dd>
                    {k === "Effort" && m.effortDefault
                      ? m.effortLevels!.map((l, i) => (
                          <span key={l}>{i > 0 && " · "}{l === m.effortDefault ? <strong title="Default">{l}</strong> : l}</span>
                        ))
                      : v}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {m.effortDefault && <p className={styles.hint}>Bold is the effort used when a request doesn&apos;t set <code>reasoning_effort</code>.</p>}

          <CapList caps={m.capabilities} />

          <section className={styles.section} aria-labelledby="model-drawer-uptime">
            <div className={styles.sectionHead}>
              <h3 id="model-drawer-uptime" className={styles.sectionTitle}>Success rate</h3>
              <div className={styles.toggle} role="group" aria-label="Time range">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={range === r.id}
                    className={`${styles.toggleBtn}${range === r.id ? ` ${styles.toggleOn}` : ""}`}
                    onClick={() => setRange(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {isLoading && <div className={styles.skeleton} />}
            {isError && <p className={styles.hint}>The history couldn&apos;t be loaded. Try again in a minute.</p>}
            {history && (
              series ? (
                <>
                  <p className={styles.rate}>
                    {series.rate === null
                      ? `No requests in ${phrase}.`
                      : <><strong className={styles[`rate_${band(series.rate)}`]}>{fmtRate(series.rate)}</strong> of requests got an answer in {phrase}.</>}
                  </p>
                  <Strip s={series} h={history} label={m.name} />
                  <div className={styles.axis} aria-hidden><span>{range === "24h" ? "24h ago" : "7d ago"}</span><span>now</span></div>
                </>
              ) : (
                <p className={styles.hint}>No history for this model yet.</p>
              )
            )}
            <p className={styles.hint}>Requests turned away for bad input or usage limits aren&apos;t counted. A grey slot means nobody used the model then.</p>
          </section>

          <section className={styles.section} aria-labelledby="model-drawer-code">
            <h3 id="model-drawer-code" className={styles.sectionTitle}>Use it</h3>
            <p className={styles.hint}>Set <code>ADO_API_KEY</code> to your key from the dashboard, then run this.</p>
            <CodeTabs snippets={snippets} />
          </section>
        </div>

        <div className={styles.foot}>
          <Link to={`/playground?model=${encodeURIComponent(m.id)}`} className={styles.primary}>
            Try it in the Playground <ArrowRight size={14} />
          </Link>
          <Link to="/docs" className={styles.secondary}>Docs</Link>
        </div>
      </div>
    </div>
  );
}
