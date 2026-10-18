package proxy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestProviderMonitor_Transitions(t *testing.T) {
	var healthy atomic.Bool
	healthy.Store(true)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer KEY" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if !healthy.Load() {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer srv.Close()

	reg := NewRegistry()
	var msgs []string
	m := NewProviderMonitor(reg, func(msg string) { msgs = append(msgs, msg) })
	ctx := context.Background()

	// Empty chain alerts once, not on every check.
	m.Check(ctx)
	m.Check(ctx)
	if len(msgs) != 1 || !strings.Contains(msgs[0], "No active LLM providers") {
		t.Fatalf("empty chain: got %q", msgs)
	}
	msgs = nil

	reg.Swap([]*Forwarder{New(srv.URL, "KEY")})
	m.Check(ctx)
	if len(msgs) != 0 {
		t.Fatalf("healthy provider: want no alert, got %q", msgs)
	}

	// One failure is tolerated; the second marks it down, and staying down
	// doesn't repeat the alert.
	healthy.Store(false)
	m.Check(ctx)
	if len(msgs) != 0 {
		t.Fatalf("single failure: want no alert, got %q", msgs)
	}
	m.Check(ctx)
	m.Check(ctx)
	if len(msgs) != 1 || !strings.Contains(msgs[0], "All LLM providers are down") || !strings.Contains(msgs[0], "502") {
		t.Fatalf("down: got %q", msgs)
	}
	msgs = nil

	healthy.Store(true)
	m.Check(ctx)
	m.Check(ctx)
	if len(msgs) != 1 || !strings.Contains(msgs[0], "Provider recovered") {
		t.Fatalf("recovered: got %q", msgs)
	}
}

func TestProviderMonitor_PartialOutage(t *testing.T) {
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer ok.Close()
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer bad.Close()

	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(ok.URL, "k"), New(bad.URL, "k")})
	var msgs []string
	m := NewProviderMonitor(reg, func(msg string) { msgs = append(msgs, msg) })
	m.Check(context.Background())
	m.Check(context.Background())

	if len(msgs) != 1 {
		t.Fatalf("want 1 alert, got %q", msgs)
	}
	if strings.Contains(msgs[0], "All LLM providers") {
		t.Fatalf("partial outage reported as total: %q", msgs[0])
	}
	if !strings.Contains(msgs[0], bad.URL+" (") {
		t.Fatalf("wrong provider in alert: %q", msgs[0])
	}
}
