package alert

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestDiscord_Send(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Content string }
		_ = json.NewDecoder(r.Body).Decode(&body)
		got = body.Content
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	if err := NewDiscord(srv.URL).Send(context.Background(), "hello"); err != nil {
		t.Fatal(err)
	}
	if got != "hello" {
		t.Fatalf("content=%q, want hello", got)
	}

	long := strings.Repeat("é", 3000)
	if err := NewDiscord(srv.URL).Send(context.Background(), long); err != nil {
		t.Fatal(err)
	}
	if n := utf8.RuneCountInString(got); n != discordMaxContent {
		t.Fatalf("truncated to %d runes, want %d", n, discordMaxContent)
	}
}

func TestDiscord_Errors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	if err := NewDiscord(srv.URL).Send(context.Background(), "x"); err == nil {
		t.Fatal("want error on 404")
	}
	if err := NewDiscord("").Send(context.Background(), "x"); err != nil {
		t.Fatalf("disabled notifier should no-op, got %v", err)
	}
}
