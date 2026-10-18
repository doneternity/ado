import { motion } from "framer-motion";
import styles from "./WordReveal.module.scss";

type Line = { text: string; className?: string };

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const word = {
  hidden: { y: "110%" },
  show: { y: "0%", transition: { duration: 0.8, ease: EASE } },
};

// Headline whose words slide up out of a mask one after another. Uses the
// "hidden"/"show" variants, so it animates with a parent's whileInView, or on
// its own when standalone is set. Screen readers get the plain text.
export function WordReveal({
  lines,
  className,
  standalone = false,
}: {
  lines: Line[];
  className?: string;
  standalone?: boolean;
}) {
  const label = lines.map((l) => l.text).join(" ");
  const own = standalone
    ? { initial: "hidden", whileInView: "show", viewport: { once: true, margin: "-5% 0px" } }
    : {};

  return (
    <motion.h2 className={className} variants={container} aria-label={label} {...own}>
      {lines.map((line, li) => (
        <span key={li} className={`${styles.line} ${line.className ?? ""}`} aria-hidden="true">
          {line.text.split(" ").map((w, wi) => (
            <span key={wi} className={styles.mask}>
              <motion.span className={styles.word} variants={word}>{w}</motion.span>
            </span>
          ))}
        </span>
      ))}
    </motion.h2>
  );
}
