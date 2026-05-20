import { useState } from "react";
import { motion } from "framer-motion";
import { Plug } from "lucide-react";
import {
  useAdminProviders, useCreateProvider, useUpdateProvider,
  useSetProviderActive, useDeleteProvider,
} from "../../api/admin";
import type { AdminProvider } from "../../types/api";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

type FormState = { name: string; baseUrl: string; apiKey: string };
const empty: FormState = { name: "", baseUrl: "", apiKey: "" };

export function AdminProviders() {
  const { data: providers = [] } = useAdminProviders();
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const setActive = useSetProviderActive();
  const del = useDeleteProvider();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminProvider | null>(null);
  const [form, setForm] = useState<FormState>(empty);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      update.mutate({ id: editing.id, ...form }, {
        onSuccess: () => { setEditing(null); setForm(empty); setShowForm(false); },
      });
    } else {
      create.mutate(form, {
        onSuccess: () => { setForm(empty); setShowForm(false); },
      });
    }
  };

  const startEdit = (p: AdminProvider) => {
    setEditing(p);
    setForm({ name: p.name, baseUrl: p.baseUrl, apiKey: "" });
    setShowForm(true);
  };

  return (
    <motion.div {...fade}>
      <div className={styles.pageHeader}>
        <div className={styles.pageRow}>
          <div>
            <h1 className={styles.title}><Plug size={18} className={styles.titleIcon} /> Providers</h1>
            <p className={styles.subtitle}>Requests fail over across every active provider, in order</p>
          </div>
          <button className={styles.btnPrimary} onClick={() => { setEditing(null); setForm(empty); setShowForm(true); }}>
            + Add provider
          </button>
        </div>
      </div>

      {providers.map((p) => (
        <div key={p.id} className={`${styles.providerCard}${p.isActive ? ` ${styles.providerCardActive}` : ""}`}>
          <div className={styles.activeBadge}>
            <span className={`${styles.badge} ${p.isActive ? styles.badgeActive : styles.badgeInactive}`}>
              {p.isActive ? "● Active" : "○ Inactive"}
            </span>
          </div>
          <div className={styles.providerName}>{p.name}</div>
          <div className={styles.providerUrl}>{p.baseUrl}</div>
          <div className={styles.providerKey}>sk-••••{p.keySuffix}</div>
          <div className={styles.btnRow} style={{ marginTop: 10 }}>
            <button
              className={styles.btnSecondary}
              style={{
                fontSize: ".7rem", padding: "4px 12px",
                borderColor: p.isActive ? "rgba(255,255,255,.12)" : "rgba(0,180,255,.25)",
                color: p.isActive ? "var(--silver)" : "var(--electric)",
              }}
              disabled={setActive.isPending}
              onClick={() => setActive.mutate({ id: p.id, active: !p.isActive })}
            >
              {p.isActive ? "Deactivate" : "Activate"}
            </button>
            <button className={styles.btnSecondary} style={{ fontSize: ".7rem", padding: "4px 12px" }} onClick={() => startEdit(p)}>
              Edit
            </button>
            <button className={styles.btnDanger} onClick={() => del.mutate(p.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {showForm && (
        <div className={styles.inlineForm}>
          <div className={styles.inlineFormTitle}>{editing ? "Edit provider" : "New provider"}</div>
          <form onSubmit={handleSubmit}>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label}>Name</label>
                <input className={styles.input} placeholder="e.g. OpenRouter" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>API Endpoint</label>
                <input className={styles.input} placeholder="https://api.example.com/v1" value={form.baseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} required />
              </div>
            </div>
            <div className={styles.field} style={{ marginBottom: 14 }}>
              <label className={styles.label}>API Key{editing ? " (leave blank to keep existing)" : ""}</label>
              <input className={styles.input} type="password" placeholder="sk-••••••••••••••••"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                required={!editing} />
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} type="submit" disabled={create.isPending || update.isPending}>
                {editing ? "Save changes" : "Save provider"}
              </button>
              <button className={styles.btnSecondary} type="button"
                onClick={() => { setShowForm(false); setEditing(null); setForm(empty); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </motion.div>
  );
}
