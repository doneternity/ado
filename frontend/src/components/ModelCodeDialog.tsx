import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { API_BASE_URL } from "../config";
import { CodeTabs, LANGS } from "./CodeTabs";
import type { Lang } from "./CodeTabs";
import { useDialog } from "./useDialog";
import styles from "./ModelCodeDialog.module.scss";

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

export function ModelCodeDialog({ model, onClose }: { model: { id: string; name: string }; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose);
  const snippets = Object.fromEntries(LANGS.map(l => [l.id, snippetFor(l.id, model.id)])) as Record<Lang, string>;

  return (
    <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog} ref={ref} role="dialog" aria-modal="true" aria-labelledby="model-code-title">
        <div className={styles.head}>
          <div>
            <h2 id="model-code-title" className={styles.title}>Use {model.name}</h2>
            <p className={styles.sub}>
              Set <code>ADO_API_KEY</code> to your key from the dashboard, then run this.
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <CodeTabs snippets={snippets} />

        <div className={styles.foot}>
          <Link to={`/playground?model=${encodeURIComponent(model.id)}`} className={styles.footLink}>Try it in the Playground</Link>
          <Link to="/docs" className={styles.footLink}>More examples in the docs</Link>
        </div>
      </div>
    </div>
  );
}
