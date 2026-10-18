package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"testing"
	"time"

	"github.com/ado/ado/backend/internal/http/handlers"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/store/db"
)

// TestRequestLog_RecordsChatCalls checks that a keyed API call lands in
// request_log with model, status and the provider's token counts, and shows up
// in the admin and per-user usage views.
func TestRequestLog_RecordsChatCalls(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	_, rawKey := createDiscordUser(t, fx, c, "discord-reqlog-001", "reqlog@example.com")

	req, _ := http.NewRequest("POST", fx.server.URL+"/api/v1/chat/completions",
		bytes.NewReader([]byte(`{"model":"gemini-test","messages":[{"role":"user","content":"hi"}]}`)))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("chat call: want 200, got %d", resp.StatusCode)
	}

	// The insert is asynchronous; wait briefly for it.
	var endpoint, model string
	var status, prompt, completion int32
	deadline := time.Now().Add(5 * time.Second)
	for {
		err = fx.pool.QueryRow(context.Background(), `
			SELECT endpoint, model, status, prompt_tokens, completion_tokens
			FROM request_log ORDER BY id DESC LIMIT 1`).Scan(&endpoint, &model, &status, &prompt, &completion)
		if err == nil || time.Now().After(deadline) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("no request_log row: %v", err)
	}
	if endpoint != "/chat/completions" || model != "gemini-test" || status != 200 || prompt != 3 || completion != 1 {
		t.Fatalf("logged %s %s %d %d/%d, want /chat/completions gemini-test 200 3/1", endpoint, model, status, prompt, completion)
	}

	var mine []struct {
		Model    string `json:"model"`
		Requests int    `json:"requests"`
	}
	r2, err := c.Get(fx.server.URL + "/api/keys/usage/models")
	if err != nil {
		t.Fatal(err)
	}
	decodeJSON(t, r2, &mine)
	if len(mine) != 1 || mine[0].Model != "gemini-test" || mine[0].Requests != 1 {
		t.Fatalf("user usage by model: %+v", mine)
	}

	var recent []struct{ Email, Endpoint string }
	r3, err := c.Get(fx.server.URL + "/api/admin/requests?email=reqlog@example.com")
	if err != nil {
		t.Fatal(err)
	}
	decodeJSON(t, r3, &recent)
	if len(recent) != 1 || recent[0].Endpoint != "/chat/completions" {
		t.Fatalf("admin recent requests: %+v", recent)
	}
}

// TestRLS_EnabledOnEveryTable guards against a new table being exposed through
// Supabase's Data API: every public table must have row-level security on.
func TestRLS_EnabledOnEveryTable(t *testing.T) {
	fx := newFixture(t)
	rows, err := fx.pool.Query(context.Background(),
		`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity AND tablename <> 'goose_db_version'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var missing []string
	for rows.Next() {
		var name string
		_ = rows.Scan(&name)
		missing = append(missing, name)
	}
	if len(missing) > 0 {
		t.Fatalf("tables without row-level security (add ENABLE ROW LEVEL SECURITY in the migration): %v", missing)
	}
}

// TestReaper_PausedDuringMaintenanceAndGrace checks that idle keys aren't
// revoked while maintenance is on, nor for a grace period after it ends.
func TestReaper_PausedDuringMaintenanceAndGrace(t *testing.T) {
	ctx := context.Background()
	fx := newFixture(t)
	q := db.New(fx.pool)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	csrf, rawKey := createDiscordUser(t, fx, c, "discord-reaper-001", "reaper@example.com")
	key, _ := q.GetActiveKeyByHash(ctx, keys.Hash(rawKey))
	if _, err := fx.pool.Exec(ctx, `UPDATE ado_keys SET last_used_at = now() - interval '30 days', created_at = now() - interval '30 days'`); err != nil {
		t.Fatal(err)
	}

	fx.maint.Set(true)
	handlers.ReapInactiveKeys(ctx, q, fx.maint)
	if isRevoked(t, fx, key.ID) {
		t.Fatal("key revoked during maintenance")
	}

	// Turning maintenance off through the admin API starts the grace period.
	body, _ := json.Marshal(map[string]bool{"enabled": false})
	req, _ := http.NewRequest("POST", fx.server.URL+"/api/admin/maintenance/toggle", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", csrf)
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	handlers.ReapInactiveKeys(ctx, q, fx.maint)
	if isRevoked(t, fx, key.ID) {
		t.Fatal("key revoked during the post-maintenance grace period")
	}

	// Once the grace period is over, idle keys are reaped as usual.
	if _, err := fx.pool.Exec(ctx, `UPDATE system_settings SET value = $1 WHERE key = 'reaper_grace_until'`,
		time.Now().Add(-time.Minute).UTC().Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	handlers.ReapInactiveKeys(ctx, q, fx.maint)
	if !isRevoked(t, fx, key.ID) {
		t.Fatal("idle key should be revoked after the grace period")
	}
}
