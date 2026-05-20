import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Plug, Users, BarChart2, SlidersHorizontal, AlertTriangle, Wrench, Zap, ChevronRight } from "lucide-react";
import { useAdminStats } from "../../api/admin";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

const MODULES = [
  { label: "Providers",   path: "/admin/providers",   Icon: Plug,               desc: "Manage API endpoints and routing" },
  { label: "Users",       path: "/admin/users",       Icon: Users,              desc: "View accounts and manage roles" },
  { label: "Usage",       path: "/admin/usage",       Icon: BarChart2,          desc: "Request stats across all users" },
  { label: "Quotas",      path: "/admin/quotas",      Icon: SlidersHorizontal,  desc: "Set global and per-user limits" },
  { label: "Errors",      path: "/admin/errors",      Icon: AlertTriangle,      desc: "Proxy error log" },
  { label: "Maintenance", path: "/admin/maintenance", Icon: Wrench,             desc: "Block all API traffic instantly" },
] as const;

export function AdminOverview() {
  const { data: stats } = useAdminStats();

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>
          <Zap size={20} className={styles.titleIcon} />
          Admin Overview
        </h1>
        <p className={styles.subtitle}>System status and quick access to management modules</p>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Users</div>
          <div className={styles.statValue}>{stats?.totalUsers ?? "—"}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Providers</div>
          <div className={styles.statValue}>
            {stats?.activeProviders ?? "—"}
          </div>
          <div className={styles.statSub}>failover routing</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Requests Today</div>
          <div className={styles.statValue}>
            {stats?.daily?.at(-1)?.total ?? 0}
          </div>
        </div>
      </div>

      <div className={styles.sectionLabel}>Management Modules</div>
      <div className={styles.modulesGrid}>
        {MODULES.map(({ path, Icon, label, desc }) => (
          <Link key={path} to={path} className={styles.moduleCard}>
            <div className={styles.moduleCardLeft}>
              <div className={styles.moduleIcon}>
                <Icon size={16} />
              </div>
              <div>
                <div className={styles.moduleTitle}>{label}</div>
                <div className={styles.moduleDesc}>{desc}</div>
              </div>
            </div>
            <ChevronRight size={15} className={styles.moduleArrow} />
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
