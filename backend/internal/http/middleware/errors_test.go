package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Keys that can't be ADO keys are turned away with a reason before any lookup
// (so the nil Queries is never touched).
func TestBearer_SaysWhyAKeyIsRefused(t *testing.T) {
	h := Bearer(nil)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("should not get through")
	}))
	for _, c := range []struct{ auth, want string }{
		{"", "missing API key"},
		{"ado-abc", "with the word Bearer and a space before the key"},
		{"Bearer sk-proj-abc", "isn't an ADO key"},
	} {
		r := httptest.NewRequest("POST", "/", nil)
		if c.auth != "" {
			r.Header.Set("Authorization", c.auth)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusUnauthorized || !strings.Contains(w.Body.String(), c.want) {
			t.Errorf("%q: %d %s, want %q", c.auth, w.Code, w.Body.String(), c.want)
		}
	}
}

func TestLimitWording(t *testing.T) {
	for _, c := range []struct {
		window time.Duration
		want   string
	}{
		{time.Minute, "requests a minute"},
		{time.Hour, "requests an hour"},
		{10 * time.Minute, "requests every 10 minutes"},
		{2 * time.Hour, "requests every 2 hours"},
	} {
		if got := per(c.window); got != c.want {
			t.Errorf("per(%v) = %q, want %q", c.window, got, c.want)
		}
	}
	for d, want := range map[time.Duration]string{
		42 * time.Second:            "42s",
		90 * time.Second:            "90s",
		7*time.Minute + time.Second: "8 minutes",
		3 * time.Hour:               "3 hours",
	} {
		if got := waitFor(d); got != want {
			t.Errorf("waitFor(%v) = %q, want %q", d, got, want)
		}
	}
}
