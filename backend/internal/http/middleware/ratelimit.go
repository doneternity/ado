package middleware

import (
	"context"
	"log/slog"
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
		return false, 0, err
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

func (l *Limiter) enforce(w http.ResponseWriter, r *http.Request, next http.Handler, prefix, redisKey string, limit int, window time.Duration, failClosed bool) {
	if limit <= 0 {
		next.ServeHTTP(w, r)
		return
	}
	allowed, retry, err := l.Check(r.Context(), redisKey, limit, window)
	if err != nil {
		slog.Warn("rate limiter check failed", "prefix", prefix, "failClosed", failClosed, "err", err)
		if failClosed {
			apperr.Write(w, apperr.ServiceUnavailable("RATE_LIMITER_DOWN", "rate limiter unavailable"))
			return
		}
		next.ServeHTTP(w, r)
		return
	}
	if !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(int(retry.Seconds())))
		apperr.Write(w, apperr.TooMany("RATE_LIMITED", "too many requests"))
		return
	}
	next.ServeHTTP(w, r)
}

// PerIP wraps a handler to enforce a limit per remote IP.
func (l *Limiter) PerIP(prefix string, limit int, window time.Duration, failClosed bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			l.enforce(w, r, next, prefix, prefix+":"+ClientIP(r), limit, window, failClosed)
		})
	}
}

// PerKey enforces a limit per API key ID extracted from the Bearer context.
// Falls back to PerIP behaviour if no bearer key is present in context.
func (l *Limiter) PerKey(prefix string, limit int, window time.Duration, failClosed bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			redisKey := prefix + ":ip:" + ClientIP(r)
			if bk, ok := BearerFromContext(r.Context()); ok {
				redisKey = prefix + ":" + bk.KeyID.String()
			}
			l.enforce(w, r, next, prefix, redisKey, limit, window, failClosed)
		})
	}
}

// PerKeyDynamic is like PerKey but reads the limit dynamically on each request.
func (l *Limiter) PerKeyDynamic(prefix string, getLimit func() int, window time.Duration, failClosed bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			redisKey := prefix + ":ip:" + ClientIP(r)
			if bk, ok := BearerFromContext(r.Context()); ok {
				redisKey = prefix + ":" + bk.KeyID.String()
			}
			l.enforce(w, r, next, prefix, redisKey, getLimit(), window, failClosed)
		})
	}
}

// RPMUsed returns the current per-minute request count for a key ID.
func (l *Limiter) RPMUsed(ctx context.Context, keyID string) int64 {
	v, _ := l.rdb.Get(ctx, "rl:v1:chat:key:"+keyID).Int64()
	return v
}

func ClientIP(r *http.Request) string {
	// koyeb appends the real client ip as the rightmost x-forwarded-for entry;
	// earlier entries are client-supplied and spoofable
	if xf := r.Header.Get("X-Forwarded-For"); xf != "" {
		parts := strings.Split(xf, ",")
		return strings.TrimSpace(parts[len(parts)-1])
	}
	if i := strings.LastIndex(r.RemoteAddr, ":"); i >= 0 {
		return r.RemoteAddr[:i]
	}
	return r.RemoteAddr
}
