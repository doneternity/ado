package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"testing"

	"github.com/google/uuid"
)

// TestInactiveUsers_PreviewAndDelete: only free, non-admin, non-banned accounts
// with no sign-in, session or API activity for the period are listed, and the
// delete keeps anyone who became active after the preview.
func TestInactiveUsers_PreviewAndDelete(t *testing.T) {
	ctx := context.Background()
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	csrf, _ := createDiscordUser(t, fx, c, "discord-inactive-admin", "cleanup-admin@example.com")

	if _, err := fx.pool.Exec(ctx, `INSERT INTO plans (id, name) VALUES ('pro', 'Pro')`); err != nil {
		t.Fatal(err)
	}
	// Every account below joined 200 days ago; they differ only in what happened since.
	mk := func(email, role string, banned bool, plan string) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		if err := fx.pool.QueryRow(ctx, `
			INSERT INTO users (email, email_verified, discord_id, display_name, role, banned, plan_id, created_at)
			VALUES ($1, true, $1, 'x', $2, $3, $4, now() - interval '200 days') RETURNING id`,
			email, role, banned, plan).Scan(&id); err != nil {
			t.Fatal(err)
		}
		if _, err := fx.pool.Exec(ctx, `
			INSERT INTO ado_keys (user_id, key_prefix, key_hash, daily_limit, created_at, last_used_at)
			VALUES ($1, 'ado-x', $2, 100, now() - interval '200 days', now() - interval '190 days')`,
			id, []byte("hash-"+email)); err != nil {
			t.Fatal(err)
		}
		return id
	}
	idle := mk("idle@example.com", "user", false, "free")
	signedIn := mk("signed-in@example.com", "user", false, "free")
	usedAPI := mk("used-api@example.com", "user", false, "free")
	mk("old-admin@example.com", "admin", false, "free")
	mk("banned@example.com", "user", true, "free")
	mk("paid@example.com", "user", false, "pro")
	lateLogin := mk("late@example.com", "user", false, "free")

	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := fx.pool.Exec(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`UPDATE users SET last_login_at = now() - interval '10 days' WHERE id = $1`, signedIn)
	exec(`UPDATE ado_keys SET last_used_at = now() - interval '1 day' WHERE user_id = $1`, usedAPI)

	do := func(method, path, body string) (int, []byte) {
		t.Helper()
		req, _ := http.NewRequest(method, fx.server.URL+path, bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		resp, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var buf bytes.Buffer
		_, _ = buf.ReadFrom(resp.Body)
		return resp.StatusCode, buf.Bytes()
	}

	if code, _ := do("GET", "/api/admin/users/inactive?days=30", ""); code != http.StatusBadRequest {
		t.Fatalf("days below the minimum: want 400, got %d", code)
	}
	code, body := do("GET", "/api/admin/users/inactive?days=150", "")
	if code != http.StatusOK {
		t.Fatalf("preview: %d %s", code, body)
	}
	var preview struct {
		Users []struct {
			ID    uuid.UUID `json:"id"`
			Email string    `json:"email"`
		} `json:"users"`
	}
	_ = json.Unmarshal(body, &preview)
	got := map[string]bool{}
	for _, u := range preview.Users {
		got[u.Email] = true
	}
	if len(got) != 2 || !got["idle@example.com"] || !got["late@example.com"] {
		t.Fatalf("preview listed %v, want only idle@ and late@", got)
	}

	// late@ signs in between the preview and the delete, so it must be kept.
	exec(`UPDATE users SET last_login_at = now() WHERE id = $1`, lateLogin)
	ids, _ := json.Marshal([]uuid.UUID{idle, lateLogin, signedIn})
	code, body = do("POST", "/api/admin/users/inactive/delete", `{"days":150,"ids":`+string(ids)+`}`)
	if code != http.StatusOK {
		t.Fatalf("delete: %d %s", code, body)
	}
	var res struct{ Deleted int }
	_ = json.Unmarshal(body, &res)
	if res.Deleted != 1 {
		t.Fatalf("deleted %d, want 1 (only idle@)", res.Deleted)
	}

	count := func(q string, args ...any) int {
		t.Helper()
		var n int
		if err := fx.pool.QueryRow(ctx, q, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if count(`SELECT COUNT(*) FROM users WHERE id = $1`, idle) != 0 || count(`SELECT COUNT(*) FROM ado_keys WHERE user_id = $1`, idle) != 0 {
		t.Fatal("idle account or its key still exists")
	}
	if count(`SELECT COUNT(*) FROM users WHERE id IN ($1, $2, $3)`, lateLogin, signedIn, usedAPI) != 3 {
		t.Fatal("an active account was deleted")
	}
}
