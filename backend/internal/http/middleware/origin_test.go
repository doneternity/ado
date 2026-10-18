package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireOrigin(t *testing.T) {
	var sawHeader string
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawHeader = r.Header.Get(OriginSecretHeader)
		w.WriteHeader(http.StatusOK)
	})

	cases := []struct {
		name, secrets, path, header string
		want                        int
	}{
		{"off when unset", "", "/api/keys/current", "", http.StatusOK},
		{"right secret", "s3cret", "/api/keys/current", "s3cret", http.StatusOK},
		{"missing secret", "s3cret", "/api/keys/current", "", http.StatusForbidden},
		{"wrong secret", "s3cret", "/api/v1/models", "guess", http.StatusForbidden},
		{"prefix of secret", "s3cret", "/api/v1/models", "s3c", http.StatusForbidden},
		{"old secret during rotation", "new, old", "/api/v1/models", "old", http.StatusOK},
		{"new secret during rotation", "new, old", "/api/v1/models", "new", http.StatusOK},
		{"platform health check stays open", "s3cret", "/api/health", "", http.StatusOK},
		{"deep health check is locked", "s3cret", "/api/health/deep", "", http.StatusForbidden},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			sawHeader = ""
			req := httptest.NewRequest(http.MethodGet, c.path, nil)
			if c.header != "" {
				req.Header.Set(OriginSecretHeader, c.header)
			}
			rec := httptest.NewRecorder()
			RequireOrigin(c.secrets)(ok).ServeHTTP(rec, req)
			if rec.Code != c.want {
				t.Fatalf("status = %d, want %d", rec.Code, c.want)
			}
			if c.secrets != "" && sawHeader != "" {
				t.Fatalf("secret header reached the handler: %q", sawHeader)
			}
		})
	}
}
