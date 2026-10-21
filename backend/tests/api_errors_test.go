package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ado/ado/backend/internal/proxy"
)

func apiCall(t *testing.T, fx *fixture, headers map[string]string, body string) (int, http.Header, string) {
	t.Helper()
	req, _ := http.NewRequest("POST", fx.server.URL+"/api/v1/chat/completions", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, resp.Header, string(b)
}

// TestAPI_ModelErrorsAndKeyHeaders: an unknown model gets ADO's own 404 (not
// the provider's error), a missing one a 400, neither costs quota, and the key
// is accepted from x-api-key and a lowercase "bearer" too.
func TestAPI_ModelErrorsAndKeyHeaders(t *testing.T) {
	fx := newFixture(t)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"data":[{"id":"real-model"}]}`))
			return
		}
		var body struct{ Model string }
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Model != "real-model" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"The supported API model names are real-model (provider secret)"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"choices":[]}`))
	}))
	defer provider.Close()
	fx.reg.Swap([]*proxy.Forwarder{proxy.New(provider.URL, "k")})

	jar, _ := cookiejar.New(nil)
	_, rawKey := createDiscordUser(t, fx, &http.Client{Jar: jar}, "discord-apierr-001", "apierr@example.com")
	auth := map[string]string{"Authorization": "Bearer " + rawKey}

	code, _, out := apiCall(t, fx, auth, `{"model":"real-modle","messages":[]}`)
	if code != http.StatusNotFound || !strings.Contains(out, "MODEL_NOT_FOUND") || !strings.Contains(out, "adoai.space/models") || strings.Contains(out, "provider secret") {
		t.Fatalf("unknown model: %d %s", code, out)
	}
	if code, _, out := apiCall(t, fx, auth, `{"messages":[]}`); code != http.StatusBadRequest || !strings.Contains(out, "MODEL_REQUIRED") {
		t.Fatalf("missing model: %d %s", code, out)
	}

	if code, _, out := apiCall(t, fx, map[string]string{"X-Api-Key": rawKey}, `{"model":"real-model","messages":[]}`); code != http.StatusOK {
		t.Fatalf("x-api-key: %d %s", code, out)
	}
	if code, _, out := apiCall(t, fx, map[string]string{"Authorization": "bearer " + rawKey}, `{"model":"real-model","messages":[]}`); code != http.StatusOK {
		t.Fatalf("lowercase bearer: %d %s", code, out)
	}

	// Only the two successful calls count against the quota.
	var used int
	_ = fx.pool.QueryRow(context.Background(), `
		SELECT COALESCE(SUM(d.used), 0) FROM daily_usage d JOIN ado_keys k ON k.id = d.key_id
		JOIN users u ON u.id = k.user_id WHERE u.email = 'apierr@example.com'`).Scan(&used)
	if used != 2 {
		t.Fatalf("quota used = %d, want 2", used)
	}
}

// TestAPI_BadKeysAreCutOff: an address that keeps sending invalid keys gets 429
// before any lookup once it passes the limit.
func TestAPI_BadKeysAreCutOff(t *testing.T) {
	fx := newFixture(t)
	bad := map[string]string{"Authorization": "Bearer ado-not-a-real-key"}
	for i := 0; i < 50; i++ {
		if code, _, _ := apiCall(t, fx, bad, `{"model":"m","messages":[]}`); code != http.StatusUnauthorized {
			t.Fatalf("bad key %d: status %d, want 401", i, code)
		}
	}
	code, hdr, out := apiCall(t, fx, bad, `{"model":"m","messages":[]}`)
	if code != http.StatusTooManyRequests || !strings.Contains(out, "TOO_MANY_BAD_KEYS") || hdr.Get("Retry-After") == "" {
		t.Fatalf("after 50 bad keys: %d %s", code, out)
	}
}

// TestAPI_StreamUsageIsCountedButHidden: a streaming request without
// stream_options gets token usage logged, and the client never sees the extra
// usage-only chunk it didn't ask for.
func TestAPI_StreamUsageIsCountedButHidden(t *testing.T) {
	fx := newFixture(t)
	var gotIncludeUsage bool
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"data":[{"id":"stream-model"}]}`))
			return
		}
		var body struct {
			StreamOptions struct {
				IncludeUsage bool `json:"include_usage"`
			} `json:"stream_options"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotIncludeUsage = body.StreamOptions.IncludeUsage
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\n\n" +
			"data: {\"choices\":[],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":2}}\n\n" +
			"data: [DONE]\n\n"))
	}))
	defer provider.Close()
	fx.reg.Swap([]*proxy.Forwarder{proxy.New(provider.URL, "k")})

	jar, _ := cookiejar.New(nil)
	_, rawKey := createDiscordUser(t, fx, &http.Client{Jar: jar}, "discord-streamuse-001", "streamuse@example.com")
	code, _, out := apiCall(t, fx, map[string]string{"Authorization": "Bearer " + rawKey},
		`{"model":"stream-model","stream":true,"messages":[{"role":"user","content":"hi"}]}`)
	if code != http.StatusOK || !gotIncludeUsage {
		t.Fatalf("status %d, provider asked for usage: %v", code, gotIncludeUsage)
	}
	if strings.Contains(out, `"usage"`) || !strings.Contains(out, "Hi") || !strings.Contains(out, "[DONE]") {
		t.Fatalf("client stream: %q", out)
	}

	var prompt, completion int32
	deadline := time.Now().Add(5 * time.Second)
	for {
		err := fx.pool.QueryRow(context.Background(), `
			SELECT COALESCE(r.prompt_tokens, 0), COALESCE(r.completion_tokens, 0) FROM request_log r
			JOIN users u ON u.id = r.user_id WHERE u.email = 'streamuse@example.com'
			ORDER BY r.id DESC LIMIT 1`).Scan(&prompt, &completion)
		if (err == nil && prompt > 0) || time.Now().After(deadline) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if prompt != 7 || completion != 2 {
		t.Fatalf("logged tokens %d/%d, want 7/2", prompt, completion)
	}
}
