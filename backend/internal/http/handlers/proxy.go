package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/ado/ado/backend/internal/apperr"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/quota"
)

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
	started, status, err := p.d.Registry.Forward(w, r, "/chat/completions", data)
	if !started {
		// No provider served the request, so it never reached a model — refund
		// and mark the model unhealthy.
		p.d.Registry.Health().Record(meta.Model, false)
		if rerr := p.d.Quota.Refund(r.Context(), bk.KeyID); rerr != nil {
			slog.Warn("quota refund failed", "err", rerr)
		}
		if err != nil {
			slog.Warn("proxy forward failed", "path", "/chat/completions", "err", err)
		}
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		return
	}
	// A response was streamed. A 2xx means the model is healthy. Don't charge the
	// user's daily quota for their own client error (4xx) — those never consumed
	// model capacity. 5xx/429 from the provider are failover statuses and never
	// reach here.
	if status >= 200 && status < 300 {
		p.d.Registry.Health().Record(meta.Model, true)
	}
	if status >= 400 && status < 500 {
		if rerr := p.d.Quota.Refund(r.Context(), bk.KeyID); rerr != nil {
			slog.Warn("quota refund failed", "err", rerr)
		}
	}
	if err != nil {
		slog.Warn("proxy stream interrupted", "path", "/chat/completions", "err", err)
	}
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
