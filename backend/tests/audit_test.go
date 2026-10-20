package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"testing"
)

// TestAuditLog_RecordsAdminChanges: successful admin changes are logged with
// who made them, a readable target and details; reads and failed requests
// aren't; and a provider's API key never reaches the log.
func TestAuditLog_RecordsAdminChanges(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	csrf, _ := createDiscordUser(t, fx, c, "discord-audit-admin", "auditor@example.com")

	send := func(method, path, body string) int {
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

	if code := send("PUT", "/api/admin/announcement", `{"message":"Hello everyone"}`); code != http.StatusOK {
		t.Fatalf("announcement: %d", code)
	}
	if code := send("PUT", "/api/admin/announcement", `{"message":"x","linkUrl":"http://insecure"}`); code != http.StatusBadRequest {
		t.Fatalf("bad announcement should fail, got %d", code)
	}
	if code := send("POST", "/api/admin/providers", `{"name":"Audit Provider","baseUrl":"https://example.com/v1","apiKeys":["sk-audit-secret-123456"]}`); code != http.StatusCreated {
		t.Fatalf("create provider: %d", code)
	}
	if code := send("POST", "/api/admin/maintenance/toggle", `{"enabled":false}`); code != http.StatusOK {
		t.Fatalf("maintenance: %d", code)
	}
	send("GET", "/api/admin/users", "") // reads aren't logged

	req, _ := http.NewRequest("GET", fx.server.URL+"/api/admin/audit", nil)
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var raw bytes.Buffer
	_, _ = raw.ReadFrom(resp.Body)
	resp.Body.Close()
	if strings.Contains(raw.String(), "sk-audit-secret") {
		t.Fatal("a provider API key reached the audit log")
	}
	var entries []struct {
		ID      int64
		Actor   string
		Action  string
		Target  string
		Details map[string]any
	}
	if err := json.Unmarshal(raw.Bytes(), &entries); err != nil {
		t.Fatalf("decode %s: %v", raw.String(), err)
	}
	if len(entries) != 3 {
		t.Fatalf("want 3 entries (the failed request and the read left out), got %d: %+v", len(entries), entries)
	}

	m, p, a := entries[0], entries[1], entries[2] // newest first
	if m.Action != "POST /maintenance/toggle" || m.Target != "maintenance mode" || m.Details["enabled"] != false {
		t.Fatalf("maintenance entry: %+v", m)
	}
	if p.Action != "POST /providers" || p.Target != "Audit Provider" || p.Details["keys"] != float64(1) {
		t.Fatalf("provider entry: %+v", p)
	}
	if a.Action != "PUT /announcement" || a.Target != "announcement" || a.Details["message"] != "Hello everyone" {
		t.Fatalf("announcement entry: %+v", a)
	}
	for _, e := range entries {
		if e.Actor != "auditor@example.com" {
			t.Fatalf("actor = %q, want the admin's email", e.Actor)
		}
	}

	// Paging: before=<id> returns only older entries.
	req, _ = http.NewRequest("GET", fx.server.URL+"/api/admin/audit?before="+jsonNum(m.ID), nil)
	resp, err = c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var older []struct{ ID int64 }
	decodeJSON(t, resp, &older)
	if len(older) != 2 || older[0].ID != p.ID {
		t.Fatalf("page before %d: %+v", m.ID, older)
	}
}

func jsonNum(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}
