import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useMe } from "../api/queries";
import styles from "./Landing.module.scss";

const WORDS = ["build", "ship", "connect", "deploy", "create"];

const STEPS = [
  {
    number: "01",
    title: "Sign up",
    subtitle: "for free",
    description: "Join with your Discord account. No credit card, no waitlist — your ADO key is issued instantly.",
  },
  {
    number: "02",
    title: "Route",
    subtitle: "your requests",
    description: "Set your OpenAI base URL to the ADO endpoint. Every model — Claude, Gemini, DeepSeek — through one key.",
  },
  {
    number: "03",
    title: "Build",
    subtitle: "anything",
    description: "Plug it into JanitorAI, SillyTavern, or your own code. Switch models without changing a single line.",
  },
];

const REGIONS = [
  { name: "Anthropic", nodes: 4, status: "operational" },
  { name: "Google",    nodes: 2, status: "operational" },
  { name: "DeepSeek",  nodes: 3, status: "operational" },
  { name: "OpenAI",    nodes: 0, status: "coming soon" },
];

// Bluesminds-exact animation config
const EASE = [0.16, 1, 0.3, 1] as const;
const VP   = { once: true, margin: "-8% 0px" } as const;

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: 0.6, ease: EASE } },
};
const slideLeft = {
  hidden: { opacity: 0, x: -32 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.75, ease: EASE } },
};
const stagger14 = { hidden: {}, show: { transition: { staggerChildren: 0.14 } } };
const stagger10 = { hidden: {}, show: { transition: { staggerChildren: 0.10 } } };

const MotionLink = motion.create(Link);

export function Landing() {
  const { data: me } = useMe();
  const [mounted, setMounted] = useState(false);
  const [wordIdx, setWordIdx] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [activeRegion, setActiveRegion] = useState(1);

  useEffect(() => { setMounted(true); }, []);

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
    const timer = setInterval(() => {
      setActiveRegion(r => (r + 1) % REGIONS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  function selectStep(i: number) {
    setActiveStep(i);
    setStepKey(k => k + 1);
  }

  return (
    <div className={styles.page}>

      {/* ─── HERO ──────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroBg} aria-hidden="true">
          <video className={styles.heroBgVideo} autoPlay muted loop playsInline>
            <source src="/hero-bg.mp4" type="video/mp4" />
          </video>
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
          </div>
        </div>

        <div className={`${styles.heroStats} ${mounted ? styles.heroStatsIn : ""}`}>
          <div className={styles.heroStatsInner}>
            {[
              { value: "20+",    label: "models available" },
              { value: "2.4B+",  label: "requests routed" },
              { value: "99.99%", label: "uptime" },
            ].map(({ value, label }) => (
              <div key={label} className={styles.heroStat}>
                <span className={styles.heroStatValue}>{value}</span>
                <span className={styles.heroStatLabel}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

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
              <h2 className={styles.displayHeadline}>
                Compatible<br />
                <span className={styles.dim}>with everything.</span>
              </h2>
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
                One key. Every model. ADO routes your requests to Claude, Gemini,
                DeepSeek, and more — transparently. No client-side changes needed.
              </p>
              <div>
                <span className={styles.bigStat}>20+</span>
                <span className={styles.bigStatLabel}>models on one key</span>
              </div>
            </div>
            <div className={styles.featCardRight}>
              <pre className={styles.codeBlock}>{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://adoai.space/v1",
  apiKey: "your-ado-key",
});

const res = await client.chat.completions.create({
  model: "claude-opus-4-6",
  messages: [{ role: "user", content: "Hello!" }],
});`}</pre>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ──────────────────────────────── */}
      <section className={styles.howSection} id="how-it-works">
        <div className={styles.howImgPanel} aria-hidden="true">
          <img src="/img-how.jpg" alt="" />
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
              <motion.h2 className={styles.displayHeadline} variants={fadeUp}>
                One endpoint,<br />
                <span className={styles.dim}>everywhere.</span>
              </motion.h2>
              <motion.p className={styles.infraDesc} variants={fadeUp}>
                ADO runs a redundant routing layer across multiple providers — engineered
                so one provider going down never takes your app with it.
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
                      style={{ animation: `pulse 2s ease-in-out ${0.1 * r}s infinite` }}
                    />
                  ))}
                </svg>
              </div>
              <div className={styles.infraBigNum}>
                <span className={styles.infraBigValue}>20</span>
                <span className={styles.infraBigSuffix}>+ models</span>
              </div>
              <p className={styles.infraBigLabel}>Routing nodes across all major providers.</p>
            </motion.div>

            <motion.div className={styles.infraSmallCards} variants={stagger14}>
              <motion.div className={styles.infraSmallCard} variants={fadeUp}>
                <span className={styles.infraSmallValue}>99.99%</span>
                <span className={styles.infraSmallLabel}>Uptime SLA</span>
              </motion.div>
              <motion.div className={styles.infraSmallCard} variants={fadeUp}>
                <span className={styles.infraSmallValue}>&lt;50ms</span>
                <span className={styles.infraSmallLabel}>Time to first token</span>
              </motion.div>
            </motion.div>
          </motion.div>

          <motion.div
            className={styles.providerGrid}
            variants={stagger10}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            {REGIONS.map((r, i) => (
              <motion.div
                key={r.name}
                className={`${styles.providerCard} ${activeRegion === i ? styles.providerCardActive : ""}`}
                variants={fadeIn}
              >
                <div className={styles.providerCardTop}>
                  <span className={`${styles.providerDot} ${activeRegion === i ? styles.providerDotActive : ""}`} />
                  <span className={styles.providerStatus}>{r.status}</span>
                </div>
                <span className={styles.providerName}>{r.name}</span>
                <span className={styles.providerNodes}>
                  {r.nodes > 0 ? `${r.nodes} model${r.nodes === 1 ? "" : "s"}` : "Not yet available"}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── DEVELOPERS ────────────────────────────────── */}
      <section className={styles.devSection} id="developers">
        <div className={styles.devImgPanel} aria-hidden="true">
          <img src="/img-dev.jpg" alt="" />
        </div>
        <div className={styles.container}>
          <motion.div
            className={styles.devHeader}
            variants={stagger14}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            <motion.h2 className={styles.displayHeadline} variants={fadeUp}>
              Code your app.<br />
              <span className={styles.dim}>Or use any client.</span>
            </motion.h2>
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
              to any model you choose — with streaming, tool use, and vision.
            </motion.p>
            <motion.div
              className={styles.devFeatures}
              variants={stagger10}
              initial="hidden"
              whileInView="show"
              viewport={VP}
            >
              {[
                { title: "OpenAI-compatible", desc: "Drop-in replacement — no SDK changes needed." },
                { title: "Streaming",          desc: "Real-time token streaming out of the box." },
                { title: "All major models",   desc: "Claude, Gemini, DeepSeek, and more." },
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
            <motion.h2 className={styles.displayHeadline} variants={fadeUp}>
              What we<br />
              <span className={styles.dim}>route.</span>
            </motion.h2>
          </motion.div>

          <motion.div
            className={styles.portGrid}
            variants={stagger14}
            initial="hidden"
            whileInView="show"
            viewport={VP}
          >
            {[
              {
                id: "01",
                name: "Anthropic Claude",
                tagline: "State-of-the-art reasoning and vision",
                desc: "claude-opus-4-6 and claude-opus-4-5 — frontier reasoning, vision, and long-context analysis, available through one ADO key.",
                tags: ["Reasoning", "Vision", "Tool use", "Streaming"],
                href: "/models",
              },
              {
                id: "02",
                name: "Google Gemini",
                tagline: "Long context and multimodal AI",
                desc: "gemini-2.5-pro and gemini-3.1-pro-preview — Google's most capable models, with a 1M-token context window.",
                tags: ["Multimodal", "Long context", "Fast"],
                href: "/models",
              },
              {
                id: "03",
                name: "DeepSeek",
                tagline: "High-performance open reasoning",
                desc: "deepseek-v4-pro and DeepSeek V3.2 — open-weight models with exceptional reasoning and code generation.",
                tags: ["Reasoning", "Code", "Open weights"],
                href: "/models",
              },
            ].map((p) => (
              <MotionLink
                key={p.id}
                to={p.href}
                className={styles.portCard}
                variants={fadeUp}
              >
                <div className={styles.portCardTop}>
                  <span className={styles.portCardId}>{p.id}</span>
                  <svg className={styles.portArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 7h10v10" /><path d="M7 17 17 7" />
                  </svg>
                </div>
                <h3 className={styles.portCardName}>{p.name}</h3>
                <p className={styles.portCardTagline}>{p.tagline}</p>
                <p className={styles.portCardDesc}>{p.desc}</p>
                <div className={styles.portTags}>
                  {p.tags.map(t => <span key={t} className={styles.portTag}>{t}</span>)}
                </div>
              </MotionLink>
            ))}
            <motion.div
              className={`${styles.portCard} ${styles.portCardComingSoon}`}
              variants={fadeUp}
            >
              <span className={styles.comingSoonLabel}>More coming</span>
              <p className={styles.comingSoonDesc}>New providers added regularly. Free, no waitlist.</p>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
