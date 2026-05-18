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
	var signupResp struct {
		User      map[string]any `json:"user"`
		CSRFToken string         `json:"csrfToken"`
	}
	json.NewDecoder(r.Body).Decode(&signupResp)
	r.Body.Close()
	if signupResp.CSRFToken == "" {
		t.Fatal("no csrfToken in signup response")
	}

	r, err = c.Get(fx.server.URL + "/api/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	if r.StatusCode != 200 {
		t.Fatalf("/me status=%d", r.StatusCode)
	}
	r.Body.Close()

	req, _ := http.NewRequest("POST", fx.server.URL+"/api/auth/logout", nil)
	req.Header.Set("X-CSRF-Token", signupResp.CSRFToken)
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

	r, _ = c.Post(fx.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if r.StatusCode != 200 {
		t.Fatalf("login status=%d, want 200", r.StatusCode)
	}
	r.Body.Close()
}

func TestAuth_LogoutWithoutCSRF_Fails(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	body, _ := json.Marshal(map[string]string{"email": "bob@example.com", "password": "hunter2-correct-horse"})
	c.Post(fx.server.URL+"/api/auth/signup", "application/json", bytes.NewReader(body))

	r, _ := c.Post(fx.server.URL+"/api/auth/logout", "", nil)
	if r.StatusCode != 403 {
		t.Fatalf("expected 403 INVALID_CSRF, got %d", r.StatusCode)
	}
}
