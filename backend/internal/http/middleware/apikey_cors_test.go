package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIKeyFrom(t *testing.T) {
	for _, c := range []struct {
		auth, apiKey, want string
	}{
		{"Bearer ado-abc", "", "ado-abc"},
		{"bearer ado-abc", "", "ado-abc"}, // the scheme is case-insensitive
		{"BEARER  ado-abc ", "", "ado-abc"},
		{"", "ado-xyz", "ado-xyz"}, // Anthropic SDK / Claude Code
		{"Basic Zm9v", "", ""},
		{"", "", ""},
	} {
		r := httptest.NewRequest("POST", "/", nil)
		if c.auth != "" {
			r.Header.Set("Authorization", c.auth)
		}
		if c.apiKey != "" {
			r.Header.Set("X-Api-Key", c.apiKey)
		}
		if got := apiKeyFrom(r); got != c.want {
			t.Errorf("auth %q x-api-key %q: got %q, want %q", c.auth, c.apiKey, got, c.want)
		}
	}
}

// A browser app's preflight is allowed whatever SDK headers it asks for
// (the OpenAI JS SDK sends x-stainless-*), and the limits are readable.
func TestCORSPublic_EchoesRequestedHeaders(t *testing.T) {
	h := CORSPublic(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	r := httptest.NewRequest("OPTIONS", "/api/v1/chat/completions", nil)
	r.Header.Set("Origin", "https://app.example")
	r.Header.Set("Access-Control-Request-Method", "POST")
	r.Header.Set("Access-Control-Request-Headers", "authorization, content-type, x-stainless-os, x-stainless-lang")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, r)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("preflight status %d", rr.Code)
	}
	if got := rr.Header().Get("Access-Control-Allow-Headers"); got != "authorization, content-type, x-stainless-os, x-stainless-lang" {
		t.Fatalf("allowed headers = %q", got)
	}
	if rr.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Fatal("public CORS must never allow credentials")
	}
	if rr.Header().Get("Access-Control-Expose-Headers") == "" {
		t.Fatal("rate-limit headers should be readable by browser apps")
	}
}
