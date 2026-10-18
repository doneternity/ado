import { useState } from "react";
import { motion } from "framer-motion";
import { Plug, Info, Eye, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import {
  useAdminProviders, useCreateProvider, useUpdateProvider,
  useSetProviderActive, useDeleteProvider,
  useAddProviderKeys, useSetProviderKeyActive, useDeleteProviderKey,
} from "../../api/admin";
import { useUiStore } from "../../stores/ui-store";
import type { AdminProvider } from "../../types/api";
import { PROXY_REQUEST_BASE } from "../../config";
import styles from "./Admin.module.scss";

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: "easeOut" as const } };

type FormState = { name: string; baseUrl: string; apiKeys: string; priority: number };
const empty: FormState = { name: "", baseUrl: "", apiKeys: "", priority: 0 };

// One key per line (commas and spaces also separate), blanks and repeats dropped.
function parseKeys(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean))];
}

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
  const showToast = useUiStore((s) => s.showToast);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AdminProvider | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [formError, setFormError] = useState<string | null>(null);

  const activeCount = providers.filter((p) => p.isActive).length;
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const closeForm = () => {
    setShowForm(false); setEditing(null); setForm(empty); setFormError(null);
    create.reset(); update.reset();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (editing) {
      update.mutate({ id: editing.id, name: form.name, baseUrl: form.baseUrl, priority: form.priority }, {
        onSuccess: () => { setEditing(null); setForm(empty); setShowForm(false); },
        onError: (err) => setFormError(errMsg(err, "Could not save provider")),
      });
    } else {
      const apiKeys = parseKeys(form.apiKeys);
      if (apiKeys.length === 0) { setFormError("Add at least one API key"); return; }
      create.mutate({ name: form.name, baseUrl: form.baseUrl, priority: form.priority, apiKeys }, {
        onSuccess: () => { setForm(empty); setShowForm(false); },
        onError: (err) => setFormError(errMsg(err, "Could not create provider")),
      });
    }
  };

  const startEdit = (p: AdminProvider) => {
    setEditing(p);
    setForm({ name: p.name, baseUrl: p.baseUrl, apiKeys: "", priority: p.priority });
    setFormError(null);
    create.reset(); update.reset();
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
                ? "No active providers. Add one to start routing requests."
                : `${activeCount} of ${providers.length} active`}
            </p>
          </div>
          <button
            className={styles.btnPrimary}
            onClick={() => {
              setEditing(null); setForm(empty); setFormError(null);
              create.reset(); update.reset();
              setShowForm(true);
            }}
          >
            + Add provider
          </button>
        </div>
      </div>

      <div className={styles.infoBanner}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Requests try each active provider by priority (lower number first) until one succeeds.
          A provider with several keys takes turns between them, and if one key fails the next
          is tried before moving on to the next provider.
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
            onToggleActive={() => {
              setPendingIds(prev => new Set([...prev, p.id]));
              setActive.mutate({ id: p.id, active: !p.isActive }, {
                onError: (err) => showToast(errMsg(err, `Could not ${p.isActive ? "deactivate" : "activate"} ${p.name}`)),
                onSettled: () => setPendingIds(prev => {
                  const next = new Set(prev);
                  next.delete(p.id);
                  return next;
                }),
              });
            }}
            onEdit={() => startEdit(p)}
            onDelete={() => {
              if (!confirm(`Remove "${p.name}"?`)) return;
              del.mutate(p.id, {
                onError: (err) => showToast(errMsg(err, `Could not remove ${p.name}`)),
              });
            }}
            isPending={pendingIds.has(p.id)}
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
            <div className={styles.formRow}>
              <div className={styles.field} style={{ maxWidth: 140 }}>
                <label className={styles.label}>Priority</label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: Math.max(0, Number(e.target.value)) }))}
                />
                <span className={styles.fieldHint}>lower = tried first</span>
              </div>
              {!editing && (
                <div className={styles.field} style={{ flex: 1 }}>
                  <label className={styles.label}>API keys</label>
                  <textarea
                    className={`${styles.input} ${styles.keyTextarea}`}
                    placeholder={"sk-first-key\nsk-second-key"}
                    value={form.apiKeys}
                    onChange={(e) => setForm((f) => ({ ...f, apiKeys: e.target.value }))}
                    rows={3}
                    spellCheck={false}
                    autoComplete="off"
                    required
                  />
                  <span className={styles.fieldHint}>one per line; add more later on the provider card</span>
                </div>
              )}
            </div>
            {formError && <p className={styles.formError}>{formError}</p>}
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
                onClick={closeForm}
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
  const activeKeys = p.keys.filter((k) => k.isActive).length;
  return (
    <div className={`${styles.providerCard}${p.isActive ? ` ${styles.providerCardActive}` : ""}`}>
      <div className={styles.providerCardInner}>
        <div className={styles.providerCardLeft}>
          <div className={styles.providerOrderBadge}>{order}</div>
          <div className={styles.providerInfo}>
            <div className={styles.providerName}>{p.name}</div>
            <div className={styles.providerUrl}>{p.baseUrl}</div>
            <div className={styles.providerKey}>
              {p.keys.length === 0
                ? "no keys: add one below"
                : `${activeKeys} of ${p.keys.length} key${p.keys.length === 1 ? "" : "s"} active`}
            </div>
          </div>
        </div>

        <div className={styles.providerCardRight}>
          <span className={styles.providerPriorityChip}>P · {p.priority}</span>
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

      <ProviderKeys provider={p} />

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

function ProviderKeys({ provider: p }: { provider: AdminProvider }) {
  const add = useAddProviderKeys();
  const setKeyActive = useSetProviderKeyActive();
  const delKey = useDeleteProviderKey();
  const showToast = useUiStore((s) => s.showToast);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const apiKeys = parseKeys(text);
    if (apiKeys.length === 0) { setError("Paste at least one key"); return; }
    setError(null);
    add.mutate({ id: p.id, apiKeys, label: label.trim() }, {
      onSuccess: (added) => {
        showToast(`Added ${added.length} key${added.length === 1 ? "" : "s"} to ${p.name}`);
        setText(""); setLabel(""); setAdding(false);
      },
      onError: (err) => setError(errMsg(err, "Could not add keys")),
    });
  };

  return (
    <div className={styles.keyList}>
      {p.keys.map((k) => (
        <div key={k.id} className={`${styles.keyRow}${k.isActive ? "" : ` ${styles.keyRowOff}`}`}>
          <code className={styles.keyMask}>••••{k.suffix}</code>
          {k.label && <span className={styles.keyLabel}>{k.label}</span>}
          <span className={styles.keyRowSpacer} />
          <label className={`${styles.toggle} ${styles.toggleSm}`} title={k.isActive ? "Turn this key off" : "Turn this key on"}>
            <input
              type="checkbox"
              checked={k.isActive}
              disabled={setKeyActive.isPending}
              onChange={() => setKeyActive.mutate({ id: p.id, keyId: k.id, active: !k.isActive }, {
                onError: (err) => showToast(errMsg(err, "Could not change the key")),
              })}
            />
            <span />
          </label>
          <button
            className={styles.btnDanger}
            onClick={() => {
              if (!confirm(`Remove key ••••${k.suffix} from ${p.name}?`)) return;
              delKey.mutate({ id: p.id, keyId: k.id }, {
                onError: (err) => showToast(errMsg(err, "Could not remove the key")),
              });
            }}
          >
            Remove
          </button>
        </div>
      ))}

      {adding ? (
        <form className={styles.keyAddForm} onSubmit={submit}>
          <textarea
            className={`${styles.input} ${styles.keyTextarea}`}
            placeholder={"Paste keys, one per line"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            autoFocus
          />
          <input
            className={styles.input}
            placeholder="Label (optional), e.g. second account"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
          />
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.btnRow}>
            <button className={styles.btnPrimary} type="submit" disabled={add.isPending}>
              {add.isPending ? "Adding…" : "Add keys"}
            </button>
            <button className={styles.btnSecondary} type="button" onClick={() => { setAdding(false); setError(null); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className={styles.keyAddBtn} onClick={() => setAdding(true)}>+ Add keys</button>
      )}
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
    // Strip stray characters — pasted keys sometimes carry invisible chars
    // that the Authorization header rejects.
    const k = keyInput.trim().replace(/[^A-Za-z0-9-]/g, "");
    if (!k) return;
    setLoading(true);
    setErr(null);
    setModels(null);
    try {
      const base = import.meta.env.VITE_PROXY_BASE_URL || PROXY_REQUEST_BASE;
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
