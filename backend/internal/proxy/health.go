package proxy

import (
	"sync"
	"time"
)

// staleWindow is how long a success/failure observation stays relevant. After
// this with no new signal, a model falls back to "available" (it's still listed
// upstream and we have no recent evidence it's broken).
const staleWindow = 10 * time.Minute

// downThreshold is how many recent consecutive failures (with no success) mark a
// model as fully down rather than degraded.
const downThreshold = 2

type modelState struct {
	lastOK   time.Time
	lastFail time.Time
	fails    int // consecutive failures since the last success
}

// ModelHealth tracks per-model chat availability from real request outcomes and
// active probes. It's the source of the ado_status field on /models.
type ModelHealth struct {
	mu sync.RWMutex
	m  map[string]*modelState
}

func NewModelHealth() *ModelHealth {
	return &ModelHealth{m: make(map[string]*modelState)}
}

// Record notes the outcome of a chat attempt for a model.
func (h *ModelHealth) Record(model string, ok bool) {
	if model == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	s := h.m[model]
	if s == nil {
		s = &modelState{}
		h.m[model] = s
	}
	now := time.Now()
	if ok {
		s.lastOK = now
		s.fails = 0
	} else {
		s.lastFail = now
		s.fails++
	}
}

// Status returns "available", "degraded", or "down" for a model, or "" if there
// is no recent signal (caller should default that to available).
func (h *ModelHealth) Status(model string) string {
	h.mu.RLock()
	s := h.m[model]
	h.mu.RUnlock()
	if s == nil {
		return ""
	}
	now := time.Now()
	recentFail := !s.lastFail.IsZero() && now.Sub(s.lastFail) < staleWindow
	recentOK := !s.lastOK.IsZero() && now.Sub(s.lastOK) < staleWindow
	if !recentFail && !recentOK {
		return "" // no recent signal — caller defaults to available
	}
	// The most recent observation wins: a success means it's working now.
	if s.lastOK.After(s.lastFail) {
		return "available"
	}
	// Most recent signal is a failure.
	if s.fails >= downThreshold && !recentOK {
		return "down"
	}
	return "degraded"
}
