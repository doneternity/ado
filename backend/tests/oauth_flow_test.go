package tests

import (
	"net/http"
	"strings"
	"testing"
)

func TestDiscord_Start_Redirects(t *testing.T) {
	fx := newFixture(t)

	c := &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	r, err := c.Get(fx.server.URL + "/api/auth/discord")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode == http.StatusNotFound {
		t.Skip("discord oauth not configured in fixture")
	}
	if r.StatusCode != http.StatusFound {
		t.Fatalf("status=%d, want 302", r.StatusCode)
	}
	loc := r.Header.Get("Location")
	if !strings.Contains(loc, "discord.com") {
		t.Fatalf("Location=%q, want discord.com", loc)
	}
}

func TestDiscord_Callback_InvalidState(t *testing.T) {
	fx := newFixture(t)
	c := &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	r, err := c.Get(fx.server.URL + "/api/auth/discord/callback?code=x&state=bogus")
	if err != nil {
		t.Fatal(err)
	}
	defer r.Body.Close()
	if r.StatusCode == http.StatusNotFound {
		t.Skip("discord oauth not configured in fixture")
	}
	// Invalid state redirects the browser to a friendly login error rather than
	// dumping a raw JSON 400.
	if r.StatusCode != http.StatusFound {
		t.Fatalf("status=%d, want 302", r.StatusCode)
	}
	if loc := r.Header.Get("Location"); !strings.Contains(loc, "/login?error=auth_failed") {
		t.Fatalf("Location=%q, want /login?error=auth_failed", loc)
	}
}
