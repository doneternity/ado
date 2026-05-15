import { useState } from "react";
import {
  useAdminProviders, useCreateProvider, useUpdateProvider,
  useSetActiveProvider, useDeleteProvider,
} from "../../api/admin";
import type { AdminProvider } from "../../types/api";
import styles from "./Admin.module.scss";

type FormState = { name: string; baseUrl: string; apiKey: string };
const empty: FormState = { name: "", baseUrl: "", apiKey: "" };

export function AdminProviders() {
  const { data: providers = [] } = useAdminProviders();
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const setActive = useSetActiveProvider();
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
    <>
      <div className={styles.pageHeader}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 className={styles.title}>🔌 Providers</h1>
            <p className={styles.subtitle}>All API traffic routes to the active provider</p>
          </div>
          <button className={styles.btnPrimary} onClick={() => { setEditing(null); setForm(empty); setShowForm(true); }}>
            + Add provider
          </button>
        </div>
      </div>

      {providers.map((p) => (
        <div key={p.id} className={`${styles.providerCard}${p.isActive ? ` ${styles.providerCardActive}` : ""}`}>
          {p.isActive && (
            <div className={styles.activeBadge}>
              <span className={`${styles.badge} ${styles.badgeActive}`}>● Active</span>
            </div>
          )}
          <div className={styles.providerName}>{p.name}</div>
          <div className={styles.providerUrl}>{p.baseUrl}</div>
          <div style={{ color: "var(--silver)", fontSize: ".68rem", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            sk-••••{p.keySuffix}
          </div>
          <div className={styles.btnRow} style={{ marginTop: 10 }}>
            {!p.isActive && (
              <button
                className={styles.btnSecondary}
                style={{ fontSize: ".7rem", padding: "4px 12px", borderColor: "rgba(0,180,255,.25)", color: "var(--electric)" }}
                onClick={() => setActive.mutate(p.id)}
              >
                Set active
              </button>
            )}
            <button className={styles.btnSecondary} style={{ fontSize: ".7rem", padding: "4px 12px" }} onClick={() => startEdit(p)}>
              Edit
            </button>
            <button className={styles.btnDanger} onClick={() => del.mutate(p.id)} disabled={p.isActive && providers.length === 1}>
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
    </>
  );
}
