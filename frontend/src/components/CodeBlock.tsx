import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { highlight } from "./highlight";
import styles from "./CodeBlock.module.scss";

const TOKENS = {
  comment: styles.tokComment,
  string: styles.tokString,
  key: styles.tokKey,
  keyword: styles.tokKeyword,
  number: styles.tokNumber,
  flag: styles.tokFlag,
};

// Copies text and shows a tick for a moment. Clipboard access can be refused
// (permissions, insecure context), in which case nothing changes.
export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => { /* refused: leave the button as it is */ },
    );
  }
  return [copied, copy];
}

// A highlighted code block with its language and a copy button.
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, copy] = useCopy();
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{lang || "text"}</span>
        <button type="button" className={styles.codeCopy} onClick={() => copy(code)} aria-label="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className={styles.pre}><code>{highlight(code, lang, TOKENS)}</code></pre>
    </div>
  );
}
