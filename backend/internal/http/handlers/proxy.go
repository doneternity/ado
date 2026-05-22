package handlers

import (
	"bytes"
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

	// Validate body is JSON and cap at 512 KB before forwarding.
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
	r.Body = io.NopCloser(bytes.NewReader(data))
	r.ContentLength = int64(len(data))

	if _, err := p.d.Quota.Charge(r.Context(), bk.KeyID, bk.DailyLimit); err != nil {
		if errors.Is(err, quota.ErrExceeded) {
			apperr.Write(w, apperr.TooMany("QUOTA_EXCEEDED", "daily quota exceeded").
				WithExtra("limit", bk.DailyLimit))
			return
		}
		apperr.Write(w, apperr.Internal("INTERNAL", "quota"))
		return
	}
	if err := p.d.Registry.Get().Forward(w, r, "/chat/completions"); err != nil {
		slog.Warn("proxy forward failed", "path", "/chat/completions", "err", err)
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", err.Error()))
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
	if err := p.d.Registry.Get().Forward(w, r, "/models"); err != nil {
		slog.Warn("proxy forward failed", "path", "/models", "err", err)
		apperr.Write(w, apperr.ServiceUnavailable("NO_PROVIDER", err.Error()))
	}
}
