import { Link } from "react-router-dom";
import styles from "./Footer.module.scss";

const DISCORD_URL =
  import.meta.env.VITE_DISCORD_INVITE_URL || "https://discord.com/invite/adoai";

type NavLink =
  | { name: string; to: string; href?: never }
  | { name: string; href: string; to?: never };

const NAV: Record<string, NavLink[]> = {
  Platform: [
    { name: "Models",     to: "/models" },
    { name: "Pricing",    to: "/pricing" },
    { name: "Playground", to: "/playground" },
    { name: "Dashboard",  to: "/dashboard" },
  ],
  Developers: [
    { name: "Documentation", to: "/docs" },
    { name: "API Reference",  to: "/docs" },
    { name: "Status",         to: "/status" },
  ],
  Company: [
    { name: "About",   to: "/docs" },
    { name: "Contact", href: DISCORD_URL },
  ],
  Legal: [
    { name: "Privacy", to: "/privacy" },
    { name: "Terms",   to: "/terms" },
  ],
};

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.grid}>
          <div className={styles.brandCol}>
            <Link to="/" className={styles.brandName}>ADO</Link>
            <p className={styles.brandDesc}>
              The AI API gateway. One OpenAI-compatible key that routes to Claude,
              Gemini, DeepSeek, and more. No card, no waitlist.
            </p>
          </div>

          {Object.entries(NAV).map(([heading, links]) => (
            <div key={heading} className={styles.linkCol}>
              <h3 className={styles.linkHeading}>{heading}</h3>
              <ul className={styles.linkList}>
                {links.map(l => (
                  <li key={l.name}>
                    {l.href ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className={styles.footLink}>{l.name}</a>
                    ) : (
                      <Link to={l.to!} className={styles.footLink}>{l.name}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.bottom}>
          <p className={styles.copy}>© {new Date().getFullYear()} ADO. All rights reserved.</p>
          <div className={styles.bottomRight}>
            <span className={styles.statusDot} />
            <span className={styles.statusText}>All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
