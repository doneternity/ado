package middleware

import "net/http"

// CORSPublic permits cross-origin requests without credentials.
// Use only on /api/v1/* (bearer-key endpoints) and other public reads. No
// Allow-Credentials: we don't accept cookies here.
//
// Allowed request headers echo whatever the browser asks for in its
// preflight. SDKs send their own (the OpenAI JavaScript SDK adds x-stainless-*
// headers to every call, the Anthropic one x-api-key and anthropic-version),
// and a fixed list made browsers block those apps outright. That's safe here
// because no cookies are involved and providers only ever receive an
// allowlist of headers (proxy.forwardedRequestHeaders).
func CORSPublic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if asked := r.Header.Get("Access-Control-Request-Headers"); asked != "" {
			h.Set("Access-Control-Allow-Headers", asked)
			h.Add("Vary", "Access-Control-Request-Headers")
		} else {
			h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key")
		}
		// Let browser apps read the limits and when to retry.
		h.Set("Access-Control-Expose-Headers", "Retry-After, X-Ratelimit-Limit-Requests, X-Ratelimit-Remaining-Requests, X-Ratelimit-Reset-Requests, X-Ado-Quota-Limit, X-Ado-Quota-Remaining, X-Ado-Quota-Reset")
		h.Set("Access-Control-Max-Age", "86400")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
