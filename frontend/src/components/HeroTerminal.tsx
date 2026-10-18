import { useEffect, useState } from "react";
import { useSampleModel } from "../api/queries";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import styles from "./HeroTerminal.module.scss";

// Demo conversations. Purely illustrative: nothing here calls the API.
const SCRIPTS = [
  {
    prompt: "Explain recursion in one sentence.",
    answer: "Recursion is when a function solves a problem by calling itself on a smaller piece of it, until the piece is simple enough to answer directly.",
  },
  {
    prompt: "What can I do with one API key?",
    answer: "Chat in SillyTavern or JanitorAI, power your own app, and try models side by side in the Playground, all with the same key.",
  },
  {
    prompt: "Write a haiku about routing.",
    answer: "One key in the dark,\nevery model within reach,\none line to change.",
  },
];

const WORD_MS = 70;
const PAUSE_MS = 2600;

export function HeroTerminal() {
  const model = useSampleModel();
  const reduced = usePrefersReducedMotion();
  const [scriptIdx, setScriptIdx] = useState(0);
  const [shown, setShown] = useState(0); // words of the answer shown so far

  const script = SCRIPTS[scriptIdx] ?? SCRIPTS[0]!;
  const words = script.answer.split(" ");
  const done = reduced || shown >= words.length;

  useEffect(() => {
    if (reduced) return;
    const t = done
      ? setTimeout(() => { setScriptIdx((i) => (i + 1) % SCRIPTS.length); setShown(0); }, PAUSE_MS)
      : setTimeout(() => setShown((n) => n + 1), WORD_MS);
    return () => clearTimeout(t);
  }, [reduced, done, shown]);

  const text = reduced ? script.answer : words.slice(0, shown).join(" ");

  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.bar}>
        <span className={styles.dots}><i /><i /><i /></span>
        <span className={styles.barLabel}>POST /v1/chat/completions</span>
        <span className={styles.live}><span className={styles.liveDot} />stream</span>
      </div>
      <div className={styles.body}>
        <div className={styles.req}>
          <span className={styles.key}>&quot;model&quot;</span>: <span className={styles.str}>&quot;{model}&quot;</span>
        </div>
        <div className={styles.prompt}>
          <span className={styles.caret}>&gt;</span> {script.prompt}
        </div>
        <p className={styles.answer}>
          {text}
          {!done && <span className={styles.cursor} />}
        </p>
      </div>
      <div className={styles.foot}>
        <span>{done ? "data: [DONE]" : "data: {\"delta\": …}"}</span>
        <span>OpenAI-compatible</span>
      </div>
    </div>
  );
}
