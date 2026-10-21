package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/ado/ado/backend/internal/apperr"
	"github.com/ado/ado/backend/internal/keys"
	"github.com/ado/ado/backend/internal/store/db"
)

const bearerKey ctxKey = "bearerKey"

type BearerKeyContext struct {
	KeyID      uuid.UUID
	UserID     uuid.UUID
	DailyLimit int32
	// PlanRPM is the plan's per-minute limit; 0 means use the global RPM.
	PlanRPM       int32
	ReasoningMode bool
}

func Bearer(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			raw := apiKeyFrom(r)
			if raw == "" {
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "missing API key: send it as \"Authorization: Bearer <key>\""))
				return
			}
			row, err := q.GetActiveKeyByHash(r.Context(), keys.Hash(raw))
			if errors.Is(err, pgx.ErrNoRows) {
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "invalid key"))
				return
			}
			if err != nil {
				apperr.Write(w, apperr.Internal("INTERNAL", "key lookup"))
				return
			}
			if row.Banned {
				apperr.Write(w, apperr.Forbidden("BANNED", "account suspended"))
				return
			}
			touchKey(q, row.ID)
			ctx := context.WithValue(r.Context(), bearerKey, BearerKeyContext{
				KeyID:         row.ID,
				UserID:        row.UserID,
				DailyLimit:    row.DailyLimit,
				PlanRPM:       row.PlanRpm,
				ReasoningMode: row.ReasoningMode,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SessionKey is Bearer for the website's Playground: it authenticates with the
// signed-in session instead of a raw key, and attaches that user's active key,
// so the backend never has to hand the raw key back to the browser (it only
// stores a hash). Everything downstream (quota, per-key RPM, request log)
// treats the call exactly like one made with the key. Use behind LoadSession
// and CSRF; banned users are already stopped by LoadSession.
func SessionKey(q *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sess, ok := SessionFromContext(r.Context())
			if !ok {
				apperr.Write(w, apperr.Unauthorized("UNAUTHORIZED", "sign in to use the playground"))
				return
			}
			row, err := q.GetActiveKeyWithQuotaByUser(r.Context(), sess.UserID)
			if errors.Is(err, pgx.ErrNoRows) {
				apperr.Write(w, apperr.Forbidden("NO_KEY", "you have no active key; get one on the dashboard"))
				return
			}
			if err != nil {
				apperr.Write(w, apperr.Internal("INTERNAL", "key lookup"))
				return
			}
			touchKey(q, row.ID)
			ctx := context.WithValue(r.Context(), bearerKey, BearerKeyContext{
				KeyID:         row.ID,
				UserID:        sess.UserID,
				DailyLimit:    row.DailyLimit,
				PlanRPM:       row.PlanRpm,
				ReasoningMode: row.ReasoningMode,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// touchKey keeps last_used_at fresh so the reaper only revokes idle keys.
// Detached and async so it never delays the request; the query self-debounces
// to about once per 30s per key.
func touchKey(q *db.Queries, id uuid.UUID) {
	go func() {
		tctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = q.TouchKeyLastUsed(tctx, id)
	}()
}

func BearerFromContext(ctx context.Context) (BearerKeyContext, bool) {
	v, ok := ctx.Value(bearerKey).(BearerKeyContext)
	return v, ok
}

// apiKeyFrom reads the ADO key from "Authorization: Bearer <key>" (the scheme
// in any case, as HTTP allows) or from x-api-key, which the Anthropic SDK and
// Claude Code send instead. Providers never see either header: the proxy
// forwards only an allowlist.
func apiKeyFrom(r *http.Request) string {
	if h := strings.TrimSpace(r.Header.Get("Authorization")); len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return strings.TrimSpace(r.Header.Get("X-Api-Key"))
}
