package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"testing"
)

// TestProviders_ModelSuffix: the suffix is saved on create and update, shown
// in the list, reaches the proxy chain, and junk is refused.
func TestProviders_ModelSuffix(t *testing.T) {
	fx := newFixture(t)
	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	csrf, _ := createDiscordUser(t, fx, c, "discord-suffix-admin", "suffix-admin@example.com")

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
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, b
	}

	code, b := do("POST", "/api/admin/providers", `{"name":"Reseller","baseUrl":"https://reseller.example/v1","apiKeys":["sk-reseller-1234567"],"modelSuffix":" -thanks-somewhere "}`)
	if code != http.StatusCreated {
		t.Fatalf("create: %d %s", code, b)
	}
	var p struct {
		ID          string `json:"id"`
		ModelSuffix string `json:"modelSuffix"`
	}
	_ = json.Unmarshal(b, &p)
	if p.ModelSuffix != "-thanks-somewhere" {
		t.Fatalf("suffix not trimmed and saved: %q", p.ModelSuffix)
	}
	found := false
	for _, f := range fx.reg.Get() {
		if f.ModelSuffix == "-thanks-somewhere" {
			found = true
		}
	}
	if !found {
		t.Fatal("the proxy chain didn't get the suffix")
	}

	if code, b := do("PUT", "/api/admin/providers/"+p.ID, `{"name":"Reseller","baseUrl":"https://reseller.example/v1","priority":0,"modelSuffix":""}`); code != http.StatusNoContent {
		t.Fatalf("clear suffix: %d %s", code, b)
	}
	_, b = do("GET", "/api/admin/providers", "")
	var list []struct {
		ID          string `json:"id"`
		ModelSuffix string `json:"modelSuffix"`
	}
	_ = json.Unmarshal(b, &list)
	for _, item := range list {
		if item.ID == p.ID && item.ModelSuffix != "" {
			t.Fatalf("suffix not cleared: %q", item.ModelSuffix)
		}
	}

	if code, _ := do("PUT", "/api/admin/providers/"+p.ID, `{"name":"Reseller","baseUrl":"https://reseller.example/v1","priority":0,"modelSuffix":"bad suffix/"}`); code != http.StatusBadRequest {
		t.Fatalf("junk suffix: want 400, got %d", code)
	}
}
