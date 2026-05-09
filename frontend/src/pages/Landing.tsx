import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useMe } from "../api/queries";
import styles from "./Landing.module.scss";

export function Landing() {
  const { data: me } = useMe();

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>UNIFIED AI API // FREE GEMINI ACCESS</span>
          <h1 className={styles.headline}>one key.<br />every model.</h1>
          <p className={styles.lede}>
            ADO gives you a free OpenAI-compatible API key that routes directly to Google Gemini.
            Plug it into JanitorAI, SillyTavern, or any OpenAI client — no card, no signup friction,
            50 requests a day.
          </p>
          <span className={styles.testStrip}>https://ado.fly.dev/api/v1</span>
          <div className={styles.heroActions}>
            {me ? (
              <Link to="/dashboard" className={styles.primaryBtn}>Go to dashboard</Link>
            ) : (
              <>
                <Link to="/login" className={styles.primaryBtn}>Get your free key</Link>
                <Link to="/dashboard" className={styles.secondaryBtn}>View dashboard</Link>
              </>
            )}
          </div>
        </div>

        <div className={styles.terminalCol}>
          <div className={styles.terminalCard}>
            <div className={styles.terminalTop}>
              <span className={styles.terminalDot} />
              <span className={styles.terminalLabel}>ADO://BOOT</span>
            </div>
            <div className={styles.kineticWord}>
              {["A", "D", "O"].map((letter, i) => (
                <motion.span
                  key={letter}
                  animate={{ y: [0, -14, 0] }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>
            <div className={styles.bootLines}>
              {[
                "initializing ado runtime...",
                "connecting to gemini api...",
                "quota engine ready.",
                <><span className={styles.operational}>● SYSTEM OPERATIONAL</span><b className={styles.cursor}> _</b></>,
              ].map((line, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.4 + 0.2, duration: 0.45 }}
                >
                  {line}
                </motion.p>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.statsBar}>
          {[
            { label: "MODELS", value: "gemini-2.0+" },
            { label: "DAILY LIMIT", value: "50 req" },
            { label: "COMPATIBLE", value: "openai api" },
            { label: "PROVIDER", value: "google" },
            { label: "ACCESS", value: "free" },
            { label: "STATUS", value: <><span className={styles.statDot} />LIVE</> },
          ].map(({ label, value }) => (
            <div key={label} className={styles.statCell}>
              <span className={styles.statLabel}>{label}</span>
              <span className={styles.statValue}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <section className={styles.howSection}>
        <span className={styles.eyebrow}>HOW IT WORKS</span>
        <h2 className={styles.sectionHeadline}>three steps to unlimited ai.</h2>
        <div className={styles.stepsGrid}>
          {[
            {
              num: "01",
              title: "Sign up",
              desc: "Create a free account with email or Google. No credit card, no waitlist.",
            },
            {
              num: "02",
              title: "Get your key",
              desc: "Your ADO key is issued instantly. One key, valid forever.",
            },
            {
              num: "03",
              title: "Plug it in",
              desc: "Set the API URL to ado.fly.dev/api/v1 in JanitorAI or SillyTavern. Done.",
            },
          ].map(({ num, title, desc }) => (
            <div key={num} className={styles.stepCard}>
              <div className={styles.stepNum}>{num}</div>
              <div className={styles.stepTitle}>{title}</div>
              <p className={styles.stepDesc}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.ctaStrip}>
        <span className={styles.eyebrow}>IT'S FREE</span>
        <h2 className={styles.ctaHeadline}>start in 30 seconds.</h2>
        <Link to="/login" className={styles.ctaBtn}>Create free account</Link>
      </section>
    </div>
  );
}
