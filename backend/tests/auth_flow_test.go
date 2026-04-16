package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"testing"
)

func TestAuth_FullFlow(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	// Signup
	body, _ := json.Marshal(map[string]string{
		"email": "alice@example.com", "password": "hunter2-correct-horse",
	})
	r, err := c.Post(fx.server.URL+"/api/auth/signup", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if r.StatusCode != 201 {
		b, _ := io.ReadAll(r.Body)
		t.Fatalf("signup status=%d body=%s", r.StatusCode, b)
	}
	r.Body.Close()

	// Login pre-verify must 403
	r, _ = c.Post(fx.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if r.StatusCode != 403 {
		t.Fatalf("pre-verify login status=%d, want 403", r.StatusCode)
	}
	r.Body.Close()

	// Claim verify token
	tok := mustToken(fx.mailer.Last)
	if tok == "" {
		t.Fatal("no token captured by mailer")
	}
	verifyBody, _ := json.Marshal(map[string]string{"token": tok})
	r, err = c.Post(fx.server.URL+"/api/auth/verify", "application/json", bytes.NewReader(verifyBody))
	if err != nil {
		t.Fatal(err)
	}
	if r.StatusCode != 200 {
		b, _ := io.ReadAll(r.Body)
		t.Fatalf("verify status=%d body=%s", r.StatusCode, b)
	}
	var verifyResp struct {
		User      map[string]any `json:"user"`
		CSRFToken string         `json:"csrfToken"`
	}
	json.NewDecoder(r.Body).Decode(&verifyResp)
	r.Body.Close()
	if verifyResp.CSRFToken == "" {
		t.Fatal("no csrfToken in verify response")
	}

	// /me reflects logged-in user
	r, err = c.Get(fx.server.URL + "/api/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	if r.StatusCode != 200 {
		t.Fatalf("/me status=%d", r.StatusCode)
	}
	r.Body.Close()

	// Logout (CSRF required)
	req, _ := http.NewRequest("POST", fx.server.URL+"/api/auth/logout", nil)
	req.Header.Set("X-CSRF-Token", verifyResp.CSRFToken)
	r, err = c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if r.StatusCode != 204 {
		t.Fatalf("logout status=%d", r.StatusCode)
	}
	r.Body.Close()

	// /me 401 after logout
	r, _ = c.Get(fx.server.URL + "/api/auth/me")
	if r.StatusCode != 401 {
		t.Fatalf("post-logout /me status=%d, want 401", r.StatusCode)
	}
	r.Body.Close()
}

func TestAuth_LogoutWithoutCSRF_Fails(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	// signup + verify (compressed)
	body, _ := json.Marshal(map[string]string{"email": "bob@example.com", "password": "hunter2-correct-horse"})
	c.Post(fx.server.URL+"/api/auth/signup", "application/json", bytes.NewReader(body))
	tok := mustToken(fx.mailer.Last)
	c.Post(fx.server.URL+"/api/auth/verify", "application/json", strings.NewReader(`{"token":"`+tok+`"}`))

	// logout without CSRF
	r, _ := c.Post(fx.server.URL+"/api/auth/logout", "", nil)
	if r.StatusCode != 403 {
		t.Fatalf("expected 403 INVALID_CSRF, got %d", r.StatusCode)
	}
}
