package middleware

import (
	"crypto/subtle"
	"encoding/base64"
	"net/http"

	"github.com/ado/ado/backend/internal/apperr"
)

// CSRF requires X-CSRF-Token to match the session's csrf_token on non-GET/HEAD/OPTIONS.
// Endpoints that create the session (signup/login/verify/oauth callback) must NOT use this.
func CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		const staleCSRF = "this page is out of date (its security token doesn't match your session); reload the page and try again"
		sess, ok := SessionFromContext(r.Context())
		if !ok {
			apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "you're signed out: sign in again"))
			return
		}
		hdr := r.Header.Get("X-CSRF-Token")
		got, err := base64.RawURLEncoding.DecodeString(hdr)
		if err != nil {
			apperr.Write(w, apperr.Forbidden("INVALID_CSRF", staleCSRF))
			return
		}
		if subtle.ConstantTimeCompare(got, sess.CSRFToken) != 1 {
			apperr.Write(w, apperr.Forbidden("INVALID_CSRF", staleCSRF))
			return
		}
		next.ServeHTTP(w, r)
	})
}
