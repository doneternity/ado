import { useState, useEffect } from "react";
import { useMe } from "../api/queries";
import { useDialog } from "./useDialog";
import styles from "./BetaModal.module.scss";

function ackKey(userId: string) {
  return `beta_ack_${userId}`;
}

export function BetaModal() {
  const { data: me, isLoading } = useMe();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isLoading || !me) return;
    if (!localStorage.getItem(ackKey(me.user.id))) {
      setShow(true);
    }
  }, [me, isLoading]);

  function acknowledge() {
    if (!me) return;
    localStorage.setItem(ackKey(me.user.id), "1");
    setShow(false);
  }

  // Escape acknowledges, same as the button.
  const dialogRef = useDialog<HTMLDivElement>(show, acknowledge);

  if (!show) return null;

  return (
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="beta-modal-title">
        <span className={styles.eyebrow}>Early Access</span>
        <h2 id="beta-modal-title" className={styles.headline}>heads up.</h2>
        <p className={styles.body}>
          ADO is still in early access. You may run into rough edges, brief outages,
          or features that aren&apos;t fully baked yet.
        </p>
        <p className={styles.body}>
          We&apos;re active in the community and quick to fix things. Don&apos;t hesitate to report anything that feels off.
        </p>
        <button className={styles.ackBtn} onClick={acknowledge}>
          I understand, let me in
        </button>
      </div>
    </div>
  );
}
