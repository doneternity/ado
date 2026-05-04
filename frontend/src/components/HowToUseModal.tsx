import { useState } from "react";
import { useRawKey } from "../api/queries";
import { useUiStore } from "../stores/ui-store";
import styles from "./HowToUseModal.module.scss";

export function HowToUseModal() {
  const raw = useRawKey();
  const showToast = useUiStore((s) => s.showToast);
  const [open, setOpen] = useState(false);

  // For Foundation, the API URL is relative to the same origin.
  const apiURL = `${window.location.origin}/api/v1`;

  const copy = (txt: string, label: string) => {
    void navigator.clipboard.writeText(txt);
    showToast(label + " copied");
  };

  return (
    <>
      <button className={styles.trigger} onClick={() => setOpen(true)}>How to use this key</button>
      {open && (
        <div className={styles.backdrop} onClick={() => setOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>JanitorAI</h3>
            <p>Custom API → paste these:</p>
            <pre>API URL: {apiURL}{"\n"}API Key: {raw?.key ?? "(rotate to reveal)"}</pre>
            <button disabled={!raw} onClick={() => raw && copy(`API URL: ${apiURL}\nAPI Key: ${raw.key}`, "JanitorAI config")}>Copy JanitorAI config</button>

            <h3>SillyTavern</h3>
            <pre>Custom API{"\n"}API Url: {apiURL}{"\n"}API Key: {raw?.key ?? "(rotate to reveal)"}</pre>
            <button disabled={!raw} onClick={() => raw && copy(`Custom API\nAPI Url: ${apiURL}\nAPI Key: ${raw.key}`, "SillyTavern config")}>Copy SillyTavern config</button>

            <button className={styles.close} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
