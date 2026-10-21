import { useSyncExternalStore } from "react";
import { CodeBlock } from "./CodeBlock";
import styles from "./CodeTabs.module.scss";

export type Lang = "curl" | "python" | "javascript";

export const LANGS: { id: Lang; label: string; hl: string }[] = [
  { id: "curl", label: "cURL", hl: "bash" },
  { id: "python", label: "Python", hl: "python" },
  { id: "javascript", label: "JavaScript", hl: "javascript" },
];

const LANG_KEY = "ado:snippet-lang";

// The chosen language is shared: picking Python in one block switches every
// block on the page, and the choice is remembered for next time.
let current: Lang | null = null;
const listeners = new Set<() => void>();

function getLang(): Lang {
  if (current) return current;
  try {
    const v = localStorage.getItem(LANG_KEY);
    current = LANGS.some(l => l.id === v) ? (v as Lang) : "curl";
  } catch {
    current = "curl";
  }
  return current;
}

function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* not remembered */ }
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// One snippet in each language, with tabs to switch between them.
export function CodeTabs({ snippets }: { snippets: Record<Lang, string> }) {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  const hl = LANGS.find(l => l.id === lang)!.hl;
  return (
    <div className={styles.wrap}>
      <div className={styles.tabs} role="tablist" aria-label="Language">
        {LANGS.map(l => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={l.id === lang}
            className={`${styles.tab}${l.id === lang ? ` ${styles.tabOn}` : ""}`}
            onClick={() => setLang(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <CodeBlock code={snippets[lang]} lang={hl} />
      </div>
    </div>
  );
}
