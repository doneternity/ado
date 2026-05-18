import { useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { useRawKey } from "../api/queries";
import { useUiStore } from "../stores/ui-store";
import styles from "./HowToUseModal.module.scss";

type Tab = "janitor" | "sillytavern" | "generic";

const TABS: { id: Tab; label: string }[] = [
  { id: "janitor",    label: "JanitorAI" },
  { id: "sillytavern", label: "SillyTavern" },
  { id: "generic",    label: "Generic" },
];

function CopyField({ label, value, disabled }: { label: string; value: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldRow}>
        <code className={`${styles.fieldValue}${disabled ? ` ${styles.dimmed}` : ""}`}>{value}</code>
        <button className={styles.copyBtn} onClick={copy} disabled={disabled} title="Copy">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export function HowToUseModal() {
  const raw = useRawKey();
  const showToast = useUiStore((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("janitor");

  const apiURL = import.meta.env.VITE_PROXY_BASE_URL ?? `${window.location.origin}/api/v1`;
  const keyDisplay = raw?.key ?? "rotate key to reveal";
  const noKey = !raw;

  function copyAll() {
    if (!raw) return;
    let text = "";
    if (tab === "janitor") {
      text = `API URL: ${apiURL}\nAPI Key: ${raw.key}`;
    } else if (tab === "sillytavern") {
      text = `API URL: ${apiURL}\nAPI Key: ${raw.key}`;
    } else {
      text = `Base URL: ${apiURL}\nAuthorization: Bearer ${raw.key}`;
    }
    void navigator.clipboard.writeText(text);
    showToast("Config copied");
  }

  if (!open) {
    return (
      <button className={styles.trigger} onClick={() => setOpen(true)}>
        How to use this key
      </button>
    );
  }

  return (
    <div className={styles.backdrop} onClick={() => setOpen(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>How to use your key</span>
          <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`${styles.tab}${tab === t.id ? ` ${styles.tabActive}` : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.tabContent}>
          {tab === "janitor" && (
            <>
              <p className={styles.hint}>
                In JanitorAI: <strong>Settings → AI → Custom API</strong>, then paste these values:
              </p>
              <CopyField label="API URL" value={apiURL} />
              <CopyField label="API Key" value={keyDisplay} disabled={noKey} />
            </>
          )}
          {tab === "sillytavern" && (
            <>
              <p className={styles.hint}>
                In SillyTavern: <strong>API Connections → Chat Completion</strong>, choose <strong>Custom (OpenAI compatible)</strong>:
              </p>
              <CopyField label="API URL" value={apiURL} />
              <CopyField label="API Key" value={keyDisplay} disabled={noKey} />
            </>
          )}
          {tab === "generic" && (
            <>
              <p className={styles.hint}>
                Drop-in replacement for OpenAI. Set the base URL and Authorization header:
              </p>
              <CopyField label="Base URL" value={apiURL} />
              <CopyField label="Authorization" value={noKey ? "Bearer " + keyDisplay : `Bearer ${keyDisplay}`} disabled={noKey} />
            </>
          )}

          {noKey && (
            <p className={styles.warning}>
              Your raw key is only visible once at creation or rotation. Hit <strong>Rotate</strong> on the key card to get a fresh one.
            </p>
          )}
        </div>

        <div className={styles.modalFoot}>
          <button className={styles.copyAll} onClick={copyAll} disabled={noKey}>
            <Copy size={13} />
            Copy all settings
          </button>
        </div>
      </div>
    </div>
  );
}
