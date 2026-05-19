package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

// TestSignup_DefaultsToUnverified is the core fix for the account-takeover
// vulnerability: an attacker who pre-registers a victim's email must not be
// able to create a verified row. Verification can only happen by clicking the
// link in the email, which the attacker cannot read.
func TestSignup_DefaultsToUnverified(t *testing.T) {
	fx := newFixture(t)
	ctx := context.Background()

	const email = "victim@example.com"
	c := &http.Client{}
	body, _ := json.Marshal(map[string]string{"email": email, "password": "attacker-pw-correct-horse"})
	r, err := c.Post(fx.server.URL+"/api/auth/signup", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if r.StatusCode != 201 {
		t.Fatalf("signup status=%d", r.StatusCode)
	}
	r.Body.Close()

	var verified bool
	if err := fx.pool.QueryRow(ctx,
		`SELECT email_verified FROM users WHERE email=$1`, email,
	).Scan(&verified); err != nil {
		t.Fatal(err)
	}
	if verified {
		t.Fatal("signup must create email_verified=false; an unverified email is the only thing standing between an attacker's pre-claim and a takeover")
	}
}

// TestLogin_BlockedUntilVerified closes the alternate path the attacker could
// have used: even if they create a pre-claimed row, they can't sign in to it
// without first verifying. Combined with the signup fix, this means the
// attacker has no usable session.
func TestLogin_BlockedUntilVerified(t *testing.T) {
	fx := newFixture(t)
	c := &http.Client{}

	body, _ := json.Marshal(map[string]string{
		"email": "unverified@example.com", "password": "hunter2-correct-horse",
	})
	r, _ := c.Post(fx.server.URL+"/api/auth/signup", "application/json", bytes.NewReader(body))
	r.Body.Close()

	r, _ = c.Post(fx.server.URL+"/api/auth/login", "application/json", bytes.NewReader(body))
	if r.StatusCode != 403 {
		t.Fatalf("login of unverified account: got %d, want 403", r.StatusCode)
	}
	var errBody struct {
		Error struct{ Code string } `json:"error"`
	}
	json.NewDecoder(r.Body).Decode(&errBody)
	r.Body.Close()
	if errBody.Error.Code != "EMAIL_NOT_VERIFIED" {
		t.Fatalf("login error code: got %q, want EMAIL_NOT_VERIFIED", errBody.Error.Code)
	}
}

// TestHasAdminQuery is the building block the admin-bootstrap handler now uses
// to refuse the bootstrap promotion when an admin already exists.
func TestHasAdminQuery(t *testing.T) {
	fx := newFixture(t)
	ctx := context.Background()

	var has bool
	if err := fx.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin')`,
	).Scan(&has); err != nil {
		t.Fatal(err)
	}
	if has {
		t.Fatal("fresh DB should have no admin")
	}

	if _, err := fx.pool.Exec(ctx, `
		INSERT INTO users (email, email_verified, role, password_hash)
		VALUES ($1, true, 'admin', $2)`,
		"admin@example.com", "dummy-not-a-real-hash",
	); err != nil {
		t.Fatal(err)
	}
	if err := fx.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin')`,
	).Scan(&has); err != nil {
		t.Fatal(err)
	}
	if !has {
		t.Fatal("after admin insert, HasAdmin should return true")
	}
}
