import { useState } from "react";
import { useCurrentKey, useRawKey } from "../api/queries";
import { useRotateKey } from "../api/mutations";
import { useUiStore } from "../stores/ui-store";
import styles from "./KeyCard.module.scss";

export function KeyCard() {
  const { data: current, isLoading } = useCurrentKey({ enabled: true });
  const raw = useRawKey();
  const rotate = useRotateKey();
  const showToast = useUiStore((s) => s.showToast);
  const [revealed, setRevealed] = useState(false);

  if (isLoading) return <div className={styles.card}>Loading key…</div>;
  if (!current) return <div className={styles.card}>No key yet.</div>;

  const display = revealed && raw ? raw.key : current.keyPrefix + "…";

  return (
    <div className={styles.card}>
      <h2 className={styles.title}>Your ADO Key</h2>
      <code className={styles.key}>{display}</code>
      <div className={styles.row}>
        {raw && (
          <button onClick={() => setRevealed((r) => !r)}>
            {revealed ? "Hide" : "Reveal"}
          </button>
        )}
        <button
          disabled={!raw}
          onClick={() => {
            if (!raw) return;
            void navigator.clipboard.writeText(raw.key);
            showToast("Copied!");
          }}
        >
          Copy
        </button>
        <button
          className={styles.rotate}
          disabled={rotate.isPending}
          onClick={() => {
            if (!confirm("Rotate your key? The current key will stop working.")) return;
            rotate.mutate(undefined, {
              onSuccess: () => { setRevealed(true); showToast("Key rotated."); },
            });
          }}
        >
          {rotate.isPending ? "Rotating…" : "Rotate"}
        </button>
      </div>
      {!raw && <p className={styles.note}>Raw key is only available right after issuance or rotation. Hit Rotate to get a fresh one.</p>}
    </div>
  );
}
