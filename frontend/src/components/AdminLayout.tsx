import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import styles from "./AdminLayout.module.scss";

const TABS = [
  { label: "Overview",    path: "/admin",             icon: "⚡" },
  { label: "Providers",   path: "/admin/providers",   icon: "🔌" },
  { label: "Users",       path: "/admin/users",       icon: "👥" },
  { label: "Usage",       path: "/admin/usage",       icon: "📊" },
  { label: "Quotas",      path: "/admin/quotas",      icon: "🎛" },
  { label: "Errors",      path: "/admin/errors",      icon: "⚠️" },
  { label: "Maintenance", path: "/admin/maintenance", icon: "🔧" },
] as const;

export function AdminLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  return (
    <div className={styles.frame}>
      <div className={styles.topNav}>
        <div className={styles.tabBar}>
          <span className={styles.wordmark}>ADO</span>
          <span className={styles.badge}>admin</span>
          {TABS.map((tab) => {
            const exact = tab.path === "/admin";
            const active = exact ? pathname === tab.path : pathname.startsWith(tab.path);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`${styles.tab}${active ? ` ${styles.tabActive}` : ""}`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
          <Link to="/dashboard" className={styles.backLink}>← dashboard</Link>
        </div>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
