package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"testing"
)

func TestKeys_LazyIssuanceAndRotation(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	// Signup + verify (compressed).
	body, _ := json.Marshal(map[string]string{"email": "carol@example.com", "password": "hunter2-correct-horse"})
	c.Post(fx.server.URL+"/api/auth/signup", "application/json", bytes.NewReader(body))
	tok := mustToken(fx.mailer.Last)
	r, _ := c.Post(fx.server.URL+"/api/auth/verify", "application/json", strings.NewReader(`{"token":"`+tok+`"}`))
	var verifyResp struct {
		User      map[string]any `json:"user"`
		CSRFToken string         `json:"csrfToken"`
		KeyJustIssued *struct {
			Key        string `json:"key"`
			KeyPrefix  string `json:"keyPrefix"`
			DailyLimit int    `json:"dailyLimit"`
		} `json:"keyJustIssued"`
	}
	json.NewDecoder(r.Body).Decode(&verifyResp)
	r.Body.Close()
	if verifyResp.KeyJustIssued == nil || verifyResp.KeyJustIssued.Key == "" {
		t.Fatal("expected keyJustIssued in verify response")
	}
	originalKey := verifyResp.KeyJustIssued.Key

	// /api/keys/current returns the prefix but never the raw.
	r, _ = c.Get(fx.server.URL + "/api/keys/current")
	var current map[string]any
	json.NewDecoder(r.Body).Decode(&current)
	r.Body.Close()
	if _, has := current["key"]; has {
		t.Fatal("/current must not return raw key")
	}
	if current["keyPrefix"] == nil {
		t.Fatal("/current must return keyPrefix")
	}

	// Rotate (CSRF required).
	req, _ := http.NewRequest("POST", fx.server.URL+"/api/keys/rotate", nil)
	req.Header.Set("X-CSRF-Token", verifyResp.CSRFToken)
	r, _ = c.Do(req)
	var rot struct {
		Key string `json:"key"`
	}
	json.NewDecoder(r.Body).Decode(&rot)
	r.Body.Close()
	if rot.Key == "" || rot.Key == originalKey {
		t.Fatalf("rotate produced %q, want different non-empty key", rot.Key)
	}
}
