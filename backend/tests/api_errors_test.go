package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strconv"
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

	if code, _, out := apiCall(t, fx, map[string]string{"X-Api-Key": rawKey}, `{"model":"real-model","messages":[{"role":"user","content":"hi"}]}`); code != http.StatusOK {
		t.Fatalf("x-api-key: %d %s", code, out)
	}
	if code, _, out := apiCall(t, fx, map[string]string{"Authorization": "bearer " + rawKey}, `{"model":"real-model","messages":[{"role":"user","content":"hi"}]}`); code != http.StatusOK {
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

func apiDo(t *testing.T, fx *fixture, method, path string, headers map[string]string, body string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(method, fx.server.URL+path, strings.NewReader(body))
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
	return resp.StatusCode, string(b)
}

// TestAPI_ErrorsSayWhatIsWrong: each kind of bad request gets a message that
// names the actual problem, and a provider's own billing error never reaches
// the caller as if it were theirs.
func TestAPI_ErrorsSayWhatIsWrong(t *testing.T) {
	fx := newFixture(t)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"data":[{"id":"ok-model"},{"id":"broke-model"},{"id":"picky-model"}]}`))
			return
		}
		var req struct{ Model string }
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req.Model == "picky-model" {
			// A provider's own error, in its own shape.
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"detail":"temperature must be at most 2"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusPaymentRequired)
		_, _ = w.Write([]byte(`{"error":{"message":"Insufficient Balance"}}`))
	}))
	defer provider.Close()
	fx.reg.Swap([]*proxy.Forwarder{proxy.New(provider.URL, "k")})

	jar, _ := cookiejar.New(nil)
	_, rawKey := createDiscordUser(t, fx, &http.Client{Jar: jar}, "discord-errmsg-001", "errmsg@example.com")
	auth := map[string]string{"Authorization": "Bearer " + rawKey}
	const chat = "/api/v1/chat/completions"

	for _, c := range []struct {
		method, path string
		headers      map[string]string
		body         string
		status       int
		want         string
	}{
		{"POST", chat, auth, `{"model":`, 400, "isn't valid JSON"},
		{"POST", chat, auth, `[1, 2]`, 400, "should be a JSON object, not array"},
		{"POST", chat, auth, ``, 400, "the request body is empty"},
		{"POST", chat, auth, `{"model":5,"messages":[]}`, 400, `\"model\" should be a string`},
		{"POST", chat, auth, `{"model":"ok-model"}`, 400, `\"messages\" is required`},
		{"POST", chat, auth, `{"model":"ok-model","messages":{}}`, 400, `\"messages\" should be a list`},
		{"POST", chat, auth, `{"model":"ok-model","messages":[]}`, 400, `\"messages\" is empty`},
		{"POST", "/api/v1/chat/completion", auth, `{}`, 404, "did you mean POST /v1/chat/completions"},
		{"POST", "/api/v1/v1/chat/completions", auth, `{}`, 404, "/v1 twice"},
		{"POST", "/api/v1/completions", auth, `{}`, 404, "older text completions"},
		{"GET", chat, auth, ``, 405, "send a POST request"},
		{"POST", "/api/missing-v1/chat/completions", nil, `{}`, 404, "missing /v1: use https://adoai.space/v1/chat/completions"},
		{"POST", chat, map[string]string{"Authorization": "Bearer sk-proj-abc"}, `{}`, 401, "isn't an ADO key"},
		{"POST", chat, map[string]string{"Authorization": rawKey}, `{}`, 401, "with the word Bearer and a space before the key"},
		{"POST", chat, map[string]string{"Authorization": "Bearer ado-mistyped"}, `{}`, 401, "it may be mistyped"},
		// A provider out of credit is the provider's problem, never the caller's.
		{"POST", chat, auth, `{"model":"broke-model","messages":[{"role":"user","content":"hi"}]}`, 503, `\"broke-model\" is unavailable right now`},
	} {
		code, out := apiDo(t, fx, c.method, c.path, c.headers, c.body)
		if code != c.status || !strings.Contains(out, c.want) || strings.Contains(out, "Insufficient Balance") {
			t.Errorf("%s %s %s: %d %s, want %d containing %q", c.method, c.path, c.body, code, out, c.status, c.want)
		}
	}

	// No provider answered: SDKs are asked to wait out the 30s cooldown.
	if _, hdr, _ := apiCall(t, fx, auth, `{"model":"broke-model","messages":[{"role":"user","content":"hi"}]}`); hdr.Get("Retry-After") != "30" {
		t.Errorf("NO_PROVIDER Retry-After = %q, want 30", hdr.Get("Retry-After"))
	}

	// A provider's own error comes back in ADO's format with its message.
	code, out := apiDo(t, fx, "POST", chat, auth, `{"model":"picky-model","messages":[{"role":"user","content":"hi"}]}`)
	if code != 400 || !strings.Contains(out, `"code":"PROVIDER_ERROR"`) || !strings.Contains(out, "temperature must be at most 2") || !strings.Contains(out, `"type":"invalid_request_error"`) {
		t.Errorf("provider error: %d %s", code, out)
	}

	// None of those reached a model, so none counted.
	var used int
	_ = fx.pool.QueryRow(context.Background(), `
		SELECT COALESCE(SUM(d.used), 0) FROM daily_usage d JOIN ado_keys k ON k.id = d.key_id
		JOIN users u ON u.id = k.user_id WHERE u.email = 'errmsg@example.com'`).Scan(&used)
	if used != 0 {
		t.Fatalf("quota used = %d, want 0", used)
	}
}

// TestAPI_CutStreamEndsWithAnError: when a provider drops the connection
// mid-stream, the client gets an error event instead of a silently cut reply.
func TestAPI_CutStreamEndsWithAnError(t *testing.T) {
	fx := newFixture(t)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"data":[{"id":"flaky-model"}]}`))
			return
		}
		conn, buf, err := http.NewResponseController(w).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		// A chunked SSE response that stops without its final chunk.
		_, _ = buf.WriteString("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n")
		chunk := "data: {\"choices\":[{\"delta\":{\"content\":\"Half\"}}]}\n\n"
		_, _ = buf.WriteString(strconv.FormatInt(int64(len(chunk)), 16) + "\r\n" + chunk + "\r\n")
		_ = buf.Flush()
		_ = conn.Close()
	}))
	defer provider.Close()
	fx.reg.Swap([]*proxy.Forwarder{proxy.New(provider.URL, "k")})

	jar, _ := cookiejar.New(nil)
	_, rawKey := createDiscordUser(t, fx, &http.Client{Jar: jar}, "discord-cutstream-001", "cutstream@example.com")
	code, _, out := apiCall(t, fx, map[string]string{"Authorization": "Bearer " + rawKey},
		`{"model":"flaky-model","stream":true,"messages":[{"role":"user","content":"hi"}]}`)
	if code != http.StatusOK || !strings.Contains(out, "Half") || !strings.Contains(out, "STREAM_INTERRUPTED") || !strings.Contains(out, "incomplete") {
		t.Fatalf("cut stream: %d %q", code, out)
	}
}
