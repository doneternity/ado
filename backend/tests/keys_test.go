package tests

import (
	"bytes"
	"net/http"
	"net/http/cookiejar"
	"testing"
)

func TestKeys_LazyIssuanceAndRotation(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	csrf, originalKey := createDiscordUser(t, fx, c, "discord-keys-001", "carol@example.com")
	if originalKey == "" {
		t.Fatal("expected a raw API key from createDiscordUser")
	}

	// /api/keys/current returns the prefix but never the raw key.
	r, _ := c.Get(fx.server.URL + "/api/keys/current")
	var current map[string]any
	decodeJSON(t, r, &current)
	if _, has := current["key"]; has {
		t.Fatal("/current must not return raw key")
	}
	if current["keyPrefix"] == nil {
		t.Fatal("/current must return keyPrefix")
	}

	// Rotate (CSRF required).
	req, _ := http.NewRequest("POST", fx.server.URL+"/api/keys/rotate", nil)
	req.Header.Set("X-CSRF-Token", csrf)
	r, _ = c.Do(req)
	var rot struct {
		Key string `json:"key"`
	}
	decodeJSON(t, r, &rot)
	if rot.Key == "" || rot.Key == originalKey {
		t.Fatalf("rotate produced %q, want different non-empty key", rot.Key)
	}

	// Old key must be rejected now that it is revoked.
	chatBody := []byte(`{"model":"gemini-test","messages":[{"role":"user","content":"hi"}]}`)
	req, _ = http.NewRequest("POST", fx.server.URL+"/api/v1/chat/completions", bytes.NewReader(chatBody))
	req.Header.Set("Authorization", "Bearer "+originalKey)
	req.Header.Set("Content-Type", "application/json")
	r, _ = c.Do(req)
	r.Body.Close()
	if r.StatusCode != http.StatusUnauthorized {
		t.Fatalf("revoked key should be rejected with 401, got %d", r.StatusCode)
	}
}
