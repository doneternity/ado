package middleware

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/ado/ado/backend/internal/apperr"
)

// OriginSecretHeader is set by Vercel on every request it proxies to the
// backend (frontend/vercel.json routes). Vercel overwrites any value a visitor
// sends, so only traffic that came through Vercel carries the right one.
const OriginSecretHeader = "X-Origin-Secret"

// RequireOrigin rejects requests that didn't come through Vercel, so nobody can
// call the koyeb.app URL directly and spoof X-Forwarded-For to dodge the rate
// limits. secrets is a comma-separated list, so the secret can be rotated
// without downtime: accept old and new, switch Vercel, then drop the old one.
// An empty list turns the check off (local development, tests).
//
// The platform health check (GET /api/health) calls the backend directly, so it
// stays open. The header is removed after the check so it never reaches
// handlers, logs, the admin request-info page, or upstream providers.
func RequireOrigin(secrets string) func(http.Handler) http.Handler {
	var accepted [][]byte
	for _, s := range strings.Split(secrets, ",") {
		if s = strings.TrimSpace(s); s != "" {
			accepted = append(accepted, []byte(s))
		}
	}
	return func(next http.Handler) http.Handler {
		if len(accepted) == 0 {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := []byte(r.Header.Get(OriginSecretHeader))
			r.Header.Del(OriginSecretHeader)
			if r.URL.Path == "/api/health" {
				next.ServeHTTP(w, r)
				return
			}
			ok := 0
			for _, want := range accepted {
				ok |= subtle.ConstantTimeCompare(got, want)
			}
			if ok != 1 {
				apperr.Write(w, apperr.Forbidden("DIRECT_ACCESS", "use https://adoai.space"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
