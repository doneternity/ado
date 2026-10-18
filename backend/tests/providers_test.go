package tests

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"testing"

	"github.com/pressly/goose/v3"

	"github.com/ado/ado/backend/internal/keyencrypt"
)

const testProviderSecret = "test-secret-32-bytes-xxxxxxxxxxx!"

type providerJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Keys []struct {
		ID       string `json:"id"`
		Label    string `json:"label"`
		Suffix   string `json:"suffix"`
		IsActive bool   `json:"isActive"`
	} `json:"keys"`
}

// TestProviders_MultipleKeys covers adding a provider with several keys,
// adding, switching off and removing keys, and that the proxy chain follows.
func TestProviders_MultipleKeys(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	csrf, _ := createDiscordUser(t, fx, c, "discord-prov-admin", "prov-admin@example.com")

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
	list := func() []providerJSON {
		t.Helper()
		code, body := do("GET", "/api/admin/providers", "")
		if code != http.StatusOK {
			t.Fatalf("list: %d %s", code, body)
		}
		if bytes.Contains(body, []byte("sk-aaaa1111")) {
			t.Fatal("list response contains a full key")
		}
		var ps []providerJSON
		if err := json.Unmarshal(body, &ps); err != nil {
			t.Fatal(err)
		}
		return ps
	}

	// Create with two keys (the repeat and blank are dropped).
	code, body := do("POST", "/api/admin/providers",
		`{"name":"DeepSeek","baseUrl":"https://api.example.com/v1","apiKeys":["sk-aaaa1111","sk-bbbb2222"," sk-aaaa1111 ",""]}`)
	if code != http.StatusCreated {
		t.Fatalf("create: %d %s", code, body)
	}
	var created providerJSON
	_ = json.Unmarshal(body, &created)
	ps := list()
	if len(ps) != 1 || len(ps[0].Keys) != 2 || ps[0].Keys[0].Suffix != "1111" || ps[0].Keys[1].Suffix != "2222" {
		t.Fatalf("after create: %+v", ps)
	}
	chain := fx.reg.Get()
	if len(chain) != 2 || chain[0].Group == 0 || chain[0].Group != chain[1].Group {
		t.Fatalf("chain should hold both keys in one group: %d entries", len(chain))
	}
	if !strings.Contains(chain[0].Name(), "DeepSeek") || strings.Contains(chain[0].Name(), "sk-aaaa1111") {
		t.Fatalf("chain label %q should name the provider, not the key", chain[0].Name())
	}

	// Add a labelled key.
	if code, body := do("POST", "/api/admin/providers/"+created.ID+"/keys", `{"apiKeys":["sk-cccc3333"],"label":"spare"}`); code != http.StatusCreated {
		t.Fatalf("add key: %d %s", code, body)
	}
	if n := len(fx.reg.Get()); n != 3 {
		t.Fatalf("chain after add: %d entries, want 3", n)
	}

	// Switch one off, then remove another.
	ps = list()
	first, spare := ps[0].Keys[0], ps[0].Keys[2]
	if spare.Label != "spare" {
		t.Fatalf("label not stored: %+v", spare)
	}
	if code, body := do("PATCH", "/api/admin/providers/"+created.ID+"/keys/"+first.ID+"/active", `{"active":false}`); code != http.StatusNoContent {
		t.Fatalf("switch off: %d %s", code, body)
	}
	if n := len(fx.reg.Get()); n != 2 {
		t.Fatalf("chain after switching a key off: %d entries, want 2", n)
	}
	if code, body := do("DELETE", "/api/admin/providers/"+created.ID+"/keys/"+spare.ID, ""); code != http.StatusNoContent {
		t.Fatalf("remove: %d %s", code, body)
	}
	ps = list()
	if len(ps[0].Keys) != 2 || ps[0].Keys[0].IsActive {
		t.Fatalf("after switch off and remove: %+v", ps[0].Keys)
	}

	// Bad requests.
	if code, _ := do("POST", "/api/admin/providers/"+created.ID+"/keys", `{"apiKeys":["  "]}`); code != http.StatusBadRequest {
		t.Fatalf("empty keys: want 400, got %d", code)
	}
	if code, _ := do("POST", "/api/admin/providers/00000000-0000-0000-0000-000000000000/keys", `{"apiKeys":["sk-x"]}`); code != http.StatusNotFound {
		t.Fatalf("unknown provider: want 404, got %d", code)
	}
	if code, _ := do("DELETE", "/api/admin/providers/"+created.ID+"/keys/00000000-0000-0000-0000-000000000000", ""); code != http.StatusNotFound {
		t.Fatalf("unknown key: want 404, got %d", code)
	}

	// Removing the provider removes its keys.
	if code, _ := do("DELETE", "/api/admin/providers/"+created.ID, ""); code != http.StatusNoContent {
		t.Fatalf("delete provider: %d", code)
	}
	var left int
	_ = fx.pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM provider_keys`).Scan(&left)
	if left != 0 || len(fx.reg.Get()) != 0 {
		t.Fatalf("keys left after deleting provider: %d rows, %d in chain", left, len(fx.reg.Get()))
	}
}

// TestProviders_MigrationKeepsExistingKey: a provider saved before migration
// 00021 (one key on the providers row) still has that key afterwards.
func TestProviders_MigrationKeepsExistingKey(t *testing.T) {
	fx := newFixture(t)
	ctx := context.Background()
	sqlDB, err := sql.Open("pgx", sharedDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()

	if err := goose.DownTo(sqlDB, "../migrations", 20); err != nil {
		t.Fatal(err)
	}
	enc, err := keyencrypt.Encrypt("sk-legacy-9999", testProviderSecret)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fx.pool.Exec(ctx, `INSERT INTO providers (name, base_url, api_key, is_active) VALUES ('Old', 'https://old.example.com/v1', $1, TRUE)`, enc); err != nil {
		t.Fatal(err)
	}
	if err := goose.Up(sqlDB, "../migrations"); err != nil {
		t.Fatal(err)
	}

	var stored string
	if err := fx.pool.QueryRow(ctx, `
		SELECT k.api_key FROM provider_keys k JOIN providers p ON p.id = k.provider_id
		WHERE p.name = 'Old'`).Scan(&stored); err != nil {
		t.Fatalf("key not copied: %v", err)
	}
	if got, _ := keyencrypt.Decrypt(stored, testProviderSecret); got != "sk-legacy-9999" {
		t.Fatalf("copied key decrypts to %q", got)
	}
}
