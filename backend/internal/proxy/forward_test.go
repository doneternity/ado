package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
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

// TestRotateGroups: a provider's keys take turns, provider order and ungrouped
// entries stay put.
func TestRotateGroups(t *testing.T) {
	a1, a2, a3 := &Forwarder{Label: "a1", Group: 1}, &Forwarder{Label: "a2", Group: 1}, &Forwarder{Label: "a3", Group: 1}
	b1 := &Forwarder{Label: "b1", Group: 2}
	u := &Forwarder{Label: "u"}
	chain := []*Forwarder{a1, a2, a3, b1, u}
	names := func(fs []*Forwarder) string {
		var s []string
		for _, f := range fs {
			s = append(s, f.Name())
		}
		return strings.Join(s, ",")
	}
	for n, want := range map[uint64]string{
		0: "a1,a2,a3,b1,u",
		1: "a2,a3,a1,b1,u",
		2: "a3,a1,a2,b1,u",
		3: "a1,a2,a3,b1,u",
	} {
		if got := names(rotateGroups(chain, n)); got != want {
			t.Errorf("n=%d: got %s, want %s", n, got, want)
		}
	}
}

// TestForward_SpreadsAndFailsOverAcrossKeys: requests alternate between one
// provider's two keys, and a rejected key fails over to the other.
func TestForward_SpreadsAndFailsOverAcrossKeys(t *testing.T) {
	var hits sync.Map
	var bad atomic.Value
	bad.Store("")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		n, _ := hits.LoadOrStore(key, new(atomic.Int32))
		n.(*atomic.Int32).Add(1)
		if key == bad.Load().(string) {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	k1, k2 := New(srv.URL, "key-one"), New(srv.URL, "key-two")
	k1.Group, k2.Group = 1, 1
	reg := NewRegistry()
	reg.Swap([]*Forwarder{k1, k2})

	count := func(key string) int32 {
		n, ok := hits.Load(key)
		if !ok {
			return 0
		}
		return n.(*atomic.Int32).Load()
	}
	for i := 0; i < 4; i++ {
		if _, err := reg.Forward(httptest.NewRecorder(), chatReq(), "/chat/completions", []byte(`{}`)); err != nil {
			t.Fatal(err)
		}
	}
	if count("key-one") != 2 || count("key-two") != 2 {
		t.Fatalf("load not spread: key-one=%d key-two=%d", count("key-one"), count("key-two"))
	}

	bad.Store("key-one")
	for i := 0; i < 2; i++ {
		res, err := reg.Forward(httptest.NewRecorder(), chatReq(), "/chat/completions", []byte(`{}`))
		if err != nil || res.Status != http.StatusOK {
			t.Fatalf("request %d: status %d err %v, want failover to key-two", i, res.Status, err)
		}
	}
}

// modelServer is a provider that lists `models` and, like real providers,
// answers 400 for a chat request naming any other model. chats counts the
// chat requests it received.
func modelServer(t *testing.T, chats *atomic.Int32, models ...string) *httptest.Server {
	t.Helper()
	owns := map[string]bool{}
	var list []string
	for _, m := range models {
		owns[m] = true
		list = append(list, `{"id":"`+m+`"}`)
	}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/models" {
			_, _ = w.Write([]byte(`{"data":[` + strings.Join(list, ",") + `]}`))
			return
		}
		chats.Add(1)
		var body struct{ Model string }
		_ = json.NewDecoder(r.Body).Decode(&body)
		if !owns[body.Model] {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"unknown model"}`))
			return
		}
		_, _ = w.Write([]byte(`{"served":"` + body.Model + `"}`))
	}))
	t.Cleanup(s.Close)
	return s
}

// A request for the second provider's model goes straight to it, even before
// anyone has loaded the model list, instead of getting the first provider's
// "unknown model" 400 (a 400 doesn't fail over).
func TestForward_RoutesByModel(t *testing.T) {
	var deepseekChats, zaiChats atomic.Int32
	deepseek := modelServer(t, &deepseekChats, "deepseek-flash", "deepseek-v4-pro")
	zai := modelServer(t, &zaiChats, "glm-5.3")

	reg := NewRegistry()
	ds := New(deepseek.URL, "k1")
	ds.Group = 1
	z := New(zai.URL, "k2")
	z.Group = 2
	reg.Swap([]*Forwarder{ds, z})

	send := func(model string) (ForwardResult, string) {
		t.Helper()
		body := []byte(`{"model":"` + model + `","messages":[]}`)
		req := httptest.NewRequest("POST", "/chat/completions", bytes.NewReader(body))
		rr := httptest.NewRecorder()
		res, err := reg.Forward(rr, req, "/chat/completions", body)
		if err != nil {
			t.Fatal(err)
		}
		return res, rr.Body.String()
	}

	res, out := send("glm-5.3")
	if res.Status != http.StatusOK || res.Provider != zai.URL || !strings.Contains(out, "glm-5.3") {
		t.Fatalf("glm-5.3: status=%d provider=%q body=%q", res.Status, res.Provider, out)
	}
	if res, _ := send("deepseek-flash"); res.Status != http.StatusOK || res.Provider != deepseek.URL {
		t.Fatalf("deepseek-flash: status=%d provider=%q", res.Status, res.Provider)
	}
	if deepseekChats.Load() != 1 || zaiChats.Load() != 1 {
		t.Fatalf("each provider should get only its own model: deepseek=%d zai=%d", deepseekChats.Load(), zaiChats.Load())
	}

	// A model nobody lists still goes to the chain in order, so the client sees
	// the provider's own error, as before.
	if res, _ := send("made-up"); res.Status != http.StatusBadRequest || res.Provider != deepseek.URL {
		t.Fatalf("made-up: status=%d provider=%q", res.Status, res.Provider)
	}
}

// A provider whose model list can't be read is kept as a last resort, after
// the ones that list the model.
func TestForModel_UnreadableListIsLastResort(t *testing.T) {
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer broken.Close()
	var chats atomic.Int32
	good := modelServer(t, &chats, "m1")

	reg := NewRegistry()
	b, g := New(broken.URL, "k1"), New(good.URL, "k2")
	reg.Swap([]*Forwarder{b, g})

	got := reg.forModel(context.Background(), reg.Get(), "m1")
	if len(got) != 2 || got[0] != g || got[1] != b {
		t.Fatalf("want [good, broken], got %v", got)
	}
}
