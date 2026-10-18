package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// Streaming relies on http.ResponseController reaching the real writer through
// every wrapper. A wrapper without Unwrap silently turns flushes into no-ops.
func TestLogger_PassesFlushThrough(t *testing.T) {
	h := Logger(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("data: hi\n\n"))
		if err := http.NewResponseController(w).Flush(); err != nil {
			t.Errorf("flush through Logger: %v", err)
		}
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if !rec.Flushed {
		t.Fatal("response was not flushed")
	}
}
