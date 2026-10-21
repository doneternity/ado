package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"
)

// TestProviders_ModelChoice: Admin sees every model a provider offers, can
// show only some (or hide some), and hidden models drop out of /models and
// can't be called.
func TestProviders_ModelChoice(t *testing.T) {
	fx := newFixture(t)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"data":[{"id":"pick-a","name":"Pick A"},{"id":"pick-b"},{"id":"pick-c"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"choices":[]}`))
	}))
	defer provider.Close()

	jar, _ := cookiejar.New(nil)
	c := &http.Client{Jar: jar}
	csrf, rawKey := createDiscordUser(t, fx, c, "discord-choice-admin", "choice-admin@example.com")
	do := func(method, path, body string, hdr map[string]string) (int, []byte) {
		t.Helper()
		req, _ := http.NewRequest(method, fx.server.URL+path, bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		for k, v := range hdr {
			req.Header.Set(k, v)
		}
		resp, err := c.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, b
	}

	code, b := do("POST", "/api/admin/providers", `{"name":"Picky","baseUrl":"`+provider.URL+`","apiKeys":["sk-picky-1234567"]}`, nil)
	if code != http.StatusCreated {
		t.Fatalf("create: %d %s", code, b)
	}
	var p struct{ ID string }
	_ = json.Unmarshal(b, &p)

	var models struct {
		Mode   string
		IDs    []string
		Models []struct{ ID, Name string }
	}
	code, b = do("GET", "/api/admin/providers/"+p.ID+"/models", "", nil)
	_ = json.Unmarshal(b, &models)
	if code != 200 || models.Mode != "all" || len(models.Models) != 3 || models.Models[0].Name != "Pick A" {
		t.Fatalf("models: %d %s", code, b)
	}

	if code, b := do("PUT", "/api/admin/providers/"+p.ID+"/models", `{"mode":"only","ids":["pick-a","pick-c"]}`, nil); code != 200 {
		t.Fatalf("set: %d %s", code, b)
	}
	if code, _ := do("PUT", "/api/admin/providers/"+p.ID+"/models", `{"mode":"some"}`, nil); code != 400 {
		t.Fatalf("bad mode: want 400, got %d", code)
	}

	_, b = do("GET", "/api/models", "", nil)
	var list struct{ Data []struct{ ID string } }
	_ = json.Unmarshal(b, &list)
	seen := map[string]bool{}
	for _, m := range list.Data {
		seen[m.ID] = true
	}
	if !seen["pick-a"] || seen["pick-b"] || !seen["pick-c"] {
		t.Fatalf("public list after choosing: %v", seen)
	}

	// A hidden model can't be called; Admin still lists it as a choice.
	code, b = do("POST", "/api/v1/chat/completions", `{"model":"pick-b","messages":[{"role":"user","content":"hi"}]}`, map[string]string{"Authorization": "Bearer " + rawKey})
	if code != http.StatusNotFound {
		t.Fatalf("hidden model call: %d %s", code, b)
	}
	_, b = do("GET", "/api/admin/providers/"+p.ID+"/models", "", nil)
	_ = json.Unmarshal(b, &models)
	if models.Mode != "only" || len(models.IDs) != 2 || len(models.Models) != 3 {
		t.Fatalf("after saving: %s", b)
	}
}
