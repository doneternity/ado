package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"testing"
)

func TestAuth_FullFlow(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	const email = "alice@example.com"
	const pass = "hunter2-correct-horse"

	body, _ := json.Marshal(map[string]string{"email": email, "password": pass})

	// Signup must succeed but NOT create a session and NOT issue a key.
	r, err := c.Post(fx.server.URL+"/api/auth/signup", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if r.StatusCode != 201 {
		b, _ := io.ReadAll(r.Body)
		t.Fatalf("signup status=%d body=%s", r.StatusCode, b)
	}
	var signupResp struct {
		User                 map[string]any `json:"user"`
		CSRFToken            string         `json:"csrfToken"`
		KeyJustIssued        any            `json:"keyJustIssued"`
		VerificationRequired bool           `json:"verificationRequired"`
	}
	json.NewDecoder(r.Body).Decode(&signupResp)
	r.Body.Close()
	if !signupResp.VerificationRequired {
		t.Fatal("signup should require verification")
	}
	if signupResp.CSRFToken != "" || signupResp.KeyJustIssued != nil {
		t.Fatal("signup must not issue session or API key before verification")
	}

	// Before verifying, /me returns 401 and login is blocked.
	r, _ = c.Get(fx.server.URL + "/api/auth/me")
	if r.StatusCode != 401 {
		t.Fatalf("pre-verify /me status=%d, want 401", r.StatusCode)
	}
	r.Body.Close()

	loginBody, _ := json.Marshal(map[string]string{"email": email, "password": pass})
	r, _ = c.Post(fx.server.URL+"/api/auth/login", "application/json", bytes.NewReader(loginBody))
	if r.StatusCode != 403 {
		t.Fatalf("pre-verify login status=%d, want 403", r.StatusCode)
	}
	r.Body.Close()

	// Click the verification link.
	tok := mustToken(fx.mailer.Last)
	if tok == "" {
		t.Fatalf("no verification token captured (mailer.Last=%q)", fx.mailer.Last)
	}
	vbody, _ := json.Marshal(map[string]string{"token": tok})
	r, err = c.Post(fx.server.URL+"/api/auth/verify", "application/json", bytes.NewReader(vbody))
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

	// Authenticated path now works.
	r, err = c.Get(fx.server.URL + "/api/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	if r.StatusCode != 200 {
		t.Fatalf("/me status=%d", r.StatusCode)
	}
	r.Body.Close()

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

	r, _ = c.Get(fx.server.URL + "/api/auth/me")
	if r.StatusCode != 401 {
		t.Fatalf("post-logout /me status=%d, want 401", r.StatusCode)
	}
	r.Body.Close()

	r, _ = c.Post(fx.server.URL+"/api/auth/login", "application/json", bytes.NewReader(loginBody))
	if r.StatusCode != 200 {
		t.Fatalf("login status=%d, want 200", r.StatusCode)
	}
	r.Body.Close()
}

func TestAuth_LogoutWithoutCSRF_Fails(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	// Need an authenticated session, so go through signup + verify.
	_ = signupAndVerify(t, fx, c, "bob@example.com", "hunter2-correct-horse")

	r, _ := c.Post(fx.server.URL+"/api/auth/logout", "", nil)
	if r.StatusCode != 403 {
		t.Fatalf("expected 403 INVALID_CSRF, got %d", r.StatusCode)
	}
}
