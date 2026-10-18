package tests

import (
	"bytes"
	"context"
	"net/http"
	"net/http/cookiejar"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/store/db"
)

func i32(v int32) *int32 { return &v }

// TestPlans_LimitsApplyToKeys checks that a user's plan overrides the global
// daily quota and RPM, and that a per-user override still wins over the plan.
func TestPlans_LimitsApplyToKeys(t *testing.T) {
	ctx := context.Background()
	fx := newFixture(t)
	q := db.New(fx.pool)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	_, rawKey := createDiscordUser(t, fx, c, "discord-plan-001", "plan@example.com")

	row, err := q.GetActiveKeyByHash(ctx, keys.Hash(rawKey))
	if err != nil {
		t.Fatal(err)
	}
	if row.PlanRpm != 0 {
		t.Fatalf("free plan: want PlanRpm 0 (use global), got %d", row.PlanRpm)
	}
	freeLimit := row.DailyLimit

	if _, err := q.UpsertPlan(ctx, db.UpsertPlanParams{ID: "pro", Name: "Pro", DailyQuota: i32(5000), Rpm: i32(2)}); err != nil {
		t.Fatal(err)
	}
	if _, err := q.SetUserPlan(ctx, db.SetUserPlanParams{ID: row.UserID, PlanID: "pro"}); err != nil {
		t.Fatal(err)
	}
	row, _ = q.GetActiveKeyByHash(ctx, keys.Hash(rawKey))
	if row.DailyLimit != 5000 || row.PlanRpm != 2 {
		t.Fatalf("pro plan: want limit 5000 / rpm 2, got %d / %d (free was %d)", row.DailyLimit, row.PlanRpm, freeLimit)
	}

	// The plan's RPM (2) applies instead of the global 60.
	seedRL(t, fx, "rl:v1:chat:key:"+row.ID.String(), 2, time.Minute)
	req, _ := http.NewRequest("POST", fx.server.URL+"/api/v1/chat/completions",
		bytes.NewReader([]byte(`{"model":"gemini-test","messages":[{"role":"user","content":"hi"}]}`)))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	assert429(t, resp)

	// A per-user override beats the plan.
	if err := q.SetUserQuotaOverride(ctx, db.SetUserQuotaOverrideParams{ID: row.UserID, DailyQuotaOverride: i32(7)}); err != nil {
		t.Fatal(err)
	}
	row, _ = q.GetActiveKeyByHash(ctx, keys.Hash(rawKey))
	if row.DailyLimit != 7 {
		t.Fatalf("override: want limit 7, got %d", row.DailyLimit)
	}
}

// TestPlans_PaidUsersSkipFreeTierRules checks that paid users don't take free
// slots and that their idle keys aren't revoked.
func TestPlans_PaidUsersSkipFreeTierRules(t *testing.T) {
	ctx := context.Background()
	fx := newFixture(t)
	q := db.New(fx.pool)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	_, freeKey := createDiscordUser(t, fx, c, "discord-plan-free", "free@example.com")
	_, paidKey := createDiscordUser(t, fx, c, "discord-plan-paid", "paid@example.com")

	paid, _ := q.GetActiveKeyByHash(ctx, keys.Hash(paidKey))
	free, _ := q.GetActiveKeyByHash(ctx, keys.Hash(freeKey))
	if _, err := q.UpsertPlan(ctx, db.UpsertPlanParams{ID: "pro", Name: "Pro"}); err != nil {
		t.Fatal(err)
	}
	if _, err := q.SetUserPlan(ctx, db.SetUserPlanParams{ID: paid.UserID, PlanID: "pro"}); err != nil {
		t.Fatal(err)
	}

	n, err := q.CountFreeTierUsers(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("free slots used: want 1 (paid user excluded), got %d", n)
	}

	// Both keys look idle for a month; only the free one is reaped.
	if _, err := fx.pool.Exec(ctx, `UPDATE ado_keys SET last_used_at = now() - interval '30 days', created_at = now() - interval '30 days'`); err != nil {
		t.Fatal(err)
	}
	cutoff := pgtype.Timestamptz{Time: time.Now().Add(-14 * 24 * time.Hour), Valid: true}
	if err := q.RevokeInactiveKeys(ctx, cutoff); err != nil {
		t.Fatal(err)
	}
	if !isRevoked(t, fx, free.ID) {
		t.Fatal("idle free key should be revoked")
	}
	if isRevoked(t, fx, paid.ID) {
		t.Fatal("idle paid key should not be revoked")
	}
}

// TestPlans_AdminAPI covers validation on the admin plan endpoints.
func TestPlans_AdminAPI(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	csrf, _ := createDiscordUser(t, fx, c, "discord-plan-admin", "admin@example.com")

	do := func(method, path, body string) int {
		t.Helper()
		req, _ := http.NewRequest(method, fx.server.URL+path, bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		resp, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}

	if got := do("PUT", "/api/admin/plans/Bad_ID", `{"name":"x"}`); got != http.StatusBadRequest {
		t.Fatalf("bad id: want 400, got %d", got)
	}
	if got := do("PUT", "/api/admin/plans/pro", `{"name":"Pro","dailyQuota":0}`); got != http.StatusBadRequest {
		t.Fatalf("zero quota: want 400, got %d", got)
	}
	if got := do("PUT", "/api/admin/plans/pro", `{"name":"Pro","dailyQuota":1000,"rpm":60}`); got != http.StatusOK {
		t.Fatalf("create plan: want 200, got %d", got)
	}
	if got := do("DELETE", "/api/admin/plans/free", ""); got != http.StatusConflict {
		t.Fatalf("delete free: want 409, got %d", got)
	}
	if got := do("DELETE", "/api/admin/plans/pro", ""); got != http.StatusNoContent {
		t.Fatalf("delete unused plan: want 204, got %d", got)
	}
}
