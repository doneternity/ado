package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/ado/ado/backend/internal/apperr"
)

type Limiter struct{ rdb *redis.Client }

func NewLimiter(rdb *redis.Client) *Limiter { return &Limiter{rdb: rdb} }

// fixedWindow increments the counter and starts its window on first use, in
// one atomic round trip. The expiry is only set when the key has none: setting
// it on every request would keep pushing the reset back, so a busy key would
// stay blocked forever. Plain INCR/PEXPIRE/PTTL work on every Redis version.
// Returns {count, ms until the window resets}.
var fixedWindow = redis.NewScript(`
local n = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {n, ttl}
`)

// Check increments the counter at `key`. Returns true if under `limit`,
// false (with retry-after) if over. Window is fixed-size.
func (l *Limiter) Check(ctx context.Context, key string, limit int, window time.Duration) (allowed bool, retryAfter time.Duration, err error) {
	res, err := fixedWindow.Run(ctx, l.rdb, []string{key}, window.Milliseconds()).Int64Slice()
	if err != nil {
		return false, 0, err
	}
	if len(res) != 2 {
		return false, 0, fmt.Errorf("rate limit script: unexpected reply %v", res)
	}
	if res[0] > int64(limit) {
		return false, time.Duration(res[1]) * time.Millisecond, nil
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
		w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retry.Seconds()))))
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
// A key on a plan with its own RPM uses that instead of getLimit.
func (l *Limiter) PerKeyDynamic(prefix string, getLimit func() int, window time.Duration, failClosed bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			redisKey := prefix + ":ip:" + ClientIP(r)
			limit := getLimit()
			if bk, ok := BearerFromContext(r.Context()); ok {
				redisKey = prefix + ":" + bk.KeyID.String()
				if bk.PlanRPM > 0 {
					limit = int(bk.PlanRPM)
				}
			}
			l.enforce(w, r, next, prefix, redisKey, limit, window, failClosed)
		})
	}
}

// RPMUsed returns the current per-minute request count for a key ID.
func (l *Limiter) RPMUsed(ctx context.Context, keyID string) int64 {
	v, _ := l.rdb.Get(ctx, "rl:v1:chat:key:"+keyID).Int64()
	return v
}
