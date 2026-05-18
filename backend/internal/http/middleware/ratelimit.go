package middleware

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/ado/ado/backend/internal/apperr"
)

type Limiter struct{ rdb *redis.Client }

func NewLimiter(rdb *redis.Client) *Limiter { return &Limiter{rdb: rdb} }

// Check increments the counter at `key`. Returns true if under `limit`,
// false (with retry-after seconds) if over. Window is fixed-size.
func (l *Limiter) Check(ctx context.Context, key string, limit int, window time.Duration) (allowed bool, retryAfter time.Duration, err error) {
	pipe := l.rdb.TxPipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, window)
	if _, err := pipe.Exec(ctx); err != nil {
		return true, 0, err // fail-open on Redis hiccup; alarm via logs upstream
	}
	if incr.Val() > int64(limit) {
		ttl, _ := l.rdb.TTL(ctx, key).Result()
		if ttl < 0 {
			ttl = window
		}
		return false, ttl, nil
	}
	return true, 0, nil
}

// PerIP wraps a handler to enforce a limit per remote IP.
func (l *Limiter) PerIP(prefix string, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := ClientIP(r)
			ok, retry, err := l.Check(r.Context(), prefix+":"+ip, limit, window)
			if err == nil && !ok {
				w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())))
				apperr.Write(w, apperr.TooMany("RATE_LIMITED", "too many requests"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func ClientIP(r *http.Request) string {
	// Fly.io sets this header and it cannot be spoofed by clients.
	if fly := r.Header.Get("Fly-Client-IP"); fly != "" {
		return strings.TrimSpace(fly)
	}
	// Fall back to the last (rightmost) entry in X-Forwarded-For, which is
	// set by the nearest trusted proxy and cannot be injected by the client.
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		parts := strings.Split(xf, ",")
		return strings.TrimSpace(parts[len(parts)-1])
	}
	if i := strings.LastIndex(r.RemoteAddr, ":"); i >= 0 {
		return r.RemoteAddr[:i]
	}
	return r.RemoteAddr
}
