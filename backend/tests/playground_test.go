package tests

import (
	"bytes"
	"context"
	"net/http"
	"net/http/cookiejar"
	"testing"
	"time"
)

// TestPlayground_ChatsWithSessionKey checks that the website's Playground can
// chat with just the session (no raw key), that the call is attributed to the
// user's key like an API call, and that it needs a session, the CSRF token,
// and an active key.
func TestPlayground_ChatsWithSessionKey(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	csrf, _ := createDiscordUser(t, fx, c, "discord-play-001", "play@example.com")

	chat := func(client *http.Client, csrfToken string) int {
		t.Helper()
		req, _ := http.NewRequest("POST", fx.server.URL+"/api/playground/chat/completions",
			bytes.NewReader([]byte(`{"model":"gemini-test","messages":[{"role":"user","content":"hi"}]}`)))
		req.Header.Set("Content-Type", "application/json")
		if csrfToken != "" {
			req.Header.Set("X-CSRF-Token", csrfToken)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}

	if code := chat(c, csrf); code != http.StatusOK {
		t.Fatalf("playground chat: want 200, got %d", code)
	}

	// Logged against the user's key, under the same endpoint name as the API.
	var endpoint, email string
	deadline := time.Now().Add(5 * time.Second)
	var err error
	for {
		err = fx.pool.QueryRow(context.Background(), `
			SELECT r.endpoint, u.email FROM request_log r
			JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 1`).Scan(&endpoint, &email)
		if err == nil || time.Now().After(deadline) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err != nil || endpoint != "/chat/completions" || email != "play@example.com" {
		t.Fatalf("request_log: %v %q %q", err, endpoint, email)
	}

	if code := chat(c, ""); code != http.StatusForbidden {
		t.Fatalf("without CSRF token: want 403, got %d", code)
	}
	if code := chat(&http.Client{}, csrf); code != http.StatusUnauthorized {
		t.Fatalf("without a session: want 401, got %d", code)
	}

	if _, err := fx.pool.Exec(context.Background(), `
		UPDATE ado_keys SET revoked_at = now()
		WHERE user_id = (SELECT id FROM users WHERE email = 'play@example.com')`); err != nil {
		t.Fatal(err)
	}
	if code := chat(c, csrf); code != http.StatusForbidden {
		t.Fatalf("with no active key: want 403, got %d", code)
	}
}
