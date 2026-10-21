package proxy

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// shortWaits makes the keep-alive and stream-start waits fast for a test.
func shortWaits(t *testing.T) {
	t.Helper()
	after, every, header := keepAliveAfter, keepAliveEvery, streamHeaderWait
	keepAliveAfter, keepAliveEvery, streamHeaderWait = 40*time.Millisecond, 40*time.Millisecond, 150*time.Millisecond
	t.Cleanup(func() { keepAliveAfter, keepAliveEvery, streamHeaderWait = after, every, header })
}

func slowProvider(delay time.Duration, status int, body, contentType string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet { // the model list answers at once
			_, _ = w.Write([]byte(`{"data":[{"id":"m"}]}`))
			return
		}
		time.Sleep(delay)
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
}

func forward(t *testing.T, reg *Registry, opts ForwardOptions) (ForwardResult, *httptest.ResponseRecorder, error) {
	t.Helper()
	body := []byte(`{"model":"m","messages":[{"role":"user","content":"hi"}]}`)
	rr := httptest.NewRecorder()
	res, err := reg.ForwardWith(rr, httptest.NewRequest("POST", "/chat/completions", bytes.NewReader(body)), "/chat/completions", body, opts)
	return res, rr, err
}

// A slow non-streamed reply is preceded by blank lines, which JSON parsers
// skip, so the connection stays open and the reply still parses.
func TestKeepAlive_SlowJSONReply(t *testing.T) {
	shortWaits(t)
	p := slowProvider(300*time.Millisecond, 200, `{"choices":[{"message":{"content":"done"}}]}`, "application/json")
	defer p.Close()
	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(p.URL, "k")})

	res, rr, err := forward(t, reg, ForwardOptions{KeepAlive: true})
	if err != nil || !res.Started || !res.KeptAlive || res.Status != 200 {
		t.Fatalf("res %+v err %v", res, err)
	}
	out := rr.Body.String()
	if !strings.HasPrefix(out, "\n") {
		t.Fatalf("no keep-alive padding before the reply: %q", out)
	}
	var reply map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &reply); err != nil {
		t.Fatalf("padded reply doesn't parse: %v (%q)", err, out)
	}
	if rr.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("content type %q", rr.Header().Get("Content-Type"))
	}
}

// A fast reply never gets padding or an early status.
func TestKeepAlive_FastReplyUntouched(t *testing.T) {
	shortWaits(t)
	p := slowProvider(0, 200, `{"ok":true}`, "application/json")
	defer p.Close()
	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(p.URL, "k")})

	res, rr, _ := forward(t, reg, ForwardOptions{KeepAlive: true})
	if res.KeptAlive || rr.Body.String() != `{"ok":true}` {
		t.Fatalf("res %+v body %q", res, rr.Body.String())
	}
}

// After the 200 went out, a provider's error comes as an error event in a
// stream, with the keep-alive comments before it.
func TestKeepAlive_LateErrorInStream(t *testing.T) {
	shortWaits(t)
	// Slower than the keep-alive (40ms) but inside the stream start wait (150ms).
	p := slowProvider(100*time.Millisecond, 400, `{"error":{"message":"context too long"}}`, "application/json")
	defer p.Close()
	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(p.URL, "k")})

	res, rr, _ := forward(t, reg, ForwardOptions{KeepAlive: true, Stream: true})
	out := rr.Body.String()
	if !res.KeptAlive || res.Status != 400 || !strings.Contains(out, ": keep-alive") ||
		!strings.Contains(out, `data: {"error":{"message":"context too long"}}`) {
		t.Fatalf("res %+v body %q", res, out)
	}
}

// When every provider fails after the 200 went out, the result says so, so
// the handler puts its error in the body.
func TestKeepAlive_NoProviderAfterPadding(t *testing.T) {
	shortWaits(t)
	p := slowProvider(150*time.Millisecond, 503, `down`, "text/plain")
	defer p.Close()
	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(p.URL, "k")})

	res, rr, err := forward(t, reg, ForwardOptions{KeepAlive: true})
	if res.Started || !res.KeptAlive || err == nil || rr.Code != 200 {
		t.Fatalf("res %+v err %v code %d", res, err, rr.Code)
	}
}

// A stream that hasn't started within streamHeaderWait fails over.
func TestStream_StuckStartFailsOver(t *testing.T) {
	shortWaits(t)
	stuck := slowProvider(2*time.Second, 200, "data: late\n\n", "text/event-stream")
	defer stuck.Close()
	ok := slowProvider(0, 200, "data: hi\n\ndata: [DONE]\n\n", "text/event-stream")
	defer ok.Close()
	reg := NewRegistry()
	reg.Swap([]*Forwarder{New(stuck.URL, "a"), New(ok.URL, "b")})

	start := time.Now()
	res, rr, err := forward(t, reg, ForwardOptions{Stream: true})
	if err != nil || !res.Started || res.Attempts != 2 || !strings.Contains(rr.Body.String(), "data: hi") {
		t.Fatalf("res %+v err %v body %q", res, err, rr.Body.String())
	}
	if time.Since(start) > time.Second {
		t.Fatalf("waited %s for the stuck stream", time.Since(start))
	}
}
