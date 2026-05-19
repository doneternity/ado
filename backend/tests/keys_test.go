package tests

import (
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"testing"
)

func TestKeys_LazyIssuanceAndRotation(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	verifyResp := signupAndVerify(t, fx, c, "carol@example.com", "hunter2-correct-horse")

	csrf, _ := verifyResp["csrfToken"].(string)
	issued, _ := verifyResp["keyJustIssued"].(map[string]any)
	if issued == nil {
		t.Fatal("expected keyJustIssued in verify response")
	}
	originalKey, _ := issued["key"].(string)
	if originalKey == "" {
		t.Fatal("expected non-empty key in verify response")
	}

	// /api/keys/current returns the prefix but never the raw.
	r, _ := c.Get(fx.server.URL + "/api/keys/current")
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
	req.Header.Set("X-CSRF-Token", csrf)
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
