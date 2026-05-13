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
  "50 chat completions per day",
  "All Gemini models (2.5 Flash, 2.5 Pro, 2.0, 1.5)",
  "OpenAI-compatible API",
  "Streaming via SSE",
  "Instant key generation",
  "Quota resets at UTC midnight",
  "Key rotation any time",
];

const STATS = [
  { icon: Zap,   value: "50",        label: "requests / day" },
  { icon: Cpu,   value: "6+",        label: "models available" },
  { icon: Clock, value: "UTC 00:00", label: "daily reset" },
  { icon: Globe, value: "global",    label: "gemini routing" },
];

const FAQ = [
  {
    q: "What counts as a request?",
    a: "Each call to /chat/completions counts as one request, regardless of token length or whether you use streaming. Calls to /models are always free and never counted.",
  },
  {
    q: "What happens when I hit the limit?",
    a: "You receive a 429 Too Many Requests with code QUOTA_EXCEEDED. Your quota resets automatically at 00:00 UTC the following day.",
  },
  {
    q: "Will there always be a free tier?",
    a: "Yes. The free tier is core to ADO's mission of making AI accessible. It will always exist.",
  },
  {
    q: "Which models are included?",
    a: "All Gemini models available through the Google AI API — including Gemini 2.5 Flash, 2.5 Pro, 2.0 Flash, 2.0 Flash-Lite, 1.5 Pro, and 1.5 Flash. See the models page for the full list.",
  },
  {
    q: "Can I use this in production?",
    a: "ADO is provided as-is with no uptime SLA. It's great for personal projects, hobby apps, and integration testing. For production workloads requiring higher limits or SLAs, wait for the Pro tier.",
  },
];

export function Pricing() {
  return (
    <motion.div className={styles.page} {...fade}>

      {/* Hero */}
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Pricing</span>
        <h1 className={styles.headline}>Free,<br />forever.</h1>
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
