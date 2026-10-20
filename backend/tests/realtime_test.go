package tests

import (
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"

	"github.com/ado/ado/backend/internal/proxy"
)

// TestRealtime_RewritesToProvider: the realtime proxy sends the request to the
// provider's /realtime with the provider's key, keeps the query string, and
// passes on neither the caller's cookies nor their IP.
func TestRealtime_RewritesToProvider(t *testing.T) {
	fx := newFixture(t)
	var got *http.Request
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Clone(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()
	fx.reg.Swap([]*proxy.Forwarder{proxy.New(upstream.URL+"/v1", "upstream-key")})

	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	_, rawKey := createDiscordUser(t, fx, c, "discord-realtime-001", "realtime@example.com")

	req, _ := http.NewRequest("GET", fx.server.URL+"/api/v1/realtime?model=m1", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("X-Forwarded-For", "203.0.113.9")
	req.Header.Set("Cookie", "ado_session=secret")
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || got == nil {
		t.Fatalf("status %d, upstream reached: %v", resp.StatusCode, got != nil)
	}
	if got.URL.Path != "/v1/realtime" || got.URL.RawQuery != "model=m1" {
		t.Fatalf("upstream got %s?%s, want /v1/realtime?model=m1", got.URL.Path, got.URL.RawQuery)
	}
	if a := got.Header.Get("Authorization"); a != "Bearer upstream-key" {
		t.Fatalf("Authorization = %q, want the provider key", a)
	}
	if got.Header.Get("Cookie") != "" || got.Header.Get("X-Forwarded-For") != "" {
		t.Fatalf("leaked headers: Cookie=%q X-Forwarded-For=%q", got.Header.Get("Cookie"), got.Header.Get("X-Forwarded-For"))
	}
}
