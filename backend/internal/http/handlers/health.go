package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

const deepHealthTimeout = 5 * time.Second

// Health serves the deep health check. Unlike /api/health it touches Postgres
// and Redis, so a scheduled ping keeps free-tier databases from being paused or
// deleted for inactivity.
type Health struct {
	pingDB    func(context.Context) error
	pingRedis func(context.Context) error
}

func NewHealth(pingDB, pingRedis func(context.Context) error) *Health {
	return &Health{pingDB: pingDB, pingRedis: pingRedis}
}

func (h *Health) Deep(w http.ResponseWriter, r *http.Request) {
	out := map[string]string{"status": "ok", "db": "ok", "redis": "ok"}
	code := http.StatusOK

	check := func(name string, ping func(context.Context) error) {
		ctx, cancel := context.WithTimeout(r.Context(), deepHealthTimeout)
		defer cancel()
		if err := ping(ctx); err != nil {
			// details stay in the logs; this endpoint is public.
			slog.Warn("deep health check failed", "component", name, "err", err)
			out[name] = "error"
			out["status"] = "degraded"
			code = http.StatusServiceUnavailable
		}
	}
	check("db", h.pingDB)
	check("redis", h.pingRedis)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(out)
}
