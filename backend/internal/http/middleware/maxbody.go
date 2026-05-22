package middleware

import "net/http"

// MaxBodySize wraps r.Body with http.MaxBytesReader at n bytes for every
// handler downstream. It is a last-resort backstop; per-handler Bind calls
// enforce their own (usually lower) caps first.
func MaxBodySize(n int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, n)
			next.ServeHTTP(w, r)
		})
	}
}
