import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMe } from "../api/queries";
import { useLogout } from "../api/mutations";
import { Toast } from "./Toast";
import { Footer } from "./Footer";
import { BetaModal } from "./BetaModal";
import styles from "./Layout.module.scss";
import betaStyles from "./BetaModal.module.scss";

const DARK_PAGES = new Set(["/dashboard", "/playground", "/admin"]);
const HERO_PAGES = new Set(["/"]);

export function Layout({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const logout = useLogout();
  const { pathname } = useLocation();
  const isDark = DARK_PAGES.has(pathname) || pathname.startsWith("/admin");
  const isHero = HERO_PAGES.has(pathname);

  const [scrolled, setScrolled] = useState(false);
  const [slotsFull, setSlotsFull] = useState(false);
  const [showSlotsModal, setShowSlotsModal] = useState(false);

  useEffect(() => {
    if (!isHero) { setScrolled(true); return; }
    setScrolled(window.scrollY > 20);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHero]);

  useEffect(() => {
    if (me) return;
    const ctrl = new AbortController();
    fetch((import.meta.env.VITE_API_BASE_URL ?? "") + "/api/slots", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { full?: boolean } | null) => setSlotsFull(Boolean(d?.full)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [me]);

  return (
    <div className={styles.frame}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : styles.headerTop}`}>
        <nav className={styles.nav}>
          <Link to="/" className={styles.wordmark}>ADO</Link>
          <div className={styles.navLinks}>
            <Link to="/models"     className={styles.navLink}>Models</Link>
            <Link to="/docs"       className={styles.navLink}>Docs</Link>
            <Link to="/pricing"    className={styles.navLink}>Pricing</Link>
            <Link to="/status"     className={styles.navLink}>Status</Link>
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
              <>
                <Link to="/login" className={styles.navLink}>Sign in</Link>
                <Link
                  to="/sign-up"
                  className={styles.getStarted}
                  onClick={slotsFull ? (e) => { e.preventDefault(); setShowSlotsModal(true); } : undefined}
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="main-content" className={`${styles.shell}${isHero ? ` ${styles.shellHero}` : ""}`}>{children}</main>

      <nav className={styles.mobileBottomNav}>
        <Link to="/models"     className={`${styles.mobileNavItem}${pathname === "/models"     ? ` ${styles.mobileNavActive}` : ""}`}>Models</Link>
        <Link to="/docs"       className={`${styles.mobileNavItem}${pathname === "/docs"       ? ` ${styles.mobileNavActive}` : ""}`}>Docs</Link>
        <Link to="/pricing"    className={`${styles.mobileNavItem}${pathname === "/pricing"    ? ` ${styles.mobileNavActive}` : ""}`}>Pricing</Link>
        <Link to="/playground" className={`${styles.mobileNavItem}${pathname === "/playground" ? ` ${styles.mobileNavActive}` : ""}`}>Play</Link>
        <Link to={me ? "/dashboard" : "/sign-up"} className={`${styles.mobileNavItem} ${styles.mobileNavCta}`}>
          {me ? "Dash" : "Sign up"}
        </Link>
      </nav>

      {!isDark && <Footer />}
      <BetaModal />
      <Toast />
      {showSlotsModal && (
        <div className={betaStyles.backdrop} onClick={() => setShowSlotsModal(false)}>
          <div className={betaStyles.modal} onClick={(e) => e.stopPropagation()}>
            <span className={betaStyles.eyebrow}>Access Limited</span>
            <h2 className={betaStyles.headline}>plan is full.</h2>
            <p className={betaStyles.body}>
              All free-tier slots are taken. Join our Discord server to get notified when a spot opens up.
            </p>
            <a
              href={import.meta.env.VITE_DISCORD_INVITE_URL || "https://discord.com/invite/adoai"}
              target="_blank"
              rel="noopener noreferrer"
              className={betaStyles.discordBtn}
            >
              Join Discord
            </a>
            <button className={betaStyles.ackBtn} onClick={() => setShowSlotsModal(false)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
