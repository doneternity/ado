package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	mw "github.com/ado/ado/backend/internal/http/middleware"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func TestCORSPrivate_MatchingOriginSetsHeaders(t *testing.T) {
	origin := "https://ado.vercel.app"
	h := mw.CORSPrivate(origin)(okHandler())

	req := httptest.NewRequest("GET", "/api/auth/me", nil)
	req.Header.Set("Origin", origin)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != origin {
		t.Errorf("Allow-Origin = %q, want %q", got, origin)
	}
	if got := rr.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Errorf("Allow-Credentials = %q, want \"true\"", got)
	}
	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rr.Code)
	}
}

func TestCORSPrivate_NonMatchingOriginNoHeaders(t *testing.T) {
	h := mw.CORSPrivate("https://ado.vercel.app")(okHandler())

	req := httptest.NewRequest("GET", "/api/auth/me", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Allow-Origin = %q, want empty", got)
	}
}

func TestCORSPrivate_PreflightReturns204(t *testing.T) {
	origin := "https://ado.vercel.app"
	h := mw.CORSPrivate(origin)(okHandler())

	req := httptest.NewRequest("OPTIONS", "/api/auth/login", nil)
	req.Header.Set("Origin", origin)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rr.Code)
	}
}

func TestCORSPrivate_NonMatchingOriginPreflightReturns403(t *testing.T) {
	h := mw.CORSPrivate("https://ado.vercel.app")(okHandler())

	req := httptest.NewRequest("OPTIONS", "/api/auth/login", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", rr.Code)
	}
}

func TestCORSPrivate_EmptyOriginPassThrough(t *testing.T) {
	h := mw.CORSPrivate("")(okHandler())

	req := httptest.NewRequest("GET", "/api/auth/me", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Allow-Origin = %q, want empty (no-op mode)", got)
	}
	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rr.Code)
	}
}
