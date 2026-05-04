import { useEffect } from "react";
import { useUiStore } from "../stores/ui-store";
import styles from "./Toast.module.scss";

export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const hide = useUiStore((s) => s.hideToast);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(hide, 1800);
    return () => clearTimeout(id);
  }, [toast, hide]);
  if (!toast) return null;
  return <div className={styles.toast} key={toast.key}>{toast.message}</div>;
}
