import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMe } from "../api/queries";
import { useLogout } from "../api/mutations";
import { Toast } from "./Toast";
import { Footer } from "./Footer";
import { BetaModal } from "./BetaModal";
import styles from "./Layout.module.scss";

const DARK_PAGES = new Set(["/dashboard", "/playground", "/admin"]);
const HERO_PAGES = new Set(["/"]);

export function Layout({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const logout = useLogout();
  const { pathname } = useLocation();
  const isDark = DARK_PAGES.has(pathname) || pathname.startsWith("/admin");
  const isHero = HERO_PAGES.has(pathname);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isHero) { setScrolled(true); return; }
    setScrolled(window.scrollY > 20);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHero]);

  return (
    <div className={styles.frame}>
      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : styles.headerTop}`}>
        <nav className={styles.nav}>
          <Link to="/" className={styles.wordmark}>ADO</Link>
          <div className={styles.navLinks}>
            <Link to="/models"     className={styles.navLink}>Models</Link>
            <Link to="/docs"       className={styles.navLink}>Docs</Link>
            <Link to="/pricing"    className={styles.navLink}>Pricing</Link>
            <Link to="/playground" className={styles.navLink}>Playground</Link>
          </div>
          <div className={styles.actions}>
            {me ? (
              <>
                <span className={styles.email}>{me.user.email}</span>
                <Link to="/dashboard" className={styles.navLink}>Dashboard</Link>
                {me.user.role === "admin" && (
                  <Link to="/admin" className={styles.navLink} style={{ color: "var(--accent)" }}>Admin</Link>
                )}
                <button
                  className={styles.signOut}
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className={styles.getStarted}>Get started</Link>
            )}
          </div>
        </nav>
      </header>

      <div className={`${styles.shell}${isHero ? ` ${styles.shellHero}` : ""}`}>{children}</div>

      <nav className={styles.mobileBottomNav}>
        <Link to="/models"     className={`${styles.mobileNavItem}${pathname === "/models"     ? ` ${styles.mobileNavActive}` : ""}`}>Models</Link>
        <Link to="/docs"       className={`${styles.mobileNavItem}${pathname === "/docs"       ? ` ${styles.mobileNavActive}` : ""}`}>Docs</Link>
        <Link to="/pricing"    className={`${styles.mobileNavItem}${pathname === "/pricing"    ? ` ${styles.mobileNavActive}` : ""}`}>Pricing</Link>
        <Link to="/playground" className={`${styles.mobileNavItem}${pathname === "/playground" ? ` ${styles.mobileNavActive}` : ""}`}>Play</Link>
        <Link to={me ? "/dashboard" : "/login"} className={`${styles.mobileNavItem} ${styles.mobileNavCta}`}>
          {me ? "Dash" : "Sign in"}
        </Link>
      </nav>

      {!isDark && <Footer />}
      <BetaModal />
      <Toast />
    </div>
  );
}
