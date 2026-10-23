import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Brain, Check, Copy, Eye, Layers, Wrench } from "lucide-react";
import { PROVIDER_COLOR, PROVIDER_NAME } from "../data/catalog";
import { fmtTokens } from "../data/model-meta";
import type { EnrichedModel } from "../data/model-meta";
import type { Capability, ModelProvider } from "../data/models";
import styles from "./ModelBits.module.scss";

// Small pieces shared by the Models page cards and the model drawer.

export const CAP_ICONS: Partial<Record<Capability, ReactNode>> = {
  Reasoning: <Brain size={12} />,
  Vision: <Eye size={12} />,
  Tools: <Wrench size={12} />,
  "Long context": <Layers size={12} />,
};

// Every model streams, so "Streaming" isn't shown or offered as a filter.
export const SHOWN_CAPS: Capability[] = ["Reasoning", "Vision", "Tools", "Long context"];

export const STATUS_LABEL = { available: "Available", degraded: "Degraded", down: "Down" } as const;

// Sets --maker to the provider's accent, for rgba(var(--maker), a).
export function makerStyle(p: ModelProvider): CSSProperties {
  return { "--maker": PROVIDER_COLOR[p] } as CSSProperties;
}

// Context size, max output and effort levels, as far as the provider says.
export function specsOf(m: EnrichedModel): [string, string][] {
  const specs: [string, string][] = [];
  if (m.contextTokens) specs.push(["Context", fmtTokens(m.contextTokens)]);
  else if (m.context) specs.push(["Context", m.context.replace(/ tokens$/, "")]);
  if (m.maxOutputTokens) specs.push(["Max output", fmtTokens(m.maxOutputTokens)]);
  if (m.effortLevels) specs.push(["Effort", m.effortLevels.join(" · ")]);
  return specs;
}

export function StatusPill({ status }: { status: EnrichedModel["adoStatus"] }) {
  return (
    <span className={`${styles.status} ${styles[`status_${status}`]}`}>
      <span className={styles.statusDot} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

// A provider's initial in its accent colour (not its logo).
export function MakerMark({ provider, size = 22 }: { provider: ModelProvider; size?: number }) {
  return (
    <span className={styles.mark} style={{ ...makerStyle(provider), width: size, height: size, fontSize: size * 0.5 }} aria-hidden>
      {PROVIDER_NAME[provider].charAt(0)}
    </span>
  );
}

export function CapList({ caps }: { caps: Capability[] }) {
  const shown = caps.filter((c) => SHOWN_CAPS.includes(c));
  if (shown.length === 0) return null;
  return (
    <ul className={styles.caps} aria-label="Capabilities">
      {shown.map((c) => <li key={c} className={styles.cap}>{CAP_ICONS[c]}{c}</li>)}
    </ul>
  );
}

export function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    // Clipboard access can be refused (permissions, an old browser); the ID
    // stays visible to select by hand then.
    navigator.clipboard?.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }, () => {});
  }
  return (
    <button type="button" className={styles.copyBtn} onClick={copy} aria-label={`Copy model ID ${id}`}>
      <span className={styles.modelId}>{id}</span>
      {copied ? <Check size={13} className={styles.copied} /> : <Copy size={13} />}
    </button>
  );
}
