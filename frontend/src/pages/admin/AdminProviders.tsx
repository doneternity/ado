import { useState } from "react";
import { motion } from "framer-motion";
import { Plug, Info, Eye, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import {
  useAdminProviders, useCreateProvider, useUpdateProvider,
  useSetProviderActive, useDeleteProvider,
} from "../../api/admin";
import type { AdminProvider } from "../../types/api";
import { PROXY_REQUEST_BASE } from "../../config";
import styles from "./Admin.module.scss";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

type FormState = { name: string; baseUrl: string; apiKey: string };
const empty: FormState = { name: "", baseUrl: "", apiKey: "" };

type LiveModel = {
  id: string;
  ado_status?: string;
  context_length?: number;
  display_name?: string;
  provider?: string;
};

export function AdminProviders() {
  const { data: providers = [] } = useAdminProviders();
  const create = useCreateProvider();
  const update = useUpdateProvider();
  const setActive = useSetProviderActive();
  const del = useDeleteProvider();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminProvider | null>(null);
  const [form, setForm] = useState<FormState>(empty);

  const activeCount = providers.filter((p) => p.isActive).length;

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
            <p className={styles.subtitle}>
              {activeCount === 0
                ? "No active providers — add one to start routing requests"
                : `${activeCount} of ${providers.length} active`}
            </p>
          </div>
          <button
            className={styles.btnPrimary}
            onClick={() => { setEditing(null); setForm(empty); setShowForm(true); }}
          >
            + Add provider
          </button>
        </div>
      </div>

      <div className={styles.infoBanner}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          All active providers are used simultaneously — requests try each one in order (oldest first) until one succeeds.
          Activate multiple providers for automatic failover coverage.
        </span>
      </div>

      {providers.length === 0 ? (
        <div className={styles.emptyState}>
          <Plug size={28} style={{ color: "rgba(255,255,255,.1)", marginBottom: 10 }} />
          <div>No providers configured. Add one to start routing requests.</div>
        </div>
      ) : (
        providers.map((p, i) => (
          <ProviderCard
            key={p.id}
            provider={p}
            order={i + 1}
            onToggleActive={() => setActive.mutate({ id: p.id, active: !p.isActive })}
            onEdit={() => startEdit(p)}
            onDelete={() => { if (confirm(`Remove "${p.name}"?`)) del.mutate(p.id); }}
            isPending={setActive.isPending}
          />
        ))
      )}

      {showForm && (
        <div className={styles.inlineForm} style={{ marginTop: providers.length ? 16 : 0 }}>
          <div className={styles.inlineFormTitle}>{editing ? "Edit provider" : "New provider"}</div>
          <form onSubmit={handleSubmit}>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.label}>Name</label>
                <input
                  className={styles.input}
                  placeholder="e.g. OpenRouter"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>API Endpoint</label>
                <input
                  className={styles.input}
                  placeholder="https://api.example.com/v1"
                  value={form.baseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className={styles.field} style={{ marginBottom: 16 }}>
              <label className={styles.label}>
                API Key{editing ? " — leave blank to keep existing" : ""}
              </label>
              <input
                className={styles.input}
                type="password"
                placeholder="sk-••••••••••••••••"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                required={!editing}
              />
            </div>
            <div className={styles.btnRow}>
              <button
                className={styles.btnPrimary}
                type="submit"
                disabled={create.isPending || update.isPending}
              >
                {editing ? "Save changes" : "Save provider"}
              </button>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={() => { setShowForm(false); setEditing(null); setForm(empty); }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <LivePreview />
    </motion.div>
  );
}

function ProviderCard({
  provider: p,
  order,
  onToggleActive,
  onEdit,
  onDelete,
  isPending,
}: {
  provider: AdminProvider;
  order: number;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  return (
    <div className={`${styles.providerCard}${p.isActive ? ` ${styles.providerCardActive}` : ""}`}>
      <div className={styles.providerCardInner}>
        <div className={styles.providerCardLeft}>
          <div className={styles.providerOrderBadge}>{order}</div>
          <div className={styles.providerInfo}>
            <div className={styles.providerName}>{p.name}</div>
            <div className={styles.providerUrl}>{p.baseUrl}</div>
            <div className={styles.providerKey}>sk-••••{p.keySuffix}</div>
          </div>
        </div>

        <div className={styles.providerCardRight}>
          <span className={`${styles.badge} ${p.isActive ? styles.badgeGreen : styles.badgeInactive}`}>
            {p.isActive ? "active" : "inactive"}
          </span>
          <label className={styles.toggle} title={p.isActive ? "Deactivate" : "Activate"}>
            <input
              type="checkbox"
              checked={p.isActive}
              disabled={isPending}
              onChange={onToggleActive}
            />
            <span />
          </label>
        </div>
      </div>

      <div className={styles.providerCardActions}>
        <button className={styles.btnSecondary} style={{ fontSize: ".7rem", padding: "4px 12px" }} onClick={onEdit}>
          Edit
        </button>
        <button className={styles.btnDanger} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function LivePreview() {
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [models, setModels] = useState<LiveModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const k = keyInput.trim();
    if (!k) return;
    setLoading(true);
    setErr(null);
    setModels(null);
    try {
      const base = import.meta.env.VITE_PROXY_BASE_URL ?? PROXY_REQUEST_BASE;
      const r = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${k}` },
      });
      const d = await r.json() as { data?: LiveModel[]; error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? `HTTP ${r.status}`);
      setModels(d.data ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  // Group models by provider field
  const grouped = models ? (() => {
    const g: Record<string, LiveModel[]> = {};
    for (const m of models) {
      const p = m.provider ?? "Main";
      if (!g[p]) g[p] = [];
      g[p].push(m);
    }
    return g;
  })() : null;

  return (
    <div className={styles.previewSection}>
      <button className={styles.previewToggle} onClick={() => setOpen(o => !o)}>
        <Eye size={14} />
        <span>Live model preview</span>
        <span className={styles.previewToggleHint}>verify a new provider is working</span>
        {open ? <ChevronUp size={14} style={{ marginLeft: "auto" }} /> : <ChevronDown size={14} style={{ marginLeft: "auto" }} />}
      </button>

      {open && (
        <div className={styles.previewBody}>
          <div className={styles.previewKeyRow}>
            <input
              className={styles.input}
              placeholder="Any valid ADO key…"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && load()}
              style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: ".78rem" }}
              autoComplete="off"
            />
            <button
              className={styles.btnPrimary}
              onClick={load}
              disabled={loading || !keyInput.trim()}
              style={{ gap: 6, display: "flex", alignItems: "center" }}
            >
              {loading ? <span className={styles.previewSpinner} /> : <RefreshCw size={13} />}
              {loading ? "Loading…" : models ? "Refresh" : "Load"}
            </button>
          </div>

          {err && <p className={styles.previewErr}>{err}</p>}

          {models && models.length === 0 && (
            <p className={styles.previewEmpty}>Provider returned 0 models. The /v1/models endpoint may not be supported by this provider.</p>
          )}

          {grouped && Object.entries(grouped).map(([providerName, pModels]) => (
            <div key={providerName} className={styles.previewGroup}>
              <div className={styles.previewGroupHeader}>
                <span className={styles.previewGroupName}>{providerName}</span>
                <span className={styles.previewGroupCount}>{pModels.length} model{pModels.length !== 1 ? "s" : ""}</span>
              </div>
              <div className={styles.previewModelGrid}>
                {pModels.map(m => (
                  <div key={m.id} className={`${styles.previewModelCard}${m.ado_status === "degraded" ? ` ${styles.previewDegraded}` : m.ado_status === "down" ? ` ${styles.previewDown}` : ""}`}>
                    <div className={styles.previewModelTop}>
                      <span className={`${styles.previewDot} ${styles[`previewDot_${m.ado_status ?? "available"}`]}`} />
                      <span className={styles.previewModelId}>{m.id}</span>
                    </div>
                    {m.context_length && (
                      <span className={styles.previewCtx}>
                        {m.context_length >= 1_000_000
                          ? `${(m.context_length / 1_000_000).toFixed(0)}M ctx`
                          : `${(m.context_length / 1_000).toFixed(0)}K ctx`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
