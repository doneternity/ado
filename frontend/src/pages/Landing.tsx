import { useState, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useCatalog, useMe, useSampleModel } from "../api/queries";
import { HeroTerminal } from "../components/HeroTerminal";
import { RoutingCanvas } from "../components/RoutingCanvas";
import { usePrefersReducedMotion } from "../components/usePrefersReducedMotion";
import { ModelMarquee } from "../components/ModelMarquee";
import { WordReveal } from "../components/WordReveal";
import styles from "./Landing.module.scss";

const WORDS = ["build", "ship", "connect", "deploy", "create"];

const STEPS = [
  {
    number: "01",
    title: "Sign up",
    subtitle: "for free",
    description: "Join with your Discord account. No credit card, no waitlist. Your ADO key is issued instantly.",
  },
  {
    number: "02",
    title: "Route",
    subtitle: "your requests",
    description: "Set your OpenAI base URL to the ADO endpoint. Every model we serve works through that one key.",
  },
  {
    number: "03",
    title: "Build",
    subtitle: "anything",
    description: "Plug it into JanitorAI, SillyTavern, or your own code. Switch models without changing a single line.",
  },
];

// Short, true-of-the-provider descriptions for the "What we route" cards. The
// cards themselves only appear for providers the live model list includes.
const PROVIDER_BLURB: Partial<Record<string, { tagline: string; tags: string[] }>> = {
  DeepSeek:  { tagline: "Open-weight reasoning and code", tags: ["Reasoning", "Code", "Open weights"] },
  Google:    { tagline: "Long context and multimodal",    tags: ["Multimodal", "Long context"] },
  OpenAI:    { tagline: "General-purpose flagship models", tags: ["General", "Tool use"] },
  Anthropic: { tagline: "Careful reasoning and writing",  tags: ["Reasoning", "Writing"] },
  xAI:       { tagline: "Grok models",                    tags: ["General"] },
  "Z.ai":        { tagline: "GLM models for coding and agents", tags: ["Code", "Agents"] },
  "Moonshot AI": { tagline: "Kimi models",                      tags: ["General", "Code"] },
};

const EASE = [0.22, 1, 0.36, 1] as const;
const VP   = { once: true, margin: "-5% 0px" } as const;

const fadeUp = {
  hidden: { opacity: 0, y: 52, filter: "blur(5px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)",
            transition: { duration: 0.9, ease: EASE } },
};
const fadeIn = {
  hidden: { opacity: 0, scale: 0.96 },
  show:   { opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE } },
};
const stagger14 = { hidden: {}, show: { transition: { staggerChildren: 0.11, delayChildren: 0.04 } } };
const stagger10 = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };

export function Landing() {
  const { data: me } = useMe();
  const sampleModel = useSampleModel();
  const catalog = useCatalog();
  // Provider-neutral wording until the live list is in (or when it can't be read).
  const routesTo = catalog.providerNames ? `ADO routes your requests to ${catalog.providerNames}` : "ADO routes your requests to the right upstream";
  const [mounted, setMounted] = useState(false);
  const [wordIdx, setWordIdx] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [activeRegion, setActiveRegion] = useState(0);
  const regionCount = catalog.providers.length;
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => { setMounted(true); }, []);

  // Cursor spotlight: written straight to CSS variables so moving the mouse
  // doesn't re-render the page.
  const heroRef = useRef<HTMLElement>(null);
  function moveSpotlight(e: ReactPointerEvent<HTMLElement>) {
    const el = heroRef.current;
    if (!el || e.pointerType === "touch" || reducedMotion) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
    el.style.setProperty("--spot-on", "1");
  }
  function hideSpotlight() {
    heroRef.current?.style.setProperty("--spot-on", "0");
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setWordVisible(false);
      setTimeout(() => {
        setWordIdx(i => (i + 1) % WORDS.length);
        setWordVisible(true);
      }, 300);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep(s => (s + 1) % STEPS.length);
      setStepKey(k => k + 1);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (regionCount < 2) return;
    const timer = setInterval(() => {
      setActiveRegion(r => (r + 1) % regionCount);
    }, 3000);
    return () => clearInterval(timer);
  }, [regionCount]);

  function selectStep(i: number) {
    setActiveStep(i);
    setStepKey(k => k + 1);
  }

  return (
    <div className={styles.page}>

      {/* ─── HERO ──────────────────────────────────────── */}
      <section className={styles.hero} ref={heroRef} onPointerMove={moveSpotlight} onPointerLeave={hideSpotlight}>
        <div className={styles.heroBg} aria-hidden="true">
          <RoutingCanvas className={styles.heroBgCanvas} />
          <div className={styles.heroBgOverlayH} />
          <div className={styles.heroBgOverlayV} />
        </div>

        <div className={styles.heroGrid} aria-hidden="true">
          {[...Array(8)].map((_, i) => (
            <div key={`h${i}`} className={styles.heroGridH} style={{ top: `${12.5 * (i + 1)}%` }} />
          ))}
          {[...Array(12)].map((_, i) => (
            <div key={`v${i}`} className={styles.heroGridV} style={{ left: `${8.33 * (i + 1)}%` }} />
          ))}
        </div>
        {/* Same grid in the accent colour, revealed only around the cursor. */}
        <div className={styles.heroGridGlow} aria-hidden="true" />

        <div className={styles.heroInner}>
          <div className={`${styles.heroContent} ${mounted ? styles.heroContentIn : ""}`}>
            <h1 className={styles.heroHeadline}>
              <span className={styles.heroHeadlineLine1}>The intelligence</span>
              <span className={styles.heroHeadlineLine2}>
                to{" "}
                <span
                  className={styles.heroWord}
                  style={{ opacity: wordVisible ? 1 : 0, transform: wordVisible ? "translateY(0)" : "translateY(8px)" }}
                >
                  {WORDS[wordIdx]}
                </span>
                {" "}anywhere
              </span>
            </h1>
            <div className={styles.heroCtas}>
              <Link to={me ? "/dashboard" : "/sign-up"} className={styles.heroCtaPrimary}>
                {me ? "Go to your dashboard" : "Get your free key"}
              </Link>
              <Link to="/docs" className={styles.heroCtaSecondary}>Read the docs</Link>
            </div>
          </div>
          <div className={`${styles.heroAside} ${mounted ? styles.heroAsideIn : ""}`}>
            <HeroTerminal />
          </div>
        </div>

        <div className={`${styles.heroStats} ${mounted ? styles.heroStatsIn : ""}`}>
          <div className={styles.heroStatsInner}>
            {[
              catalog.count > 0
                ? { value: String(catalog.count), label: catalog.count === 1 ? "model available" : "models available" }
                : { value: "/v1", label: "OpenAI-compatible API" },
              { value: "1",      label: "key for all of them" },
              { value: "Free",   label: "no credit card" },
            ].map(({ value, label }) => (
              <div key={label} className={styles.heroStat}>
                <span className={styles.heroStatValue}>{value}</span>
                <span className={styles.heroStatLabel}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ModelMarquee />

      {/* ─── FEATURES ──────────────────────────────────── */}
      <section className={styles.featSection} id="features">
        <div className={styles.container}>
          <motion.div
            className={styles.sectionHeader}
            variants={stagger14}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            <motion.div className={styles.sectionHeaderLeft} variants={fadeUp}>
              <WordReveal className={styles.displayHeadline} lines={[{ text: "Compatible" }, { text: "with everything.", className: styles.dim }]} />
            </motion.div>
            <motion.p className={styles.sectionDesc} variants={fadeUp}>
              Drop-in OpenAI replacement. No SDK changes, no vendor lock-in.
              Route to the best model for each request.
            </motion.p>
          </motion.div>

          <motion.div
            className={styles.featCard}
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            <div className={styles.featCardLeft}>
              <span className={styles.cardNum}>01</span>
              <h3 className={styles.featCardTitle}>Unified Routing</h3>
              <p className={styles.featCardDesc}>
                One key. Every model. {routesTo}. Transparently.
                No client-side changes needed.
              </p>
              {catalog.count > 0 && (
                <div>
                  <span className={styles.bigStat}>{catalog.count}</span>
                  <span className={styles.bigStatLabel}>{catalog.count === 1 ? "model" : "models"} on one key</span>
                </div>
              )}
            </div>
            <div className={styles.featCardRight}>
              <pre className={styles.codeBlock}>{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://adoai.space/v1",
  apiKey: "your-ado-key",
});

const res = await client.chat.completions.create({
  model: "${sampleModel}",
  messages: [{ role: "user", content: "Hello!" }],
});`}</pre>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ──────────────────────────────── */}
      <section className={styles.howSection} id="how-it-works">
        <div className={styles.howImgPanel} aria-hidden="true">
          <img src="/img-how.webp" alt="" width={1920} height={1080} loading="lazy" decoding="async" />
        </div>
        <div className={styles.howAmbient} aria-hidden="true" />
        <div className={styles.container}>
          <div className={styles.howTop}>
            {/* Eyebrow slides in from left */}
            <motion.h2
              className={styles.howHeadline}
              variants={stagger14}
              initial="hidden"
              whileInView="show"
              viewport={VP}
            >
              <motion.span className={styles.howLine1} variants={fadeUp}>Sign up.</motion.span>
              <motion.span className={styles.howLine2} variants={fadeUp}>Route.</motion.span>
              <motion.span className={styles.howLine3} variants={fadeUp}>Build.</motion.span>
            </motion.h2>
          </div>

          <motion.div
            className={styles.howSteps}
            variants={stagger10}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            {STEPS.map((step, i) => {
              const isActive = activeStep === i;
              return (
                <motion.button
                  key={step.number}
                  type="button"
                  onClick={() => selectStep(i)}
                  className={`${styles.stepCard} ${isActive ? styles.stepCardActive : ""}`}
                  variants={fadeUp}
                >
                  <div className={styles.stepCardTop}>
                    <span className={`${styles.stepNum} ${isActive ? styles.stepNumActive : ""}`}>
                      {step.number}
                    </span>
                    <div className={styles.stepProgressTrack}>
                      {isActive && <div key={stepKey} className={styles.stepProgressBar} />}
                    </div>
                  </div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <span className={styles.stepSubtitle}>{step.subtitle}</span>
                  <p className={`${styles.stepDesc} ${isActive ? styles.stepDescActive : ""}`}>
                    {step.description}
                  </p>
                  <div className={`${styles.stepBottomLine} ${isActive ? styles.stepBottomLineActive : ""}`} />
                </motion.button>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ─── INFRASTRUCTURE ────────────────────────────── */}
      <section className={styles.infraSection}>
        <div className={styles.container}>
          <div className={styles.infraTop}>
            <motion.div
              className={styles.infraTitleRow}
              variants={stagger14}
              initial="hidden"
              whileInView="show"
              viewport={VP}
            >
              <WordReveal className={styles.displayHeadline} lines={[{ text: "One endpoint," }, { text: "everywhere.", className: styles.dim }]} />
              <motion.p className={styles.infraDesc} variants={fadeUp}>
                One endpoint for every model. When a model is served by more than one
                upstream, ADO fails over automatically if one of them goes down.
              </motion.p>
            </motion.div>
          </div>

          <motion.div
            className={styles.infraGrid}
            variants={stagger14}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            <motion.div className={styles.infraBigCard} variants={fadeUp}>
              <div className={styles.infraSvgWrap} aria-hidden="true">
                <svg className={styles.infraSvg}>
                  <defs>
                    <style>{`
                      @keyframes drawLine {
                        0%   { stroke-dashoffset: 1000; opacity: 0; }
                        15%  { opacity: 1; }
                        70%  { opacity: 0.7; }
                        100% { stroke-dashoffset: 0; opacity: 0; }
                      }
                      .ado-line {
                        stroke: #eca8d6;
                        stroke-width: 1.2;
                        fill: none;
                        stroke-dasharray: 1000;
                        animation: drawLine 3s ease-in-out infinite;
                      }
                    `}</style>
                  </defs>
                  {[...Array(19)].map((_, r) => {
                    const y1 = 10 + 25 * Math.floor(r / 5);
                    const y2 = 10 + 25 * Math.floor((r + 1) / 5);
                    return (
                      <line
                        key={r}
                        x1={`${10 + (r % 5) * 20}%`} y1={`${y1}%`}
                        x2={`${10 + ((r + 1) % 5) * 20}%`} y2={`${y2}%`}
                        className="ado-line"
                        style={{ animationDelay: `${0.15 * r}s` }}
                      />
                    );
                  })}
                  {[...Array(20)].map((_, r) => (
                    <circle
                      key={r}
                      cx={`${10 + (r % 5) * 20}%`}
                      cy={`${10 + 25 * Math.floor(r / 5)}%`}
                      r="3" fill="#eca8d6"
                      className={styles.infraDot}
                      style={{ animationDelay: `${0.1 * r}s` }}
                    />
                  ))}
                </svg>
              </div>
              <div className={styles.infraBigNum}>
                <span className={styles.infraBigValue}>{catalog.count > 0 ? catalog.count : 1}</span>
                <span className={styles.infraBigSuffix}>{catalog.count > 0 ? (catalog.count === 1 ? "model" : "models") : "key"}</span>
              </div>
              <p className={styles.infraBigLabel}>
                {catalog.providerNames ? `From ${catalog.providerNames}, behind one key.` : "Every model we serve, behind one key."}
              </p>
            </motion.div>

            <motion.div className={styles.infraSmallCards} variants={stagger14}>
              <motion.div className={styles.infraSmallCard} variants={fadeUp}>
                <span className={styles.infraSmallValue}>Failover</span>
                <span className={styles.infraSmallLabel}>Across providers</span>
              </motion.div>
              <motion.div className={styles.infraSmallCard} variants={fadeUp}>
                <span className={styles.infraSmallValue}>SSE</span>
                <span className={styles.infraSmallLabel}>Streaming responses</span>
              </motion.div>
            </motion.div>
          </motion.div>

          {regionCount > 0 && (
            <motion.div
              className={styles.providerGrid}
              variants={stagger10}
              initial="hidden"
              whileInView="show"
              viewport={VP}
            >
              {catalog.providers.map((p, i) => (
                <motion.div
                  key={p.provider}
                  className={`${styles.providerCard} ${activeRegion === i ? styles.providerCardActive : ""}`}
                  variants={fadeIn}
                >
                  <div className={styles.providerCardTop}>
                    <span className={`${styles.providerDot} ${activeRegion === i ? styles.providerDotActive : ""}`} />
                    <span className={styles.providerStatus}>{p.status}</span>
                  </div>
                  <span className={styles.providerName}>{p.name}</span>
                  <span className={styles.providerNodes}>
                    {p.models.length} model{p.models.length === 1 ? "" : "s"}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* ─── DEVELOPERS ────────────────────────────────── */}
      <section className={styles.devSection} id="developers">
        <div className={styles.devImgPanel} aria-hidden="true">
          <img src="/img-dev.webp" alt="" width={1920} height={1080} loading="lazy" decoding="async" />
        </div>
        <div className={styles.container}>
          <motion.div
            className={styles.devHeader}
            variants={stagger14}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            <WordReveal className={styles.displayHeadline} lines={[{ text: "Code your app." }, { text: "Or use any client.", className: styles.dim }]} />
          </motion.div>

          <div className={styles.devGrid}>
            <motion.p
              className={styles.devDesc}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={VP}
            >
              Two config lines. Every existing OpenAI call routes through ADO
              to any model you choose, with streaming, and tool use where the model supports it.
            </motion.p>
            <motion.div
              className={styles.devFeatures}
              variants={stagger10}
              initial="hidden"
              whileInView="show"
              viewport={VP}
            >
              {[
                { title: "OpenAI-compatible", desc: "Drop-in replacement. No SDK changes needed." },
                { title: "Streaming",          desc: "Real-time token streaming out of the box." },
                { title: "Switch in one line", desc: "Change the model name. Same key, same code." },
                { title: "Works everywhere",   desc: "JanitorAI, SillyTavern, your own app." },
              ].map((f) => (
                <motion.div key={f.title} className={styles.devFeature} variants={fadeUp}>
                  <h3 className={styles.devFeatureTitle}>{f.title}</h3>
                  <p className={styles.devFeatureDesc}>{f.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ─── PORTFOLIO / MODELS ────────────────────────── */}
      <section className={styles.portSection} id="models">
        <div className={styles.container}>
          <motion.div
            className={styles.portHeader}
            variants={stagger14}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            <WordReveal className={styles.displayHeadline} lines={[{ text: "What we" }, { text: "route.", className: styles.dim }]} />
          </motion.div>

          <motion.div
            className={styles.portGrid}
            variants={stagger14}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            {catalog.providers.map((p, i) => {
              const blurb = PROVIDER_BLURB[p.name];
              const shown = p.models.slice(0, 3);
              const more = p.models.length - shown.length;
              return (
                // A plain motion.div around the Link: motion.create(Link) cards could get
                // stuck invisible mid-animation, leaving this section looking empty.
                <motion.div key={p.provider} className={styles.portCell} variants={fadeUp}>
                  <Link to="/models" className={styles.portCard}>
                    <div className={styles.portCardTop}>
                      <span className={styles.portCardId}>{String(i + 1).padStart(2, "0")}</span>
                      <svg className={styles.portArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M7 7h10v10" /><path d="M7 17 17 7" />
                      </svg>
                    </div>
                    <h3 className={styles.portCardName}>{p.name}</h3>
                    {blurb && <p className={styles.portCardTagline}>{blurb.tagline}</p>}
                    <p className={styles.portCardDesc}>
                      {shown.join(", ")}{more > 0 ? `, and ${more} more` : ""}.
                    </p>
                    {blurb && (
                      <div className={styles.portTags}>
                        {blurb.tags.map(t => <span key={t} className={styles.portTag}>{t}</span>)}
                      </div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
            <motion.div className={styles.portCell} variants={fadeUp}>
              <Link to="/models" className={`${styles.portCard} ${styles.portCardComingSoon}`}>
                <span className={styles.comingSoonLabel}>{catalog.count > 0 ? `All ${catalog.count} models` : "Every model"}</span>
                <p className={styles.comingSoonDesc}>Context sizes, capabilities and live status on the models page.</p>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
