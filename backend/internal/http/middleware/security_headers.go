package middleware

import "net/http"

// SecurityHeaders sets browser hardening headers on every backend response.
// Vercel adds its own to the website's pages, but not to responses it proxies
// from here (its vercel.json routes run before its headers block), so the
// backend sets them itself. The API only ever serves JSON, event streams and
// redirects, so its CSP can forbid everything.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}
