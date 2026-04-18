package tests

import (
	"net/http"
	"strings"
	"testing"
)

func TestGoogle_Start_Redirects(t *testing.T) {
	fx := newFixture(t)
	if fx == nil {
		t.Skip("no fixture")
	}

	c := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	r, err := c.Get(fx.server.URL + "/api/auth/google")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	// Accept 404 when Google client wasn't initialized in the fixture (env unset).
	if r.StatusCode == http.StatusNotFound {
		t.Skip("google oauth disabled in fixture (no client ID)")
	}
	if r.StatusCode != http.StatusFound {
		t.Fatalf("status=%d, want 302", r.StatusCode)
	}
	loc := r.Header.Get("Location")
	if !strings.Contains(loc, "accounts.google.com") {
		t.Fatalf("Location=%q, want google", loc)
	}
}

func TestGoogle_Callback_InvalidState(t *testing.T) {
	fx := newFixture(t)
	r, err := http.Get(fx.server.URL + "/api/auth/google/callback?code=x&state=bogus")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode == http.StatusNotFound {
		t.Skip("google oauth disabled in fixture")
	}
	if r.StatusCode != 400 {
		t.Fatalf("status=%d, want 400", r.StatusCode)
	}
}
