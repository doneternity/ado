package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"testing"
)

// TestAnnouncement_SetShowClear: an admin sets the notice, everyone can read
// it, a new save gets a new id (so dismissals reset), bad links are refused,
// and an empty message clears it.
func TestAnnouncement_SetShowClear(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	csrf, _ := createDiscordUser(t, fx, c, "discord-announce-admin", "announce@example.com")

	type notice struct{ ID, Message, LinkURL, LinkLabel string }
	put := func(body string) (int, notice) {
		t.Helper()
		req, _ := http.NewRequest("PUT", fx.server.URL+"/api/admin/announcement", bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		resp, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var n notice
		_ = json.NewDecoder(resp.Body).Decode(&n)
		return resp.StatusCode, n
	}
	public := func() notice {
		t.Helper()
		resp, err := http.Get(fx.server.URL + "/api/announcement")
		if err != nil {
			t.Fatal(err)
		}
		var n notice
		decodeJSON(t, resp, &n)
		return n
	}

	if n := public(); n.Message != "" {
		t.Fatalf("no notice yet, got %+v", n)
	}
	code, first := put(`{"message":"We moved Discord servers.","linkUrl":"https://discord.gg/example"}`)
	if code != http.StatusOK || first.ID == "" || first.LinkLabel != "Learn more" {
		t.Fatalf("set: %d %+v", code, first)
	}
	if n := public(); n.Message != "We moved Discord servers." || n.LinkURL != "https://discord.gg/example" || n.ID != first.ID {
		t.Fatalf("public read: %+v", n)
	}
	_, second := put(`{"message":"We moved Discord servers.","linkUrl":"https://discord.gg/example","linkLabel":"Join"}`)
	if second.ID == first.ID {
		t.Fatal("saving again should give a new id")
	}

	if code, _ := put(`{"message":"x","linkUrl":"javascript:alert(1)"}`); code != http.StatusBadRequest {
		t.Fatalf("non-https link: want 400, got %d", code)
	}
	if code, _ := put(`{"message":"x","linkUrl":"http://example.com"}`); code != http.StatusBadRequest {
		t.Fatalf("http link: want 400, got %d", code)
	}

	if code, cleared := put(`{"message":"  "}`); code != http.StatusOK || cleared.Message != "" {
		t.Fatalf("clear: %d %+v", code, cleared)
	}
	if n := public(); n.Message != "" {
		t.Fatalf("after clear: %+v", n)
	}
}
