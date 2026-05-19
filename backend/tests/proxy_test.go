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

	f := proxy.New(upstream.URL, "SECRET")

	r := httptest.NewRequest("POST", "/chat/completions",
		bytes.NewReader([]byte(`{"model":"gemini-pro","messages":[{"role":"user","content":"hi"}]}`)))
	r.Header.Set("Authorization", "Bearer ado-anything") // overridden by Forward
	r.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	if err := f.Forward(rr, r, "/chat/completions"); err != nil {
		t.Fatal(err)
	}

	body, _ := io.ReadAll(rr.Body)
	if !strings.Contains(string(body), "chunk1") || !strings.Contains(string(body), "chunk2") {
		t.Fatalf("did not see both chunks: %q", string(body))
	}
	if rr.Header().Get("Content-Type") != "text/event-stream" {
		t.Fatal("missing Content-Type pass-through")
	}
}

func TestProxy_QuotaTrips(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	verifyResp := signupAndVerify(t, fx, c, "dave@example.com", "hunter2-correct-horse")
	issued, _ := verifyResp["keyJustIssued"].(map[string]any)
	if issued == nil {
		t.Fatal("expected keyJustIssued in verify response")
	}
	rawKey, _ := issued["key"].(string)
	if rawKey == "" {
		t.Fatal("expected non-empty key in verify response")
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
