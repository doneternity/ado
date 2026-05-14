package proxy

import "sync/atomic"

// Registry holds the active forwarder and allows hot-swap without restart.
type Registry struct {
	p atomic.Pointer[Forwarder]
}

func NewRegistry(baseURL, apiKey string) *Registry {
	r := &Registry{}
	r.p.Store(New(baseURL, apiKey))
	return r
}

func (r *Registry) Get() *Forwarder { return r.p.Load() }

func (r *Registry) Swap(baseURL, apiKey string) {
	r.p.Store(New(baseURL, apiKey))
}
