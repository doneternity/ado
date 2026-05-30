package proxy

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func chatReq() *http.Request {
	body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)
	r := httptest.NewRequest("POST", "/chat/completions", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	return r
}

func okServer(payload string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(payload))
	}))
}

// a 5xx from the first provider should fail over to the next.
func TestForward_FailsOverOn5xx(t *testing.T) {
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer down.Close()
	up := okServer(`{"ok":true}`)
	defer up.Close()

	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(down.URL, "k1"), New(up.URL, "k2")})

	rr := httptest.NewRecorder()
	res, err := reg.Forward(rr, chatReq(), "/chat/completions", []byte(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if !res.Started || res.Status != http.StatusOK {
		t.Fatalf("expected served 200, got started=%v status=%d", res.Started, res.Status)
	}
	if res.Provider != up.URL {
		t.Fatalf("served by %q, want failover to %q", res.Provider, up.URL)
	}
	if res.Attempts != 2 {
		t.Fatalf("attempts=%d, want 2", res.Attempts)
	}
	if !strings.Contains(rr.Body.String(), `"ok":true`) {
		t.Fatalf("client got wrong body: %q", rr.Body.String())
	}
}

// a connection error (provider unreachable) should also fail over.
func TestForward_FailsOverOnNetworkError(t *testing.T) {
	dead := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	deadURL := dead.URL
	dead.Close() // now refuses connections

	up := okServer(`{"ok":1}`)
	defer up.Close()

	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(deadURL, "k1"), New(up.URL, "k2")})

	rr := httptest.NewRecorder()
	res, err := reg.Forward(rr, chatReq(), "/chat/completions", []byte(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	if !res.Started || res.Provider != up.URL {
		t.Fatalf("expected failover to %q, got started=%v provider=%q", up.URL, res.Started, res.Provider)
	}
}

// when every provider fails, Forward reports not-started with an error.
func TestForward_AllProvidersFail(t *testing.T) {
	d1 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(503) }))
	defer d1.Close()
	d2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(500) }))
	defer d2.Close()

	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(d1.URL, "k1"), New(d2.URL, "k2")})

	res, err := reg.Forward(httptest.NewRecorder(), chatReq(), "/chat/completions", []byte(`{}`))
	if res.Started {
		t.Fatal("expected started=false when all providers fail")
	}
	if err == nil {
		t.Fatal("expected an error when all providers fail")
	}
	if res.Attempts != 2 {
		t.Fatalf("attempts=%d, want 2", res.Attempts)
	}
}

// once a provider trips its breaker it should be skipped on later requests,
// so a dead upstream stops slowing every call.
func TestForward_BreakerSkipsTrippedProvider(t *testing.T) {
	var deadHits int64
	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt64(&deadHits, 1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer dead.Close()
	up := okServer(`{"ok":1}`)
	defer up.Close()

	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(dead.URL, "k1"), New(up.URL, "k2")})

	for i := 0; i < 5; i++ {
		res, err := reg.Forward(httptest.NewRecorder(), chatReq(), "/chat/completions", []byte(`{}`))
		if err != nil || !res.Started || res.Provider != up.URL {
			t.Fatalf("req %d: expected service from %q, got started=%v provider=%q err=%v", i, up.URL, res.Started, res.Provider, err)
		}
	}
	// it trips after breakerThreshold failures, then gets skipped, so it's
	// hit exactly that many times.
	if got := atomic.LoadInt64(&deadHits); got != int64(breakerThreshold) {
		t.Fatalf("dead provider hit %d times, want %d (breaker should skip it after tripping)", got, breakerThreshold)
	}
}

// an already-disconnected client should not make Forward walk the chain.
func TestForward_StopsOnClientCancel(t *testing.T) {
	var hits int64
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt64(&hits, 1)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer up.Close()

	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(up.URL, "k1")})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := chatReq().WithContext(ctx)

	res, err := reg.Forward(httptest.NewRecorder(), r, "/chat/completions", []byte(`{}`))
	if err == nil {
		t.Fatal("expected context error")
	}
	if res.Attempts != 0 || atomic.LoadInt64(&hits) != 0 {
		t.Fatalf("expected no provider calls on cancelled context, got attempts=%d hits=%d", res.Attempts, hits)
	}
}

// upstream CORS and hop-by-hop headers should not reach the client.
func TestForward_StripsUpstreamHeaders(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "https://evil.example")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer up.Close()

	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(up.URL, "k1")})

	rr := httptest.NewRecorder()
	if _, err := reg.Forward(rr, chatReq(), "/chat/completions", []byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("upstream CORS header leaked to client: %q", got)
	}
	if got := rr.Header().Get("Connection"); got != "" {
		t.Fatalf("hop-by-hop header leaked to client: %q", got)
	}
}
