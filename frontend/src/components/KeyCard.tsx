import { useState } from "react";
import { Copy, Check, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useCurrentKey, useRawKey } from "../api/queries";
import { useRotateKey } from "../api/mutations";
import { useUiStore } from "../stores/ui-store";
import { Skeleton } from "./Skeleton";
import styles from "./KeyCard.module.scss";

export function KeyCard() {
  const { data: current, isLoading } = useCurrentKey({ enabled: true });
  const raw = useRawKey();
  const rotate = useRotateKey();
  const showToast = useUiStore((s) => s.showToast);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className={styles.card}>
        <Skeleton height="0.7rem" width="6rem" />
        <Skeleton height="2rem" />
        <div className={styles.skeletonRow}>
          <Skeleton height="2.2rem" width="40%" />
          <Skeleton height="2.2rem" width="30%" />
        </div>
      </div>
    );
  }

  if (!current) return null;

  const display = revealed && raw ? raw.key : current.keyPrefix + "…";

  async function copy() {
    if (!raw) {
      showToast("Rotate your key to reveal it, then copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(raw.key);
      setCopied(true);
      showToast("Key copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("Couldn't access clipboard");
    }
  }

  return (
    <div className={styles.card}>
      <span className={styles.title}>Your ADO key</span>

      <div className={styles.keyWrap}>
        <code className={styles.key}>{display}</code>
        {raw && (
          <button
            className={styles.revealBtn}
            onClick={() => setRevealed((r) => !r)}
            title={revealed ? "Hide key" : "Show key"}
            aria-label={revealed ? "Hide key" : "Show key"}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>

      {/* Primary action */}
      <button className={styles.copyBtn} onClick={copy}>
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "Copied!" : "Copy key"}
      </button>

      {/* Danger zone */}
      <div className={styles.danger}>
        <button
          className={styles.rotateBtn}
          disabled={rotate.isPending}
          onClick={() => {
            if (!confirm("Rotate key? The current key stops working immediately.")) return;
            rotate.mutate(undefined, {
              onSuccess: () => { setRevealed(true); showToast("New key ready. Copy it now."); },
            });
          }}
        >
          <RefreshCw size={13} />
          {rotate.isPending ? "Rotating…" : "Rotate key"}
        </button>
        {!raw && (
          <span className={styles.note}>
            Raw key not visible. Rotate to reveal a new one.
          </span>
        )}
      </div>
    </div>
  );
}
