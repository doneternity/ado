package tests

import (
	"bytes"
	"context"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"testing"
	"time"

	mw "github.com/ado/ado/backend/internal/http/middleware"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/store/db"
)

func seedRL(t *testing.T, fx *fixture, key string, count int64, ttl time.Duration) {
	t.Helper()
	if err := fx.rdb.Set(context.Background(), key, count, ttl).Err(); err != nil {
		t.Fatalf("seedRL: %v", err)
	}
}

func post(t *testing.T, fx *fixture, path, body, bearerKey string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, fx.server.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if bearerKey != "" {
		req.Header.Set("Authorization", "Bearer "+bearerKey)
	}
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func getReq(t *testing.T, fx *fixture, path, bearerKey string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, fx.server.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	if bearerKey != "" {
		req.Header.Set("Authorization", "Bearer "+bearerKey)
	}
	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func assert429(t *testing.T, resp *http.Response) {
	t.Helper()
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", resp.StatusCode)
	}
	if resp.Header.Get("Retry-After") == "" {
		t.Fatal("expected Retry-After header on 429 response")
	}
}

// TestRateLimit_WindowDoesNotSlide guards against the regression where calling
// EXPIRE on every increment reset the TTL, turning the fixed window into a
// never-resetting one that blocks active keys forever.
func TestRateLimit_WindowDoesNotSlide(t *testing.T) {
	fx := newFixture(t)
	l := mw.NewLimiter(fx.rdb)
	ctx := context.Background()
	const key = "rl:test:window-slide"
	const window = 10 * time.Second

	if _, _, err := l.Check(ctx, key, 100, window); err != nil {
		t.Fatalf("first Check: %v", err)
	}
	ttl1, err := fx.rdb.PTTL(ctx, key).Result()
	if err != nil {
		t.Fatalf("PTTL 1: %v", err)
	}

	time.Sleep(600 * time.Millisecond)

	if _, _, err := l.Check(ctx, key, 100, window); err != nil {
		t.Fatalf("second Check: %v", err)
	}
	ttl2, err := fx.rdb.PTTL(ctx, key).Result()
	if err != nil {
		t.Fatalf("PTTL 2: %v", err)
	}

	// The window must keep counting down, not get pushed back out to ~full.
	if ttl2 >= ttl1 {
		t.Fatalf("TTL was extended on a later request (window slid): ttl1=%v ttl2=%v", ttl1, ttl2)
	}
}

func TestRateLimit_Admin_IP(t *testing.T) {
	fx := newFixture(t)
	seedRL(t, fx, "rl:admin:ip:127.0.0.1", 60, time.Hour)
	resp := getReq(t, fx, "/api/admin/maintenance", "")
	assert429(t, resp)
}

func TestRateLimit_ChatCompletions_PerKey(t *testing.T) {
	ctx := context.Background()
	fx := newFixture(t)
	q := db.New(fx.pool)

	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	_, rawKey := createDiscordUser(t, fx, client, "discord-rl-001", "rl-chat@example.com")

	row, err := q.GetActiveKeyByHash(ctx, keys.Hash(rawKey))
	if err != nil {
		t.Fatalf("GetActiveKeyByHash: %v", err)
	}

	seedRL(t, fx, "rl:v1:chat:key:"+row.ID.String(), 60, time.Minute)

	chatBody := []byte(`{"model":"gemini-test","messages":[{"role":"user","content":"hi"}]}`)
	req, _ := http.NewRequest("POST", fx.server.URL+"/api/v1/chat/completions", bytes.NewReader(chatBody))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	resp, _ := client.Do(req)
	resp.Body.Close()
	assert429(t, resp)
}

func TestRateLimit_Models_PerKey(t *testing.T) {
	ctx := context.Background()
	fx := newFixture(t)
	q := db.New(fx.pool)

	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	_, rawKey := createDiscordUser(t, fx, client, "discord-rl-002", "rl-models@example.com")

	row, err := q.GetActiveKeyByHash(ctx, keys.Hash(rawKey))
	if err != nil {
		t.Fatalf("GetActiveKeyByHash: %v", err)
	}

	seedRL(t, fx, "rl:v1:models:key:"+row.ID.String(), 30, time.Minute)

	resp := getReq(t, fx, "/api/v1/models", rawKey)
	assert429(t, resp)
}
