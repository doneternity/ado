package tests

import (
	"net/http"
	"net/http/cookiejar"
	"testing"
)

// TestAdminRoutes_RequireAuth verifies that the RequireAdmin middleware blocks
// unauthenticated requests (401) and regular-user requests (403).
func TestAdminRoutes_RequireAuth(t *testing.T) {
	fx := newFixtureRealAdmin(t)

	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}

	// No session → 401.
	r, _ := c.Get(fx.server.URL + "/api/admin/users")
	r.Body.Close()
	if r.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no-session admin request: want 401, got %d", r.StatusCode)
	}

	// Regular verified user → 403.
	signupAndVerify(t, fx, c, "regular@example.com", "hunter2-correct-horse")
	r, _ = c.Get(fx.server.URL + "/api/admin/users")
	r.Body.Close()
	if r.StatusCode != http.StatusForbidden {
		t.Fatalf("regular-user admin request: want 403, got %d", r.StatusCode)
	}
}
