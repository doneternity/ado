import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, Zap, Clock, Cpu } from "lucide-react";
import { DISCORD_INVITE_URL } from "../config";
import { useCatalog, useMe } from "../api/queries";
import styles from "./Pricing.module.scss";

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: "easeOut" as const },
};

type Plan = {
  id: string;
  name: string;
  price: string;
  period?: string;
  // "available" plans can be signed up for; "soon" plans are shown dimmed.
  status: "available" | "soon";
  badge?: string;
  features?: string[];
  teaser?: string;
  cta: { label: string; to: string } | { label: string; href: string };
};

// Add paid tiers here. Each entry renders as one card, in order.
const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/month",
    status: "available",
    badge: "Current",
    features: [
      "Every model on the models page",
      "OpenAI-compatible API",
      "Streaming via SSE",
      "Instant key generation",
      "Quota resets at UTC midnight",
      "Key rotation any time",
    ],
    cta: { label: "Get your free key", to: "/sign-up" },
  },
  {
    id: "pro",
    name: "Pro",
    price: "TBD",
    status: "soon",
    badge: "Soon",
    teaser: "Higher daily limits, priority routing, team key management, and usage analytics.",
    cta: { label: "Get notified on Discord", href: DISCORD_INVITE_URL },
  },
];

const STATS = [
  { icon: Clock, value: "UTC 00:00", label: "daily reset" },
  { icon: Zap,   value: "<30s",      label: "to first request" },
];

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "What models can I access?",
    a: <>Check out our <Link to="/models">models page</Link> for the full list. It updates live, so it always shows exactly what you can call right now.</>,
  },
  {
    q: "How does the rate limiting work?",
    a: "Rate limits are applied per API key. Each API call (chat, embeddings, images, audio, and so on) counts as one request, regardless of token length or streaming. Calls that fail upstream are refunded. Your daily quota resets at UTC midnight and is shown on your dashboard.",
  },
  {
    q: "Will ADO always be free?",
    a: "The current tier is free while we're in early access. Paid plans with higher limits, priority routing, and team features are planned, and we intend to keep a free tier alongside them.",
  },
];

function PlanCard({ plan, signedIn }: { plan: Plan; signedIn: boolean }) {
  const soon = plan.status === "soon";
  // Signed-in users already have the free plan; send them to their key instead.
  const cta = signedIn && plan.id === "free" ? { label: "Go to your dashboard", to: "/dashboard" } : plan.cta;
  const ctaClass = soon ? styles.ctaWaitlist : styles.ctaFree;
  return (
    <div className={soon ? styles.cardPro : styles.cardFree}>
      <div className={styles.cardTop}>
        <div>
          <span className={soon ? styles.tierLabelPro : styles.tierLabel}>{plan.name}</span>
          <div className={styles.priceRow}>
            <span className={styles.priceAmount}>{plan.price}</span>
            {plan.period && <span className={styles.pricePeriod}>{plan.period}</span>}
          </div>
        </div>
        {plan.badge && <span className={soon ? styles.badgeSoon : styles.badge}>{plan.badge}</span>}
      </div>
      {plan.features && (
        <ul className={styles.features}>
          {plan.features.map((f) => (
            <li key={f} className={styles.feature}>
              <Check size={14} className={styles.checkIcon} />
              {f}
            </li>
          ))}
        </ul>
      )}
      {plan.teaser && <p className={styles.proTeaser}>{plan.teaser}</p>}
      {"to" in cta ? (
        <Link to={cta.to} className={ctaClass}>{cta.label}</Link>
      ) : (
        <a href={cta.href} target="_blank" rel="noopener noreferrer" className={ctaClass}>{cta.label}</a>
      )}
    </div>
  );
}

export function Pricing() {
  // The model count is live; it is left out until the list loads.
  const { count } = useCatalog();
  const { data: me } = useMe();
  const stats = count > 0
    ? [{ icon: Cpu, value: String(count), label: count === 1 ? "model available" : "models available" }, ...STATS]
    : STATS;

  return (
    <motion.div className={styles.page} {...fade}>

      {/* Hero */}
      <div className={styles.hero}>
        <h1 className={styles.headline}>simple<br />and honest.</h1>
        <p className={styles.lead}>
          No credit card. No waitlist. No tricks. Sign up and your key is ready in under 30 seconds.
        </p>
      </div>

      {/* Stats bar */}
      <div className={styles.statsRow}>
        {stats.map(({ icon: Icon, value, label }) => (
          <div key={label} className={styles.stat}>
            <Icon size={18} className={styles.statIcon} />
            <span className={styles.statValue}>{value}</span>
            <span className={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Tier cards */}
      <div className={styles.cards}>
        {PLANS.map((plan) => <PlanCard key={plan.id} plan={plan} signedIn={!!me} />)}
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
        {me ? (
          <>
            <h2 className={styles.ctaHeadline}>You&apos;re all set.</h2>
            <Link to="/dashboard" className={styles.ctaBtn}>Go to your dashboard</Link>
          </>
        ) : (
          <>
            <h2 className={styles.ctaHeadline}>Ready to start?</h2>
            <Link to="/sign-up" className={styles.ctaBtn}>Create free account</Link>
          </>
        )}
      </div>

    </motion.div>
  );
}
