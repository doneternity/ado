import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMe } from "../api/queries";
import { useLogout } from "../api/mutations";
import { Toast } from "./Toast";
import { Footer } from "./Footer";
import styles from "./Layout.module.scss";

const DARK_PAGES = new Set(["/dashboard", "/playground"]);

export function Layout({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const logout = useLogout();
  const { pathname } = useLocation();
  const isDark = DARK_PAGES.has(pathname);

  return (
    <div className={styles.frame}>
      <header className={styles.nav}>
        <Link to="/" className={styles.wordmark}>ADO</Link>
        <nav className={styles.navLinks}>
          <Link to="/models"     className={styles.navLink}>models</Link>
          <Link to="/docs"       className={styles.navLink}>docs</Link>
          <Link to="/pricing"    className={styles.navLink}>pricing</Link>
          <Link to="/playground" className={styles.navLink}>playground</Link>
        </nav>
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
      {!isDark && <Footer />}
      <Toast />
    </div>
  );
}
