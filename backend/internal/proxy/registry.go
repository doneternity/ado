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
	chain atomic.Pointer[[]*Forwarder]
	mcMu  sync.Mutex
	mc    *cachedModels
}

func NewRegistry() *Registry {
	r := &Registry{}
	r.Swap(nil)
	return r
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
