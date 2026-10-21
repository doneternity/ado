package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ado/ado/backend/internal/proxy"
)

// TestChat_ClientCancelIsNotAnOutage: a client that leaves before the provider
// answers is logged as 499, refunded, not counted as a server error, and
// doesn't mark the model unhealthy.
func TestChat_ClientCancelIsNotAnOutage(t *testing.T) {
	fx := newFixture(t)
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"data":[{"id":"slow-model"}]}`))
			return
		}
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
			_, _ = w.Write([]byte(`{}`))
		}
	}))
	defer slow.Close()
	fx.reg.Swap([]*proxy.Forwarder{proxy.New(slow.URL, "k")})

	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	_, rawKey := createDiscordUser(t, fx, c, "discord-cancel-001", "cancel@example.com")

	ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "POST", fx.server.URL+"/api/v1/chat/completions",
		strings.NewReader(`{"model":"slow-model","messages":[{"role":"user","content":"hi"}]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	if resp, err := http.DefaultClient.Do(req); err == nil {
		resp.Body.Close()
		t.Fatal("the request should have been cancelled")
	}

	// The handler finishes after the client has gone; wait for its log row.
	var status int
	deadline := time.Now().Add(5 * time.Second)
	for {
		err := fx.pool.QueryRow(context.Background(), `
			SELECT r.status FROM request_log r JOIN users u ON u.id = r.user_id
			WHERE u.email = 'cancel@example.com' ORDER BY r.id DESC LIMIT 1`).Scan(&status)
		if err == nil || time.Now().After(deadline) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if status != 499 {
		t.Fatalf("logged status %d, want 499", status)
	}

	var used int
	_ = fx.pool.QueryRow(context.Background(), `
		SELECT COALESCE(SUM(d.used), 0) FROM daily_usage d JOIN ado_keys k ON k.id = d.key_id
		JOIN users u ON u.id = k.user_id WHERE u.email = 'cancel@example.com'`).Scan(&used)
	if used != 0 {
		t.Fatalf("quota used = %d, want 0 (refunded)", used)
	}

	time.Sleep(300 * time.Millisecond) // error logging is asynchronous too
	var serverErrors int
	_ = fx.pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM error_logs WHERE message LIKE '%/chat/completions%'`).Scan(&serverErrors)
	if serverErrors != 0 {
		t.Fatalf("%d server errors logged for a client cancel", serverErrors)
	}

	if s := fx.reg.Health().Status("slow-model"); s != "" && s != "available" {
		t.Fatalf("model marked %q after a client cancel", s)
	}
}

// TestChat_AcceptsInlineImages: a chat request carrying a base64 image (a few
// MB) is accepted rather than refused as too large.
func TestChat_AcceptsInlineImages(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	_, rawKey := createDiscordUser(t, fx, c, "discord-image-001", "image@example.com")

	image := "data:image/png;base64," + strings.Repeat("A", 2<<20) // ~2 MB
	body, _ := json.Marshal(map[string]any{
		"model": "gemini-test",
		"messages": []any{map[string]any{"role": "user", "content": []any{
			map[string]any{"type": "text", "text": "what is this?"},
			map[string]any{"type": "image_url", "image_url": map[string]string{"url": image}},
		}}},
	})
	req, _ := http.NewRequest("POST", fx.server.URL+"/api/v1/chat/completions", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("2 MB image request: status %d, want 200", resp.StatusCode)
	}

	long, _ := json.Marshal(map[string]any{"model": strings.Repeat("m", 300), "messages": []any{}})
	req, _ = http.NewRequest("POST", fx.server.URL+"/api/v1/chat/completions", bytes.NewReader(long))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("300-character model name: status %d, want 400", resp.StatusCode)
	}
}
