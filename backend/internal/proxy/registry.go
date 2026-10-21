package proxy

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

const modelsCacheTTL = 5 * time.Minute

type cachedModels struct {
	data      []map[string]any
	fetchedAt time.Time
}

type Registry struct {
	chain atomic.Pointer[[]*Forwarder]
	rr    atomic.Uint64 // round-robin counter for rotateGroups
	// lastRefresh is when the model lists were last fetched (unix nanos);
	// 0 after a Swap, so the next unlisted model fetches them right away.
	lastRefresh atomic.Int64
	mcMu        sync.Mutex
	mc          *cachedModels
	health      *ModelHealth
}

func NewRegistry() *Registry {
	r := &Registry{health: NewModelHealth()}
	r.Swap(nil)
	return r
}

// Health exposes the per-model availability tracker.
func (r *Registry) Health() *ModelHealth { return r.health }

func (r *Registry) Get() []*Forwarder {
	if p := r.chain.Load(); p != nil {
		return *p
	}
	return nil
}

// Swap atomically replaces the provider chain and clears the models cache so
// the next /models request fetches fresh data from the new chain.
func (r *Registry) Swap(chain []*Forwarder) {
	// Admin changes rebuild the whole chain; a provider key that's unchanged
	// keeps what it knew (its models, aliases and last list), so routing and
	// the fallback list work straight away instead of after the next fetch.
	old := map[string]*Forwarder{}
	for _, f := range r.Get() {
		old[f.identity()] = f
	}
	for _, f := range chain {
		if prev := old[f.identity()]; prev != nil && prev != f {
			f.models.Store(prev.models.Load())
			f.aliases.Store(prev.aliases.Load())
			f.lastList.Store(prev.lastList.Load())
		}
	}
	r.chain.Store(&chain)
	r.lastRefresh.Store(0)
	r.mcMu.Lock()
	r.mc = nil
	r.mcMu.Unlock()
}

// identity is what makes two forwarders the same provider key across chain
// rebuilds.
func (f *Forwarder) identity() string {
	return f.BaseURL + "\x00" + f.APIKey + "\x00" + f.ModelSuffix
}

// Pick returns the provider key to use for one model, in the same order
// Forward would try them (model-aware, keys taking turns, tripped ones last),
// for connections that can't fail over (the realtime WebSocket). Nil if the
// chain is empty.
func (r *Registry) Pick(ctx context.Context, model string) *Forwarder {
	chain := r.Get()
	if len(chain) == 0 {
		return nil
	}
	order := failoverOrder(rotateGroups(r.forModel(ctx, chain, model), r.rr.Add(1)))
	return order[0]
}

// UpstreamID is the provider's own ID for a model asked for by its plain ID
// (see alias.go); other IDs come back unchanged.
func (f *Forwarder) UpstreamID(model string) string { return f.upstreamID(model) }

// Serves reports whether any provider may serve model. It's false only when
// every provider's model list is known and none lists it (after one fresh
// look, as rarely as forModel allows), so a provider whose list can't be read
// never turns a real model into "not found".
func (r *Registry) Serves(ctx context.Context, model string) bool {
	chain := r.Get()
	if len(chain) == 0 {
		return true // no providers at all is reported as NO_PROVIDER instead
	}
	serving, unknown := splitByModel(chain, model)
	if len(serving) == 0 && time.Since(time.Unix(0, r.lastRefresh.Load())) > modelRefreshEvery {
		rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		r.refreshModels(rctx)
		cancel()
		serving, unknown = splitByModel(chain, model)
	}
	return len(serving) > 0 || len(unknown) > 0
}
