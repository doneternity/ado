import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Copy, Check, Eye, EyeOff, RefreshCw,
  Activity, Shield, BookOpen, Zap, Terminal,
  BarChart3, ExternalLink,
} from "lucide-react";
import { useCurrentKey, useRawKey, fetchFlashKeyOnce, useMe } from "../api/queries";
import { useRotateKey } from "../api/mutations";
import { useUiStore } from "../stores/ui-store";
import styles from "./Dashboard.module.scss";

const PROXY_BASE = import.meta.env.VITE_PROXY_BASE_URL ?? "https://your-proxy-url/v1";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.26, ease: "easeOut" as const } },
};

function useCountdown(toIso: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!toIso) return "--:--:--";
  const diff = Math.max(0, new Date(toIso).getTime() - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function KeySection() {
  const { data: current, isLoading } = useCurrentKey({ enabled: true });
  const raw = useRawKey();
  const rotate = useRotateKey();
  const showToast = useUiStore((s) => s.showToast);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown(current?.resetsAt);

  if (isLoading || !current) return null;

  const pct = Math.min(100, Math.round((current.used / current.dailyLimit) * 100));
  const nearLimit = pct >= 80;
  const display = revealed && raw ? raw.key : current.keyPrefix + "…";

  function copy() {
    const text = raw?.key ?? current?.keyPrefix + "…";
    void navigator.clipboard.writeText(text);
    setCopied(true);
    showToast("Key copied");
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <>
      {/* Key card */}
      <motion.div className={styles.keyCard} variants={itemVariants}>
        <div className={styles.keyCardHeader}>
          <span className={styles.sectionEyebrow}>API Key</span>
          <div className={styles.keyActions}>
            {raw && (
              <button
                className={styles.iconBtn}
                onClick={() => setRevealed(r => !r)}
                title={revealed ? "Hide key" : "Reveal key"}
              >
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
            <button
              className={styles.iconBtn}
              onClick={copy}
              title="Copy key"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <code className={styles.keyDisplay}>{display}</code>

        {!raw && (
          <p className={styles.keyNote}>Raw key not visible — rotate to reveal a new one.</p>
        )}

        <div className={styles.keyMeta}>
          <span className={styles.keyMetaItem}>
            Created {new Date(current.createdAt).toLocaleDateString()}
          </span>
          {current.lastUsedAt && (
            <span className={styles.keyMetaItem}>
              Last used {new Date(current.lastUsedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <button
          className={styles.rotateBtn}
          disabled={rotate.isPending}
          onClick={() => {
            if (!confirm("Rotate key? The current key stops working immediately.")) return;
            rotate.mutate(undefined, {
              onSuccess: () => { setRevealed(true); showToast("New key ready — copy it now."); },
            });
          }}
        >
          <RefreshCw size={13} />
          {rotate.isPending ? "Rotating…" : "Rotate key"}
        </button>
      </motion.div>

      {/* Usage card */}
      <motion.div className={styles.usageCard} variants={itemVariants}>
        <div className={styles.usageRow}>
          <div>
            <span className={styles.sectionEyebrow}>Daily Usage</span>
            <div className={styles.usageCount}>
              <span className={nearLimit ? styles.usageWarn : styles.usageNum}>{current.used}</span>
              <span className={styles.usageOf}> / {current.dailyLimit}</span>
            </div>
          </div>
          <div className={styles.resetBox}>
            <span className={styles.resetLabel}>Resets in</span>
            <span className={styles.resetTimer}>{countdown}</span>
          </div>
        </div>
        <div className={styles.usageBarWrap}>
          <div
            className={`${styles.usageBar}${nearLimit ? ` ${styles.usageBarWarn}` : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className={styles.usagePct}>{pct}% used today</div>
      </motion.div>
    </>
  );
}

export function Dashboard() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  useEffect(() => { void fetchFlashKeyOnce(qc); }, [qc]);

  const firstName = me?.user.displayName?.split(" ")[0]?.toLowerCase();
  const greeting = firstName ? `welcome back, ${firstName}.` : "welcome back.";

  return (
    <div className={styles.page}>
      <motion.div
        className={styles.inner}
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div className={styles.header} variants={itemVariants}>
          <div className={styles.headerLeft}>
            <span className={styles.eyebrow}>
              <Activity size={12} />
              Dashboard
            </span>
            <h1 className={styles.greeting}>{greeting}</h1>
            <p className={styles.subtext}>
              {me?.user.email}
            </p>
          </div>
          <div className={styles.headerRight}>
            <span className={`${styles.roleBadge}${me?.user.role === "admin" ? ` ${styles.roleAdmin}` : ""}`}>
              {me?.user.role === "admin" ? "Admin" : "User"}
            </span>
          </div>
        </motion.div>

        {/* Main grid */}
        <div className={styles.mainGrid}>
          {/* Left column */}
          <div className={styles.leftCol}>
            <KeySection />

            {/* Quick start */}
            <motion.div className={styles.quickStartCard} variants={itemVariants}>
              <div className={styles.quickStartHeader}>
                <Terminal size={14} className={styles.quickStartIcon} />
                <span className={styles.sectionEyebrow}>Quick start</span>
              </div>
              <pre className={styles.codeSnippet}>{`import OpenAI from "openai";

const client = new OpenAI({
  apiKey:  "YOUR_ADO_KEY",
  baseURL: "${PROXY_BASE}",
});

const res = await client.chat.completions.create({
  model:    "[kmo]claude-opus-4.7",
  messages: [{ role: "user", content: "Hello!" }],
});`}</pre>
            </motion.div>
          </div>

          {/* Right sidebar */}
          <div className={styles.rightCol}>
            {/* Stats */}
            <motion.div className={styles.statsCard} variants={itemVariants}>
              <span className={styles.sectionEyebrow}>
                <BarChart3 size={12} />
                Overview
              </span>
              <div className={styles.statsList}>
                <div className={styles.statsRow}>
                  <span className={styles.statsLabel}>Role</span>
                  <span className={styles.statsValue}>{me?.user.role ?? "—"}</span>
                </div>
                <div className={styles.statsRow}>
                  <span className={styles.statsLabel}>Email verified</span>
                  <span className={styles.statsValue}>
                    {me?.user.emailVerified ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Navigate */}
            <motion.div className={styles.linksCard} variants={itemVariants}>
              <span className={styles.sectionEyebrow}>Explore</span>
              <div className={styles.linkList}>
                {[
                  { to: "/models",     icon: Zap,        label: "Models",     desc: "Browse available models" },
                  { to: "/docs",       icon: BookOpen,   label: "Docs",       desc: "API reference & examples" },
                  { to: "/playground", icon: Terminal,   label: "Playground", desc: "Test requests live" },
                ].map(({ to, icon: Icon, label, desc }) => (
                  <Link key={to} to={to} className={styles.linkItem}>
                    <div className={styles.linkIcon}><Icon size={14} /></div>
                    <div className={styles.linkText}>
                      <span className={styles.linkLabel}>{label}</span>
                      <span className={styles.linkDesc}>{desc}</span>
                    </div>
                    <ExternalLink size={11} className={styles.linkArrow} />
                  </Link>
                ))}
              </div>
            </motion.div>

            {/* Security */}
            <motion.div className={styles.securityCard} variants={itemVariants}>
              <div className={styles.securityHeader}>
                <Shield size={13} className={styles.securityIcon} />
                <span className={styles.sectionEyebrow}>Security</span>
              </div>
              <ul className={styles.securityList}>
                <li>Never share your key or commit it to version control.</li>
                <li>Rotate your key immediately if you suspect it leaked.</li>
                <li>Keys start with <code>ado-</code> and are shown once at creation.</li>
              </ul>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
