import { motion, useScroll, useSpring } from "framer-motion";
import styles from "./Layout.module.scss";

// Hairline under the header that fills as you read a long page.
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 32, restDelta: 0.001 });
  return <motion.div className={styles.scrollProgress} style={{ scaleX }} aria-hidden="true" />;
}
