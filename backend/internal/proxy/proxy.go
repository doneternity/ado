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
	"sync/atomic"
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
	// Label names this provider key in logs and alerts, e.g. "DeepSeek …a1b2".
	// Never the full key. Empty means BaseURL.
	Label string
	// Group ties together the keys of one provider: requests take turns across
	// a group's keys. 0 means not part of a group (never rotated).
	Group int

	// models holds the model IDs this provider listed on its last successful
	// /models fetch; nil until one succeeds. Forward uses it to send each
	// request only to providers that serve the requested model.
	models atomic.Pointer[map[string]bool]

	// ModelSuffix is stripped from this provider's model IDs (see alias.go);
	// aliases maps each plain ID back to the provider's own.
	ModelSuffix string
	aliases     atomic.Pointer[map[string]string]

	// lastList is this provider's model list as last fetched (already in its
	// public form), shown again when a fetch fails so one slow or failed
	// /models call doesn't hide its models from the site.
	lastList atomic.Pointer[[]map[string]any]

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

// Name is how logs and alerts refer to this forwarder.
func (f *Forwarder) Name() string {
	if f.Label != "" {
		return f.Label
	}
	return f.BaseURL
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
	for _, k := range forwardedRequestHeaders {
		for _, v := range r.Header.Values(k) {
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
		"model":      f.upstreamID(model),
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
	for _, f := range r.forModel(ctx, chain, model) {
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

// ServedModelIDs returns the IDs from the last model-list fetch, fetching the
// lists first when there's none yet (after a restart or a provider change).
func (r *Registry) ServedModelIDs(ctx context.Context) []string {
	if ids := r.CachedModelIDs(); len(ids) > 0 {
		return ids
	}
	if len(r.Get()) == 0 {
		return nil
	}
	rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	r.refreshModels(rctx)
	return r.CachedModelIDs()
}

// ForwardResult is the outcome of a Forward call (used for logging + quota).
type ForwardResult struct {
	Started  bool   // a provider response was streamed to the client
	Status   int    // http status served (0 if none)
	Provider string // base url of the provider that served (empty if none)
	Attempts int    // providers tried
	Usage    Usage  // token counts, when the provider reported them
}

// ForwardOptions adjusts one Forward call.
type ForwardOptions struct {
	// HideUsageChunk drops the usage-only stream event from what the client
	// receives (its usage is still read): set when ADO turned on
	// stream_options.include_usage and the client hadn't.
	HideUsageChunk bool
}

// Forward streams the first non-failover provider response to the client.
// tripped providers are tried last so an all-down state still gets an attempt,
// and it stops early if the client has disconnected.
func (r *Registry) Forward(w http.ResponseWriter, req *http.Request, path string, body []byte) (ForwardResult, error) {
	return r.ForwardWith(w, req, path, body, ForwardOptions{})
}

// ForwardWith is Forward with options.
func (r *Registry) ForwardWith(w http.ResponseWriter, req *http.Request, path string, body []byte, opts ForwardOptions) (ForwardResult, error) {
	chain := r.Get()
	if len(chain) == 0 {
		return ForwardResult{}, errors.New("no provider configured")
	}

	var lastErr error
	attempts := 0
	model := modelOf(body)
	chain = r.forModel(req.Context(), chain, model)
	for _, f := range failoverOrder(rotateGroups(chain, r.rr.Add(1))) {
		if cerr := req.Context().Err(); cerr != nil {
			return ForwardResult{Attempts: attempts}, cerr
		}
		attempts++

		// per-attempt context so the idle watchdog can cancel one stalled
		// upstream without touching the others.
		streamCtx, cancel := context.WithCancel(req.Context())
		// A plain ID goes to the provider as its own (tagged) ID, and is
		// swapped back in the response.
		sendBody := body
		var swap *quotedSwap
		if up := f.upstreamID(model); up != model {
			sendBody = withModel(body, up)
			swap = newQuotedSwap(up, model)
		}
		resp, derr := f.do(streamCtx, req, path, sendBody)
		if derr != nil {
			cancel()
			// client cancel isn't the provider's fault: don't trip it, just stop.
			if cerr := req.Context().Err(); cerr != nil {
				return ForwardResult{Attempts: attempts}, cerr
			}
			lastErr = derr
			f.tripBreaker()
			slog.Warn("proxy failover", "provider", f.Name(), "path", path, "reason", "request error", "err", derr)
			continue
		}
		if isFailoverStatus(resp.StatusCode) {
			lastErr = fmt.Errorf("provider returned %d", resp.StatusCode)
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			cancel()
			f.tripBreaker()
			slog.Warn("proxy failover", "provider", f.Name(), "path", path, "reason", "status", "status", resp.StatusCode)
			continue
		}
		f.resetBreaker()
		// Keep the end of the response to read its token usage; content is not kept.
		tail := newTailBuffer(16 << 10)
		var filter *usageChunkFilter
		if opts.HideUsageChunk {
			filter = &usageChunkFilter{}
		}
		serr := streamResponse(w, resp, cancel, tail, swap, filter)
		if serr != nil && req.Context().Err() == nil && isEventStream(resp) {
			// The provider stalled or dropped mid-reply while the client is
			// still there. Say so in the stream (OpenAI's SDKs raise an error
			// for an event with an "error" field) rather than just stopping,
			// which looks like a finished but truncated reply.
			writeStreamError(w, serr)
		}
		return ForwardResult{Started: true, Status: resp.StatusCode, Provider: f.BaseURL, Attempts: attempts, Usage: parseUsage(tail.Bytes())}, serr
	}
	return ForwardResult{Attempts: attempts}, lastErr
}

// rotateGroups spreads load across a provider's keys: within each run of
// forwarders sharing a non-zero Group, it starts at a different key each call
// (n is a per-request counter). Group order and ungrouped entries are kept, so
// failover still goes through the rest of a provider's keys before moving on.
func rotateGroups(chain []*Forwarder, n uint64) []*Forwarder {
	out := make([]*Forwarder, 0, len(chain))
	for i := 0; i < len(chain); {
		j := i + 1
		if g := chain[i].Group; g != 0 {
			for j < len(chain) && chain[j].Group == g {
				j++
			}
		}
		group := chain[i:j]
		start := int(n % uint64(len(group)))
		out = append(out, group[start:]...)
		out = append(out, group[:start]...)
		i = j
	}
	return out
}

// modelOf reads the "model" field of a JSON body ("" for anything else, such
// as a multipart upload).
func modelOf(body []byte) string {
	var meta struct {
		Model string `json:"model"`
	}
	if json.Unmarshal(body, &meta) != nil {
		return ""
	}
	return meta.Model
}

// modelRefreshEvery limits how often an unlisted model makes Forward re-fetch
// the providers' model lists, so a burst of requests for a made-up name can't
// hammer /models.
const modelRefreshEvery = 30 * time.Second

// forModel narrows the chain to the providers that list the model, so a
// request for one provider's model never lands on another (which would answer
// 400 "unknown model", and a 400 doesn't fail over). Providers whose list
// couldn't be read stay as a last resort. A model nobody lists keeps the whole
// chain, as before, after one fresh look at the lists.
func (r *Registry) forModel(ctx context.Context, chain []*Forwarder, model string) []*Forwarder {
	if model == "" {
		return chain
	}
	serving, unknown := splitByModel(chain, model)
	if len(serving) == 0 && time.Since(time.Unix(0, r.lastRefresh.Load())) > modelRefreshEvery {
		rctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		r.refreshModels(rctx)
		cancel()
		serving, unknown = splitByModel(chain, model)
	}
	if len(serving) == 0 {
		return chain
	}
	return append(serving, unknown...)
}

func splitByModel(chain []*Forwarder, model string) (serving, unknown []*Forwarder) {
	for _, f := range chain {
		m := f.models.Load()
		switch {
		case m == nil:
			unknown = append(unknown, f)
		case (*m)[model]:
			serving = append(serving, f)
		}
	}
	return serving, unknown
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

	all := r.refreshModels(req.Context())
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(map[string]any{"object": "list", "data": r.withStatus(all)})
}

// refreshModels fetches every provider's model list concurrently, records
// which models each one serves (for forModel), and caches the merged,
// deduplicated list. A provider whose fetch fails contributes the list it
// served last time, if any, so a blip doesn't empty the site's model list.
func (r *Registry) refreshModels(ctx context.Context) []map[string]any {
	r.lastRefresh.Store(time.Now().UnixNano())
	chain := r.Get()

	type modelItem = map[string]any
	results := make([][]modelItem, len(chain))
	var wg sync.WaitGroup
	for i, f := range chain {
		wg.Add(1)
		go func(idx int, fwd *Forwarder) {
			defer wg.Done()
			if list, ok := fwd.fetchModels(ctx); ok {
				results[idx] = list
			} else if last := fwd.lastList.Load(); last != nil {
				results[idx] = *last // keep showing what it served last time
			}
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
	return all
}

// fetchModels gets this provider's /models list and records it (setModels).
// ok is false when the list couldn't be fetched or read.
func (f *Forwarder) fetchModels(ctx context.Context) (list []map[string]any, ok bool) {
	// bound each fetch so one slow upstream can't stall the aggregation.
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "/models", nil)
	if err != nil {
		return nil, false
	}
	resp, err := f.do(ctx, req, "/models", nil)
	if err != nil {
		slog.Warn("aggregate models: request failed", "url", f.BaseURL+"/models", "err", err)
		return nil, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		slog.Warn("aggregate models: non-200 response", "url", f.BaseURL+"/models", "status", resp.StatusCode)
		return nil, false
	}
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		slog.Warn("aggregate models: read body failed", "url", f.BaseURL+"/models", "err", err)
		return nil, false
	}
	// standard OpenAI envelope: {"data": [...]}
	var envelope struct {
		Data []map[string]any `json:"data"`
	}
	if json.Unmarshal(raw, &envelope) == nil && len(envelope.Data) > 0 {
		slog.Info("aggregate models: ok", "url", f.BaseURL+"/models", "count", len(envelope.Data))
		return f.setModels(envelope.Data), true
	}
	// some providers return a bare array
	var arr []map[string]any
	if json.Unmarshal(raw, &arr) == nil && len(arr) > 0 {
		slog.Info("aggregate models: ok (bare array)", "url", f.BaseURL+"/models", "count", len(arr))
		return f.setModels(arr), true
	}
	slog.Warn("aggregate models: unparseable response", "url", f.BaseURL+"/models", "body", string(raw[:min(len(raw), 300)]))
	return nil, false
}

// setModels records the model IDs from this provider's /models response.
// It returns the list as ADO shows it: with ModelSuffix set, plain IDs and
// names. Both the plain and the provider's own ID count as served.
func (f *Forwarder) setModels(list []map[string]any) []map[string]any {
	ids := make(map[string]bool, len(list))
	aliases := map[string]string{}
	nameRe := suffixNamePattern(f.ModelSuffix)
	out := make([]map[string]any, 0, len(list))
	for _, m := range list {
		id, _ := m["id"].(string)
		if id == "" {
			continue
		}
		ids[id] = true
		pub := f.publicID(id)
		if pub != id {
			ids[pub] = true
			aliases[pub] = id
			m = f.publicEntry(m, nameRe)
		}
		out = append(out, m)
	}
	f.models.Store(&ids)
	f.aliases.Store(&aliases)
	f.lastList.Store(&out)
	return out
}

// withStatus returns the model list as ADO publishes it: only publicFields
// (providers add their own, such as prices, internal flags or which reseller
// they are, and those stay private), owned_by only when it names a model
// maker, and ado_status from the health tracker. It builds new maps, so the
// cached list (shared across requests) is never mutated.
func (r *Registry) withStatus(list []map[string]any) []map[string]any {
	out := make([]map[string]any, len(list))
	for i, m := range list {
		cp := publicModel(m)
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

// publicFields are the /models fields passed on as the provider sent them.
var publicFields = []string{
	"id", "object", "created", "name", "display_name",
	"context_length", "context_window", "max_output_tokens",
	"input_modalities", "output_modalities", "effort", "reasoning", "supported_parameters",
}

// publicCapabilities are the parts of a provider's capabilities object the
// site reads (context size, image input, reasoning).
var publicCapabilities = []string{"contextWindow", "vision", "reasoning"}

// modelMakers are owned_by values worth passing on: they name who made the
// model, which the site uses to group models. Anything else (a reseller's own
// name, "system", "organization-owner") becomes "ado".
var modelMakers = []string{
	"deepseek", "openai", "anthropic", "google", "xai", "x-ai", "z-ai", "zai", "zhipu",
	"moonshot", "kimi", "meta", "mistral", "qwen", "alibaba", "cohere", "microsoft", "nvidia", "amazon",
}

func publicModel(m map[string]any) map[string]any {
	cp := make(map[string]any, len(publicFields)+3)
	for _, k := range publicFields {
		if v, ok := m[k]; ok {
			cp[k] = v
		}
	}
	if _, ok := cp["object"]; !ok {
		cp["object"] = "model"
	}
	cp["owned_by"] = "ado"
	if owner, _ := m["owned_by"].(string); owner != "" {
		l := strings.ToLower(owner)
		for _, maker := range modelMakers {
			if strings.Contains(l, maker) {
				cp["owned_by"] = owner
				break
			}
		}
	}
	if caps, ok := m["capabilities"].(map[string]any); ok {
		kept := map[string]any{}
		for _, k := range publicCapabilities {
			if v, ok := caps[k]; ok {
				kept[k] = v
			}
		}
		if len(kept) > 0 {
			cp["capabilities"] = kept
		}
	}
	return cp
}

func isFailoverStatus(code int) bool {
	// 401/403 mean the provider's own key is invalid, and 402 that ADO's
	// account with it is out of credit: try the next provider, and never pass
	// those on, since a caller would read them as a problem with their own
	// key or balance. 429 and 5xx mean overloaded/down: same.
	return code >= 500 || code == http.StatusTooManyRequests ||
		code == http.StatusUnauthorized || code == http.StatusPaymentRequired ||
		code == http.StatusForbidden
}

func isEventStream(resp *http.Response) bool {
	return strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream")
}

// writeStreamError ends a broken stream with an error event.
func writeStreamError(w http.ResponseWriter, serr error) {
	msg := "the provider's connection dropped partway through the reply, so it's incomplete; try again"
	if errors.Is(serr, context.Canceled) || errors.Is(serr, context.DeadlineExceeded) {
		msg = fmt.Sprintf("the provider stopped sending for %d seconds partway through the reply, so it's incomplete; try again", int(streamIdleTimeout.Seconds()))
	}
	body, _ := json.Marshal(map[string]any{"error": map[string]string{
		"code": "STREAM_INTERRUPTED", "type": "api_error", "message": msg,
	}})
	_, _ = fmt.Fprintf(w, "\n\ndata: %s\n\n", body)
	_ = http.NewResponseController(w).Flush()
}

// max gap between chunks before we treat the stream as stalled and cancel it,
// so a wedged upstream can't pin a connection forever.
const streamIdleTimeout = 120 * time.Second

// streamResponse relays the upstream response, flushing each chunk. cancel
// cancels the upstream request; it fires on idle (watchdog) and on return.
// tail, if non-nil, receives a copy of what is streamed (it keeps only the end).
// swap, if non-nil, replaces the provider's tagged model ID in the body.
// filter, if non-nil, drops the usage-only event after tail has seen it.
func streamResponse(w http.ResponseWriter, resp *http.Response, cancel context.CancelFunc, tail *tailBuffer, swap *quotedSwap, filter *usageChunkFilter) error {
	defer resp.Body.Close()
	defer cancel()
	for _, k := range forwardedResponseHeaders {
		if swap != nil && k == "Content-Length" {
			continue // the swap changes the length
		}
		for _, v := range resp.Header.Values(k) {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)

	idle := time.AfterFunc(streamIdleTimeout, cancel)
	defer idle.Stop()

	rc := http.NewResponseController(w)
	buf := make([]byte, 4096)
	send := func(p []byte) error {
		if len(p) == 0 {
			return nil
		}
		if _, werr := w.Write(p); werr != nil {
			return werr
		}
		_ = rc.Flush()
		return nil
	}
	write := func(p []byte) error {
		if len(p) == 0 {
			return nil
		}
		if tail != nil {
			tail.Write(p)
		}
		if filter != nil {
			p = filter.push(p)
		}
		return send(p)
	}
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			idle.Reset(streamIdleTimeout)
			chunk := buf[:n]
			if swap != nil {
				chunk = swap.push(chunk)
			}
			if werr := write(chunk); werr != nil {
				return werr
			}
		}
		if errors.Is(rerr, io.EOF) {
			if swap != nil {
				if werr := write(swap.flush()); werr != nil {
					return werr
				}
			}
			if filter != nil {
				return send(filter.flush())
			}
			return nil
		}
		if rerr != nil {
			return rerr
		}
	}
}

// forwardedRequestHeaders are the only client headers a provider receives
// (Authorization is replaced by the provider's own key). Everything else stays
// with ADO: the visitor's IP and location (X-Forwarded-For, X-Real-Ip,
// Vercel's X-Vercel-IP-* headers), cookies, the Playground's CSRF token, and
// a second copy of the ADO key some clients send as x-api-key.
// Accept-Encoding is left out on purpose: Go's transport then asks for gzip
// itself and decompresses it, where a client's "br" would come back as
// brotli it can't read.
var forwardedRequestHeaders = []string{
	"Content-Type", "Accept", "Idempotency-Key",
	"Openai-Beta", "Anthropic-Version", "Anthropic-Beta",
}

// forwardedResponseHeaders are the only provider headers a client receives.
// The rest describe the provider, not ADO: cookies it would set on adoai.space
// (the Playground runs there), its own rate limits and request IDs, CORS and
// security headers (ADO's middleware sets those), connection headers.
var forwardedResponseHeaders = []string{
	"Content-Type", "Content-Length", "Content-Encoding",
	"Content-Disposition", "Content-Language", "Cache-Control",
}
