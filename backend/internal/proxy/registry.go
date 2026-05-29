package proxy

import (
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
	chain  atomic.Pointer[[]*Forwarder]
	mcMu   sync.Mutex
	mc     *cachedModels
	health *ModelHealth
}

func NewRegistry() *Registry {
	r := &Registry{health: NewModelHealth()}
	r.Swap(nil)
	return r
}

// Health exposes the per-model availability tracker.
func (r *Registry) Health() *ModelHealth { return r.health }

// First returns the highest-priority forwarder, or nil if the chain is empty.
// Used for endpoints that can't fail over (e.g. realtime WebSocket).
func (r *Registry) First() *Forwarder {
	chain := r.Get()
	if len(chain) == 0 {
		return nil
	}
	return chain[0]
}

func (r *Registry) Get() []*Forwarder {
	if p := r.chain.Load(); p != nil {
		return *p
	}
	return nil
}

// Swap atomically replaces the provider chain and clears the models cache so
// the next /models request fetches fresh data from the new chain.
func (r *Registry) Swap(chain []*Forwarder) {
	r.chain.Store(&chain)
	r.mcMu.Lock()
	r.mc = nil
	r.mcMu.Unlock()
}
