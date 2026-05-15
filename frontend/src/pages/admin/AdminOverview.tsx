import { Link } from "react-router-dom";
import { useAdminStats } from "../../api/admin";
import styles from "./Admin.module.scss";

const MODULES = [
  { label: "Providers",   path: "/admin/providers",   icon: "🔌", desc: "Manage API endpoints and routing" },
  { label: "Users",       path: "/admin/users",       icon: "👥", desc: "View accounts and manage roles" },
  { label: "Usage",       path: "/admin/usage",       icon: "📊", desc: "Request stats across all users" },
  { label: "Quotas",      path: "/admin/quotas",      icon: "🎛",  desc: "Set global and per-user limits" },
  { label: "Errors",      path: "/admin/errors",      icon: "⚠️", desc: "Proxy error log" },
  { label: "Maintenance", path: "/admin/maintenance", icon: "🔧", desc: "Block all API traffic instantly" },
] as const;

export function AdminOverview() {
  const { data: stats } = useAdminStats();

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>⚡ Admin Overview</h1>
        <p className={styles.subtitle}>System status and quick access to management modules</p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Users</div>
          <div className={styles.statValue}>{stats?.totalUsers ?? "—"}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Provider</div>
          <div className={styles.statValue} style={{ fontSize: "1rem" }}>
            {stats?.activeProvider ?? "—"}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Requests Today</div>
          <div className={styles.statValue}>
            {stats?.daily?.at(-1)?.total ?? 0}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12, fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--silver)" }}>
        Management Modules
      </div>
      <div className={styles.modulesGrid}>
        {MODULES.map((m) => (
          <Link key={m.path} to={m.path} className={styles.moduleCard}>
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              <div className={styles.moduleIcon}>{m.icon}</div>
              <div>
                <div className={styles.moduleTitle}>{m.label}</div>
                <div className={styles.moduleDesc}>{m.desc}</div>
              </div>
            </div>
            <span style={{ color: "rgba(0,180,255,.4)", fontSize: ".85rem", marginLeft: 8, flexShrink: 0 }}>→</span>
          </Link>
        ))}
      </div>
    </>
  );
}
