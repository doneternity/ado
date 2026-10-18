import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_#$%&*";
const DURATION_MS = 700;

// Shows `text`; whenever it changes, characters cycle through random glyphs
// and lock in left to right. Spaces and "…" are left as they are.
export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [out, setOut] = useState(text);
  const first = useRef(true);

  useEffect(() => {
    // No animation on first render or for reduced motion.
    if (first.current || reduced) {
      first.current = false;
      setOut(text);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      const locked = Math.floor(p * text.length);
      let s = text.slice(0, locked);
      for (let i = locked; i < text.length; i++) {
        const c = text[i]!;
        s += c === " " || c === "…" ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setOut(s);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, reduced]);

  return <span className={className} aria-label={text}><span aria-hidden="true">{out}</span></span>;
}
