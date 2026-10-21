package proxy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func modelsServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"id":"alpha","name":"Alpha"},{"id":"beta-x"},{"id":"gamma-x","name":"Gamma x"}]}`))
	}))
}

func listedIDs(list []map[string]any) map[string]bool {
	out := map[string]bool{}
	for _, m := range list {
		out[m["id"].(string)] = true
	}
	return out
}

func TestModelFilter_HidesAndOnly(t *testing.T) {
	srv := modelsServer()
	defer srv.Close()
	ctx := context.Background()

	// "all except": beta is hidden (by the ID ADO lists, after the suffix).
	f := New(srv.URL, "k")
	f.ModelSuffix = "-x"
	f.Models = NewModelFilter("all", []string{"beta"})
	reg := NewRegistry()
	reg.Swap([]*Forwarder{f})
	got := listedIDs(reg.refreshModels(ctx))
	if !got["alpha"] || got["beta"] || !got["gamma"] {
		t.Fatalf("all except beta: %v", got)
	}
	if reg.Serves(ctx, "beta") || reg.Serves(ctx, "beta-x") || !reg.Serves(ctx, "gamma") {
		t.Fatal("a hidden model must not be served, by either ID")
	}

	// Admin still sees every model, hidden ones included.
	if c := reg.ProviderChoices(""); len(c) != 3 || c[1].ID != "beta" || c[2].Name != "Gamma" {
		t.Fatalf("choices: %+v", c)
	}

	// "only": switching applies at once on Swap, without a new fetch.
	g := New(srv.URL, "k")
	g.ModelSuffix = "-x"
	g.Models = NewModelFilter("only", []string{"gamma"})
	reg.Swap([]*Forwarder{g})
	if !reg.Serves(ctx, "gamma") || reg.Serves(ctx, "alpha") {
		t.Fatal("only gamma should be served right after the swap")
	}
	if got := listedIDs(*g.lastList.Load()); len(got) != 1 || !got["gamma"] {
		t.Fatalf("only gamma: %v", got)
	}
}

func TestModelFilter_ZeroValueAllowsAll(t *testing.T) {
	var m ModelFilter
	if !m.Allows("anything") {
		t.Fatal("the zero filter must offer every model")
	}
	if NewModelFilter("only", nil).Allows("x") {
		t.Fatal(`"only" with no IDs offers nothing`)
	}
}
