package tests

import (
	"context"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"

	"github.com/ado/ado/backend/internal/proxy"
)

// TestStatusHistory_SuccessRates: the public history counts 2xx as success and
// 5xx as failure, ignores client errors, lists only models a provider serves,
// and never exposes request counts.
func TestStatusHistory_SuccessRates(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	createDiscordUser(t, fx, c, "discord-status-hist", "statushist@example.com")

	// A provider that lists exactly one model.
	lister := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"served-model"}]}`))
	}))
	t.Cleanup(lister.Close)
	fx.reg.Swap([]*proxy.Forwarder{proxy.New(lister.URL, "k")})

	ctx := context.Background()
	var userID string
	if err := fx.pool.QueryRow(ctx, `SELECT id FROM users WHERE email = 'statushist@example.com'`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		model  string
		status int
	}{
		{"served-model", 200}, {"served-model", 200}, {"served-model", 503},
		{"served-model", 400}, // client error: not counted
		{"made-up", 503},      // not served: never listed or counted
	} {
		if _, err := fx.pool.Exec(ctx, `INSERT INTO request_log (user_id, endpoint, model, status, duration_ms) VALUES ($1, '/chat/completions', $2, $3, 10)`,
			userID, row.model, row.status); err != nil {
			t.Fatal(err)
		}
	}

	resp, err := http.Get(fx.server.URL + "/api/status/history?range=24h")
	if err != nil {
		t.Fatal(err)
	}
	var h struct {
		Range   string
		Buckets []string
		Overall struct {
			Rate   *float64
			Series []*float64
		}
		Models []struct {
			ID     string
			Rate   *float64
			Series []*float64
		}
	}
	decodeJSON(t, resp, &h)

	if h.Range != "24h" || len(h.Buckets) != 24 {
		t.Fatalf("range %q with %d buckets", h.Range, len(h.Buckets))
	}
	if len(h.Models) != 1 || h.Models[0].ID != "served-model" {
		t.Fatalf("models: %+v", h.Models)
	}
	m := h.Models[0]
	if m.Rate == nil || *m.Rate != 66.7 || m.Series[23] == nil || *m.Series[23] != 66.7 {
		t.Fatalf("served-model rate: %v, last slot %v (want 66.7: 2 of 3, the 400 ignored)", m.Rate, m.Series[23])
	}
	if h.Overall.Rate == nil || *h.Overall.Rate != 66.7 {
		t.Fatalf("overall: %v (the made-up model must not count)", h.Overall.Rate)
	}
}
