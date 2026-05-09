import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMe } from "../api/queries";
import { useLogout } from "../api/mutations";
import { Toast } from "./Toast";
import styles from "./Layout.module.scss";

export function Layout({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <div className={styles.frame}>
      <header className={styles.nav}>
        <Link to="/" className={styles.wordmark}>ADO</Link>
        <div className={styles.actions}>
          {me ? (
            <>
              <span className={styles.email}>{me.user.email}</span>
              <Link to="/dashboard" className={styles.navLink}>dashboard</Link>
              <button
                className={styles.signOut}
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                sign out
              </button>
            </>
          ) : (
            <Link to="/login" className={styles.getStarted}>get started</Link>
          )}
        </div>
      </header>
      <div className={styles.shell}>{children}</div>
      <Toast />
    </div>
  );
}
