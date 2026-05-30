package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ado/ado/backend/internal/proxy"
)

func TestForwarder_Streams(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer SECRET" {
			http.Error(w, "no key", 401)
			return
		}
		flusher := w.(http.Flusher)
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(200)
		_, _ = w.Write([]byte("data: chunk1\n\n"))
		flusher.Flush()
		_, _ = w.Write([]byte("data: chunk2\n\n"))
		flusher.Flush()
	}))
	defer upstream.Close()

	body := []byte(`{"model":"gemini-pro","messages":[{"role":"user","content":"hi"}]}`)
	r := httptest.NewRequest("POST", "/chat/completions", bytes.NewReader(body))
	r.Header.Set("Authorization", "Bearer ado-anything") // overridden by Forward
	r.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	reg := proxy.NewRegistry()
	reg.Swap([]*proxy.Forwarder{proxy.New(upstream.URL, "SECRET")})
	if _, err := reg.Forward(rr, r, "/chat/completions", body); err != nil {
		t.Fatal(err)
	}

	got, _ := io.ReadAll(rr.Body)
	if !strings.Contains(string(got), "chunk1") || !strings.Contains(string(got), "chunk2") {
		t.Fatalf("did not see both chunks: %q", string(got))
	}
	if rr.Header().Get("Content-Type") != "text/event-stream" {
		t.Fatal("missing Content-Type pass-through")
	}
}

// TestForwarder_SurfacesClientErrorStatus verifies Forward reports a served
// 4xx (rather than failing over), so the handler can refund quota for it.
func TestForwarder_SurfacesClientErrorStatus(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"unknown model"}}`))
	}))
	defer upstream.Close()

	body := []byte(`{"model":"does-not-exist","messages":[{"role":"user","content":"hi"}]}`)
	r := httptest.NewRequest("POST", "/chat/completions", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	reg := proxy.NewRegistry()
	reg.Swap([]*proxy.Forwarder{proxy.New(upstream.URL, "SECRET")})

	res, err := reg.Forward(rr, r, "/chat/completions", body)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Started {
		t.Fatal("expected started=true for a non-failover 4xx")
	}
	if res.Status != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400", res.Status)
	}
}

func TestProxy_QuotaTrips(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	_, rawKey := createDiscordUser(t, fx, c, "discord-proxy-001", "dave@example.com")
	if rawKey == "" {
		t.Fatal("expected non-empty key from createDiscordUser")
	}

	chatBody := []byte(`{"model":"gemini-test","messages":[{"role":"user","content":"hi"}]}`)

	// 50 successful calls.
	for i := 0; i < 50; i++ {
		req, _ := http.NewRequest("POST", fx.server.URL+"/api/v1/chat/completions",
			bytes.NewReader(chatBody))
		req.Header.Set("Authorization", "Bearer "+rawKey)
		req.Header.Set("Content-Type", "application/json")
		resp, err := c.Do(req)
		if err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("call %d: expected 200, got %d", i, resp.StatusCode)
		}
	}

	// 51st call must be rejected.
	req, _ := http.NewRequest("POST", fx.server.URL+"/api/v1/chat/completions",
		bytes.NewReader(chatBody))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected 429 on 51st call, got %d", resp.StatusCode)
	}
	var errResp struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	json.NewDecoder(resp.Body).Decode(&errResp)
	if errResp.Error.Code != "QUOTA_EXCEEDED" {
		t.Fatalf("expected QUOTA_EXCEEDED, got %q", errResp.Error.Code)
	}
}
