import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, Zap, Clock, Cpu, Globe } from "lucide-react";
import styles from "./Pricing.module.scss";

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

const FREE_FEATURES = [
  "Claude, Gemini, DeepSeek, and more",
  "OpenAI-compatible API",
  "Streaming via SSE",
  "Instant key generation",
  "Quota resets at UTC midnight",
  "Key rotation any time",
];

const STATS = [
  { icon: Cpu,   value: "20+",       label: "models available" },
  { icon: Globe, value: "2",         label: "providers" },
  { icon: Clock, value: "UTC 00:00", label: "daily reset" },
  { icon: Zap,   value: "instant",   label: "key generation" },
];

const FAQ = [
  {
    q: "What models can I access?",
    a: "Claude Opus 4.7 and 4.6, Gemini 3 Flash, Gemini 2.5 Pro, DeepSeek V4 Pro, Kimi K2, and more. See the models page for the full current list — we add new models as providers expand.",
  },
  {
    q: "How does the rate limiting work?",
    a: "Rate limits are applied per API key. Each call to /chat/completions counts as one request, regardless of token length or streaming. Your daily quota resets at UTC midnight and is shown on your dashboard.",
  },
  {
    q: "Will ADO always be free?",
    a: "The current tier is free while we're in early access. A Pro plan with higher limits, priority routing, and team features is coming. Free tier will remain available.",
  },
];

export function Pricing() {
  return (
    <motion.div className={styles.page} {...fade}>

      {/* Hero */}
      <div className={styles.hero}>
        <span className={styles.eyebrow}><span className={styles.eyebrowDash} />Pricing</span>
        <h1 className={styles.headline}>simple<br />and honest.</h1>
        <p className={styles.lead}>
          No credit card. No waitlist. No tricks. Sign up and your key is ready in under 30 seconds.
        </p>
      </div>

      {/* Stats bar */}
      <div className={styles.statsRow}>
        {STATS.map(({ icon: Icon, value, label }) => (
          <div key={label} className={styles.stat}>
            <Icon size={18} className={styles.statIcon} />
            <span className={styles.statValue}>{value}</span>
            <span className={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Tier cards */}
      <div className={styles.cards}>
        <div className={styles.cardFree}>
          <div className={styles.cardTop}>
            <div>
              <span className={styles.tierLabel}>Free</span>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>$0</span>
                <span className={styles.pricePeriod}>/month</span>
              </div>
            </div>
            <span className={styles.badge}>Current</span>
          </div>
          <ul className={styles.features}>
            {FREE_FEATURES.map((f) => (
              <li key={f} className={styles.feature}>
                <Check size={14} className={styles.checkIcon} />
                {f}
              </li>
            ))}
          </ul>
          <Link to="/login" className={styles.ctaFree}>Get your free key</Link>
        </div>

        <div className={styles.cardPro}>
          <div className={styles.cardTop}>
            <div>
              <span className={styles.tierLabelPro}>Pro</span>
              <div className={styles.priceRow}>
                <span className={styles.priceAmount}>TBD</span>
              </div>
            </div>
            <span className={styles.badgeSoon}>Soon</span>
          </div>
          <p className={styles.proTeaser}>
            Higher daily limits, priority routing, team key management, and usage analytics.
          </p>
          <button className={styles.ctaWaitlist} disabled>Join waitlist</button>
        </div>
      </div>

      {/* FAQ */}
      <div className={styles.faqSection}>
        <h2 className={styles.faqHeading}>Common questions</h2>
        <dl className={styles.faqList}>
          {FAQ.map(({ q, a }) => (
            <div key={q} className={styles.faqItem}>
              <dt className={styles.faqQ}>{q}</dt>
              <dd className={styles.faqA}>{a}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Bottom CTA */}
      <div className={styles.bottomCta}>
        <h2 className={styles.ctaHeadline}>Ready to start?</h2>
        <Link to="/login" className={styles.ctaBtn}>Create free account</Link>
        <Link to="/playground" className={styles.ctaSecondary}>Try playground first</Link>
      </div>

    </motion.div>
  );
}
