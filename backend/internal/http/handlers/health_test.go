package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthDeep(t *testing.T) {
	ok := func(context.Context) error { return nil }
	fail := func(context.Context) error { return errors.New("boom") }

	cases := []struct {
		name      string
		db, redis func(context.Context) error
		wantCode  int
		want      map[string]string
	}{
		{"all ok", ok, ok, http.StatusOK, map[string]string{"status": "ok", "db": "ok", "redis": "ok"}},
		{"db down", fail, ok, http.StatusServiceUnavailable, map[string]string{"status": "degraded", "db": "error", "redis": "ok"}},
		{"redis down", ok, fail, http.StatusServiceUnavailable, map[string]string{"status": "degraded", "db": "ok", "redis": "error"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			NewHealth(tc.db, tc.redis).Deep(rec, httptest.NewRequest(http.MethodGet, "/api/health/deep", nil))

			if rec.Code != tc.wantCode {
				t.Fatalf("code=%d, want %d", rec.Code, tc.wantCode)
			}
			var got map[string]string
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			for k, v := range tc.want {
				if got[k] != v {
					t.Errorf("%s=%q, want %q", k, got[k], v)
				}
			}
		})
	}
}
