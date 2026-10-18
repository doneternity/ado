package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"

	mw "github.com/ado/ado/backend/internal/http/middleware"
)

// proxyHeaders are the headers proxies commonly use to pass on the visitor's
// address. Shown so CLIENT_IP_HEADER / TRUSTED_PROXY_HOPS can be set from
// what actually arrives.
var proxyHeaders = []string{
	"X-Forwarded-For", "X-Real-Ip", "X-Vercel-Forwarded-For", "Cf-Connecting-Ip",
	"True-Client-Ip", "Forwarded", "X-Forwarded-Host", "X-Forwarded-Proto",
}

// AdminRequestInfo is an admin-only diagnostic: how the backend sees the
// caller's request, and whether the rate limiter is working.
type AdminRequestInfo struct{ limiter *mw.Limiter }

func NewAdminRequestInfo(l *mw.Limiter) *AdminRequestInfo { return &AdminRequestInfo{limiter: l} }

func (h *AdminRequestInfo) Get(w http.ResponseWriter, r *http.Request) {
	headers := map[string]string{}
	for _, k := range proxyHeaders {
		if v := r.Header.Get(k); v != "" {
			headers[k] = v
		}
	}

	// Two hits on a throwaway key with limit 1: a working limiter allows the
	// first and blocks the second.
	limiter := map[string]any{}
	key := "rl:diag:" + uuid.NewString()
	first, _, err1 := h.limiter.Check(r.Context(), key, 1, 10*time.Second)
	second, _, err2 := h.limiter.Check(r.Context(), key, 1, 10*time.Second)
	switch {
	case err1 != nil:
		limiter["ok"], limiter["error"] = false, err1.Error()
	case err2 != nil:
		limiter["ok"], limiter["error"] = false, err2.Error()
	default:
		limiter["ok"] = first && !second
		limiter["firstAllowed"], limiter["secondAllowed"] = first, second
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"clientIP":   mw.ClientIP(r),
		"remoteAddr": r.RemoteAddr,
		"headers":    headers,
		"limiter":    limiter,
	})
}
