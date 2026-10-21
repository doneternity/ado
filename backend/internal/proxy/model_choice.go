package proxy

import (
	"context"
	"sort"
)

// ModelFilter picks which of a provider's models ADO offers (Admin →
// Providers → Models). With Only set, just the IDs listed, so models the
// provider adds later stay hidden until picked; otherwise every model except
// the IDs listed. IDs are as ADO lists them (after ModelSuffix). The zero
// value offers everything.
type ModelFilter struct {
	Only bool
	IDs  map[string]bool
}

// NewModelFilter builds a filter from the stored mode ("all" or "only") and IDs.
func NewModelFilter(mode string, ids []string) ModelFilter {
	set := make(map[string]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	return ModelFilter{Only: mode == "only", IDs: set}
}

// Allows reports whether ADO offers the model with this (public) ID.
func (m ModelFilter) Allows(id string) bool {
	if m.Only {
		return m.IDs[id]
	}
	return !m.IDs[id]
}

// ModelChoice is one of a provider's models as Admin shows it, hidden or not.
type ModelChoice struct {
	ID   string `json:"id"`
	Name string `json:"name,omitempty"`
}

// Choices lists every model this provider key's last /models fetch returned,
// hidden ones included, by the IDs ADO uses. Nil if no fetch has succeeded.
func (f *Forwarder) Choices() []ModelChoice {
	raw := f.rawList.Load()
	if raw == nil {
		return nil
	}
	nameRe := suffixNamePattern(f.ModelSuffix)
	out := make([]ModelChoice, 0, len(*raw))
	seen := map[string]bool{}
	for _, m := range *raw {
		id, _ := m["id"].(string)
		if id == "" {
			continue
		}
		pub := f.publicID(id)
		if seen[pub] {
			continue
		}
		seen[pub] = true
		entry := m
		if pub != id {
			entry = f.publicEntry(m, nameRe)
		}
		name, _ := entry["display_name"].(string)
		if name == "" {
			name, _ = entry["name"].(string)
		}
		out = append(out, ModelChoice{ID: pub, Name: name})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// FetchChoices fetches this provider key's model list now and returns Choices.
// For a provider that isn't in the chain (inactive), via a throwaway Forwarder.
func (f *Forwarder) FetchChoices(ctx context.Context) ([]ModelChoice, bool) {
	if _, ok := f.fetchModels(ctx); !ok {
		return nil, false
	}
	return f.Choices(), true
}

// ProviderChoices returns a provider's models as its keys in the chain last
// saw them, or nil if none has a list yet (or the provider isn't active).
func (r *Registry) ProviderChoices(providerID string) []ModelChoice {
	for _, f := range r.Get() {
		if f.ProviderID == providerID {
			if c := f.Choices(); c != nil {
				return c
			}
		}
	}
	return nil
}
