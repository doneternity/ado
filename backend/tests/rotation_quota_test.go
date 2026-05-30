package tests

import (
	"context"
	"net/http"
	"net/http/cookiejar"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ado/ado/backend/internal/store/db"
)

// rotating should move today's usage to the new key, so the quota can't be
// reset by rotating and the old key leaves no row behind to double-count.
func TestRotate_MovesUsageForward(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	ctx := context.Background()

	createDiscordUser(t, fx, c, "discord-rot-001", "rot1@example.com")

	q := db.New(fx.pool)
	var keyID, userID uuid.UUID
	if err := fx.pool.QueryRow(ctx, `SELECT id, user_id FROM ado_keys WHERE revoked_at IS NULL`).Scan(&keyID, &userID); err != nil {
		t.Fatalf("find active key: %v", err)
	}

	for i := 0; i < 5; i++ {
		if _, err := q.IncrementUsage(ctx, db.IncrementUsageParams{KeyID: keyID, DailyLimit: 100}); err != nil {
			t.Fatalf("increment usage: %v", err)
		}
	}

	issued, err := fx.keys.Rotate(ctx, userID)
	if err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if issued.Raw == "" {
		t.Fatal("rotate returned no key")
	}

	var newKeyID uuid.UUID
	if err := fx.pool.QueryRow(ctx, `SELECT id FROM ado_keys WHERE user_id=$1 AND revoked_at IS NULL`, userID).Scan(&newKeyID); err != nil {
		t.Fatalf("find new key: %v", err)
	}

	used, err := q.GetUsageForToday(ctx, newKeyID)
	if err != nil {
		t.Fatalf("usage for new key: %v", err)
	}
	if used != 5 {
		t.Fatalf("new key carried usage = %d, want 5 (rotating must not reset the daily quota)", used)
	}

	var oldRows int
	if err := fx.pool.QueryRow(ctx, `SELECT count(*) FROM daily_usage WHERE key_id=$1 AND day=CURRENT_DATE`, keyID).Scan(&oldRows); err != nil {
		t.Fatalf("count old rows: %v", err)
	}
	if oldRows != 0 {
		t.Fatalf("old key still has %d usage row(s) after rotate; usage was copied not moved (admin totals would double-count)", oldRows)
	}
}

// the reaper should only revoke idle keys. guards the bug where last_used_at
// was never written, so the reaper revoked every key 14 days after creation.
func TestInactiveKeyReaper_RespectsLastUsed(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	ctx := context.Background()

	createDiscordUser(t, fx, c, "discord-reap-001", "reap1@example.com")

	q := db.New(fx.pool)
	var keyID uuid.UUID
	if err := fx.pool.QueryRow(ctx, `SELECT id FROM ado_keys WHERE revoked_at IS NULL`).Scan(&keyID); err != nil {
		t.Fatalf("find active key: %v", err)
	}

	cutoff := pgtype.Timestamptz{Time: time.Now().Add(-14 * 24 * time.Hour), Valid: true}

	// a 30-day-old key that was just touched should survive the reaper.
	if _, err := fx.pool.Exec(ctx, `UPDATE ado_keys SET created_at = now() - interval '30 days', last_used_at = NULL WHERE id=$1`, keyID); err != nil {
		t.Fatalf("age key: %v", err)
	}
	if err := q.TouchKeyLastUsed(ctx, keyID); err != nil {
		t.Fatalf("touch: %v", err)
	}
	if err := q.RevokeInactiveKeys(ctx, cutoff); err != nil {
		t.Fatalf("reaper: %v", err)
	}
	if isRevoked(t, fx, keyID) {
		t.Fatal("recently-touched key was wrongly revoked by the inactive-key reaper")
	}

	// a 30-day-old key that was never used should be revoked.
	if _, err := fx.pool.Exec(ctx, `UPDATE ado_keys SET created_at = now() - interval '30 days', last_used_at = NULL WHERE id=$1`, keyID); err != nil {
		t.Fatalf("re-age key: %v", err)
	}
	if err := q.RevokeInactiveKeys(ctx, cutoff); err != nil {
		t.Fatalf("reaper: %v", err)
	}
	if !isRevoked(t, fx, keyID) {
		t.Fatal("genuinely idle key (never used, 30 days old) should have been revoked")
	}
}

func isRevoked(t *testing.T, fx *fixture, keyID uuid.UUID) bool {
	t.Helper()
	var revoked bool
	if err := fx.pool.QueryRow(context.Background(), `SELECT revoked_at IS NOT NULL FROM ado_keys WHERE id=$1`, keyID).Scan(&revoked); err != nil {
		t.Fatalf("check revoked: %v", err)
	}
	return revoked
}
