package handlers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/ado/ado/backend/internal/apperr"
	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/proxy"
	"github.com/ado/ado/backend/internal/quota"
)

type ProxyDeps struct {
	Forwarder *proxy.Forwarder
	Quota     *quota.Service
}

type Proxy struct{ d ProxyDeps }

func NewProxy(d ProxyDeps) *Proxy { return &Proxy{d: d} }

func (p *Proxy) ChatCompletions(w http.ResponseWriter, r *http.Request) {
	bk, ok := mw.BearerFromContext(r.Context())
	if !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
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
	// Headers may already be flushed mid-stream, so we can only log on error.
	if err := p.d.Forwarder.Forward(w, r, "/chat/completions"); err != nil {
		slog.Warn("proxy forward failed", "path", "/chat/completions", "err", err)
	}
}

func (p *Proxy) Models(w http.ResponseWriter, r *http.Request) {
	if _, ok := mw.BearerFromContext(r.Context()); !ok {
		apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "no key"))
		return
	}
	// No quota cost for /models.
	if err := p.d.Forwarder.Forward(w, r, "/models"); err != nil {
		slog.Warn("proxy forward failed", "path", "/models", "err", err)
	}
}
