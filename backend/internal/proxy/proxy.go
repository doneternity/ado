package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	dialTimeout = 5 * time.Second
	// generous on purpose: a non-streamed completion may not send headers until
	// the whole answer is ready. fast failover comes from the breaker, not here.
	responseHeaderTimeout = 120 * time.Second

	// breaker: after this many consecutive failures, skip a provider for the
	// cooldown so a dead upstream stops slowing every request.
	breakerThreshold = 2
	breakerCooldown  = 30 * time.Second
)

type Forwarder struct {
	BaseURL string
	APIKey  string
	Client  *http.Client

	mu        sync.Mutex
	fails     int
	openUntil time.Time
}

func New(baseURL, apiKey string) *Forwarder {
	return &Forwarder{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		Client: &http.Client{
			Timeout: 0,
			Transport: &http.Transport{
				DialContext:           (&net.Dialer{Timeout: dialTimeout}).DialContext,
				ResponseHeaderTimeout: responseHeaderTimeout,
				ForceAttemptHTTP2:     true,
				MaxIdleConns:          100,
				IdleConnTimeout:       90 * time.Second,
				TLSHandshakeTimeout:   10 * time.Second,
				ExpectContinueTimeout: time.Second,
			},
		},
	}
}

// breakerOpen reports whether the provider is in its skip window.
func (f *Forwarder) breakerOpen(now time.Time) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return now.Before(f.openUntil)
}

// tripBreaker records a failure and opens the breaker at the threshold.
func (f *Forwarder) tripBreaker() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.fails++
	if f.fails >= breakerThreshold {
		f.openUntil = time.Now().Add(breakerCooldown)
		f.fails = 0
	}
}

// resetBreaker clears failure state after a success.
func (f *Forwarder) resetBreaker() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.fails = 0
	f.openUntil = time.Time{}
}

func (f *Forwarder) do(ctx context.Context, r *http.Request, path string, body []byte) (*http.Response, error) {
	upstreamURL := f.BaseURL + path
	if r.URL.RawQuery != "" {
		upstreamURL += "?" + r.URL.RawQuery
	}
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, r.Method, upstreamURL, bodyReader)
	if err != nil {
		return nil, err
	}
	skip := skipRequestHeaders(r.Header)
	for k, vs := range r.Header {
		if skip[http.CanonicalHeaderKey(k)] {
			continue
		}
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	req.Header.Set("Authorization", "Bearer "+f.APIKey)
	return f.Client.Do(req)
}

// probe sends a minimal chat request to check whether this provider can serve
// the given model. Returns true only on a 2xx response.
func (f *Forwarder) probe(ctx context.Context, model string) bool {
	body, err := json.Marshal(map[string]any{
		"model":      model,
		"messages":   []map[string]string{{"role": "user", "content": "ping"}},
		"max_tokens": 1,
	})
	if err != nil {
		return false
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, f.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+f.APIKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := f.Client.Do(req)
	if err != nil {
		return false
	}
	defer func() { _, _ = io.Copy(io.Discard, resp.Body); _ = resp.Body.Close() }()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

// Probe checks a model against the chain and records the result. A model is
// healthy if any provider in the chain serves it.
func (r *Registry) Probe(ctx context.Context, model string) {
	chain := r.Get()
	if len(chain) == 0 {
		return
	}
	ok := false
	for _, f := range chain {
		if f.probe(ctx, model) {
			ok = true
			break
		}
	}
	r.health.Record(model, ok)
}

// CachedModelIDs returns the model IDs from the last /models aggregation, for
// the background prober to cycle through.
func (r *Registry) CachedModelIDs() []string {
	r.mcMu.Lock()
	defer r.mcMu.Unlock()
	if r.mc == nil {
		return nil
	}
	ids := make([]string, 0, len(r.mc.data))
	for _, m := range r.mc.data {
		if id, _ := m["id"].(string); id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

// ForwardResult is the outcome of a Forward call (used for logging + quota).
type ForwardResult struct {
	Started  bool   // a provider response was streamed to the client
	Status   int    // http status served (0 if none)
	Provider string // base url of the provider that served (empty if none)
	Attempts int    // providers tried
}

// Forward streams the first non-failover provider response to the client.
// tripped providers are tried last so an all-down state still gets an attempt,
// and it stops early if the client has disconnected.
func (r *Registry) Forward(w http.ResponseWriter, req *http.Request, path string, body []byte) (ForwardResult, error) {
	chain := r.Get()
	if len(chain) == 0 {
		return ForwardResult{}, errors.New("no provider configured")
	}

	var lastErr error
	attempts := 0
	for _, f := range failoverOrder(chain) {
		if cerr := req.Context().Err(); cerr != nil {
			return ForwardResult{Attempts: attempts}, cerr
		}
		attempts++

		// per-attempt context so the idle watchdog can cancel one stalled
		// upstream without touching the others.
		streamCtx, cancel := context.WithCancel(req.Context())
		resp, derr := f.do(streamCtx, req, path, body)
		if derr != nil {
			cancel()
			// client cancel isn't the provider's fault: don't trip it, just stop.
			if cerr := req.Context().Err(); cerr != nil {
				return ForwardResult{Attempts: attempts}, cerr
			}
			lastErr = derr
			f.tripBreaker()
			slog.Warn("proxy failover", "provider", f.BaseURL, "path", path, "reason", "request error", "err", derr)
			continue
		}
		if isFailoverStatus(resp.StatusCode) {
			lastErr = fmt.Errorf("provider returned %d", resp.StatusCode)
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			cancel()
			f.tripBreaker()
			slog.Warn("proxy failover", "provider", f.BaseURL, "path", path, "reason", "status", "status", resp.StatusCode)
			continue
		}
		f.resetBreaker()
		serr := streamResponse(w, resp, cancel)
		return ForwardResult{Started: true, Status: resp.StatusCode, Provider: f.BaseURL, Attempts: attempts}, serr
	}
	return ForwardResult{Attempts: attempts}, lastErr
}

// failoverOrder puts closed-breaker providers first (priority order), tripped
// ones last as a fallback.
func failoverOrder(chain []*Forwarder) []*Forwarder {
	now := time.Now()
	order := make([]*Forwarder, 0, len(chain))
	var tripped []*Forwarder
	for _, f := range chain {
		if f.breakerOpen(now) {
			tripped = append(tripped, f)
		} else {
			order = append(order, f)
		}
	}
	return append(order, tripped...)
}

// AggregateModels queries all providers concurrently and merges their model
// lists into a single deduplicated response. Providers that fail are silently
// skipped so a partial list is returned rather than an error.
func (r *Registry) AggregateModels(w http.ResponseWriter, req *http.Request) error {
	chain := r.Get()
	if len(chain) == 0 {
		return errors.New("no provider configured")
	}

	r.mcMu.Lock()
	if r.mc != nil && time.Since(r.mc.fetchedAt) < modelsCacheTTL {
		cached := r.mc.data
		r.mcMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		return json.NewEncoder(w).Encode(map[string]any{"object": "list", "data": r.withStatus(cached)})
	}
	r.mcMu.Unlock()

	type modelItem = map[string]any
	results := make([][]modelItem, len(chain))
	var wg sync.WaitGroup
	for i, f := range chain {
		wg.Add(1)
		go func(idx int, fwd *Forwarder) {
			defer wg.Done()
			// bound each fetch so one slow upstream can't stall the aggregation.
			ctx, cancel := context.WithTimeout(req.Context(), 15*time.Second)
			defer cancel()
			resp, err := fwd.do(ctx, req, "/models", nil)
			if err != nil {
				slog.Warn("aggregate models: request failed", "url", fwd.BaseURL+"/models", "err", err)
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				slog.Warn("aggregate models: non-200 response", "url", fwd.BaseURL+"/models", "status", resp.StatusCode)
				return
			}
			raw, err := io.ReadAll(resp.Body)
			if err != nil {
				slog.Warn("aggregate models: read body failed", "url", fwd.BaseURL+"/models", "err", err)
				return
			}
			// standard OpenAI envelope: {"data": [...]}
			var envelope struct {
				Data []modelItem `json:"data"`
			}
			if json.Unmarshal(raw, &envelope) == nil && len(envelope.Data) > 0 {
				slog.Info("aggregate models: ok", "url", fwd.BaseURL+"/models", "count", len(envelope.Data))
				results[idx] = envelope.Data
				return
			}
			// some providers return a bare array
			var arr []modelItem
			if json.Unmarshal(raw, &arr) == nil && len(arr) > 0 {
				slog.Info("aggregate models: ok (bare array)", "url", fwd.BaseURL+"/models", "count", len(arr))
				results[idx] = arr
				return
			}
			slog.Warn("aggregate models: unparseable response", "url", fwd.BaseURL+"/models", "body", string(raw[:min(len(raw), 300)]))
		}(i, f)
	}
	wg.Wait()

	seen := make(map[string]bool)
	all := make([]modelItem, 0)
	for _, list := range results {
		for _, m := range list {
			id, _ := m["id"].(string)
			if id == "" || seen[id] {
				continue
			}
			seen[id] = true
			all = append(all, m)
		}
	}

	r.mcMu.Lock()
	r.mc = &cachedModels{data: all, fetchedAt: time.Now()}
	r.mcMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"object": "list", "data": r.withStatus(all)})
}

// withStatus returns a copy of the model list with each item's ado_status set
// from the health tracker. It copies each map so the cached list (shared across
// requests) is never mutated.
func (r *Registry) withStatus(list []map[string]any) []map[string]any {
	out := make([]map[string]any, len(list))
	for i, m := range list {
		cp := make(map[string]any, len(m)+1)
		for k, v := range m {
			cp[k] = v
		}
		status := "available"
		if id, _ := m["id"].(string); id != "" {
			if s := r.health.Status(id); s != "" {
				status = s
			}
		}
		cp["ado_status"] = status
		out[i] = cp
	}
	return out
}

func isFailoverStatus(code int) bool {
	// 401/403 mean the provider's own key is invalid — try the next provider.
	// 429 and 5xx mean overloaded/down — same.
	return code >= 500 || code == http.StatusTooManyRequests ||
		code == http.StatusUnauthorized || code == http.StatusForbidden
}

// max gap between chunks before we treat the stream as stalled and cancel it,
// so a wedged upstream can't pin a connection forever.
const streamIdleTimeout = 120 * time.Second

// streamResponse relays the upstream response, flushing each chunk. cancel
// cancels the upstream request; it fires on idle (watchdog) and on return.
func streamResponse(w http.ResponseWriter, resp *http.Response, cancel context.CancelFunc) error {
	defer resp.Body.Close()
	defer cancel()
	for k, vs := range resp.Header {
		if isHopByHop(k) || isUpstreamOnly(k) {
			continue
		}
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)

	idle := time.AfterFunc(streamIdleTimeout, cancel)
	defer idle.Stop()

	rc := http.NewResponseController(w)
	buf := make([]byte, 4096)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			idle.Reset(streamIdleTimeout)
			if _, werr := w.Write(buf[:n]); werr != nil {
				return werr
			}
			_ = rc.Flush()
		}
		if errors.Is(rerr, io.EOF) {
			return nil
		}
		if rerr != nil {
			return rerr
		}
	}
}

func skipRequestHeaders(h http.Header) map[string]bool {
	// Accept-Encoding is stripped so Go's transport negotiates compression
	// itself (adds gzip, auto-decompresses). Forwarding the client's value
	// (which includes "br") causes providers to send brotli, which Go doesn't
	// transparently decompress.
	skip := map[string]bool{"Cookie": true, "Accept-Encoding": true}
	for name := range hopByHop {
		skip[name] = true
	}
	for _, v := range h.Values("Connection") {
		for _, token := range strings.Split(v, ",") {
			if t := strings.TrimSpace(token); t != "" {
				skip[http.CanonicalHeaderKey(t)] = true
			}
		}
	}
	return skip
}

var hopByHop = map[string]struct{}{
	"Connection": {}, "Keep-Alive": {}, "Proxy-Authenticate": {},
	"Proxy-Authorization": {}, "Te": {}, "Trailer": {},
	"Transfer-Encoding": {}, "Upgrade": {},
}

// upstreamOnly lists headers that describe the upstream's own CORS/security
// policy. They must not be forwarded to clients — our middleware sets the
// correct values and forwarding upstream copies creates duplicate headers that
// browsers/iOS reject.
var upstreamOnly = map[string]struct{}{
	"Access-Control-Allow-Origin":      {},
	"Access-Control-Allow-Methods":     {},
	"Access-Control-Allow-Headers":     {},
	"Access-Control-Allow-Credentials": {},
	"Access-Control-Expose-Headers":    {},
	"Access-Control-Max-Age":           {},
}

func isHopByHop(k string) bool {
	_, ok := hopByHop[http.CanonicalHeaderKey(k)]
	return ok
}

func isUpstreamOnly(k string) bool {
	_, ok := upstreamOnly[http.CanonicalHeaderKey(k)]
	return ok
}
