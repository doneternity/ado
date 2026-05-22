package proxy

import "sync/atomic"

type Registry struct {
	chain atomic.Pointer[[]*Forwarder]
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

func (r *Registry) Swap(chain []*Forwarder) {
	r.chain.Store(&chain)
}
