import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Zap, Plug, Users, BarChart2, SlidersHorizontal, AlertTriangle, Wrench } from "lucide-react";
import styles from "./AdminLayout.module.scss";

const TABS = [
  { label: "Overview",    path: "/admin",             Icon: Zap },
  { label: "Providers",   path: "/admin/providers",   Icon: Plug },
  { label: "Users",       path: "/admin/users",       Icon: Users },
  { label: "Usage",       path: "/admin/usage",       Icon: BarChart2 },
  { label: "Quotas",      path: "/admin/quotas",      Icon: SlidersHorizontal },
  { label: "Errors",      path: "/admin/errors",      Icon: AlertTriangle },
  { label: "Maintenance", path: "/admin/maintenance", Icon: Wrench },
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
                <tab.Icon size={13} />
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
