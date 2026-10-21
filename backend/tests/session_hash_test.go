package tests

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"testing"
)

// The database keeps only a hash of each session token, so a copy of it can't
// be used to sign in, and the cookie still works.
func TestSessions_StoredHashed(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	createDiscordUser(t, fx, c, "discord-hash-001", "hash@example.com")

	var cookie string
	for _, ck := range jar.Cookies(mustParse(t, fx.server.URL)) {
		if ck.Name == "ado_session" {
			cookie = ck.Value
		}
	}
	token, err := base64.RawURLEncoding.DecodeString(cookie)
	if err != nil || len(token) == 0 {
		t.Fatalf("session cookie %q: %v", cookie, err)
	}
	sum := sha256.Sum256(token)
	var raw, hashed int
	ctx := context.Background()
	_ = fx.pool.QueryRow(ctx, `SELECT count(*) FROM sessions WHERE id = $1`, token).Scan(&raw)
	_ = fx.pool.QueryRow(ctx, `SELECT count(*) FROM sessions WHERE id = $1`, sum[:]).Scan(&hashed)
	if raw != 0 || hashed != 1 {
		t.Fatalf("rows matching the raw token: %d (want 0), its hash: %d (want 1)", raw, hashed)
	}

	r, err := c.Get(fx.server.URL + "/api/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	r.Body.Close()
	if r.StatusCode != http.StatusOK {
		t.Fatalf("/api/auth/me with the cookie: %d", r.StatusCode)
	}
}

func mustParse(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u
}
