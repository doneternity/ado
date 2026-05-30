package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/ado/ado/backend/internal/apperr"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/quota"
)

// maxPassthroughBody caps passthrough request bodies. Larger than chat to allow
// image/audio uploads, but bounded to protect the server.
const maxPassthroughBody = 25 << 20 // 25 MB

type ProxyDeps struct {
	Registry    *proxy.Registry
	Maintenance *proxy.MaintenanceFlag
	Quota       *quota.Service
}

type Proxy struct{ d ProxyDeps }

func NewProxy(d ProxyDeps) *Proxy { return &Proxy{d: d} }

func (p *Proxy) ChatCompletions(w http.ResponseWriter, r *http.Request) {
	if p.d.Maintenance.Enabled() {
		apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
		return
	}
	bk, ok := mw.BearerFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
		return
	}

	const maxChatBody = 512 * 1024
	data, err := io.ReadAll(io.LimitReader(r.Body, maxChatBody+1))
	if err != nil {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "could not read request body"))
		return
	}
	if int64(len(data)) > maxChatBody {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "request body too large"))
		return
	}
	if !json.Valid(data) {
		apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "invalid JSON"))
		return
	}

	var meta struct {
		Model string `json:"model"`
	}
	_ = json.Unmarshal(data, &meta)

	// When the key has reasoning mode on, ask the model to show its step-by-step
	// thinking. Injection failures fall back to the original body.
	if bk.ReasoningMode {
		data = injectReasoning(data)
	}

	if _, err := p.d.Quota.Charge(r.Context(), bk.KeyID, bk.DailyLimit); err != nil {
		if errors.Is(err, quota.ErrExceeded) {
			apperr.Write(w, apperr.TooMany("QUOTA_EXCEEDED", "daily quota exceeded").
				WithExtra("limit", bk.DailyLimit))
			return
		}
		apperr.Write(w, apperr.Internal("INTERNAL", "quota"))
		return
	}
	start := time.Now()
	res, ferr := p.d.Registry.Forward(w, r, "/chat/completions", data)
	if !res.Started {
		// No provider served the request, so it never reached a model — refund
		// and mark the model unhealthy.
		p.d.Registry.Health().Record(meta.Model, false)
		if rerr := p.d.Quota.Refund(r.Context(), bk.KeyID); rerr != nil {
			slog.Warn("quota refund failed", "err", rerr)
		}
		slog.Warn("proxy no provider", "path", "/chat/completions", "model", meta.Model, "attempts", res.Attempts, "err", ferr)
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		return
	}
	// 2xx with no stream error means the model is healthy. refund client
	// errors (4xx): they never used model capacity. 5xx/429 fail over earlier.
	if res.Status >= 200 && res.Status < 300 && ferr == nil {
		p.d.Registry.Health().Record(meta.Model, true)
	}
	if res.Status >= 400 && res.Status < 500 {
		if rerr := p.d.Quota.Refund(r.Context(), bk.KeyID); rerr != nil {
			slog.Warn("quota refund failed", "err", rerr)
		}
	}
	slog.Info("proxy request", "path", "/chat/completions", "model", meta.Model,
		"provider", res.Provider, "attempts", res.Attempts, "status", res.Status,
		"ms", time.Since(start).Milliseconds(), "stream_err", ferr != nil)
}

func (p *Proxy) Models(w http.ResponseWriter, r *http.Request) {
	if p.d.Maintenance.Enabled() {
		apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
		return
	}
	if _, ok := mw.BearerFromContext(r.Context()); !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
		return
	}
	if err := p.d.Registry.AggregateModels(w, r); err != nil {
		slog.Warn("aggregate models failed", "err", err)
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
	}
}

const reasoningInstruction = "Before giving your final answer, reason through the problem step by step and show that reasoning in your reply. Lay out your thinking first, then clearly present your final answer."

// injectReasoning adds a step-by-step reasoning instruction to a chat-completions
// body. It appends to an existing leading system message, or prepends a new one.
// Any parse failure returns the body unchanged so a malformed payload still
// reaches the upstream (which will report the real error).
func injectReasoning(body []byte) []byte {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return body
	}
	msgs, ok := payload["messages"].([]any)
	if !ok {
		return body
	}
	if len(msgs) > 0 {
		if first, ok := msgs[0].(map[string]any); ok && first["role"] == "system" {
			if content, ok := first["content"].(string); ok {
				first["content"] = content + "\n\n" + reasoningInstruction
				payload["messages"] = msgs
				if out, err := json.Marshal(payload); err == nil {
					return out
				}
				return body
			}
		}
	}
	sys := map[string]any{"role": "system", "content": reasoningInstruction}
	payload["messages"] = append([]any{sys}, msgs...)
	if out, err := json.Marshal(payload); err == nil {
		return out
	}
	return body
}

func (p *Proxy) PublicModels(w http.ResponseWriter, r *http.Request) {
	if p.d.Maintenance.Enabled() {
		apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
		return
	}
	if err := p.d.Registry.AggregateModels(w, r); err != nil {
		slog.Warn("aggregate models failed", "err", err)
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
	}
}

// Passthrough forwards a request to the given upstream path with the same
// failover/streaming behaviour as chat completions. It charges one quota unit
// and refunds it if no provider serves the request or it's rejected with a 4xx.
// Works for JSON, multipart (image/audio uploads), and binary responses.
func (p *Proxy) Passthrough(upstreamPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if p.d.Maintenance.Enabled() {
			apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
			return
		}
		bk, ok := mw.BearerFromContext(r.Context())
		if !ok {
			apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
			return
		}

		data, err := io.ReadAll(io.LimitReader(r.Body, maxPassthroughBody+1))
		if err != nil {
			apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "could not read request body"))
			return
		}
		if int64(len(data)) > maxPassthroughBody {
			apperr.Write(w, apperr.BadRequest("INVALID_INPUT", "request body too large"))
			return
		}

		if _, err := p.d.Quota.Charge(r.Context(), bk.KeyID, bk.DailyLimit); err != nil {
			if errors.Is(err, quota.ErrExceeded) {
				apperr.Write(w, apperr.TooMany("QUOTA_EXCEEDED", "daily quota exceeded").
					WithExtra("limit", bk.DailyLimit))
				return
			}
			apperr.Write(w, apperr.Internal("INTERNAL", "quota"))
			return
		}

		start := time.Now()
		res, ferr := p.d.Registry.Forward(w, r, upstreamPath, data)
		if !res.Started {
			if rerr := p.d.Quota.Refund(r.Context(), bk.KeyID); rerr != nil {
				slog.Warn("quota refund failed", "err", rerr)
			}
			slog.Warn("passthrough no provider", "path", upstreamPath, "attempts", res.Attempts, "err", ferr)
			apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
			return
		}
		if res.Status >= 400 && res.Status < 500 {
			if rerr := p.d.Quota.Refund(r.Context(), bk.KeyID); rerr != nil {
				slog.Warn("quota refund failed", "err", rerr)
			}
		}
		slog.Info("proxy request", "path", upstreamPath, "provider", res.Provider,
			"attempts", res.Attempts, "status", res.Status,
			"ms", time.Since(start).Milliseconds(), "stream_err", ferr != nil)
	}
}

// Realtime reverse-proxies the WebSocket realtime endpoint to the first active
// provider. It cannot fail over mid-connection, so it uses a single provider and
// rewrites auth to the provider key. Browser clients can't set the Authorization
// header on a WebSocket, so this serves server-side clients (Bearer required).
func (p *Proxy) Realtime(w http.ResponseWriter, r *http.Request) {
	if p.d.Maintenance.Enabled() {
		apperr.Write(w, apperr.ServiceUnavailable("MAINTENANCE", "service temporarily unavailable"))
		return
	}
	if _, ok := mw.BearerFromContext(r.Context()); !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
		return
	}
	fwd := p.d.Registry.First()
	if fwd == nil {
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		return
	}
	target, err := url.Parse(fwd.BaseURL)
	if err != nil {
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		return
	}
	rp := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.URL.Path = strings.TrimRight(target.Path, "/") + "/realtime"
			req.Host = target.Host
			req.Header.Set("Authorization", "Bearer "+fwd.APIKey)
			req.Header.Del("Cookie")
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, e error) {
			slog.Warn("realtime proxy failed", "err", e)
			apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		},
	}
	rp.ServeHTTP(w, r)
}
