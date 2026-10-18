package tests

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"testing"
)

// TestMaintenance_AdminBypass checks that maintenance mode blocks regular
// users' dashboard and API calls while admins keep working, and that the
// public status endpoint reports the flag.
func TestMaintenance_AdminBypass(t *testing.T) {
	fx := newFixture(t)

	userJar, _ := cookiejar.New(nil)
	user := &http.Client{Jar: userJar}
	_, userKey := createDiscordUser(t, fx, user, "discord-maint-user", "maint-user@example.com")

	adminJar, _ := cookiejar.New(nil)
	admin := &http.Client{Jar: adminJar}
	_, adminKey := createDiscordUser(t, fx, admin, "discord-maint-admin", "maint-admin@example.com")
	if _, err := fx.pool.Exec(context.Background(), `UPDATE users SET role = 'admin' WHERE email = 'maint-admin@example.com'`); err != nil {
		t.Fatal(err)
	}

	status := func(c *http.Client, path, bearer string) int {
		t.Helper()
		req, _ := http.NewRequest(http.MethodGet, fx.server.URL+path, nil)
		if bearer != "" {
			req.Header.Set("Authorization", "Bearer "+bearer)
		}
		resp, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	enabled := func() bool {
		t.Helper()
		resp, err := http.Get(fx.server.URL + "/api/maintenance")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var body struct{ Enabled bool }
		_ = json.NewDecoder(resp.Body).Decode(&body)
		return body.Enabled
	}

	if enabled() {
		t.Fatal("maintenance should start off")
	}
	if got := status(user, "/api/keys/current", ""); got != http.StatusOK {
		t.Fatalf("user dashboard before maintenance: want 200, got %d", got)
	}

	fx.maint.Set(true)
	if !enabled() {
		t.Fatal("/api/maintenance should report enabled")
	}
	if got := status(user, "/api/keys/current", ""); got != http.StatusServiceUnavailable {
		t.Fatalf("user dashboard in maintenance: want 503, got %d", got)
	}
	if got := status(admin, "/api/keys/current", ""); got != http.StatusOK {
		t.Fatalf("admin dashboard in maintenance: want 200, got %d", got)
	}
	if got := status(user, "/api/v1/models", userKey); got != http.StatusServiceUnavailable {
		t.Fatalf("user API key in maintenance: want 503, got %d", got)
	}
	if got := status(admin, "/api/v1/models", adminKey); got == http.StatusServiceUnavailable {
		t.Fatal("admin API key in maintenance: should not get 503")
	}
	// Signing in must keep working so admins can reach the site.
	if got := status(user, "/api/auth/me", ""); got != http.StatusOK {
		t.Fatalf("/api/auth/me in maintenance: want 200, got %d", got)
	}
}
