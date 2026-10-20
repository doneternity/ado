package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A reseller-style provider: tagged IDs and names, echoes the model it got.
func taggedServer(t *testing.T, gotModel *string) *httptest.Server {
	t.Helper()
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			_, _ = w.Write([]byte(`{"data":[
				{"id":"gpt-6-sol-thanks-somewhere","display_name":"GPT-6 Sol (Thanks Somewhere)"},
				{"id":"plain-model","display_name":"Plain"}]}`))
			return
		}
		raw, _ := io.ReadAll(r.Body)
		var body struct{ Model string }
		_ = json.Unmarshal(raw, &body)
		*gotModel = body.Model
		_, _ = w.Write([]byte(`{"model":"` + body.Model + `","choices":[]}`))
	}))
	t.Cleanup(s.Close)
	return s
}

func TestAlias_ListsPlainIDsAndSwapsBothWays(t *testing.T) {
	var got string
	srv := taggedServer(t, &got)
	f := New(srv.URL, "k")
	f.ModelSuffix = "-thanks-somewhere"
	reg := NewRegistry()
	reg.Swap([]*Forwarder{f})

	list := reg.refreshModels(context.Background())
	if len(list) != 2 || list[0]["id"] != "gpt-6-sol" || list[0]["display_name"] != "GPT-6 Sol" {
		t.Fatalf("listed: %+v", list)
	}
	if list[1]["id"] != "plain-model" || list[1]["display_name"] != "Plain" {
		t.Fatalf("an untagged model must be left alone: %+v", list[1])
	}

	call := func(model string) (string, http.Header) {
		t.Helper()
		body := []byte(`{"model":"` + model + `","messages":[],"temperature":0.2}`)
		rr := httptest.NewRecorder()
		res, err := reg.Forward(rr, httptest.NewRequest("POST", "/chat/completions", bytes.NewReader(body)), "/chat/completions", body)
		if err != nil || res.Status != http.StatusOK {
			t.Fatalf("forward %s: %v %d", model, err, res.Status)
		}
		return rr.Body.String(), rr.Header()
	}

	out, hdr := call("gpt-6-sol")
	if hdr.Get("Content-Length") != "" {
		t.Fatal("the provider's Content-Length must not be passed on once the body changes")
	}
	if got != "gpt-6-sol-thanks-somewhere" {
		t.Fatalf("provider got model %q, want its own tagged ID", got)
	}
	if !strings.Contains(out, `"model":"gpt-6-sol"`) || strings.Contains(out, "thanks-somewhere") {
		t.Fatalf("client saw %s", out)
	}

	// The full tagged ID still works, untouched.
	out, _ = call("gpt-6-sol-thanks-somewhere")
	if got != "gpt-6-sol-thanks-somewhere" || !strings.Contains(out, "gpt-6-sol-thanks-somewhere") {
		t.Fatalf("full ID: provider got %q, client saw %s", got, out)
	}
}

func TestQuotedSwap_MatchSplitAcrossChunks(t *testing.T) {
	in := `data: {"model":"gpt-6-sol-thanks-somewhere","x":1}` + "\n\n" + `data: {"model":"gpt-6-sol-thanks-somewhere"}`
	want := strings.ReplaceAll(in, "gpt-6-sol-thanks-somewhere", "gpt-6-sol")
	for cut := 1; cut < len(in); cut++ {
		q := newQuotedSwap("gpt-6-sol-thanks-somewhere", "gpt-6-sol")
		var out []byte
		out = append(out, q.push([]byte(in[:cut]))...)
		out = append(out, q.push([]byte(in[cut:]))...)
		out = append(out, q.flush()...)
		if string(out) != want {
			t.Fatalf("cut at %d: got %s", cut, out)
		}
	}
}

func TestSuffixNamePattern(t *testing.T) {
	re := suffixNamePattern("-thanks-somewhere")
	for in, want := range map[string]string{
		"GPT-6 Sol (Thanks Somewhere)": "GPT-6 Sol",
		"GPT-6 Sol - thanks somewhere": "GPT-6 Sol",
		"GPT-6 Sol":                    "GPT-6 Sol",
	} {
		if got := strings.TrimSpace(re.ReplaceAllString(in, "")); got != want {
			t.Fatalf("%q -> %q, want %q", in, got, want)
		}
	}
}
