// Single source of truth for the "example" model ID shown in docs, code
// snippets, and featured-model lists. It resolves against the live /api/models
// list so it never drifts when the upstream provider changes; the constant
// below is only the offline fallback.

export const FALLBACK_SAMPLE_MODEL = "gemini-3.1-pro";

// Preference order: the first of these that the provider actually serves wins.
const SAMPLE_MODEL_PREFERENCE = [
  "gemini-3.1-pro",
  "gemini-3-pro",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "gpt-5.5",
  "gpt-5.1",
  "deepseek-v4-pro",
];

// pickSampleModel returns the best example model ID given the live list.
export function pickSampleModel(liveIds?: string[]): string {
  if (!liveIds || liveIds.length === 0) return FALLBACK_SAMPLE_MODEL;
  const set = new Set(liveIds);
  for (const id of SAMPLE_MODEL_PREFERENCE) {
    if (set.has(id)) return id;
  }
  return liveIds[0] ?? FALLBACK_SAMPLE_MODEL;
}
