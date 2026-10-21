package tests

import (
	"context"
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
	req.Header.Set("X-Real-Ip", "203.0.113.9")
	req.Header.Set("X-Vercel-Ip-City", "Lisbon")
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
	for _, h := range []string{"Cookie", "X-Forwarded-For", "X-Real-Ip", "X-Vercel-Ip-City"} {
		if v := got.Header.Get(h); v != "" {
			t.Fatalf("leaked header %s: %q", h, v)
		}
	}

	// The connection counts as one request against the daily quota.
	var used int
	if err := fx.pool.QueryRow(context.Background(), `
		SELECT COALESCE(SUM(u.used), 0) FROM daily_usage u
		JOIN ado_keys k ON k.id = u.key_id
		JOIN users us ON us.id = k.user_id
		WHERE us.email = 'realtime@example.com' AND u.day = CURRENT_DATE`).Scan(&used); err != nil {
		t.Fatal(err)
	}
	if used != 1 {
		t.Fatalf("quota used = %d, want 1 for the connection", used)
	}
}
