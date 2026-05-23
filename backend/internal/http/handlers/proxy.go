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

	if _, err := p.d.Quota.Charge(r.Context(), bk.KeyID, bk.DailyLimit); err != nil {
		if errors.Is(err, quota.ErrExceeded) {
			apperr.Write(w, apperr.TooMany("QUOTA_EXCEEDED", "daily quota exceeded").
				WithExtra("limit", bk.DailyLimit))
			return
		}
		apperr.Write(w, apperr.Internal("INTERNAL", "quota"))
		return
	}
	started, err := p.d.Registry.Forward(w, r, "/chat/completions", data)
	if err != nil {
		slog.Warn("proxy forward failed", "path", "/chat/completions", "err", err)
		if !started {
			if rerr := p.d.Quota.Refund(r.Context(), bk.KeyID); rerr != nil {
				slog.Warn("quota refund failed", "err", rerr)
			}
			apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", "upstream provider unavailable"))
		}
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
