import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Copy, Check, Eye, EyeOff, RefreshCw, AlertTriangle,
  Activity, Shield, BookOpen, Zap, Terminal,
  Lock, ChevronRight, Code,
} from "lucide-react";
import { useCurrentKey, useRawKey, fetchFlashKeyOnce, useMe, useKeyUsageHistory } from "../api/queries";
import { useRotateKey, useDeleteAccount } from "../api/mutations";
import { useUiStore } from "../stores/ui-store";
import { API_BASE_URL } from "../config";
import styles from "./Dashboard.module.scss";

const PROXY_BASE = API_BASE_URL;
const BANNER_KEY = "beta_strip_dismissed";

function BetaBanner() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(BANNER_KEY));
  if (!visible) return null;
  return (
    <div className={styles.betaBanner}>
      <span className={styles.betaDot} />
      <span className={styles.betaText}>
        ADO is in early access. You may run into rough edges. Report anything off in the Discord.
      </span>
      <button
        className={styles.betaDismiss}
        onClick={() => { localStorage.setItem(BANNER_KEY, "1"); setVisible(false); }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

const FEATURED_MODELS = [
  { id: "codebuddy/gemini-3.1-pro",  name: "Gemini 3.1 Pro",    cap: "Reasoning" },
  { id: "kiro/claude-sonnet-4.5",    name: "Claude Sonnet 4.5", cap: "Coding"    },
  { id: "codex/gpt-5.5",             name: "GPT-5.5",           cap: "General"   },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const fade = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.24, ease: "easeOut" as const } },
};

function fmt(n: number) { return String(n).padStart(2, "0"); }

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
  return `${fmt(h)}:${fmt(m)}:${fmt(s)}`;
}

function StatCards() {
  const { data } = useCurrentKey({ enabled: true });
  const countdown = useCountdown(data?.resetsAt);
  if (!data) return null;
  const pct = Math.min(100, Math.round((data.used / data.dailyLimit) * 100));
  const nearLimit = pct >= 80;

  return (
    <motion.div className={styles.statsRow} variants={fade}>
      {/* Daily Usage */}
      <div className={styles.statCell}>
        <span className={styles.statCellLabel}>Daily usage</span>
        <div className={styles.statCellMain}>
          <span className={nearLimit ? styles.statNumWarn : styles.statNum}>{data.used}</span>
          <span className={styles.statDenom}> / {data.dailyLimit}</span>
        </div>
        <div className={styles.statBar}>
          <div
            className={`${styles.statBarFill}${nearLimit ? ` ${styles.statBarWarn}` : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={styles.statSub}>{pct}% consumed today</span>
      </div>

      {/* Quota reset */}
      <div className={styles.statCell}>
        <span className={styles.statCellLabel}>Quota reset</span>
        <div className={styles.statCellMain}>
          <span className={styles.statMono}>{countdown}</span>
        </div>
        <span className={styles.statSub}>resets at UTC midnight</span>
      </div>

      {/* RPM */}
      {data.rpmLimit != null && (
        <div className={styles.statCell}>
          <span className={styles.statCellLabel}>Rate limit</span>
          <div className={styles.statCellMain}>
            <span className={styles.statNum}>{data.rpmUsed ?? 0}</span>
            <span className={styles.statDenom}> / {data.rpmLimit} rpm</span>
          </div>
          <span className={styles.statSub}>requests this minute</span>
        </div>
      )}

      {/* API status */}
      <div className={styles.statCell}>
        <span className={styles.statCellLabel}>API status</span>
        <div className={`${styles.statCellMain} ${styles.statStatusRow}`}>
          <span className={styles.statusDot} />
          <span className={styles.statNum}>LIVE</span>
        </div>
        <span className={styles.statSub}>all systems operational</span>
      </div>
    </motion.div>
  );
}

function KeyCard() {
  const { data: current, isLoading } = useCurrentKey({ enabled: true });
  const raw = useRawKey();
  const rotate = useRotateKey();
  const showToast = useUiStore((s) => s.showToast);
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  if (isLoading || !current) return null;

  const display = revealed && raw ? raw.key : current.keyPrefix + "…";

  function copy() {
    if (!raw) { showToast("Rotate your key to reveal it first."); return; }
    void navigator.clipboard.writeText(raw.key);
    setCopied(true);
    showToast("Key copied");
    setTimeout(() => setCopied(false), 1800);
  }

  function copyCurl() {
    if (!raw) { showToast("Rotate your key to reveal it first."); return; }
    const snippet = `curl ${PROXY_BASE}/chat/completions \\\n  -H "Authorization: Bearer ${raw.key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"codebuddy/gemini-3.1-pro","messages":[{"role":"user","content":"Hello!"}]}'`;
    void navigator.clipboard.writeText(snippet);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1800);
  }

  function doRotate() {
    rotate.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        setRevealed(true);
        showToast("New key ready. Copy it now.");
      },
    });
  }

  return (
    <motion.div className={styles.keyCard} variants={fade}>
      <div className={styles.keyCardGradient} />
      <div className={styles.keyCardInner}>
        <div className={styles.keyCardHead}>
          <div className={styles.keyCardHeadLeft}>
            <div className={styles.keyCardIcon}><Lock size={16} /></div>
            <div>
              <div className={styles.keyCardTitle}>Your API Key</div>
              <div className={styles.keyCardSub}>
                Created {new Date(current.createdAt).toLocaleDateString()}
                {current.lastUsedAt && ` · Last used ${new Date(current.lastUsedAt).toLocaleDateString()}`}
              </div>
            </div>
          </div>
          <div className={styles.keyCardActions}>
            {raw && (
              <button className={styles.actionBtn} onClick={() => setRevealed(r => !r)} title={revealed ? "Hide" : "Reveal"}>
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
            <button className={styles.actionBtn} onClick={copyCurl} title="Copy as cURL">
              {copiedCurl ? <Check size={14} /> : <Code size={14} />}
            </button>
            <button className={styles.actionBtn} onClick={copy} title="Copy key">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className={`${styles.keyDisplayWrap}${revealed && raw ? ` ${styles.keyDisplayWrapNew}` : ""}`}>
          <code className={styles.keyDisplay}>{display}</code>
        </div>

        {revealed && raw && (
          <p className={styles.keyNewBanner}>
            <Check size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
            New key. Copy it now, it won&apos;t be shown again.
          </p>
        )}

        {!raw && !confirming && (
          <p className={styles.keyNote}>Full key hidden. Rotate to reveal a new one.</p>
        )}

        {confirming ? (
          <div className={styles.rotateConfirm}>
            <p className={styles.rotateConfirmText}>
              <AlertTriangle size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
              Current key stops working immediately.
            </p>
            <div className={styles.rotateConfirmBtns}>
              <button className={styles.rotateBtnConfirm} onClick={doRotate} disabled={rotate.isPending}>
                <RefreshCw size={11} />
                {rotate.isPending ? "Rotating…" : "Confirm rotate"}
              </button>
              <button className={styles.rotateBtnCancel} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className={styles.rotateBtn} onClick={() => setConfirming(true)}>
            <RefreshCw size={12} />
            Rotate key
          </button>
        )}
      </div>
    </motion.div>
  );
}

function QuickStart() {
  const [copied, setCopied] = useState(false);
  const snippet = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey:  "YOUR_ADO_KEY",
  baseURL: "${PROXY_BASE}",
});

const res = await client.chat.completions.create({
  model:    "codebuddy/gemini-3.1-pro",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(res.choices[0].message.content);`;

  function copy() {
    void navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <motion.div className={styles.codeCard} variants={fade}>
      <div className={styles.codeCardHead}>
        <div className={styles.codeCardTitle}>
          <Terminal size={13} className={styles.codeCardIcon} />
          Quick Start
        </div>
        <button className={styles.codeCopyBtn} onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className={styles.codeBlock}>{snippet}</pre>
    </motion.div>
  );
}

function UsageChart() {
  const { data, isSuccess } = useKeyUsageHistory();
  if (!isSuccess) return null;

  const allZero = !data || data.every((d) => d.used === 0);
  if (allZero) {
    return (
      <motion.div className={styles.usageCard} variants={fade}>
        <div className={styles.usageCardHead}>
          <Activity size={12} className={styles.usageCardIcon} />
          <span className={styles.usageCardTitle}>Usage — Last 30 Days</span>
        </div>
        <div className={styles.usageEmpty}>No usage yet</div>
      </motion.div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.used), 1);

  return (
    <motion.div className={styles.usageCard} variants={fade}>
      <div className={styles.usageCardHead}>
        <Activity size={12} className={styles.usageCardIcon} />
        <span className={styles.usageCardTitle}>Usage — Last 30 Days</span>
      </div>
      <div className={styles.usageChartBars}>
        {data.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.used}`}
            className={styles.usageBar}
            style={{
              background: `rgba(236,168,214,${0.15 + 0.7 * (d.used / maxVal)})`,
              height: `${Math.max(4, (d.used / maxVal) * 100)}%`,
            }}
          />
        ))}
      </div>
      <div className={styles.usageChartDate}>{data.at(-1)?.day ?? ""}</div>
    </motion.div>
  );
}

function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();

  function handleConfirm() {
    deleteAccount.mutate(undefined, {
      onSuccess: () => navigate("/login"),
    });
  }

  if (confirming) {
    return (
      <div className={styles.deleteRow}>
        <span className={styles.deleteConfirmText}>Delete your account permanently?</span>
        <div className={styles.deleteConfirmBtns}>
          <button
            className={styles.deleteConfirmBtn}
            onClick={handleConfirm}
            disabled={deleteAccount.isPending}
          >
            {deleteAccount.isPending ? "Deleting…" : "Delete"}
          </button>
          <button className={styles.deleteCancelBtn} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.deleteRow}>
      <button className={styles.deleteBtn} onClick={() => setConfirming(true)}>
        Delete account
      </button>
    </div>
  );
}

export function Dashboard() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  useEffect(() => { void fetchFlashKeyOnce(qc); }, [qc]);

  return (
    <div className={styles.page}>
      <motion.div className={styles.inner} variants={stagger} initial="hidden" animate="show">

        <BetaBanner />

        {/* ── Header ── */}
        <motion.div className={styles.header} variants={fade}>
          <div className={styles.headerLeft}>
            <div className={styles.devConsoleBadge}>
              <Zap size={11} className={styles.devConsoleIcon} />
              Developer Console
            </div>
            <h1 className={styles.pageTitle}>API Management</h1>
            <p className={styles.pageSubtitle}>
              Manage access keys for {me?.user.email ?? "your account"}.
            </p>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.healthCard}>
              <div className={styles.healthIcon}>
                <Activity size={16} className={styles.healthActivity} />
              </div>
              <div>
                <div className={styles.healthLabel}>Network health</div>
                <div className={styles.healthStatus}>All systems live</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Stats row ── */}
        <StatCards />

        {/* ── Usage chart ── */}
        <UsageChart />

        {/* ── Main grid ── */}
        <div className={styles.mainGrid}>
          {/* Left column */}
          <div className={styles.leftCol}>
            <KeyCard />
            <QuickStart />
          </div>

          {/* Right sidebar */}
          <div className={styles.rightCol}>

            {/* Featured models */}
            <motion.div className={styles.sideCard} variants={fade}>
              <div className={styles.sideCardHead}>
                <Zap size={12} className={styles.sideCardIcon} />
                <span className={styles.sideCardTitle}>Featured Models</span>
              </div>
              <div className={styles.modelList}>
                {FEATURED_MODELS.map(m => (
                  <div key={m.id} className={styles.modelRow}>
                    <div>
                      <div className={styles.modelName}>{m.name}</div>
                      <code className={styles.modelId}>{m.id}</code>
                    </div>
                    <span className={styles.modelCap}>{m.cap}</span>
                  </div>
                ))}
                <Link to="/models" className={styles.modelsSeeAll}>
                  All models <ChevronRight size={11} />
                </Link>
              </div>
            </motion.div>

            {/* Quick links */}
            <motion.div className={styles.sideCard} variants={fade}>
              <div className={styles.sideCardHead}>
                <BookOpen size={12} className={styles.sideCardIcon} />
                <span className={styles.sideCardTitle}>Resources</span>
              </div>
              <div className={styles.linkGrid}>
                {[
                  { to: "/docs",       icon: BookOpen,  label: "Docs"       },
                  { to: "/playground", icon: Terminal,  label: "Playground" },
                  { to: "/models",     icon: Zap,       label: "Models"     },
                ].map(({ to, icon: Icon, label }) => (
                  <Link key={to} to={to} className={styles.linkGridItem}>
                    <Icon size={13} />
                    {label}
                  </Link>
                ))}
              </div>
            </motion.div>

            {/* Security */}
            <motion.div className={styles.sideCard} variants={fade}>
              <div className={styles.sideCardHead}>
                <Shield size={12} className={styles.sideCardIcon} />
                <span className={styles.sideCardTitle}>Security Console</span>
              </div>
              <ul className={styles.securityList}>
                <li>
                  <div className={styles.securityBullet}><Lock size={10} /></div>
                  <p>Never share your key or expose it in client-side code.</p>
                </li>
                <li>
                  <div className={styles.securityBullet}><Shield size={10} /></div>
                  <p>Rotate immediately if you suspect your key leaked.</p>
                </li>
              </ul>
            </motion.div>

          </div>
        </div>
        {/* ── Delete account ── */}
        <DeleteAccount />

      </motion.div>
    </div>
  );
}
